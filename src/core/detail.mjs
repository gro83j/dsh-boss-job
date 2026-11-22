import { evalJs, sleep } from './cdp.mjs';

/** Executes inside the detail page; returns one raw object. */
export const DETAIL_EXPR = `(function () {
  const text = (sel) => {
    const el = document.querySelector(sel);
    return el ? (el.innerText || '').trim() : '';
  };
  const lines = (sel) => text(sel).split('\\n').map((s) => s.trim()).filter(Boolean);
  const titleRaw = text('.job-name') || text('h1');
  const title = titleRaw.replace(/\\s*\\d+(?:\\.\\d+)?-\\d+(?:\\.\\d+)?K.*$/, '').trim();
  const companyLines = lines('.level-list .company-name');
  const company = (companyLines[0] === '公司名称' ? companyLines[1] : companyLines[0]) || '';
  const sider = lines('.sider-company');
  const size = sider.find((s) => /\\d+\\s*人/.test(s)) || '';
  const industry = sider.length ? sider[sider.length - 1] : '';
  const boss = lines('.job-boss-info');
  const activeText = boss.find((s) => /活跃|在线/.test(s)) || '';
  return {
    url: location.href,
    title,
    salary: text('.salary'),
    city: text('.text-city'),
    exp: text('.text-experiece'),
    degree: text('.text-degree'),
    company,
    companySize: size,
    companyIndustry: industry,
    activeText,
    bossName: boss[0] || '',
    bossTitle: boss[1] || '',
    tags: Array.from(document.querySelectorAll('.job-keyword-list li')).map((x) => (x.innerText || '').trim()).filter(Boolean),
    jd: text('.job-sec-text'),
    address: text('.location-address')
  };
})()`;

function parseSalary(salary) {
  const m = String(salary || '').match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)K/);
  if (!m) return { salaryMin: null, salaryMax: null };
  return { salaryMin: Math.round(Number(m[1]) * 1000), salaryMax: Math.round(Number(m[2]) * 1000) };
}

export function parseDetail(raw) {
  const warnings = [];
  const url = raw && typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) {
    return { job: null, warnings: ['缺少职位链接，已跳过'] };
  }
  const idMatch = url.match(/job_detail\/([^./]+)\.html/);
  if (!idMatch) {
    return { job: null, warnings: [`无法从链接解析职位 id：${url}`] };
  }
  const jd = typeof raw.jd === 'string' ? raw.jd.trim() : '';
  if (!jd) warnings.push('JD 正文为空（可能岗位下线或页面结构变了）');
  const { salaryMin, salaryMax } = parseSalary(raw.salary);
  return {
    job: {
      id: idMatch[1],
      url,
      title: (raw.title || '').trim(),
      salary: (raw.salary || '').trim(),
      salaryMin,
      salaryMax,
      exp: (raw.exp || '').trim(),
      degree: (raw.degree || '').trim(),
      city: (raw.city || '').trim(),
      area: (raw.area || '').trim(),
      company: (raw.company || '').trim(),
      companySize: (raw.companySize || '').trim(),
      companyIndustry: (raw.companyIndustry || '').trim(),
      activeText: (raw.activeText || '').trim(),
      bossName: (raw.bossName || '').trim(),
      bossTitle: (raw.bossTitle || '').trim(),
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      jd,
      address: (raw.address || '').trim(),
    },
    warnings,
  };
}

const sleepRandom = ([min, max] = [2500, 4500]) => sleep(min + Math.floor(Math.random() * (max - min)));

async function waitForDetail(cdp, timeoutMs = 16000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await evalJs(
        cdp,
        `({ href: location.href,
            jdLen: (document.querySelector('.job-sec-text') || { innerText: '' }).innerText.trim().length,
            body: (document.body ? document.body.innerText : '').slice(0, 300) })`,
        { timeoutMs: 5000 },
      );
      if (last.jdLen > 0) return last;
      const waited = Date.now() - started;
      if (waited > 3000 && /安全验证|请完成验证|登录后查看|登录\/注册/.test(last.body)) return last;
      if (waited > 3000 && /\/web\/geek\/jobs/.test(last.href)) return last;
    } catch {
      // navigation in flight
    }
    await sleep(500);
  }
  return last;
}

export async function fetchDetails({ cdp, ids, urlFor, intervalMs = [2500, 4500], warn = () => {} }) {
  const jobs = [];
  const warnings = [];
  let aborted = false;
  for (const id of ids) {
    const url = urlFor ? urlFor(id) : `https://www.zhipin.com/job_detail/${id}.html`;
    await cdp.send('Page.navigate', { url }, { timeoutMs: 15000 });
    const state = await waitForDetail(cdp);
    const redirected = state && !/\/job_detail\//.test(state.href || '');
    const blocked = state && /安全验证|请完成验证|登录后查看/.test(state.body || '');
    if (!state || state.jdLen === 0) {
      if (redirected || blocked) {
        warnings.push(`岗位 ${id} 被重定向或要求验证，已停止后续抓取`);
        aborted = true;
        break;
      }
      warnings.push(`岗位 ${id} 未加载出 JD，已跳过`);
      warn(`跳过 ${id}`);
      continue;
    }
    const raw = await evalJs(cdp, DETAIL_EXPR, { timeoutMs: 10000 });
    const parsed = parseDetail(raw && raw.url ? raw : { ...raw, url });
    jobs.push(...(parsed.job ? [parsed.job] : []));
    warnings.push(...parsed.warnings);
    if (ids.indexOf(id) < ids.length - 1) await sleepRandom(intervalMs);
  }
  return { jobs, warnings, aborted };
}
