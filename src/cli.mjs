#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './core/chrome.mjs';
import { ensureChrome, goto, hasLoginCookie, loginCookieValue, LOGIN_URL, pageRequiresLogin, readCookies, waitForNewLogin } from './core/auth.mjs';
import { dataDir, jobsDir, profileDir, reportsDir } from './core/paths.mjs';
import { readRuntime } from './core/runtime.mjs';
import { openSession } from './core/session.mjs';
import { searchJobs } from './core/search.mjs';
import { resolveCities } from './core/city.mjs';
import { sleep } from './core/cdp.mjs';
import { fetchDetails } from './core/detail.mjs';
import { loadPrefs } from './core/prefs.mjs';
import { applyFilters } from './core/filter.mjs';
import { exportReport } from './core/report.mjs';
import { installSkill, mcpConfigSnippet } from './core/setup.mjs';
import { startStdio } from './mcp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

function notImplemented(name) {
  return async (_args, io) => {
    io.stdout(`「${name}」尚未实现\n`);
    return 0;
  };
}

export function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function splitList(value) {
  if (value === undefined || value === null || value === true) return [];
  return String(value)
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCityEntry(text) {
  return /^\d+$/.test(text) ? { code: text } : { name: text };
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeName(value) {
  return String(value).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
}

function table(jobs) {
  const header = ['标题', '薪资', '区域', '公司', 'id'].join('\t');
  const rows = jobs.map((j) => [j.title, j.salaryRaw || '-', j.area || '-', j.company || '-', j.id].join('\t'));
  return [header, ...rows].join('\n');
}

function readJobs(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.jobs)) return parsed.jobs;
  throw new Error(`无法从 ${file} 读出职位数组`);
}

export const COMMANDS = {
  login: {
    describe: '打开专用 Chrome 窗口，用你自己的 Boss 直聘账号登录',
    run: async (args, io) => {
      const flags = parseFlags(args);
      const chromePath = findChrome({ env: io.env });
      if (!chromePath) {
        io.stderr('未找到 Chrome：请先安装 Google Chrome，或用 --chrome <path> 指定路径。\n');
        return 2;
      }
      const { port, pid, reused } = await ensureChrome({ chromePath, env: io.env, url: LOGIN_URL });
      io.stdout(
        reused
          ? `复用已运行的专用 Chrome（端口 ${port}）\n`
          : `已启动专用 Chrome（端口 ${port}，pid ${pid}）\n`,
      );
      if (reused) {
        try {
          await goto(port, LOGIN_URL);
        } catch {
          // 窗口已可用，导航失败不阻塞登录
        }
      }
      const initial = loginCookieValue(await readCookies(port).catch(() => []));
      const timeoutMinutes = Number(flags.timeout || 5);
      io.stdout(`请在弹出的 Chrome 窗口完成登录（扫码或手机验证码），最多等待 ${timeoutMinutes} 分钟。\n`);
      const ok = await waitForNewLogin({
        readCookies: () => readCookies(port),
        initial,
        timeoutMs: timeoutMinutes * 60_000,
      });
      if (!ok) {
        io.stderr('等待超时，请重试 `dsh-boss-job login`\n');
        return 1;
      }
      // The login page also renders a guest header briefly; give it a moment to redirect.
      let needsLogin = true;
      for (let i = 0; i < 5 && needsLogin; i++) {
        needsLogin = await pageRequiresLogin(port).catch(() => true);
        if (needsLogin) await new Promise((r) => setTimeout(r, 1500));
      }
      if (needsLogin) {
        io.stderr('检测到新的登录 cookie，但页面仍显示未登录；请重试 `dsh-boss-job login`\n');
        return 1;
      }
      io.stdout(`登录成功，专用 profile：${profileDir(io.env)}\n`);
      return 0;
    },
  },
  search: {
    describe: '搜索职位列表（支持多个城市 × 多个关键词）',
    run: async (args, io) => {
      const flags = parseFlags(args);
      const queries = splitList(flags.queries || flags.query);
      if (!queries.length) {
        io.stderr('用法：dsh-boss-job search --queries "关键词A,关键词B" --cities 杭州,上海 [--pages 1] [--json]\n');
        return 1;
      }
      const prefs = loadPrefs(io.env, { warn: (m) => io.stderr(`[warn] ${m}\n`) });
      const cityInputs = splitList(flags.cities || flags.city);
      const cityEntries = cityInputs.length ? cityInputs.map(toCityEntry) : (prefs.cities || []);
      if (!cityEntries.length) {
        io.stderr('未设置城市：先完成偏好访谈（写入 ~/.dsh-boss-job/preferences.json），或用 --cities "杭州,上海" 指定。\n');
        return 1;
      }
      const pages = Math.min(3, Math.max(1, Number(flags.pages || 1)));
      if (queries.length * cityEntries.length > 12) {
        io.stderr(`组合太多（${queries.length} 个关键词 × ${cityEntries.length} 个城市），请减少到 12 组以内。\n`);
        return 1;
      }
      const chromePath = flags.chrome || findChrome({ env: io.env });
      if (!chromePath) {
        io.stderr('未找到 Chrome：请先安装 Google Chrome，或用 --chrome <path> 指定路径。\n');
        return 2;
      }
      const session = await openSession({ chromePath, env: io.env, url: 'https://www.zhipin.com/web/geek/jobs' });
      try {
        const cookies = await readCookies(session.port);
        if (!hasLoginCookie(cookies)) {
          io.stderr('未检测到登录态，请先运行 `dsh-boss-job login`。\n');
          return 3;
        }
        let resolved = [];
        let unknown = [];
        try {
          ({ resolved, unknown } = await resolveCities(session.cdp, io.env, cityEntries));
        } catch (err) {
          io.stderr(`城市列表获取失败：${err.message}\n`);
          return 2;
        }
        if (unknown.length) {
          io.stderr(`无法识别的城市：${unknown.join('、')}。请用中文城市名，或 BOSS 城市 code。\n`);
          if (!resolved.length) return 1;
        }
        const jobs = [];
        const seen = new Set();
        const warnings = [];
        for (let ci = 0; ci < resolved.length; ci++) {
          const city = resolved[ci];
          for (let qi = 0; qi < queries.length; qi++) {
            const query = queries[qi];
            io.stderr(`[search] ${city.name} × ${query}\n`);
            const result = await searchJobs({ cdp: session.cdp, query, city: city.code, pages });
            warnings.push(...result.warnings.map((w) => `${city.name}/${query}: ${w}`));
            for (const job of result.jobs) {
              if (!job.id || seen.has(job.id)) continue;
              seen.add(job.id);
              jobs.push({ ...job, searchQuery: query, searchCity: city.name });
            }
            if (ci !== resolved.length - 1 || qi !== queries.length - 1) {
              await sleep(1200 + Math.floor(Math.random() * 1200));
            }
          }
        }
        for (const warning of warnings) io.stderr(`[warn] ${warning}\n`);
        const dir = join(jobsDir(timestamp(), io.env));
        mkdirSync(dir, { recursive: true });
        const suffix = queries.length > 1 ? `-${queries.length}q` : '';
        const file = join(dir, `search-${safeName(queries[0])}${suffix}.json`);
        writeFileSync(file, JSON.stringify(jobs, null, 2) + '\n', 'utf8');
        if (flags.json) {
          io.stdout(JSON.stringify(jobs) + '\n');
        } else {
          io.stdout(`${table(jobs)}\n共 ${jobs.length} 条（${queries.length} 个关键词 × ${resolved.length} 个城市），已保存到 ${file}\n`);
        }
        return jobs.length ? 0 : 4;
      } catch (err) {
        if (err && err.name === 'LoginRequiredError') {
          io.stderr(`${err.message}\n`);
          return 3;
        }
        throw err;
      } finally {
        session.cdp.close();
      }
    },
  },
  detail: {
    describe: '抓取职位详情（JD 正文、公司、招聘者活跃状态）',
    run: async (args, io) => {
      const flags = parseFlags(args);
      let ids = [];
      if (flags.ids) ids = String(flags.ids).split(',').map((s) => s.trim()).filter(Boolean);
      else if (flags.file) {
        ids = readFileSync(String(flags.file), 'utf8')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (!ids.length) {
        io.stderr('用法：dsh-boss-job detail --ids <a,b> 或 --file ids.txt [--json]\n');
        return 1;
      }
      if (ids.length > 60) {
        io.stderr('单次最多 60 个，已截断到前 60 个。\n');
        ids = ids.slice(0, 60);
      }
      const chromePath = flags.chrome || findChrome({ env: io.env });
      if (!chromePath) {
        io.stderr('未找到 Chrome：请先安装 Google Chrome，或用 --chrome <path> 指定路径。\n');
        return 2;
      }
      const session = await openSession({ chromePath, env: io.env });
      try {
        const cookies = await readCookies(session.port);
        if (!hasLoginCookie(cookies)) {
          io.stderr('未检测到登录态，请先运行 `dsh-boss-job login`。\n');
          return 3;
        }
        const { jobs, warnings, aborted } = await fetchDetails({
          cdp: session.cdp,
          ids,
          warn: (m) => io.stderr(`[warn] ${m}\n`),
        });
        for (const warning of warnings) io.stderr(`[warn] ${warning}\n`);
        const dir = join(jobsDir(timestamp(), io.env));
        mkdirSync(dir, { recursive: true });
        const file = join(dir, 'details.json');
        writeFileSync(file, JSON.stringify(jobs, null, 2) + '\n', 'utf8');
        if (flags.json) {
          io.stdout(JSON.stringify(jobs) + '\n');
        } else {
          const rows = jobs.map((j) => ({ title: j.title, salaryRaw: j.salary, area: j.city, company: j.company, id: j.id }));
          io.stdout(`${table(rows)}\n共 ${jobs.length} 条，已保存到 ${file}\n`);
        }
        return aborted ? 5 : 0;
      } finally {
        session.cdp.close();
      }
    },
  },
  filter: {
    describe: '按 preferences.json 做硬筛与评分',
    run: async (args, io) => {
      const flags = parseFlags(args);
      if (!flags.input) {
        io.stderr('用法：dsh-boss-job filter --input details.json [--out <dir>]\n');
        return 1;
      }
      const jobs = readJobs(String(flags.input));
      const prefs = loadPrefs(io.env, { warn: (m) => io.stderr(`[warn] ${m}\n`) });
      const { kept, rejected } = applyFilters(jobs, prefs);
      const dir = flags.out ? String(flags.out) : jobsDir(timestamp(), io.env);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, 'filtered.json');
      writeFileSync(file, JSON.stringify({ kept, rejected }, null, 2) + '\n', 'utf8');
      io.stdout(`保留 ${kept.length} 个，剔除 ${rejected.length} 个，已写入 ${file}\n`);
      for (const item of rejected.slice(0, 10)) {
        io.stdout(`- ${item.job.title}：${item.reasons.join('；')}\n`);
      }
      return 0;
    },
  },
  export: {
    describe: '把筛选结果渲染成 Markdown 报告',
    run: async (args, io) => {
      const flags = parseFlags(args);
      if (!flags.input) {
        io.stderr('用法：dsh-boss-job export --input filtered.json [--eval evaluation.json] [--out <dir>]\n');
        return 1;
      }
      const parsed = JSON.parse(readFileSync(String(flags.input), 'utf8'));
      const jobs = Array.isArray(parsed) ? parsed : Array.isArray(parsed.kept) ? parsed.kept : parsed.jobs || [];
      const rejected = Array.isArray(parsed.rejected) ? parsed.rejected : [];
      const prefs = loadPrefs(io.env, { warn: (m) => io.stderr(`[warn] ${m}\n`) });
      let evaluation = {};
      if (flags.eval) evaluation = JSON.parse(readFileSync(String(flags.eval), 'utf8'));
      const outDir = flags.out ? String(flags.out) : reportsDir(timestamp(), io.env);
      const mdPath = exportReport({
        outDir,
        prefs,
        jobs,
        rejected,
        evaluation,
        generatedAt: new Date().toISOString().slice(0, 10),
      });
      io.stdout(`报告已写入 ${mdPath}\n`);
      return 0;
    },
  },
  setup: {
    describe: '把 Skill 安装到 DSH / Claude Code / Codex，并打印 MCP 配置',
    run: async (args, io) => {
      const flags = parseFlags(args);
      const host = String(flags.host || 'auto');
      const result = installSkill({ host, cwd: io.cwd, env: io.env });
      io.stdout(`Skill 已安装：${result.target}${result.existed ? '（已存在，未覆盖）' : ''}\n`);
      io.stdout('MCP 配置（加入 Claude Code / DSH 的 MCP 设置）：\n');
      io.stdout(JSON.stringify(mcpConfigSnippet(), null, 2) + '\n');
      io.stdout('下一步：dsh-boss-job login\n');
      return 0;
    },
  },
  doctor: {
    describe: '自检：Chrome、端口、登录态、数据目录',
    run: async (_args, io) => {
      const chromePath = findChrome({ env: io.env });
      const lines = [
        'dsh-boss-job doctor',
        `  Node       ${process.version}`,
        `  Chrome     ${chromePath || '未找到'}`,
        `  数据目录   ${dataDir(io.env)}`,
      ];
      const rt = readRuntime(io.env);
      if (rt && rt.port) {
        let alive = false;
        try {
          process.kill(rt.pid, 0);
          alive = true;
        } catch {
          alive = false;
        }
        lines.push(`  runtime    port ${rt.port} pid ${rt.pid}${alive ? '' : '（进程已退出，下次启动会重开）'}`);
      } else {
        lines.push('  runtime    无（首次 login 会自动创建专用 Chrome profile）');
      }
      lines.push(`  profile    ${profileDir(io.env)}`);
      let loginState = 'unknown（没有运行中的专用 Chrome）';
      if (rt?.port) {
        try {
          const cookies = await readCookies(rt.port, { timeoutMs: 2000 });
          if (!hasLoginCookie(cookies)) {
            loginState = '未登录（运行 login）';
          } else {
            const needsLogin = await pageRequiresLogin(rt.port).catch(() => false);
            loginState = needsLogin ? '登录态已失效（运行 login 重新登录）' : '已登录';
          }
        } catch {
          loginState = 'unknown（DevTools 不可达，运行 login 重开窗口）';
        }
      }
      lines.push(`  登录态     ${loginState}`);
      if (!chromePath) {
        lines.push('', '未找到 Chrome：请安装 Google Chrome，或用 --chrome <path> 指定路径。');
        io.stdout(lines.join('\n') + '\n');
        return 2;
      }
      io.stdout(lines.join('\n') + '\n');
      return 0;
    },
  },
  mcp: {
    describe: '以 MCP stdio server 方式运行（给宿主 agent 用）',
    run: async () => {
      startStdio({});
      await new Promise(() => {});
      return 0;
    },
  },
};

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  const lines = [
    'dsh-boss-job — AI 辅助的 Boss 直聘筛岗工具',
    '',
    '用法：dsh-boss-job <command> [options]',
    '',
    '命令：',
    ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.describe}`),
    '',
    '示例：dsh-boss-job setup && dsh-boss-job login',
    '      dsh-boss-job login --timeout 10   # 最多等 10 分钟扫码',
    '      dsh-boss-job search --query 美妆运营 --pages 1 --json',
  ];
  return lines.join('\n') + '\n';
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const out = {
    stdout: io.stdout || ((s) => process.stdout.write(s)),
    stderr: io.stderr || ((s) => process.stderr.write(s)),
    env: io.env || process.env,
    cwd: io.cwd || process.cwd(),
  };

  if (argv.includes('--version') || argv.includes('-v')) {
    out.stdout(pkg.version + '\n');
    return 0;
  }
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    out.stdout(helpText());
    return 0;
  }
  const [name, ...rest] = argv;
  const cmd = COMMANDS[name];
  if (!cmd) {
    out.stderr(`未知命令：${name}\n\n`);
    out.stdout(helpText());
    return 1;
  }
  return cmd.run(rest, out);
}

const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write((err && err.stack ? err.stack : String(err)) + '\n');
      process.exitCode = 1;
    });
}
