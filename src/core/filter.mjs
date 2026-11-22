export const SENIOR_RE = /组长|主管|经理|总监|负责人|店长|督导|合伙人|操盘/;
export const HARD_FLOW_RE = /(必须|要求|需要|熟悉|精通)[^。；\n]{0,20}(直通车|万相台|千川|巨量|引力魔方|付费投放)/;
export const BAD_CAT_RE = /服装|服饰|女装|男装|鞋|箱包|内衣|家纺|珠宝|母婴|童装|3C|数码|婚纱|医疗|装修|家装|汽车|教育|游戏|房产|家电/;
export const HIGH_EXP_RE = /3-5年|5-10年|3年以上|5年以上/;
export const RECENT_ACTIVE_RE = /刚刚活跃|今日活跃|3日内活跃|在线/;
export const BAD_ROLE_RE = /主播|助播|带货|客服|销售|BD|商务|招商|采购|仓库|物流|美工|拍摄|剪辑|编导|摄影|投手/;
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

export function applyFilters(jobs, prefs) {
  const cities = (prefs.cities || []).map((c) => c.name).filter(Boolean);
  const directions = prefs.directions || [];
  const floor = prefs.salary?.floor ?? 0;
  const ceiling = prefs.salary?.ceiling ?? null;
  const months = prefs.experienceMonths ?? 0;
  const activeDays = prefs.activeDays ?? 0;
  const kept = [];
  const rejected = [];

  for (const job of jobs || []) {
    const reasons = [];
    const cityText = String(job.city || '');
    if (cities.length && !cities.some((name) => cityText.includes(name))) {
      reasons.push(`城市不符: ${cityText || '未知'}`);
    }
    const salaryMin = salaryMinFrom(job);
    if (salaryMin !== null && salaryMin < floor) {
      reasons.push(`薪资下限 ${salaryMin} 低于 ${floor}`);
    }
    if (salaryMin !== null && ceiling !== null && salaryMin >= ceiling) {
      reasons.push(`薪资下限 ${salaryMin} 达到上限 ${ceiling}`);
    }
    if (HIGH_EXP_RE.test(String(job.exp || '')) && months < 24) {
      reasons.push('经验要求偏高');
    }
    if (SENIOR_RE.test(String(job.title || ''))) {
      reasons.push('级别偏高');
    }
    if (HARD_FLOW_RE.test(String(job.jd || ''))) {
      reasons.push('硬性投流');
    }
    const activeText = String(job.activeText || '');
    if (activeDays > 0 && activeText && !RECENT_ACTIVE_RE.test(activeText)) {
      reasons.push(`活跃度不足: ${activeText}`);
    }
    const title = String(job.title || '');
    if (BAD_ROLE_RE.test(title) && !/运营/.test(title)) {
      reasons.push('岗位方向不符');
    }
    if (TITLE_FLOW_RE.test(title)) {
      reasons.push('投流岗');
    }
    const titleTags = `${job.title || ''} ${(job.tags || []).join(' ')}`;
    if (Array.isArray(prefs.avoid) && prefs.avoid.some((word) => word && titleTags.includes(word))) {
      reasons.push('命中排除词');
    }
    if (BAD_CAT_RE.test(titleTags) && !directions.some((d) => titleTags.includes(d))) {
      reasons.push('类目不符');
    }
    if (reasons.length) rejected.push({ job, reasons });
    else kept.push(job);
  }

  return { kept, rejected };
}
