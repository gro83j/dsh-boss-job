import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLoginCookie, waitForLogin } from '../src/core/auth.mjs';

test('hasLoginCookie 只认 wt2', () => {
  assert.equal(hasLoginCookie([{ name: 'wt2', value: 'x' }]), true);
  assert.equal(hasLoginCookie([{ name: '__zp_stoken__', value: 'x' }]), false);
  assert.equal(hasLoginCookie([]), false);
});

test('waitForLogin 轮询到即返回 true', async () => {
  let n = 0;
  const ok = await waitForLogin({
    readCookies: async () => (++n >= 3 ? [{ name: 'wt2', value: 'x' }] : []),
    sleep: async () => {},
  });
  assert.equal(ok, true);
  assert.equal(n, 3);
});

test('waitForLogin 超时返回 false', async () => {
  let t = 0;
  const ok = await waitForLogin({
    readCookies: async () => [],
    sleep: async () => {
      t += 1000;
    },
    timeoutMs: 2500,
    intervalMs: 1000,
    now: () => t,
  });
  assert.equal(ok, false);
});
