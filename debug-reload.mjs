import { writeFileSync } from 'node:fs';
import { openSession } from './src/core/session.mjs';
import { evalJs, sleep } from './src/core/cdp.mjs';
import { findChrome } from './src/core/chrome.mjs';

const chromePath = findChrome({ env: process.env });
const session = await openSession({ chromePath, env: process.env });
const { cdp } = session;
try {
  await cdp.send('Page.reload', { ignoreCache: true }, { timeoutMs: 15000 });
  await sleep(7000);
  const state = await evalJs(cdp, `({
    url: location.href,
    header: (document.querySelector('.header-login-btn')||{}).innerText || null,
    bodyLen: document.body.innerText.length,
    cards: document.querySelectorAll('li.job-card-box').length
  })`, { timeoutMs: 8000 });
  console.log(JSON.stringify(state));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
  writeFileSync('E:/找工作/boss-job/debug-page2.jpg', Buffer.from(shot.data, 'base64'));
} finally { cdp.close(); }
