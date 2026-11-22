import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { installSkill, mcpConfigSnippet, detectHosts } from '../src/core/setup.mjs';

test('installSkill 在 .dsh/skills 建立链接', () => {
  const cwd = mkdtempSync(tmpdir() + '/bj-');
  const r = installSkill({ host: 'dsh', cwd, link: () => {} });
  assert.match(r.target, /\.dsh[\\/]skills[\\/]boss-job$/);
  assert.equal(r.linked, false);
});

test('installSkill 重复安装时报告已存在', () => {
  const cwd = mkdtempSync(tmpdir() + '/bj-');
  installSkill({ host: 'dsh', cwd, link: () => {} });
  assert.ok(existsSync(cwd));
});

test('mcpConfigSnippet 结构正确', () => {
  const s = mcpConfigSnippet();
  assert.deepEqual(s.mcpServers['boss-job'].args, ['-y', 'dsh-boss-job', 'mcp']);
});

test('detectHosts 只返回已存在的宿主', () => {
  const cwd = mkdtempSync(tmpdir() + '/bj-');
  assert.deepEqual(detectHosts({ cwd, env: { USERPROFILE: mkdtempSync(tmpdir() + '/home-') } }), []);
});
