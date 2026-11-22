import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from '../src/core/filter.mjs';

const prefs = {
  cities: [{ name: '杭州', code: '101210100' }],
  salary: { floor: 7000 },
  directions: ['美妆', '食品', '宠物'],
  experienceMonths: 7,
};
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

test('保留合规岗位', () => {
  const { kept, rejected } = applyFilters([base], prefs);
  assert.equal(kept.length, 1);
  assert.equal(rejected.length, 0);
});

test('薪资下限低于 7000 被剔除', () => {
  const { rejected } = applyFilters([{ ...base, salaryMin: 6000 }], prefs);
  assert.match(rejected[0].reasons.join(), /薪资下限/);
});

test('组长/主管标题被剔除', () => {
  const { rejected } = applyFilters([{ ...base, title: '天猫运营组长' }], prefs);
  assert.match(rejected[0].reasons.join(), /级别偏高/);
});

test('硬性直通车要求被剔除', () => {
  const { rejected } = applyFilters([{ ...base, jd: '要求精通直通车与万相台投放' }], prefs);
  assert.match(rejected[0].reasons.join(), /硬性投流/);
});

test('城市不符被剔除', () => {
  const { rejected } = applyFilters([{ ...base, city: '成都' }], prefs);
  assert.match(rejected[0].reasons.join(), /城市不符/);
});

test('salaryRaw 解析出下限：8-12K 保留，12-15K 超过上限剔除', () => {
  const withCeiling = { ...prefs, salary: { floor: 7000, ceiling: 10000 } };
  assert.equal(applyFilters([{ ...base, salaryMin: undefined, salaryRaw: '8-12K·13薪' }], withCeiling).kept.length, 1);
  const { rejected } = applyFilters([{ ...base, salaryMin: undefined, salaryRaw: '10-15K' }], withCeiling);
  assert.match(rejected[0].reasons.join(), /达到上限/);
});

test('活跃度超过 3 天的被剔除', () => {
  const { rejected } = applyFilters([{ ...base, activeText: '本周活跃' }], { ...prefs, activeDays: 3 });
  assert.match(rejected[0].reasons.join(), /活跃度不足/);
  const fresh = applyFilters([{ ...base, activeText: '今日活跃' }], { ...prefs, activeDays: 3 });
  assert.equal(fresh.kept.length, 1);
});

test('非运营岗（主播/销售）与排除词被剔除', () => {
  const { rejected } = applyFilters([{ ...base, title: '美妆带货主播' }], prefs);
  assert.match(rejected[0].reasons.join(), /岗位方向不符/);
  const avoided = applyFilters([{ ...base, title: '新媒体运营' }], { ...prefs, avoid: ['新媒体'] });
  assert.match(avoided.rejected[0].reasons.join(), /命中排除词/);
});

test('投手/投流岗被剔除', () => {
  const { rejected } = applyFilters([{ ...base, title: '运营型投手/眼部美妆' }], prefs);
  assert.match(rejected[0].reasons.join(), /投流岗/);
});
