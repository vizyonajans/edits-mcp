import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export const root = fileURLToPath(new URL('../..', import.meta.url));
export const secret = 'test-only-not-an-edits-token';
export const readTool = { name: 'fixture_read', description: 'Synthetic fixture, NOT a real Edits tool.', inputSchema: { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'], additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } };
export function tokenFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edits-extensive-test-'));
  const file = path.join(dir, 'access.token');
  fs.writeFileSync(file, secret + '\n', { mode: 0o600 });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return file;
}
export async function fixture(t, options = {}) {
  const state = { calls: [], requests: [], tools: structuredClone(options.tools || [readTool]), active: 0, maxActive: 0 };
  const server = http.createServer(async (req, res) => {
    try {
      state.requests.push({ method: req.method, url: req.url, auth: req.headers.authorization });
      if (options.redirect) { res.writeHead(307, { location: options.redirect }).end(); return; }
      if (options.status) { res.writeHead(options.status).end(secret); return; }
      if (req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401).end(); return; }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      const rpc = JSON.parse(body);
      if (rpc.id === undefined) { res.writeHead(202).end(); return; }
      let result;
      if (rpc.method === 'initialize') {
        result = { protocolVersion: options.version || rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-test-server', version: '1' } };
      } else if (rpc.method === 'tools/list') {
        result = options.list ? options.list(rpc.params, state) : { tools: state.tools };
      } else if (rpc.method === 'tools/call') {
        state.calls.push(rpc.params);
        if (options.disconnect) { req.socket.destroy(); return; }
        state.active++; state.maxActive = Math.max(state.maxActive, state.active);
        if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
        state.active--;
        if (options.rpcError) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32603, message: secret } })); return;
        }
        result = options.result || { content: [{ type: 'text', text: JSON.stringify(rpc.params.arguments) }] };
      } else result = {};
      if (res.destroyed) return;
      if (options.malformed) { res.writeHead(200, { 'content-type': 'application/json' }).end('invalid-json-' + secret); return; }
      if (options.sse && rpc.method === 'tools/call') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })}\n\n`);
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
      }
    } catch { if (!res.destroyed) res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, state };
}
export async function bridge(t, env = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs')],
    env: { PATH: process.env.PATH, ...env }, stderr: 'pipe' });
  const log = { stderr: '' };
  transport.stderr.on('data', chunk => { log.stderr += chunk; });
  const client = new Client({ name: 'extended-test-client', version: '1' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  return { client, log };
}
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
