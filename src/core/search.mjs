import { evalJs, sleep } from './cdp.mjs';

export function buildSearchUrl({ query, city = '101210100', page = 1 }) {
  const u = new URL('https://www.zhipin.com/web/geek/jobs');
  u.searchParams.set('query', query);
  u.searchParams.set('city', city);
  if (page > 1) u.searchParams.set('page', String(page));
  return u.href;
}

/** Runs in the page: collect raw card fields, one object per result card. */
export const CARD_EXPR = `(function () {
  const out = [];
  const cards = document.querySelectorAll('li.job-card-wrapper, ul.job-list-box > li');
  for (const li of cards) {
    const a = li.querySelector('a[href*="/job_detail/"]');
    const txt = (sel) => {
      const el = li.querySelector(sel);
      return el ? (el.innerText || '').trim() : '';
    };
    out.push({
      href: a ? a.getAttribute('href') : '',
      title: txt('.job-name') || txt('.job-title') || txt('h3'),
      salaryRaw: txt('.salary'),
      area: txt('.job-area'),
      tags: Array.from(li.querySelectorAll('.tag-list li')).map((x) => (x.innerText || '').trim()).filter(Boolean),
      company: txt('.company-name') || txt('.company-text .name')
    });
  }
  return out;
})()`;

const PUA = /[\uE000-\uF8FF]/;

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
    jobs.push({
      id: idMatch[1],
      url: new URL(href, 'https://www.zhipin.com').href,
      title: (item.title || '').trim(),
      salaryRaw,
      area: (item.area || '').trim(),
      tags: Array.isArray(item.tags) ? item.tags : [],
      company: (item.company || '').trim(),
      salaryReliable: !PUA.test(salaryRaw),
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
        "document.querySelectorAll('li.job-card-wrapper, ul.job-list-box > li').length",
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

export async function searchJobs({ cdp, query, city = '101210100', pages = 1, delay = sleepRandom }) {
  const jobs = [];
  const warnings = [];
  for (let page = 1; page <= pages; page++) {
    const url = buildSearchUrl({ query, city, page });
    await cdp.send('Page.navigate', { url }, { timeoutMs: 15000 });
    const n = await waitForCards(cdp);
    if (n === 0) warnings.push(`第 ${page} 页没有等到职位卡片（可能无结果或页面结构变了）`);
    const raw = await evalJs(cdp, CARD_EXPR, { timeoutMs: 15000 });
    const parsed = parseCards(raw);
    jobs.push(...parsed.jobs);
    warnings.push(...parsed.warnings);
    if (page < pages) await delay();
  }
  const seen = new Set();
  const unique = jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  return { jobs: unique, warnings };
}
