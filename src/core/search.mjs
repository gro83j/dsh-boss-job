import { evalJs, sleep } from './cdp.mjs';
import { LoginRequiredError } from './auth.mjs';

export function buildSearchUrl({ query, city = '101210100', page = 1 }) {
  const u = new URL('https://www.zhipin.com/web/geek/jobs');
  u.searchParams.set('query', query);
  u.searchParams.set('city', city);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.href;
}

/** Same-origin job list API: returns plaintext salaryDesc (the DOM salary is a PUA font). */
export function buildApiUrl({ query, city = '101210100', page = 1, pageSize = 30 }) {
  const u = new URL('https://www.zhipin.com/wapi/zpgeek/search/joblist.json');
  u.searchParams.set('scene', '1');
  u.searchParams.set('query', query);
  u.searchParams.set('city', city);
  u.searchParams.set('page', String(page));
  u.searchParams.set('pageSize', String(pageSize));
  return u.href;
}

/** Runs in the page and calls the site's own JSON endpoint with the real cookies. */
export function apiExpr(url) {
  return (
    `fetch(${JSON.stringify(url)},{credentials:'include',headers:{'x-requested-with':'XMLHttpRequest'}})`
    + '.then(r=>r.json())'
    + '.then(j=>({code:j.code,message:j.message,list:(j.zpData&&j.zpData.jobList)||[]}))'
    + '.catch(e=>({code:-1,message:String(e),list:[]}))'
  );
}

/** Runs in the page: collect raw card fields, one object per result card (DOM fallback). */
export const CARD_EXPR = `(function () {
  const out = [];
  const cards = document.querySelectorAll('li.job-card-box, li.job-card-wrapper, ul.job-list-box > li');
  for (const li of cards) {
    const a = li.querySelector('a[href*="/job_detail/"]');
    const txt = (sel) => {
      const el = li.querySelector(sel);
      return el ? (el.innerText || '').trim() : '';
    };
    out.push({
      href: a ? a.getAttribute('href') : '',
      title: txt('.job-name') || txt('.job-title') || txt('h3'),
      salaryRaw: txt('.job-salary') || txt('.salary'),
      area: txt('.company-location') || txt('.job-area'),
      tags: Array.from(li.querySelectorAll('.tag-list li')).map((x) => (x.innerText || '').trim()).filter(Boolean),
      company: txt('.boss-name') || txt('.company-name') || txt('.company-text .name')
    });
  }
  return out;
})()`;

const PUA = /[\uE000-\uF8FF]/;

function normalizeArea(raw) {
  return [raw.cityName, raw.areaDistrict, raw.businessDistrict].filter(Boolean).join('·');
}

/** Normalize one job list API item into a JobCard. */
export function mapApiJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.encryptJobId === 'string' ? raw.encryptJobId.trim() : '';
  if (!id) return null;
  const tags = [
    ...(Array.isArray(raw.jobLabels) ? raw.jobLabels : []),
    ...(Array.isArray(raw.skills) ? raw.skills : []),
  ].filter((x) => typeof x === 'string' && x.trim());
  return {
    id,
    url: `https://www.zhipin.com/job_detail/${id}.html`,
    title: (raw.jobName || '').trim(),
    salaryRaw: (raw.salaryDesc || '').trim(),
    salaryReliable: true,
    city: (raw.cityName || '').trim(),
    area: normalizeArea(raw),
    exp: (raw.jobExperience || '').trim(),
    degree: (raw.jobDegree || '').trim(),
    tags,
    company: (raw.brandName || '').trim(),
    bossName: (raw.bossName || '').trim(),
    bossTitle: (raw.bossTitle || '').trim(),
    bossOnline: raw.bossOnline === true,
    valid: raw.jobValidStatus === 1,
  };
}

/** Normalize raw DOM cards into JobCard[] and collect warnings. */
export function parseCards(raw) {
  const jobs = [];
  const warnings = [];
  const list = Array.isArray(raw) ? raw : [];
  list.forEach((item, i) => {
    const href = item && typeof item.href === 'string' ? item.href.trim() : '';
    const idMatch = href.match(/job_detail\/([^./]+)\.html/);
    if (!href || !idMatch) {
      warnings.push(`第 ${i + 1} 条缺少 job_detail 链接，已跳过`);
      return;
    }
    const salaryRaw = typeof item.salaryRaw === 'string' ? item.salaryRaw : '';
    const area = (item.area || '').trim();
    jobs.push({
      id: idMatch[1],
      url: new URL(href, 'https://www.zhipin.com').href,
      title: (item.title || '').trim(),
      salaryRaw,
      salaryReliable: !PUA.test(salaryRaw),
      city: area.split('·')[0] || '',
      area,
      tags: Array.isArray(item.tags) ? item.tags : [],
      company: (item.company || '').trim(),
    });
  });
  return { jobs, warnings };
}

const sleepRandom = (min = 2500, max = 4500) => sleep(min + Math.floor(Math.random() * (max - min)));

async function waitForCards(cdp, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const n = await evalJs(
        cdp,
        "document.querySelectorAll('li.job-card-box, li.job-card-wrapper, ul.job-list-box > li').length",
        { timeoutMs: 4000 },
      );
      if (n > 0) return n;
    } catch {
      // page may be mid-navigation
    }
    await sleep(400);
  }
  return 0;
}

/** Guest pages render the 登录/注册 header and mask salaries; treat them as logged out. */
async function pageShowsGuestHeader(cdp) {
  try {
    const v = await evalJs(cdp, "!!document.querySelector('.header-login-btn')", { timeoutMs: 5000 });
    return v === true;
  } catch {
    return false;
  }
}

export async function searchJobs({ cdp, query, city = '101210100', pages = 1, delay = sleepRandom }) {
  const jobs = [];
  const warnings = [];
  for (let page = 1; page <= pages; page++) {
    const url = buildSearchUrl({ query, city, page });
    await cdp.send('Page.navigate', { url }, { timeoutMs: 15000 });
    const n = await waitForCards(cdp);
    if (n === 0) warnings.push(`第 ${page} 页没有等到职位卡片（可能无结果或页面结构变了）`);
    if (n > 0 && (await pageShowsGuestHeader(cdp))) {
      throw new LoginRequiredError('Boss 直聘登录态已失效（页面显示“登录/注册”，薪资被打码），请运行 dsh-boss-job login 重新登录');
    }

    let usedApi = false;
    try {
      const data = await evalJs(cdp, apiExpr(buildApiUrl({ query, city, page })), { timeoutMs: 20000 });
      if (data && data.code === 0 && Array.isArray(data.list) && data.list.length > 0) {
        for (const raw of data.list) {
          const job = mapApiJob(raw);
          if (job) jobs.push(job);
        }
        usedApi = true;
      } else if (data && data.code === 37) {
        warnings.push(`第 ${page} 页接口触发风控（code 37），改用 DOM 解析`);
      } else if (data && data.code !== 0) {
        warnings.push(`第 ${page} 页接口返回 code=${data.code} ${data.message || ''}，改用 DOM 解析`);
      }
    } catch (err) {
      warnings.push(`第 ${page} 页接口调用失败：${err.message}，改用 DOM 解析`);
    }

    if (!usedApi) {
      const raw = await evalJs(cdp, CARD_EXPR, { timeoutMs: 15000 });
      const parsed = parseCards(raw);
      jobs.push(...parsed.jobs);
      warnings.push(...parsed.warnings);
    }
    if (page < pages) await delay();
  }
  const seen = new Set();
  const unique = jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  return { jobs: unique, warnings };
}
