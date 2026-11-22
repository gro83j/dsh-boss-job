import { writeFileSync } from 'node:fs';
import { openSession } from './src/core/session.mjs';
import { evalJs } from './src/core/cdp.mjs';
import { findChrome } from './src/core/chrome.mjs';

const chromePath = findChrome({ env: process.env });
const session = await openSession({ chromePath, env: process.env });
const { cdp } = session;
try {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  writeFileSync('E:/找工作/boss-job/debug-page.jpg', Buffer.from(shot.data, 'base64'));
  const state = await evalJs(cdp, `(function(){
    const txt = (s) => { const e = document.querySelector(s); return e ? (e.innerText||'').trim().slice(0,100) : null; };
    return {
      url: location.href,
      headerRight: txt('.header-login-btn') || txt('.header-right') || txt('.nav-right'),
      figure: txt('.nav-figure'),
      loginBtns: document.querySelectorAll('.header-login-btn').length,
      userInfoEls: document.querySelectorAll('[class*=user], [class*=avatar]').length,
      bodyLen: document.body.innerText.length
    };
  })()`, { timeoutMs: 8000 });
  console.log(JSON.stringify(state, null, 2));
} finally { cdp.close(); }
