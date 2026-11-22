import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';

export const WINDOWS_EXCLUDED_PORT_RANGE = [9201, 9300];

/**
 * Locate a Chrome binary. Returns null when nothing is found, so callers can
 * print actionable hints instead of throwing.
 */
export function findChrome({ platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const candidates = [];
  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    );
    if (env.LOCALAPPDATA) {
      candidates.push(join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium');
  }
  return candidates.find((p) => exists(p)) || null;
}

/** Try to bind the port; true when the OS accepts the listen call. */
export function isPortFree(port, { host = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/**
 * Pick a port Chrome can actually bind. Windows reserves 9201-9300 for
 * WinNAT/Hyper-V, so those are skipped outright; if the whole window is busy we
 * fall back to high ephemeral ports.
 */
export async function pickPort({
  platform = process.platform,
  start = 9400,
  end = 9500,
  probe = isPortFree,
  random = Math.random,
} = {}) {
  for (let port = start; port <= end; port++) {
    if (platform === 'win32' && port >= WINDOWS_EXCLUDED_PORT_RANGE[0] && port <= WINDOWS_EXCLUDED_PORT_RANGE[1]) {
      continue;
    }
    if (await probe(port)) return port;
  }
  let fallback = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = 10000 + Math.floor(random() * 50000);
    fallback = port;
    if (await probe(port)) return port;
  }
  // High ports are rarely contended; returning the last candidate lets Chrome
  // surface a bind error (and doctor explain it) instead of blocking login.
  return fallback;
}

/** Args are shared with tests; keep the URL last. */
export function buildLaunchArgs({ profileDir, port, url }) {
  return [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate',
    url,
  ];
}

/** Spawn a detached Chrome that survives this process. */
export function launchChrome({ chromePath, profileDir, port, url }) {
  const child = spawn(chromePath, buildLaunchArgs({ profileDir, port, url }), {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
  return { pid: child.pid };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll /json/version until the DevTools endpoint answers. */
export async function waitForDevtools(port, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  const detail = lastError ? ` (${lastError.message})` : '';
  throw new Error(`Chrome DevTools did not start on port ${port}${detail}`);
}
