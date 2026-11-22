import { openSession } from './src/core/session.mjs';
import { evalJs } from './src/core/cdp.mjs';
import { findChrome } from './src/core/chrome.mjs';

const chromePath = findChrome({ env: process.env });
const session = await openSession({ chromePath, env: process.env });
const { cdp } = session;
try {
  const info = await evalJs(cdp, `(function(){
    const a = document.querySelector('a[href*="/job_detail/"]');
    if (!a) return { none: true };
    const chain = [];
    let el = a;
    for (let i = 0; i < 6 && el; i++) { chain.push(el.tagName + '.' + (el.className || '').toString().trim().replace(/\\s+/g, '.')); el = el.parentElement; }
    const card = a.closest('li') || a.closest('div');
    return {
      chain,
      linkText: a.innerText,
      cardText: card ? card.innerText.slice(0, 300) : '',
      header: (document.querySelector('.header-login-btn, .login-btn, .user-nav, .nav-figure') || {}).innerText || '',
      hasAvatar: !!document.querySelector('.nav-figure img, .user-avatar'),
      cookieHasWt2: document.cookie.includes('wt2')
    };
  })()`, { timeoutMs: 8000 });
  console.log(JSON.stringify(info, null, 2));
} finally { cdp.close(); }
