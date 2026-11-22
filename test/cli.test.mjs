import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dataDir, prefsFile } from '../src/core/paths.mjs';

test('--version 打印 package.json 版本', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const out = execFileSync(process.execPath, ['src/cli.mjs', '--version'], { encoding: 'utf8' });
  assert.equal(out.trim(), pkg.version);
});

test('--help 列出 login/search/detail/mcp/setup/doctor', () => {
  const out = execFileSync(process.execPath, ['src/cli.mjs', '--help'], { encoding: 'utf8' });
  for (const cmd of ['login', 'search', 'detail', 'mcp', 'setup', 'doctor']) {
    assert.match(out, new RegExp(cmd));
  }
});

test('dataDir 优先 BOSS_JOB_HOME', () => {
  assert.equal(dataDir({ BOSS_JOB_HOME: 'C:/tmp/bj' }), 'C:/tmp/bj');
  assert.match(prefsFile({}), /\.dsh-boss-job[\\/]preferences\.json$/);
});
