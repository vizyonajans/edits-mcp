import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig, readToken, authorize } from '../src/config.mjs';
import { Backend } from '../src/backend.mjs';
import { fixture, tokenFile, bridge, secret, readTool, pause } from './support/fixture.mjs';

for (const value of ['-1', '0', 'NaN', '1.5', '120001', '1000junk']) test(`timeout configuration rejects ${value}`, () => {
  assert.throws(() => loadConfig({ EDITS_TIMEOUT_MS: value }));
});
for (const value of ['', 'a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u0131b']) test(`token rejects ${JSON.stringify(value)}`, t => {
  const file = tokenFile(t); fs.writeFileSync(file, value);
  assert.throws(() => readToken({ tokenFile: file }));
});
test('oversized token is rejected before reading', t => {
  const file = tokenFile(t); fs.writeFileSync(file, 'a'.repeat(16385));
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_FILE_UNSAFE/);
});
for (const mode of [0o604, 0o640, 0o660, 0o601]) test(`token rejects permissions ${mode.toString(8)}`, t => {
  const file = tokenFile(t); fs.chmodSync(file, mode);
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_FILE_UNSAFE/);
});
for (const annotation of [{}, { readOnlyHint: false }, { readOnlyHint: true, destructiveHint: true }]) test(`unknown/destructive annotation fails closed ${JSON.stringify(annotation)}`, () => {
  const config = loadConfig({ EDITS_ALLOWED_TOOLS: '["fixture_read"]' });
  assert.throws(() => authorize(config, { ...readTool, annotations: annotation }), /POLICY_DENIED/);
});
for (const code of [401, 403, 404, 429, 500, 503]) test(`HTTP ${code} is sanitized and never calls tool`, async t => {
  const f = await fixture(t, { status: code });
  const b = new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t) }));
  await assert.rejects(b.catalog(), e => e.message.startsWith('UPSTREAM_FAILED:') && !e.message.includes(secret));
  assert.equal(f.state.calls.length, 0);
});
test('malformed JSON is sanitized', async t => {
  const f = await fixture(t, { malformed: true });
  const b = new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t) }));
  await assert.rejects(b.catalog(), e => !e.message.includes(secret));
});
test('wrong credential cannot fetch catalog', async t => {
  const f = await fixture(t); const file = tokenFile(t); fs.writeFileSync(file, 'wrong-token');
  await assert.rejects(new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: file })).catalog(), /UPSTREAM_FAILED/);
  assert.equal(f.state.calls.length, 0);
});
test('duplicate catalog names fail closed', async t => {
  const f = await fixture(t, { tools: [readTool, readTool] });
  await assert.rejects(new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t) })).catalog(), /UPSTREAM_FAILED/);
});
test('catalog > 2000 tools is rejected', async t => {
  const tools = Array.from({ length: 2001 }, (_, i) => ({ ...readTool, name: `fixture_${i}` }));
  const f = await fixture(t, { tools });
  await assert.rejects(new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t) })).catalog(), /UPSTREAM_FAILED/);
});
test('schema-invalid arguments do not reach native tool', async t => {
  const f = await fixture(t);
  const b = new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' }));
  for (const args of [{}, { value: '1' }, { value: 1, extra: true }, { value: null }]) {
    await assert.rejects(b.invoke('fixture_read', args), /INVALID_ARGUMENTS/);
  }
  assert.equal(f.state.calls.length, 0);
});
test('schema validation does not coerce or mutate inputs', async t => {
  const f = await fixture(t);
  const b = new Backend(loadConfig({ EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' }));
  const args = { value: 7 }; await b.invoke('fixture_read', args);
  assert.deepEqual(args, { value: 7 }); assert.deepEqual(f.state.calls[0].arguments, args);
});
test('wrapper rejects undeclared parameters and recovers after error', async t => {
  const { client } = await bridge(t);
  for (const name of ['edits_status', 'edits_catalog']) {
    const result = await client.callTool({ name, arguments: { unwanted: true } });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /INVALID_ARGUMENTS/);
  }
  const unknown = await client.callTool({ name: 'not_a_tool', arguments: {} });
  assert.equal(unknown.isError, true);
  const status = await client.callTool({ name: 'edits_status', arguments: {} });
  assert.ok(!status.isError);
});
test('cancelled queued request never reaches native app', async t => {
  const f = await fixture(t, { delay: 250 });
  const { client } = await bridge(t, { EDITS_MCP_URL: f.url, EDITS_TOKEN_FILE: tokenFile(t), EDITS_ALLOWED_TOOLS: '["fixture_read"]' });
  const first = client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { value: 1 } } });
  await pause(40);
  const abort = new AbortController();
  const second = client.callTool({ name: 'edits_invoke', arguments: { name: 'fixture_read', arguments: { value: 2 } } }, undefined, { signal: abort.signal });
  const rejected = assert.rejects(second); await pause(40); abort.abort();
  await rejected; await first; await pause(350);
  assert.deepEqual(f.state.calls.map(c => c.arguments.value), [1]);
});

test('non-regular FIFO token is rejected without blocking', async t => {
  const { execFileSync } = await import('node:child_process');
  const file = tokenFile(t); fs.unlinkSync(file); execFileSync('mkfifo', [file]); fs.chmodSync(file, 0o600);
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_FILE_UNSAFE/);
});
test('token file owned by another user is rejected', t => {
  const file = tokenFile(t); const original = fs.fstatSync;
  t.mock.method(fs, 'fstatSync', fd => { const stat = original(fd); stat.uid = process.getuid() + 1; return stat; });
  assert.throws(() => readToken({ tokenFile: file }), /TOKEN_FILE_UNSAFE/);
});

for (const env of [
  { EDITS_ALLOWED_TOOLS: '["test-only-not-an-edits-token' },
  { EDITS_MCP_URL: 'not-a-url-test-only-not-an-edits-token' },
  { EDITS_TIMEOUT_MS: 'test-only-not-an-edits-token' }
]) test(`invalid startup configuration is sanitized (${Object.keys(env)[0]})`, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await assert.rejects(promisify(execFile)(process.execPath, ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url), timeout: 5000, env: { PATH: process.env.PATH, ...env }
  }), error => error.code === 1 && error.stdout === '' && error.stderr.includes('CONFIG_INVALID:') && !error.stderr.includes(secret));
});
