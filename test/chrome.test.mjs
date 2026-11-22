import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPort, buildLaunchArgs, findChrome } from '../src/core/chrome.mjs';
import { readRuntime, writeRuntime, clearRuntime } from '../src/core/runtime.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test('pickPort 在 win32 跳过 9201-9300', async () => {
  const tried = [];
  const port = await pickPort({
    platform: 'win32',
    start: 9199,
    end: 9305,
    probe: async (p) => {
      tried.push(p);
      return p === 9301;
    },
  });
  assert.equal(port, 9301);
  assert.ok(!tried.includes(9222));
});

test('pickPort 范围内全占用时回退随机高位端口', async () => {
  const port = await pickPort({ start: 9400, end: 9401, probe: async () => false, random: () => 0.5 });
  assert.ok(port >= 10000 && port <= 60000);
});

test('buildLaunchArgs 带专用 profile 与调试端口', () => {
  const args = buildLaunchArgs({ profileDir: 'D:/p', port: 9410, url: 'https://www.zhipin.com' });
  assert.ok(args.includes('--user-data-dir=D:/p'));
  assert.ok(args.includes('--remote-debugging-port=9410'));
  assert.equal(args.at(-1), 'https://www.zhipin.com');
});

test('findChrome 找不到时返回 null', () => {
  assert.equal(findChrome({ platform: 'win32', exists: () => false, env: {} }), null);
});

test('runtime 读写清', () => {
  const env = { BOSS_JOB_HOME: mkdtempSync(tmpdir() + '/bj-') };
  assert.equal(readRuntime(env), null);
  writeRuntime({ port: 9410, pid: 123, profileDir: 'D:/p' }, env);
  assert.equal(readRuntime(env).port, 9410);
  clearRuntime(env);
  assert.equal(readRuntime(env), null);
});
