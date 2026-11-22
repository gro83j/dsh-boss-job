import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, buildSearchUrl, mapApiJob, parseCards } from '../src/core/search.mjs';

test('buildApiUrl 带 scene=1 与分页参数', () => {
  const u = new URL(buildApiUrl({ query: '美妆运营', city: '101210100', page: 2 }));
  assert.equal(u.pathname, '/wapi/zpgeek/search/joblist.json');
  assert.equal(u.searchParams.get('query'), '美妆运营');
  assert.equal(u.searchParams.get('city'), '101210100');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('scene'), '1');
});

test('mapApiJob 映射明文薪资与公司/区域/标签', () => {
  const job = mapApiJob({
    encryptJobId: 'abc123',
    jobName: '天猫运营',
    salaryDesc: '8-10K',
    cityName: '杭州',
    areaDistrict: '上城区',
    businessDistrict: '四季青',
    brandName: '某公司',
    jobLabels: ['1-3年'],
    skills: ['美妆日化'],
    bossName: '李女士',
    bossOnline: true,
    jobValidStatus: 1,
  });
  assert.equal(job.id, 'abc123');
  assert.equal(job.url, 'https://www.zhipin.com/job_detail/abc123.html');
  assert.equal(job.salaryRaw, '8-10K');
  assert.equal(job.salaryReliable, true);
  assert.equal(job.area, '杭州·上城区·四季青');
  assert.deepEqual(job.tags, ['1-3年', '美妆日化']);
  assert.equal(job.bossOnline, true);
});

test('mapApiJob 跳过没有 encryptJobId 的条目', () => {
  assert.equal(mapApiJob({ jobName: 'x' }), null);
});

test('buildSearchUrl 编码关键词', () => {
  const u = new URL(buildSearchUrl({ query: '美妆运营', city: '101210100' }));
  assert.equal(u.searchParams.get('query'), '美妆运营');
  assert.equal(u.searchParams.get('city'), '101210100');
});

test('parseCards 归一化 href/绝对 url/id', () => {
  const { jobs, warnings } = parseCards([
    {
      href: '/job_detail/adcbcfa9cc9675620n162Nq0EFNS.html',
      title: '拼多多运营组长',
      salaryRaw: '15-30K',
      area: '杭州·西湖区',
      tags: ['1-3年', '本科'],
      company: '杭州比柔',
    },
  ]);
  assert.equal(jobs[0].id, 'adcbcfa9cc9675620n162Nq0EFNS');
  assert.equal(jobs[0].url, 'https://www.zhipin.com/job_detail/adcbcfa9cc9675620n162Nq0EFNS.html');
  assert.equal(jobs[0].salaryReliable, true);
  assert.equal(warnings.length, 0);
});

test('parseCards 标记 PUA 乱码薪资不可靠', () => {
  const { jobs } = parseCards([{ href: '/job_detail/x.html', title: 'A', salaryRaw: '\uE032\uE033-\uE034K' }]);
  assert.equal(jobs[0].salaryReliable, false);
});

test('parseCards 缺 href 时告警并跳过', () => {
  const { jobs, warnings } = parseCards([{ title: '无链接' }]);
  assert.equal(jobs.length, 0);
  assert.match(warnings[0], /缺少 job_detail 链接/);
});
