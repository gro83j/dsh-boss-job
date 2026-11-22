import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome } from './core/chrome.mjs';
import { ensureChrome, goto, hasLoginCookie, LOGIN_URL, readCookies } from './core/auth.mjs';
import { openSession } from './core/session.mjs';
import { searchJobs } from './core/search.mjs';
import { resolveCities } from './core/city.mjs';
import { fetchDetails } from './core/detail.mjs';
import { loadPrefs, mergePrefs, savePrefs } from './core/prefs.mjs';
import { exportReport } from './core/report.mjs';
import { dataDir, reportsDir } from './core/paths.mjs';
import { readRuntime } from './core/runtime.mjs';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const PROTOCOL_VERSION = '2024-11-05';

export const TOOLS = [
  {
    name: 'boss_doctor',
    description: '检查 Chrome、数据目录、专用 profile 与登录态是否就绪',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'boss_login',
    description: '打开专用 Chrome 窗口并检查是否已登录（用户需在窗口内扫码/验证码登录）',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'boss_search',
    description: '按关键词搜索 Boss 直聘职位列表，返回 job id/标题/薪资/公司',
    inputSchema: {
      type: 'object',
      properties: {
        queries: { type: 'array', items: { type: 'string' }, description: '多个岗位方向关键词' },
        query: { type: 'string', description: '单个关键词（兼容旧调用；与 queries 二选一）' },
        cities: { type: 'array', items: { type: 'string' }, description: '多个城市名或 code（国内城市，支持跨地区）' },
        city: { type: 'string', description: '单个城市名或 code（兼容旧调用）' },
        pages: { type: 'number', description: '每个关键词页数，默认 1，最大 3' },
      },
    },
  },
  {
    name: 'boss_detail',
    description: '按 job id 抓取详情（JD 正文、公司、招聘者活跃状态），单次最多 60 个',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'job_detail 里的 id 列表' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'boss_prefs_get',
    description: '读取岗位偏好 preferences.json（城市/薪资下限/方向/经验）',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'boss_prefs_set',
    description: '合并写入岗位偏好（浅合并，avoid/keywords 去重）',
    inputSchema: {
      type: 'object',
      properties: { prefs: { type: 'object', description: '要合并的偏好片段' } },
      required: ['prefs'],
    },
  },
  {
    name: 'boss_export',
    description: '把已抓取岗位与 AI 评分渲染成 Markdown 报告',
    inputSchema: {
      type: 'object',
      properties: {
        jobs: { type: 'array', items: { type: 'object' } },
        evaluation: { type: 'object', description: '{ [jobId]: { fit, reachability, growth, risk, score, reason } }' },
        outDir: { type: 'string' },
      },
      required: ['jobs'],
    },
  },
];

const envOf = (ctx) => ctx.env || process.env;

function requireChrome(ctx) {
  const chrome = (ctx.chrome && ctx.chrome.find) || findChrome;
  const chromePath = chrome({ env: envOf(ctx) });
  if (!chromePath) throw new Error('未找到 Chrome：请安装 Google Chrome 后重试');
  return chromePath;
}

const MCP_TOOL_HANDLERS = {
  async boss_doctor(_args, ctx) {
    return {
      node: process.version,
      chrome: ((ctx.chrome && ctx.chrome.find) || findChrome)({ env: envOf(ctx) }),
      dataDir: dataDir(envOf(ctx)),
      runtime: readRuntime(envOf(ctx)),
    };
  },

  async boss_login(_args, ctx) {
    const chromePath = requireChrome(ctx);
    const { port, pid, reused } = await ensureChrome({ chromePath, env: envOf(ctx), url: LOGIN_URL });
    if (reused) {
      try {
        await goto(port, LOGIN_URL);
      } catch {
        // window still usable
      }
    }
    const cookies = await readCookies(port);
    const loggedIn = hasLoginCookie(cookies);
    return {
      port,
      pid,
      reused,
      loggedIn,
      loginUrl: LOGIN_URL,
      message: loggedIn ? '已登录' : '专用 Chrome 已打开，请完成登录后再次调用 boss_login 或 boss_search',
    };
  },

  async boss_search(args, ctx) {
    const chromePath = args.chrome || requireChrome(ctx);
    const session = await openSession({
      chromePath,
      env: envOf(ctx),
      url: 'https://www.zhipin.com/web/geek/jobs',
    });
    try {
      const cookies = await readCookies(session.port);
      if (!hasLoginCookie(cookies)) throw new Error('未检测到登录态：先调用 boss_login 完成登录');
      const queries = (Array.isArray(args.queries) ? args.queries : args.query ? [args.query] : [])
        .map((q) => String(q).trim())
        .filter(Boolean);
      if (!queries.length) throw new Error('queries 不能为空');
      const cityInputs = Array.isArray(args.cities) ? args.cities : args.city ? [args.city] : [];
      const prefs = ((ctx.prefs && ctx.prefs.load) || (() => loadPrefs(envOf(ctx))))();
      const cityEntries = cityInputs.length ? cityInputs : prefs.cities || [];
      if (!cityEntries.length) throw new Error('cities 不能为空：先完成偏好访谈，或传入城市名');
      const { resolved, unknown } = await resolveCities(session.cdp, envOf(ctx), cityEntries);
      if (!resolved.length) throw new Error(`无法识别城市：${unknown.join('、') || cityEntries.join('、')}`);
      if (queries.length * resolved.length > 12) throw new Error('城市×关键词组合不能超过 12 组');
      const pages = Math.min(3, Math.max(1, Number(args.pages || 1)));
      const jobs = [];
      const seen = new Set();
      const warnings = unknown.length ? [`无法识别城市：${unknown.join('、')}`] : [];
      for (const city of resolved) {
        for (const query of queries) {
          const result = await searchJobs({ cdp: session.cdp, query, city: city.code, pages });
          warnings.push(...result.warnings.map((w) => `${city.name}/${query}: ${w}`));
          for (const job of result.jobs) {
            if (!job.id || seen.has(job.id)) continue;
            seen.add(job.id);
            jobs.push({ ...job, searchQuery: query, searchCity: city.name });
          }
        }
      }
      return { count: jobs.length, jobs, warnings, cities: resolved.map((c) => c.name), queries };
    } finally {
      session.cdp.close();
    }
  },

  async boss_detail(args, ctx) {
    const ids = (Array.isArray(args.ids) ? args.ids : []).slice(0, 60);
    if (!ids.length) throw new Error('ids 不能为空');
    const chromePath = args.chrome || requireChrome(ctx);
    const session = await openSession({ chromePath, env: envOf(ctx) });
    try {
      const cookies = await readCookies(session.port);
      if (!hasLoginCookie(cookies)) throw new Error('未检测到登录态：先调用 boss_login 完成登录');
      const { jobs, warnings, aborted } = await fetchDetails({ cdp: session.cdp, ids });
      return { count: jobs.length, jobs, warnings, aborted };
    } finally {
      session.cdp.close();
    }
  },

  async boss_prefs_get(_args, ctx) {
    return (ctx.prefs && ctx.prefs.load ? ctx.prefs.load : () => loadPrefs(envOf(ctx)))();
  },

  async boss_prefs_set(args, ctx) {
    const load = (ctx.prefs && ctx.prefs.load) || (() => loadPrefs(envOf(ctx)));
    const save = (ctx.prefs && ctx.prefs.save) || ((prefs) => savePrefs(prefs, envOf(ctx)));
    const next = mergePrefs(load(), args.prefs || {});
    const saved = save(next);
    return { saved, prefs: next };
  },

  async boss_export(args, ctx) {
    const outDir = args.outDir || reportsDir(new Date().toISOString().replace(/[:.]/g, '-'), envOf(ctx));
    const report = ((ctx.report && ctx.report.export) || exportReport)({
      outDir,
      prefs: (ctx.prefs && ctx.prefs.load ? ctx.prefs.load : () => loadPrefs(envOf(ctx)))(),
      jobs: args.jobs || [],
      evaluation: args.evaluation || {},
      generatedAt: new Date().toISOString().slice(0, 10),
    });
    return { report };
  },
};

function envelope(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function errorEnvelope(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

export async function handleMessage(msg, ctx = {}) {
  const id = msg?.id ?? null;
  switch (msg?.method) {
    case 'initialize':
      return envelope(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'dsh-boss-job', version: pkg.version },
      });
    case 'notifications/initialized':
      return null;
    case 'ping':
      return envelope(id, {});
    case 'tools/list':
      return envelope(id, { tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      const handler = MCP_TOOL_HANDLERS[name];
      if (!handler) return errorEnvelope(id, -32602, `未知工具：${name}`);
      try {
        const result = await handler(msg.params?.arguments || {}, ctx);
        return envelope(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (err) {
        return envelope(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        });
      }
    }
    default:
      return errorEnvelope(id, -32601, `Method not found: ${msg?.method}`);
  }
}

/** Line-delimited JSON-RPC over stdio, processed serially. */
export function startStdio({ input = process.stdin, output = process.stdout, ctx = {} } = {}) {
  const rl = createInterface({ input, terminal: false });
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    chain = chain
      .then(async () => {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          output.write(JSON.stringify(errorEnvelope(null, -32700, 'Parse error')) + '\n');
          return;
        }
        const response = await handleMessage(msg, ctx);
        if (response) output.write(JSON.stringify(response) + '\n');
      })
      .catch((err) => {
        output.write(JSON.stringify(errorEnvelope(null, -32603, err.message)) + '\n');
      });
  });
  return rl;
}

export { MCP_TOOL_HANDLERS, join };

// Entry point when the DSH mcp-client row runs `node <pkg>/src/mcp.mjs`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdio({});
}
