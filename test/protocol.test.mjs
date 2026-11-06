import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadConfig } from '../src/config.mjs';
import { Backend } from '../src/backend.mjs';
import { validateArguments } from '../src/validation.mjs';
import { fixture, tokenFile, bridge, secret, readTool, pause } from './support/fixture.mjs';
const configFor = (t, f, extra = {}) => loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]', ...extra });

for (const version of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']) test(`legacy negotiation ${version}`, async t => {
  const f = await fixture(t, { version });
  assert.equal((await new Backend(configFor(t, f)).catalog()).length, 1);
});
test('unsupported protocol fails closed', async t => {
  const f = await fixture(t, { version: '2099-01-01' });
  await assert.rejects(new Backend(configFor(t, f)).catalog(), /UPSTREAM_FAILED/);
});
test('SSE native call result is forwarded', async t => {
  const f = await fixture(t, { sse: true });
  const result = await new Backend(configFor(t, f)).invoke('fixture_read', { value: 4 });
  assert.equal(JSON.parse(result.content[0].text).value, 4);
});
test('structured and image content survives the bridge unchanged', async t => {
  const result = { content: [{ type: 'text', text: 'fixture output' }, { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }], structuredContent: { value: 2 }, isError: false };
  const f = await fixture(t, { result });
  const { client } = await bridge(t, { EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' });
  const actual = await client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { value: 2 } } });
  assert.deepEqual(actual, result);
});
test('native tool isError result is preserved', async t => {
  const result = { content: [{ type: 'text', text: 'Fixture validation failed' }], isError: true };
  const f = await fixture(t, { result });
  assert.deepEqual(await new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }), result);
});
test('RPC errors redact upstream exception text and do not retry', async t => {
  const f = await fixture(t, { rpcError: true });
  await assert.rejects(new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }), e => e.message.startsWith('UPSTREAM_FAILED:') && !e.message.includes(secret));
  assert.equal(f.state.calls.length, 1);
});
test('timeout does not retry a dispatched native call', async t => {
  const f = await fixture(t, { delay: 450 });
  const start = performance.now();
  await assert.rejects(new Backend(configFor(t, f, { EDITS_TIMEOUT_MS: '200' })).invoke('fixture_read', { value: 1 }), /UPSTREAM_FAILED/);
  assert.ok(performance.now() - start < 2000);
  await pause(500);
  assert.equal(f.state.calls.length, 1);
});
test('already cancelled call does not connect', async t => {
  const f = await fixture(t); const abort = new AbortController(); abort.abort();
  await assert.rejects(new Backend(configFor(t, f)).catalog(abort.signal), /CANCELLED/);
  assert.equal(f.state.requests.length, 0);
});
test('active cancellation returns promptly and does not retry', async t => {
  const f = await fixture(t, { delay: 350 }); const abort = new AbortController();
  const promise = new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }, abort.signal);
  const rejection = assert.rejects(promise, /CANCELLED/);
  const waitUntil = performance.now() + 5000;
  while (!f.state.calls.length && performance.now() < waitUntil) await pause(5);
  assert.equal(f.state.calls.length, 1, 'Fixture should receive the call before cancellation.');
  abort.abort(); await rejection; await pause(400);
  assert.equal(f.state.calls.length, 1);
});
test('parallel stdio invocations are serialized', async t => {
  const f = await fixture(t, { delay: 40 });
  const { client } = await bridge(t, { EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' });
  const results = await Promise.all(Array.from({ length: 5 }, (_, value) => client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { value } } })));
  assert.ok(results.every(result => !result.isError));
  assert.equal(f.state.maxActive, 1);
  assert.deepEqual(f.state.calls.map(call => call.arguments.value), [0, 1, 2, 3, 4]);
});
test('queue overflow is rejected rather than dispatched', async t => {
  const f = await fixture(t, { delay: 5 });
  const { client } = await bridge(t, { EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' });
  const results = await Promise.all(Array.from({ length: 36 }, (_, value) => client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { value } } })));
  const busy = results.filter(r => r.isError && r.content[0].text.startsWith('BUSY:'));
  assert.ok(busy.length >= 4); assert.equal(f.state.calls.length, results.length - busy.length);
});
test('catalog is refreshed before dispatch after screen change', async t => {
  const f = await fixture(t); const b = new Backend(configFor(t, f));
  await b.catalog(); f.state.tools = [];
  await assert.rejects(b.invoke('fixture_read', { value: 1 }), /TOOL_NOT_FOUND/);
  assert.equal(f.state.calls.length, 0);
});
test('changed annotations are reevaluated before dispatch', async t => {
  const f = await fixture(t); const b = new Backend(configFor(t, f));
  await b.catalog(); f.state.tools[0].annotations = { readOnlyHint: false };
  await assert.rejects(b.invoke('fixture_read', { value: 1 }), /POLICY_DENIED/);
  assert.equal(f.state.calls.length, 0);
});
test('100 page catalog limit stops unique cursor stream', async t => {
  let pages = 0;
  const f = await fixture(t, { list: () => ({ tools: [], nextCursor: String(++pages) }) });
  await assert.rejects(new Backend(configFor(t, f)).catalog(), /UPSTREAM_FAILED/);
  assert.equal(pages, 100);
});
test('oversized upstream response is rejected', async t => {
  const f = await fixture(t, { result: { content: [{ type: 'text', text: 'a'.repeat(8 * 1024 * 1024 + 1) }] } });
  await assert.rejects(new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }), /UPSTREAM_FAILED/);
  assert.equal(f.state.calls.length, 1);
});
test('oversized arguments are rejected before native dispatch', async t => {
  const f = await fixture(t);
  await assert.rejects(new Backend(configFor(t, f)).invoke('fixture_read', { value: 1, data: 'a'.repeat(1048577) }), /INVALID_ARGUMENTS/);
  assert.equal(f.state.calls.length, 0);
});
for (const schema of [
  { type: 'object', $ref: 'https://example.invalid/no-fetch' },
  { type: 'not-a-real-type' },
  { type: 'object', $schema: 'https://example.invalid/unknown-dialect' },
  { type: 'object', description: 'a'.repeat(262145) }
]) test(`unsupported schema fails closed (${schema.$ref || schema.$schema || schema.type}, size ${JSON.stringify(schema).length})`, () => {
  assert.throws(() => validateArguments(schema, {}), /SCHEMA_UNSUPPORTED/);
});
test('draft-07 and draft-2020-12 schema validation', () => {
  for (const dialect of ['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2020-12/schema']) {
    const schema = { $schema: dialect, type: 'object', properties: { value: { type: 'integer', minimum: 1 } }, required: ['value'], additionalProperties: false };
    validateArguments(schema, { value: 1 });
    assert.throws(() => validateArguments(schema, { value: 0 }), /INVALID_ARGUMENTS/);
    assert.throws(() => validateArguments(schema, { value: '1' }), /INVALID_ARGUMENTS/);
  }
});
test('unconfigured bridge reports missing token without leaking paths', async t => {
  const { client, log } = await bridge(t);
  const result = await client.callTool({ name: 'edits_catalog', arguments: {} });
  assert.equal(result.isError, true); assert.match(result.content[0].text, /^TOKEN_MISSING:/);
  assert.ok(!log.stderr.includes(secret));
});

test('redirect never forwards token to a second loopback listener', async t => {
  const receiver = await fixture(t);
  const sender = await fixture(t, { redirect: receiver.url });
  await assert.rejects(new Backend(configFor(t, sender)).catalog(), /UPSTREAM_FAILED/);
  assert.equal(receiver.state.requests.length, 0);
});
test('inherited properties do not satisfy required native arguments', () => {
  assert.throws(() => validateArguments(readTool.inputSchema, Object.create({ value: 1 })), /INVALID_ARGUMENTS/);
});
test('preflight schema rejects arrays and empty native names', async t => {
  const { client } = await bridge(t);
  for (const args of [{ name: '', arguments: {} }, { name: 'fixture_read', arguments: [] }, { name: 'fixture_read' }, { name: 'fixture_read', arguments: {}, extra: true }]) {
    const result = await client.callTool({ name: 'edits_invoke', arguments: args });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /INVALID_ARGUMENTS/);
  }
});

test('disconnect after dispatch is not retried', async t => {
  const f = await fixture(t, { disconnect: true });
  await assert.rejects(new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }), /UPSTREAM_FAILED/);
  assert.equal(f.state.calls.length, 1);
});
test('malformed tool response is rejected by SDK validation', async t => {
  const f = await fixture(t, { result: { content: 'wrong-type' } });
  await assert.rejects(new Backend(configFor(t, f)).invoke('fixture_read', { value: 1 }), /UPSTREAM_FAILED/);
});
test('empty catalog is a valid result', async t => {
  const f = await fixture(t, { tools: [] });
  assert.deepEqual(await new Backend(configFor(t, f)).catalog(), []);
});
test('live smoke script discovers catalog without invoking native tools', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const f = await fixture(t);
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['scripts/smoke.mjs', '--catalog'], {
    cwd: new URL('..', import.meta.url), timeout: 10000,
    env: { PATH: process.env.PATH, EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t) }
  });
  const report = JSON.parse(stdout);
  assert.equal(report.nativeCatalog, 'passed'); assert.equal(report.nativeToolCount, 1);
  assert.equal(report.editsDispatched, 0); assert.equal(f.state.calls.length, 0);
  assert.ok(!stdout.includes(secret)); assert.ok(!stderr.includes(secret));
});
test('live smoke script fails explicitly when token is missing', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await assert.rejects(promisify(execFile)(process.execPath, ['scripts/smoke.mjs', '--catalog'], {
    cwd: new URL('..', import.meta.url), timeout: 10000, env: { PATH: process.env.PATH }
  }), error => error.code === 2 && JSON.parse(error.stdout).nativeCatalog === 'failed');
});
