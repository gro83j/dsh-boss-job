/**
 * Hard filters are preference-driven on purpose: nothing about a job direction,
 * category or seniority is assumed by the code. Every rule below only runs when
 * the user's preferences ask for it, so the same build works for any industry.
 */

export const SENIOR_RE = /组长|主管|经理|总监|负责人|店长|督导|合伙人|操盘/;
export const HARD_FLOW_RE = /(必须|要求|需要|熟悉|精通)[^。；\n]{0,20}(直通车|万相台|千川|巨量|引力魔方|付费投放)/;
export const HIGH_EXP_RE = /3-5年|5-10年|3年以上|5年以上/;
export const RECENT_ACTIVE_RE = /刚刚活跃|今日活跃|3日内活跃|在线/;
export const TITLE_FLOW_RE = /投手|投流|投放|推广专员|付费推广/;

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

    if (months !== null && months < 24 && HIGH_EXP_RE.test(String(job.exp || ''))) {
      reasons.push('经验要求偏高');
    }
    const title = String(job.title || '');
    if (prefs.rejectSenior === true && SENIOR_RE.test(title)) {
      reasons.push('级别偏高');
    }
    const jd = String(job.jd || '');
    if (prefs.rejectHardFlow === true && (HARD_FLOW_RE.test(jd) || TITLE_FLOW_RE.test(title))) {
      reasons.push('硬性投流/投放岗');
    }

    const activeText = String(job.activeText || '');
    if (activeDays !== null && activeDays > 0 && activeText && !RECENT_ACTIVE_RE.test(activeText)) {
      reasons.push(`活跃度不足: ${activeText}`);
    }

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

    if (reasons.length) rejected.push({ job, reasons });
    else kept.push(job);
  }

  return { kept, rejected };
}
