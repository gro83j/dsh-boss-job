#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './core/chrome.mjs';
import { ensureChrome, goto, hasLoginCookie, LOGIN_URL, readCookies, waitForLogin } from './core/auth.mjs';
import { dataDir, jobsDir, profileDir } from './core/paths.mjs';
import { readRuntime } from './core/runtime.mjs';
import { openSession } from './core/session.mjs';
import { searchJobs } from './core/search.mjs';
import { fetchDetails } from './core/detail.mjs';

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

export const COMMANDS = {
  login: {
    describe: '打开专用 Chrome 窗口，用你自己的 Boss 直聘账号登录',
    run: async (_args, io) => {
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
      io.stdout('请在弹出的 Chrome 窗口完成登录（扫码或手机验证码）。\n');
      const ok = await waitForLogin({ readCookies: () => readCookies(port) });
      if (!ok) {
        io.stderr('等待超时，请重试 `dsh-boss-job login`\n');
        return 1;
      }
      io.stdout(`登录成功，专用 profile：${profileDir(io.env)}\n`);
      return 0;
    },
  },
  search: {
    describe: '搜索职位列表并保存为 JSON',
    run: async (args, io) => {
      const flags = parseFlags(args);
      if (!flags.query) {
        io.stderr('用法：dsh-boss-job search --query <关键词> [--city 101210100] [--pages 1] [--json]\n');
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
        const { jobs, warnings } = await searchJobs({
          cdp: session.cdp,
          query: String(flags.query),
          city: String(flags.city || '101210100'),
          pages: Number(flags.pages || 1),
        });
        for (const warning of warnings) io.stderr(`[warn] ${warning}\n`);
        const dir = join(jobsDir(timestamp(), io.env));
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `search-${safeName(flags.query)}.json`);
        writeFileSync(file, JSON.stringify(jobs, null, 2) + '\n', 'utf8');
        if (flags.json) {
          io.stdout(JSON.stringify(jobs) + '\n');
        } else {
          io.stdout(`${table(jobs)}\n共 ${jobs.length} 条，已保存到 ${file}\n`);
        }
        return jobs.length ? 0 : 4;
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
    run: notImplemented('filter'),
  },
  export: {
    describe: '把筛选结果渲染成 Markdown 报告',
    run: notImplemented('export'),
  },
  setup: {
    describe: '把 Skill 安装到 DSH / Claude Code / Codex，并打印 MCP 配置',
    run: notImplemented('setup'),
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
      lines.push('  登录态     unknown（login 后检查 cookies 里的 wt2）');
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
    run: notImplemented('mcp'),
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
