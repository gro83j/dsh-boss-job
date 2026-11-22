import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, loadPrefs, savePrefs, mergePrefs } from '../src/core/prefs.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('默认偏好是空的：没有城市、薪资、活跃度假设', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  const p = loadPrefs(env);
  assert.equal(p.salary.floor, null);
  assert.equal(p.salary.ceiling, null);
  assert.deepEqual(p.cities, []);
  assert.equal(p.experienceMonths, null);
  assert.equal(p.activeDays, null);
  assert.deepEqual(p.excludeJdKeywords, []);
  assert.equal(p.version, 2);
});

test('loadPrefs 返回可修改副本，不污染 DEFAULT_PREFS', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  const p = loadPrefs(env);
  p.salary.floor = 1;
  assert.equal(DEFAULT_PREFS.salary.floor, null);
});

test('savePrefs 后可读回且中文不转义', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  savePrefs({ ...DEFAULT_PREFS, directions: ['示例方向'] }, env);
  assert.deepEqual(loadPrefs(env).directions, ['示例方向']);
});

test('mergePrefs 数组去重', () => {
  const m = mergePrefs({ ...DEFAULT_PREFS, keywords: ['a'] }, { keywords: ['a', 'b'] });
  assert.deepEqual(m.keywords, ['a', 'b']);
});

test('mergePrefs 对排除项数组也去重', () => {
  const m = mergePrefs(
    { ...DEFAULT_PREFS, excludeJdKeywords: ['x'], excludeTitles: ['y'] },
    { excludeJdKeywords: ['x', 'z'], excludeTitles: ['y', 'w'] },
  );
  assert.deepEqual(m.excludeJdKeywords, ['x', 'z']);
  assert.deepEqual(m.excludeTitles, ['y', 'w']);
});
