import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'boss-job';

/** Packaged Skill folder shipped with this npm package. */
export const skillSource = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', SKILL_NAME);

const HOSTS = ['dsh', 'claude', 'codex', 'cursor'];

function homeOf(env) {
  return env.USERPROFILE || env.HOME || homedir();
}

function targetFor(host, { cwd, env }) {
  const home = homeOf(env);
  switch (host) {
    case 'dsh':
      return join(cwd, '.dsh', 'skills', SKILL_NAME);
    case 'codex':
      return join(cwd, '.agents', 'skills', SKILL_NAME);
    case 'claude':
      return join(home, '.claude', 'skills', SKILL_NAME);
    case 'cursor':
      return join(home, '.cursor', 'skills', SKILL_NAME);
    default:
      throw new Error(`未知宿主：${host}（可选 ${HOSTS.join(' / ')} / auto）`);
  }
}

/** Which agent hosts are already present in this workspace / home. */
export function detectHosts({ cwd = process.cwd(), env = process.env } = {}) {
  const home = homeOf(env);
  const found = [];
  if (existsSync(join(cwd, '.dsh'))) found.push('dsh');
  if (existsSync(join(home, '.claude'))) found.push('claude');
  if (existsSync(join(cwd, '.agents'))) found.push('codex');
  if (existsSync(join(home, '.cursor'))) found.push('cursor');
  return found;
}

/**
 * Link the packaged Skill into one agent host.
 * `link` is injectable so unit tests never touch the filesystem.
 */
export function installSkill({ host = 'auto', cwd = process.cwd(), env = process.env, link } = {}) {
  const resolved = host === 'auto' ? detectHosts({ cwd, env })[0] || 'dsh' : host;
  const target = targetFor(resolved, { cwd, env });
  if (existsSync(target)) {
    return { host: resolved, target, linked: true, existed: true };
  }
  mkdirSync(dirname(target), { recursive: true });
  const linker = link || ((from, to) => symlinkSync(from, to, process.platform === 'win32' ? 'junction' : 'dir'));
  linker(skillSource, target);
  return { host: resolved, target, linked: Boolean(link === undefined), existed: false };
}

/** Config block users paste into an MCP-capable host. */
export function mcpConfigSnippet() {
  return {
    mcpServers: {
      'boss-job': {
        command: 'npx',
        args: ['-y', 'dsh-boss-job', 'mcp'],
      },
    },
  };
}
