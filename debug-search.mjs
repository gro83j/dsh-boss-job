import { openSession } from './src/core/session.mjs';
import { evalJs, sleep } from './src/core/cdp.mjs';
import { buildSearchUrl } from './src/core/search.mjs';
import { findChrome } from './src/core/chrome.mjs';

const chromePath = findChrome({ env: process.env });
const session = await openSession({ chromePath, env: process.env });
const { cdp } = session;
try {
  await cdp.send('Page.navigate', { url: buildSearchUrl({ query: '美妆运营', city: '101210100', page: 1 }) }, { timeoutMs: 15000 });
  await sleep(4000);
  const info = await evalJs(cdp, `({
    href: location.href,
    title: document.title,
    text: (document.body && document.body.innerText || '').slice(0, 400),
    li: document.querySelectorAll('li').length,
    cards: document.querySelectorAll('li.job-card-wrapper').length,
    jobLinks: document.querySelectorAll('a[href*="/job_detail/"]').length,
    bodyHtmlLen: document.documentElement.outerHTML.length
  })`, { timeoutMs: 8000 });
  console.log(JSON.stringify(info, null, 2));
} finally {
  cdp.close();
}
