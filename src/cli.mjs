#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './core/chrome.mjs';
import { dataDir } from './core/paths.mjs';
import { readRuntime } from './core/runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

function notImplemented(name) {
  return async (_args, io) => {
    io.stdout(`「${name}」尚未实现\n`);
    return 0;
  };
}

export const COMMANDS = {
  login: {
    describe: '打开专用 Chrome 窗口，用你自己的 Boss 直聘账号登录',
    run: notImplemented('login'),
  },
  search: {
    describe: '搜索职位列表并保存为 JSON',
    run: notImplemented('search'),
  },
  detail: {
    describe: '抓取职位详情（JD 正文、公司、招聘者活跃状态）',
    run: notImplemented('detail'),
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
