import { CDP, ensurePage } from './cdp.mjs';
import { launchChrome, pickPort, waitForDevtools } from './chrome.mjs';
import { profileDir as profilePath } from './paths.mjs';
import { clearRuntime, readRuntime, writeRuntime } from './runtime.mjs';

export const LOGIN_URL = 'https://www.zhipin.com/web/user/?ka=header-login';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Boss 直聘的登录态以 wt2 cookie 为准（__zp_stoken__ 只说明过了风控，不代表已登录）。 */
export function hasLoginCookie(cookies) {
  return Array.isArray(cookies) && cookies.some((c) => c && c.name === 'wt2');
}

export async function waitForLogin({
  readCookies,
  intervalMs = 2000,
  timeoutMs = 300000,
  now = Date.now,
  sleep = defaultSleep,
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const cookies = await readCookies();
    if (hasLoginCookie(cookies)) return true;
    if (now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

/** Read cookies at browser level so it works without an open zhipin tab. */
export async function readCookies(port, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error(`DevTools /json/version failed: HTTP ${res.status}`);
  const version = await res.json();
  const cdp = new CDP();
  await cdp.open(version.webSocketDebuggerUrl, { timeoutMs });
  try {
    const r = await cdp.send(
      'Network.getCookies',
      { urls: ['https://www.zhipin.com', 'https://www.zhipin.com/web/geek/jobs'] },
      { timeoutMs },
    );
    return r?.cookies || [];
  } finally {
    cdp.close();
  }
}

/** Navigate an existing (or new) zhipin page; used after reusing a running Chrome. */
export async function goto(port, url) {
  const page = await ensurePage(port, { url: 'https://www.zhipin.com/' });
  const cdp = new CDP();
  await cdp.open(page.wsUrl);
  try {
    await cdp.send('Page.navigate', { url }, { timeoutMs: 10000 });
  } finally {
    cdp.close();
  }
}

/**
 * Reuse the Chrome described by runtime.json when it is still reachable,
 * otherwise pick a port, launch the dedicated profile, and persist runtime.
 */
export async function ensureChrome({ chromePath, env = process.env, url = 'https://www.zhipin.com/', fetchImpl = fetch } = {}) {
  const rt = readRuntime(env);
  if (rt?.port) {
    try {
      await waitForDevtools(rt.port, { timeoutMs: 1500, fetchImpl });
      return { port: rt.port, pid: rt.pid, reused: true };
    } catch {
      clearRuntime(env);
    }
  }
  const port = await pickPort();
  const profileDir = profilePath(env);
  const { pid } = launchChrome({ chromePath, profileDir, port, url });
  await waitForDevtools(port, { fetchImpl });
  writeRuntime({ port, pid, profileDir, startedAt: new Date().toISOString() }, env);
  return { port, pid, reused: false };
}
