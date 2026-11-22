import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CDP, evalJs } from '../src/core/cdp.mjs';

class FakeWS {
  static last;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = 0;
    FakeWS.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
  }
}

test('send 以 id 匹配响应', async () => {
  const cdp = new CDP(FakeWS);
  await cdp.open('ws://x');
  const p = cdp.send('Runtime.evaluate', { expression: '1' });
  const msg = FakeWS.last.sent[0];
  assert.equal(msg.method, 'Runtime.evaluate');
  FakeWS.last.onmessage({ data: JSON.stringify({ id: msg.id, result: { value: 1 } }) });
  assert.deepEqual(await p, { value: 1 });
});

test('超时 reject CDP timeout', async () => {
  const cdp = new CDP(FakeWS);
  await cdp.open('ws://x');
  await assert.rejects(cdp.send('X', {}, { timeoutMs: 30 }), /CDP timeout: X/);
});

test('event 分发', async () => {
  const cdp = new CDP(FakeWS);
  await cdp.open('ws://x');
  let got = null;
  cdp.on('Page.loadEventFired', (p) => {
    got = p;
  });
  FakeWS.last.onmessage({ data: JSON.stringify({ method: 'Page.loadEventFired', params: { t: 1 } }) });
  assert.deepEqual(got, { t: 1 });
});

test('evalJs 遇 exceptionDetails 抛错', async () => {
  const cdp = new CDP(FakeWS);
  await cdp.open('ws://x');
  const p = evalJs(cdp, 'boom()');
  const msg = FakeWS.last.sent[0];
  FakeWS.last.onmessage({
    data: JSON.stringify({ id: msg.id, result: { exceptionDetails: { text: 'ReferenceError' } } }),
  });
  await assert.rejects(p, /ReferenceError/);
});
