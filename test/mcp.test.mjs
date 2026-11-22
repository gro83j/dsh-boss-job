import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleMessage, TOOLS } from '../src/mcp.mjs';

test('直接运行 src/mcp.mjs 能作为 stdio server 响应 initialize', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/mcp.mjs', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const out = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    let data = '';
    child.stdout.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) {
        clearTimeout(timer);
        child.kill();
        resolve(data);
      }
    });
    child.on('error', reject);
    child.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  });
  assert.match(out, /"protocolVersion":"2024-11-05"/);
});

test('initialize 返回协议版本与 tools 能力', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, {});
  assert.equal(r.result.protocolVersion, '2024-11-05');
  assert.ok(r.result.capabilities.tools);
});

test('tools/list 含 7 个工具', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {});
  assert.equal(r.result.tools.length, TOOLS.length);
  assert.ok(r.result.tools.every((t) => t.inputSchema));
});

test('未知方法返回 -32601', async () => {
  const r = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'nope' }, {});
  assert.equal(r.error.code, -32601);
});

test('tools/call 包装文本结果', async () => {
  const r = await handleMessage(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'boss_prefs_get', arguments: {} } },
    { prefs: { load: () => ({ salary: { floor: 7000 } }) } },
  );
  assert.equal(r.result.content[0].type, 'text');
  assert.match(r.result.content[0].text, /7000/);
});
