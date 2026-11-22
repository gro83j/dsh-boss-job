/**
 * Minimal CDP client over the built-in WebSocket. No dependency, no retries:
 * callers decide how to reconnect (see core/session.mjs).
 */
export class CDP {
  constructor(wsImpl = globalThis.WebSocket) {
    this.wsImpl = wsImpl;
    this.ws = null;
    this.pending = new Map();
    this.handlers = new Map();
    this.nextId = 1;
    this.closed = false;
  }

  open(url, { timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
        reject(new Error(`CDP open timeout: ${url}`));
      }, timeoutMs);

      let ws;
      try {
        ws = new this.wsImpl(url);
      } catch (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      ws.onmessage = (ev) => this.#dispatch(ev && ev.data);
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`CDP socket error: ${url}`));
      };
      ws.onclose = () => {
        this.closed = true;
        const err = new Error('CDP socket closed');
        for (const { reject: rj, timer: t } of this.pending.values()) {
          clearTimeout(t);
          rj(err);
        }
        this.pending.clear();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      };
    });
  }

  #dispatch(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (msg.id != null) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (entry.timer) clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error.message || 'CDP error'));
      else entry.resolve(msg.result);
      return;
    }
    const list = this.handlers.get(msg.method);
    if (!list) return;
    for (const fn of list) {
      try {
        fn(msg.params);
      } catch {
        // a broken listener must not kill the socket loop
      }
    }
  }

  send(method, params = {}, { timeoutMs = 0 } = {}) {
    if (!this.ws) return Promise.reject(new Error('CDP socket is not open'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.closed = true;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (port) => `http://127.0.0.1:${port}`;

export async function listTargets(port, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${base(port)}/json/list`);
  if (!res.ok) throw new Error(`DevTools /json/list failed: HTTP ${res.status}`);
  return res.json();
}

/** Reuse a zhipin page or open a new one. */
export async function ensurePage(port, { url = 'https://www.zhipin.com/', fetchImpl = fetch } = {}) {
  const targets = await listTargets(port, { fetchImpl });
  const page = targets.find((t) => t.type === 'page' && typeof t.url === 'string' && t.url.includes('zhipin.com'));
  if (page) return { id: page.id, wsUrl: page.webSocketDebuggerUrl };
  const res = await fetchImpl(`${base(port)}/json/new?url=${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`DevTools /json/new failed: HTTP ${res.status}`);
  const fresh = await res.json();
  return { id: fresh.id, wsUrl: fresh.webSocketDebuggerUrl };
}

export async function evalJs(cdp, expression, { awaitPromise = true, timeoutMs = 15000 } = {}) {
  const r = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise, returnByValue: true },
    { timeoutMs },
  );
  if (r?.exceptionDetails) {
    const ex = r.exceptionDetails;
    throw new Error(`${ex.text || 'Runtime.evaluate failed'} ${ex.exception?.description ?? ''}`.trim());
  }
  return r?.result?.value;
}

export { sleep };
