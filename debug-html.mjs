import { openSession } from './src/core/session.mjs';
import { evalJs } from './src/core/cdp.mjs';
import { findChrome } from './src/core/chrome.mjs';

const chromePath = findChrome({ env: process.env });
const session = await openSession({ chromePath, env: process.env });
const { cdp } = session;
try {
  const html = await evalJs(cdp, `(function(){
    const li = document.querySelector('li.job-card-box');
    return li ? li.outerHTML.slice(0, 3000) : 'none';
  })()`, { timeoutMs: 8000 });
  console.log(html);
} finally { cdp.close(); }
