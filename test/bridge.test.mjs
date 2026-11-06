import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig, readToken, authorize } from '../src/config.mjs';
import { Backend } from '../src/backend.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureTools = [
  { name: 'fixture_read', description: 'TEST FIXTURE ONLY, not an Edits API.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'fixture_write', description: 'TEST FIXTURE ONLY.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } },
  { name: 'fixture_unknown', description: 'TEST FIXTURE ONLY.', inputSchema: { type: 'object' } }
];
function tempToken(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edits-mcp-test-'));
  const file = path.join(dir, 'access.token');
  fs.writeFileSync(file, 'fixture-secret-not-real\n', { mode: 0o600 });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return file;
}
async function nativeFixture(t, mode = 'normal') {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer fixture-secret-not-real') { res.writeHead(401).end(); return; }
    if (mode === 'redirect') { res.writeHead(307, { location: 'http://127.0.0.1:1/mcp' }).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const rpc = JSON.parse(body);
    if (rpc.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (rpc.method === 'initialize') result = { protocolVersion: rpc.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: 'test-fixture-not-edits', version: '1' } };
    else if (rpc.method === 'tools/list') {
      if (mode === 'pagination') result = rpc.params?.cursor ? { tools: fixtureTools.slice(1) } : { tools: fixtureTools.slice(0, 1), nextCursor: 'next' };
      else if (mode === 'cycle') result = { tools: [], nextCursor: 'again' };
      else result = { tools: fixtureTools };
    } else if (rpc.method === 'tools/call') { calls.push(rpc.params); result = { content: [{ type: 'text', text: JSON.stringify(rpc.params) }] }; }
    else result = {};
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, calls };
}

test('config restricts credentials to exact loopback MCP URL', () => {
  for (const url of ['https://127.0.0.1:19501/mcp', 'http://localhost:19501/mcp', 'http://example.com/mcp', 'http://127.0.0.1/mcp?token=x', 'http://a:b@127.0.0.1/mcp', 'http://127.0.0.1/other', 'http://127.0.0.1/mcp#x']) {
    assert.throws(() => loadConfig({ EDITS_MCP_URL: url }));
  }
  assert.equal(loadConfig({}).url.href, 'http://127.0.0.1:19501/mcp');
  assert.throws(() => loadConfig({ EDITS_ALLOWED_TOOLS: '["*"]' }));
  assert.throws(() => loadConfig({ EDITS_ALLOWED_TOOLS: '{}' }));
  assert.throws(() => loadConfig({ EDITS_ALLOW_WRITES: 'yes' }));
  assert.throws(() => loadConfig({ EDITS_TOKEN_FILE: 'relative' }));
});
test('token permissions, symlinks, missing token and multiline rejection', t => {
  const file = tempToken(t);
  assert.equal(readToken({ tokenFile: file }), 'fixture-secret-not-real');
  assert.throws(() => readToken({}), /TOKEN_MISSING/);
  fs.chmodSync(file, 0o644);
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_FILE_UNSAFE/);
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, 'a\nb');
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_INVALID/);
  const link = `${file}.link`; fs.symlinkSync(file, link);
  assert.throws(() => readToken({ tokenFile: link }));
});
test('write and unknown tools fail closed even if allowlisted', () => {
  const config = loadConfig({ EDITS_ALLOWED_TOOLS: JSON.stringify(fixtureTools.map(t => t.name)) });
  authorize(config, fixtureTools[0]);
  assert.throws(() => authorize(config, fixtureTools[1]), /POLICY_DENIED/);
  assert.throws(() => authorize(config, fixtureTools[2]), /POLICY_DENIED/);
  assert.throws(() => authorize(config, { ...fixtureTools[0], annotations: { readOnlyHint: true, destructiveHint: true } }), /POLICY_DENIED/);
  assert.throws(() => authorize(loadConfig({ EDITS_ALLOW_WRITES: '1' }), fixtureTools[1]), /POLICY_DENIED/);
});
for (const mode of ['normal', 'pagination']) test(`authenticated native catalog and writes (${mode})`, async t => {
  const fixture = await nativeFixture(t, mode);
  const config = loadConfig({ EDITS_MCP_URL: fixture.url, EDITS_TOKEN_FILE: tempToken(t), EDITS_ALLOWED_TOOLS: '["fixture_read","fixture_write"]' });
  const backend = new Backend(config);
  assert.deepEqual((await backend.catalog()).map(t => t.name), fixtureTools.map(t => t.name));
  const response = await backend.invoke('fixture_read', { sample: 42 });
  assert.equal(JSON.parse(response.content[0].text).arguments.sample, 42);
  await assert.rejects(backend.invoke('fixture_write', {}), /POLICY_DENIED/);
  await assert.rejects(backend.invoke('no_such_tool', {}), /TOOL_NOT_FOUND/);
  assert.equal(fixture.calls.length, 1);
  config.allowWrites = true;
  await backend.invoke('fixture_write', {});
  assert.equal(fixture.calls.length, 2);
});
for (const mode of ['redirect', 'cycle']) test(`upstream ${mode} is rejected without secret leakage`, async t => {
  const fixture = await nativeFixture(t, mode);
  const backend = new Backend(loadConfig({ EDITS_MCP_URL: fixture.url, EDITS_TOKEN_FILE: tempToken(t) }));
  await assert.rejects(backend.catalog(), error => error.message.startsWith('UPSTREAM_FAILED:') && !error.message.includes('fixture-secret'));
  assert.equal(fixture.calls.length, 0);
});
test('end-to-end stdio MCP discovery, status, catalog and policy', async t => {
  const fixture = await nativeFixture(t);
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs')],
    env: { PATH: process.env.PATH, EDITS_MCP_URL: fixture.url, EDITS_TOKEN_FILE: tempToken(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' }, stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'integration-test', version: '1' });
  t.after(async () => { await client.close(); assert.ok(!stderr.includes('fixture-secret')); });
  await client.connect(transport);
  assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['edits_status', 'edits_catalog', 'edits_invoke']);
  const status = await client.callTool({ name: 'edits_status', arguments: {} });
  assert.equal(JSON.parse(status.content[0].text).bridge.allowWrites, false);
  const catalog = await client.callTool({ name: 'edits_catalog', arguments: {} });
  assert.equal(JSON.parse(catalog.content[0].text).tools.length, 3);
  const ok = await client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { a: 1 } } });
  assert.equal(JSON.parse(ok.content[0].text).name, 'fixture_read');
  const denied = await client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_write', arguments: {} } });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0].text, /POLICY_DENIED/);
  assert.equal(fixture.calls.length, 1);
});
