/**
 * Hard filters are preference-driven on purpose: nothing about a job direction,
 * category or seniority is assumed by the code. Every rule below only runs when
 * the user's preferences ask for it, so the same build works for any industry.
 */

export const RECENT_ACTIVE_RE = /刚刚活跃|今日活跃|3日内活跃|在线/;

/** Monthly CNY lower bound from a salary string such as `8-12K`, `7-10K·13薪`, or `150-200元/天`. */
export function salaryMinFrom(job) {
  if (job && typeof job.salaryMin === 'number') return job.salaryMin;
  const text = String((job && (job.salaryRaw || job.salary)) || '');
  const monthly = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*K/i);
  if (monthly) return Math.round(parseFloat(monthly[1]) * 1000);
  const daily = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*元\s*\/\s*[天日]/);
  if (daily) return Math.round(parseFloat(daily[1]) * 22);
  const hourly = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*元\s*\/\s*(?:时|小时)/);
  if (hourly) return Math.round(parseFloat(hourly[1]) * 8 * 22);
  return null;
}

/**
 * Lower bound of the experience a job asks for, in months. Understands the
 * strings Boss uses (`1-3年`, `3年以上`, `经验不限`, `在校/应届`, `1年以内`).
 * Returns null when the text cannot be parsed — callers must treat null as "unknown".
 */
export function requirementMonths(expText) {
  const text = String(expText || '').trim();
  if (!text) return null;
  if (/经验不限|不限经验|应届|在校/.test(text)) return 0;
  if (/年以内/.test(text)) return 0;
  const range = text.match(/(\d+)\s*[-~～至]\s*(\d+)\s*年/);
  if (range) return parseInt(range[1], 10) * 12;
  const above = text.match(/(\d+)\s*年\s*(以上|及以上|\+)/);
  if (above) return parseInt(above[1], 10) * 12;
  const single = text.match(/^(\d+)\s*年$/);
  if (single) return parseInt(single[1], 10) * 12;
  return null;
}

function includesAny(text, words) {
  if (!Array.isArray(words)) return false;
  return words.some((word) => typeof word === 'string' && word.length > 0 && text.includes(word));
}

export function applyFilters(jobs, prefs = {}) {
  const cities = (prefs.cities || []).map((c) => c.name).filter(Boolean);
  const floor = prefs.salary?.floor ?? null;
  const ceiling = prefs.salary?.ceiling ?? null;
  const months = prefs.experienceMonths ?? null;
  const activeDays = prefs.activeDays ?? null;
  const kept = [];
  const rejected = [];

  for (const job of jobs || []) {
    const reasons = [];
    const cityText = String(job.city || '');
    if (cities.length && !cities.some((name) => cityText.includes(name))) {
      reasons.push(`城市不符: ${cityText || '未知'}`);
    }

    const salaryMin = salaryMinFrom(job);
    if (salaryMin !== null && floor !== null && salaryMin < floor) {
      reasons.push(`薪资下限 ${salaryMin} 低于 ${floor}`);
    }
    if (salaryMin !== null && ceiling !== null && salaryMin >= ceiling) {
      reasons.push(`薪资下限 ${salaryMin} 达到上限 ${ceiling}`);
    }

    if (months !== null) {
      const required = requirementMonths(job.exp);
      if (required !== null && required > months) {
        reasons.push(`经验要求偏高: 要求 ${job.exp || '未知'}，用户 ${months} 个月`);
      }
    }

    const activeText = String(job.activeText || '');
    if (activeDays !== null && activeDays > 0 && activeText && !RECENT_ACTIVE_RE.test(activeText)) {
      reasons.push(`活跃度不足: ${activeText}`);
    }

    const title = String(job.title || '');
    const jd = String(job.jd || '');

    if (includesAny(title, prefs.excludeTitles)) {
      reasons.push('命中排除岗位');
    }

    const titleTags = `${title} ${(job.tags || []).join(' ')}`;
    if (includesAny(titleTags, prefs.excludeCategories)) {
      reasons.push('命中排除类目');
    }
    if (includesAny(titleTags, prefs.avoid)) {
      reasons.push('命中排除词');
    }
    if (includesAny(jd, prefs.excludeJdKeywords)) {
      reasons.push('命中排除 JD 关键词');
    }

    if (reasons.length) rejected.push({ job, reasons });
    else kept.push(job);
  }

  return { kept, rejected };
}
