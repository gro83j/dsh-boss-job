import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const esc = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const riskText = (risk) => (typeof risk === 'number' ? `${risk}/5` : '未评分');

function jobRow({ job, ev }) {
  const match = ev ? `${ev.score} · ${esc(ev.reason || '')}` : '未评分';
  return `| ${esc(job.company)} | ${esc(job.title)} | ${esc(job.salary)} | ${esc(job.activeText)} | ${match} | ${riskText(ev?.risk)} | [打开](${job.url}) |`;
}

function table(rows) {
  return [
    '| 公司 | 岗位 | 薪资 | 活跃 | 匹配点 | 风险 | 链接 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function renderReport({
  prefs = {},
  jobs = [],
  evaluation = {},
  rejected = [],
  generatedAt = new Date().toISOString().slice(0, 10),
}) {
  const scored = jobs.map((job, index) => ({ job, ev: evaluation[job.id], index }));
  scored.sort((a, b) => (b.ev?.score ?? -1) - (a.ev?.score ?? -1) || a.index - b.index);
  const main = scored.slice(0, 8);
  const rest = scored.slice(8);

  const cities = (prefs.cities || []).map((c) => c.name).filter(Boolean).join('、') || '未设置';
  const directions = (prefs.directions || []).join('、') || '未设置';
  const floor = prefs.salary?.floor ?? '未设置';
  const ceiling = prefs.salary?.ceiling;
  const months = prefs.experienceMonths ?? '未填写';

  const lines = [
    '# dsh-boss-job 筛选报告',
    '',
    `生成时间：${generatedAt}`,
    '',
    '## 偏好摘要',
    '',
    `- 城市：${cities}`,
    `- 薪资下限：${floor}`,
    ...(ceiling ? [`- 薪资上限（下限达到即剔除）：${ceiling}`] : []),
    `- 方向：${directions}`,
    `- 经验：${months} 个月`,
    '',
    `## 主投（${main.length}）`,
    '',
    main.length ? table(main.map(jobRow)) : '无。',
    '',
  ];

  if (rest.length) {
    lines.push(`## 备选（${rest.length}）`, '', table(rest.map(jobRow)), '');
  }

  lines.push('## 剔除摘要', '');
  if (rejected.length) {
    lines.push(`硬筛剔除了 ${rejected.length} 个岗位，前 10 条：`, '');
    for (const item of rejected.slice(0, 10)) {
      lines.push(`- ${esc(item.job?.title)} @ ${esc(item.job?.company)}：${esc((item.reasons || []).join('；'))}`);
    }
  } else {
    lines.push('本报告基于已通过硬筛的岗位；剔除明细可运行 `dsh-boss-job filter` 查看。');
  }

  lines.push(
    '',
    '---',
    '免责声明：',
    '1. 数据来自 Boss 直聘公开页面，仅用于个人求职筛选，请遵守平台条款与 robots 约定。',
    '2. 评分由宿主 AI 依据 JD 生成，可能存在误判，投递前请自行核对岗位详情。',
    '3. 本工具不自动打招呼、不投递、不修改账号状态。',
    '',
  );
  return lines.join('\n');
}

export function exportReport({ outDir, format = 'md', ...data }) {
  mkdirSync(outDir, { recursive: true });
  const md = renderReport(data);
  const mdPath = join(outDir, 'report.md');
  writeFileSync(mdPath, md, 'utf8');
  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify({ generatedAt: data.generatedAt, evaluation: data.evaluation || {}, jobs: data.jobs || [] }, null, 2) + '\n',
    'utf8',
  );
  return format === 'md' ? mdPath : mdPath;
}
