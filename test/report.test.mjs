import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../src/core/report.mjs';

const prefs = { cities: [{ name: '杭州' }], salary: { floor: 7000 }, directions: ['美妆'] };
const job = {
  id: 'a',
  title: '天猫产品运营',
  company: '悠可',
  salary: '8-12K·13薪',
  activeText: '今日活跃',
  url: 'https://www.zhipin.com/job_detail/a.html',
  tags: ['美妆日化'],
};
const evaluation = { a: { fit: 5, reachability: 4, growth: 4, risk: 2, score: 88, reason: '动作高度重合' } };

test('报告包含主投表与链接', () => {
  const md = renderReport({ prefs, jobs: [job], evaluation, generatedAt: '2026-11-22' });
  assert.match(md, /主投/);
  assert.match(md, /悠可/);
  assert.match(md, /https:\/\/www\.zhipin\.com\/job_detail\/a\.html/);
  assert.match(md, /88/);
});

test('未评分岗位降级并标注', () => {
  const md = renderReport({ prefs, jobs: [job], evaluation: {}, generatedAt: '2026-11-22' });
  assert.match(md, /未评分/);
});
