import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, salaryMinFrom, requirementMonths } from '../src/core/filter.mjs';

/** No preference is baked into the code: an empty prefs object keeps every job. */
const base = {
  id: 'a',
  title: '示例岗位',
  salaryMin: 8000,
  city: '示例市',
  exp: '1-3年',
  tags: ['示例类目'],
  jd: '负责日常工作',
  company: '示例公司',
};

test('空偏好保留所有岗位（不预设立场）', () => {
  const { kept, rejected } = applyFilters([base], {});
  assert.equal(kept.length, 1);
  assert.equal(rejected.length, 0);
});

test('只有 cities 非空时才按城市过滤', () => {
  const prefs = { cities: [{ name: '示例市', code: '000000' }] };
  assert.equal(applyFilters([{ ...base, city: '另一市' }], prefs).rejected.length, 1);
  assert.match(applyFilters([{ ...base, city: '另一市' }], prefs).rejected[0].reasons.join(), /城市不符/);
  assert.equal(applyFilters([{ ...base, city: '另一市' }], {}).kept.length, 1);
});

test('薪资下限低于 floor 被剔除', () => {
  const { rejected } = applyFilters([{ ...base, salaryMin: 6000 }], { salary: { floor: 8000 } });
  assert.match(rejected[0].reasons.join(), /薪资下限/);
});

test('薪资下限达到 ceiling 被剔除', () => {
  const prefs = { salary: { floor: 8000, ceiling: 12000 } };
  assert.equal(applyFilters([{ ...base, salaryRaw: '8-12K·13薪' }], prefs).kept.length, 1);
  const { rejected } = applyFilters([{ ...base, salaryMin: undefined, salaryRaw: '12-15K' }], prefs);
  assert.match(rejected[0].reasons.join(), /达到上限/);
});

test('salaryMinFrom 解析 K/日薪/时薪', () => {
  assert.equal(salaryMinFrom({ salaryRaw: '8-12K·13薪' }), 8000);
  assert.equal(salaryMinFrom({ salaryRaw: '150-200元/天' }), 3300);
  assert.equal(salaryMinFrom({ salaryRaw: '30-40元/时' }), 5280);
  assert.equal(salaryMinFrom({ salaryRaw: '面议' }), null);
});

test('requirementMonths 解析常见年限写法', () => {
  assert.equal(requirementMonths('1-3年'), 12);
  assert.equal(requirementMonths('3-5年'), 36);
  assert.equal(requirementMonths('3年以上'), 36);
  assert.equal(requirementMonths('经验不限'), 0);
  assert.equal(requirementMonths('在校/应届'), 0);
  assert.equal(requirementMonths('1年以内'), 0);
  assert.equal(requirementMonths(''), null);
});

test('经验过滤按岗位年限下限与用户自述月数比较', () => {
  assert.equal(applyFilters([{ ...base, exp: '1-3年' }], {}).kept.length, 1);
  assert.match(
    applyFilters([{ ...base, exp: '1-3年' }], { experienceMonths: 7 }).rejected[0].reasons.join(),
    /经验要求偏高/,
  );
  assert.match(
    applyFilters([{ ...base, exp: '3-5年' }], { experienceMonths: 7 }).rejected[0].reasons.join(),
    /经验要求偏高/,
  );
  assert.equal(applyFilters([{ ...base, exp: '3-5年' }], { experienceMonths: 36 }).kept.length, 1);
  assert.equal(applyFilters([{ ...base, exp: '经验不限' }], { experienceMonths: 7 }).kept.length, 1);
  assert.equal(applyFilters([{ ...base, exp: '未知' }], { experienceMonths: 7 }).kept.length, 1);
});

test('活跃度过滤只在 activeDays 明确时生效', () => {
  const job = { ...base, activeText: '本周活跃' };
  assert.equal(applyFilters([job], {}).kept.length, 1);
  assert.match(applyFilters([job], { activeDays: 3 }).rejected[0].reasons.join(), /活跃度不足/);
  assert.equal(applyFilters([{ ...base, activeText: '今日活跃' }], { activeDays: 3 }).kept.length, 1);
});

test('排除岗位/类目/排除词只匹配标题与标签', () => {
  const prefs = { excludeTitles: ['示例词'], excludeCategories: ['某类目'], avoid: ['外包'] };
  assert.match(applyFilters([{ ...base, title: '示例岗位示例词' }], prefs).rejected[0].reasons.join(), /命中排除岗位/);
  assert.match(applyFilters([{ ...base, title: '某类目运营' }], prefs).rejected[0].reasons.join(), /命中排除类目/);
  assert.match(applyFilters([{ ...base, tags: ['外包'] }], prefs).rejected[0].reasons.join(), /命中排除词/);
  // JD 正文不参与上面三类匹配，避免误伤
  assert.equal(applyFilters([{ ...base, jd: '本岗位不外包' }], prefs).kept.length, 1);
});

test('excludeJdKeywords 只匹配 JD 正文', () => {
  const prefs = { excludeJdKeywords: ['某工具'] };
  assert.match(
    applyFilters([{ ...base, jd: '要求精通某工具' }], prefs).rejected[0].reasons.join(),
    /命中排除 JD 关键词/,
  );
  // 只在标题出现、JD 没提，不剔除
  assert.equal(applyFilters([{ ...base, title: '某工具运营', jd: '负责日常工作' }], prefs).kept.length, 1);
});
