export const SENIOR_RE = /组长|主管|经理|总监|负责人|店长|督导|合伙人|操盘/;
export const HARD_FLOW_RE = /(必须|要求|需要|熟悉|精通)[^。；\n]{0,20}(直通车|万相台|千川|巨量|引力魔方|付费投放)/;
export const BAD_CAT_RE = /服装|服饰|女装|男装|鞋|箱包|内衣|家纺|珠宝|母婴|童装|3C|数码|婚纱|医疗|装修|家装|汽车|教育|游戏|房产|家电/;
export const HIGH_EXP_RE = /3-5年|5-10年|3年以上|5年以上/;

export function applyFilters(jobs, prefs) {
  const cities = (prefs.cities || []).map((c) => c.name).filter(Boolean);
  const directions = prefs.directions || [];
  const floor = prefs.salary?.floor ?? 0;
  const months = prefs.experienceMonths ?? 0;
  const kept = [];
  const rejected = [];

  for (const job of jobs || []) {
    const reasons = [];
    const cityText = String(job.city || '');
    if (cities.length && !cities.some((name) => cityText.includes(name))) {
      reasons.push(`城市不符: ${cityText || '未知'}`);
    }
    if (typeof job.salaryMin === 'number' && job.salaryMin < floor) {
      reasons.push(`薪资下限 ${job.salaryMin} 低于 ${floor}`);
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
    const catText = `${job.title || ''} ${(job.tags || []).join(' ')}`;
    if (BAD_CAT_RE.test(catText) && !directions.some((d) => catText.includes(d))) {
      reasons.push('类目不符');
    }
    if (reasons.length) rejected.push({ job, reasons });
    else kept.push(job);
  }

  return { kept, rejected };
}
