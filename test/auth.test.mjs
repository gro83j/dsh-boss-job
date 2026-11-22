import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLoginCookie, loginCookieValue, waitForLogin, waitForNewLogin } from '../src/core/auth.mjs';

test('loginCookieValue 取 wt2 的值', () => {
  assert.equal(loginCookieValue([{ name: 'wt2', value: 'abc' }]), 'abc');
  assert.equal(loginCookieValue([{ name: '__zp_stoken__', value: 'x' }]), null);
  assert.equal(loginCookieValue(null), null);
});

test('waitForNewLogin 忽略旧 cookie，等到变化才返回', async () => {
  let n = 0;
  const ok = await waitForNewLogin({
    readCookies: async () => (++n < 3 ? [{ name: 'wt2', value: 'old' }] : [{ name: 'wt2', value: 'new' }]),
    initial: 'old',
    sleep: async () => {},
  });
  assert.equal(ok, true);
  assert.equal(n, 3);
});

test('waitForNewLogin 超时返回 false', async () => {
  let t = 0;
  const ok = await waitForNewLogin({
    readCookies: async () => [{ name: 'wt2', value: 'old' }],
    initial: 'old',
    sleep: async () => {
      t += 1000;
    },
    timeoutMs: 2500,
    intervalMs: 1000,
    now: () => t,
  });
  assert.equal(ok, false);
});

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
