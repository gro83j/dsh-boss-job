import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, loadPrefs, savePrefs, mergePrefs } from '../src/core/prefs.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('loadPrefs 无文件返回默认副本', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  const p = loadPrefs(env);
  assert.equal(p.salary.floor, 7000);
  p.salary.floor = 1;
  assert.equal(DEFAULT_PREFS.salary.floor, 7000);
});

test('savePrefs 后可读回且中文不转义', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  savePrefs({ ...DEFAULT_PREFS, directions: ['美妆'] }, env);
  assert.deepEqual(loadPrefs(env).directions, ['美妆']);
});

test('mergePrefs 数组去重', () => {
  const m = mergePrefs({ ...DEFAULT_PREFS, keywords: ['a'] }, { keywords: ['a', 'b'] });
  assert.deepEqual(m.keywords, ['a', 'b']);
});
