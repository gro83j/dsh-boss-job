import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, salaryMinFrom } from '../src/core/filter.mjs';

/** No preference is baked into the code: an empty prefs object keeps every job. */
const base = {
  id: 'a',
  title: '天猫运营',
  salaryMin: 8000,
  city: '杭州',
  exp: '1-3年',
  tags: ['美妆日化'],
  jd: '负责店铺日常运营',
  company: 'X',
};

test('空偏好保留所有岗位（不预设立场）', () => {
  const { kept, rejected } = applyFilters([base], {});
  assert.equal(kept.length, 1);
  assert.equal(rejected.length, 0);
});

test('只有 cities 非空时才按城市过滤', () => {
  const prefs = { cities: [{ name: '杭州', code: '101210100' }] };
  assert.equal(applyFilters([{ ...base, city: '成都' }], prefs).rejected.length, 1);
  assert.match(applyFilters([{ ...base, city: '成都' }], prefs).rejected[0].reasons.join(), /城市不符/);
  assert.equal(applyFilters([{ ...base, city: '成都' }], {}).kept.length, 1);
});

test('薪资下限低于 floor 被剔除', () => {
  const { rejected } = applyFilters([{ ...base, salaryMin: 6000 }], { salary: { floor: 7000 } });
  assert.match(rejected[0].reasons.join(), /薪资下限/);
});

test('薪资下限达到 ceiling 被剔除', () => {
  const prefs = { salary: { floor: 7000, ceiling: 10000 } };
  assert.equal(applyFilters([{ ...base, salaryRaw: '8-12K·13薪' }], prefs).kept.length, 1);
  const { rejected } = applyFilters([{ ...base, salaryMin: undefined, salaryRaw: '10-15K' }], prefs);
  assert.match(rejected[0].reasons.join(), /达到上限/);
});

test('salaryMinFrom 解析 K/日薪/时薪', () => {
  assert.equal(salaryMinFrom({ salaryRaw: '8-12K·13薪' }), 8000);
  assert.equal(salaryMinFrom({ salaryRaw: '150-200元/天' }), 3300);
  assert.equal(salaryMinFrom({ salaryRaw: '30-40元/时' }), 5280);
  assert.equal(salaryMinFrom({ salaryRaw: '面议' }), null);
});

test('只有 rejectSenior 为 true 才剔除管理岗', () => {
  const job = { ...base, title: '天猫运营组长' };
  assert.equal(applyFilters([job], {}).kept.length, 1);
  assert.match(applyFilters([job], { rejectSenior: true }).rejected[0].reasons.join(), /级别偏高/);
});

test('只有 rejectHardFlow 为 true 才剔除投流岗', () => {
  const job = { ...base, jd: '要求精通直通车与万相台投放' };
  assert.equal(applyFilters([job], {}).kept.length, 1);
  assert.match(applyFilters([job], { rejectHardFlow: true }).rejected[0].reasons.join(), /投流/);
});

test('经验要求过滤只在 experienceMonths 明确且 <24 时生效', () => {
  const job = { ...base, exp: '3-5年' };
  assert.equal(applyFilters([job], {}).kept.length, 1);
  assert.match(applyFilters([job], { experienceMonths: 7 }).rejected[0].reasons.join(), /经验要求偏高/);
  assert.equal(applyFilters([job], { experienceMonths: 60 }).kept.length, 1);
});

test('活跃度过滤只在 activeDays 明确时生效', () => {
  const job = { ...base, activeText: '本周活跃' };
  assert.equal(applyFilters([job], {}).kept.length, 1);
  assert.match(applyFilters([job], { activeDays: 3 }).rejected[0].reasons.join(), /活跃度不足/);
  assert.equal(applyFilters([{ ...base, activeText: '今日活跃' }], { activeDays: 3 }).kept.length, 1);
});

test('排除岗位/类目/排除词只匹配标题与标签', () => {
  const prefs = { excludeTitles: ['主播'], excludeCategories: ['服装'], avoid: ['外包'] };
  assert.match(applyFilters([{ ...base, title: '美妆主播' }], prefs).rejected[0].reasons.join(), /命中排除岗位/);
  assert.match(applyFilters([{ ...base, title: '服装运营' }], prefs).rejected[0].reasons.join(), /命中排除类目/);
  assert.match(applyFilters([{ ...base, title: '运营专员', tags: ['外包'] }], prefs).rejected[0].reasons.join(), /命中排除词/);
  // JD 正文不参与排除词匹配，避免误伤
  assert.equal(applyFilters([{ ...base, jd: '本岗位不外包' }], prefs).kept.length, 1);
});
