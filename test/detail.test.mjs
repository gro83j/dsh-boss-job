import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail } from '../src/core/detail.mjs';

const raw = {
  url: 'https://www.zhipin.com/job_detail/7bf35b5bbce4db721XV83t2_GVNR.html',
  title: '示例岗位',
  salary: '8-12K·13薪',
  exp: '1-3年',
  degree: '本科',
  city: '示例市',
  area: '西湖区',
  company: '示例公司',
  companySize: '1000-9999人',
  companyIndustry: '示例行业',
  activeText: '今日活跃',
  bossName: '张女士',
  bossTitle: '招聘专员',
  tags: ['示例标签', '双休'],
  jd: '岗位职责：负责某类产品与店铺日常…',
  address: '示例市示例区某大厦',
};

test('parseDetail 提取薪资区间与数字', () => {
  const { job, warnings } = parseDetail(raw);
  assert.equal(job.salaryMin, 8000);
  assert.equal(job.salaryMax, 12000);
  assert.equal(job.id, '7bf35b5bbce4db721XV83t2_GVNR');
  assert.equal(warnings.length, 0);
});

test('parseDetail 缺 JD 时告警', () => {
  const { job, warnings } = parseDetail({ ...raw, jd: '' });
  assert.equal(job.jd, '');
  assert.match(warnings[0], /JD 正文为空/);
});

test('parseDetail 缺链接时返回 null', () => {
  const { job, warnings } = parseDetail({ ...raw, url: '' });
  assert.equal(job, null);
  assert.match(warnings[0], /链接/);
});
