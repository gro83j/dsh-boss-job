import { CDP, ensurePage } from './cdp.mjs';
import { ensureChrome } from './auth.mjs';

/**
 * One live page + one CDP socket. Callers own the socket and must close it.
 * The page is reused across calls; navigation happens inside search/detail.
 */
export async function openSession({ chromePath, env = process.env, url = 'https://www.zhipin.com/' } = {}) {
  const { port, pid, reused } = await ensureChrome({ chromePath, env, url });
  const page = await ensurePage(port, { url });
  const cdp = new CDP();
  await cdp.open(page.wsUrl);
  return { cdp, port, pid, reused, pageId: page.id };
}
