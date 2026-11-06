// Reproducible read-only smoke test. Never invokes native editing tools.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const live = process.argv.includes('--catalog');
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))],
  env: { PATH: process.env.PATH || '/usr/bin:/bin',
    ...(process.env.EDITS_MCP_URL ? { EDITS_MCP_URL: process.env.EDITS_MCP_URL } : {}),
    ...(process.env.EDITS_TOKEN_FILE ? { EDITS_TOKEN_FILE: process.env.EDITS_TOKEN_FILE } : {}),
    ...(process.env.EDITS_TIMEOUT_MS ? { EDITS_TIMEOUT_MS: process.env.EDITS_TIMEOUT_MS } : {}),
    EDITS_ALLOWED_TOOLS: '[]', EDITS_ALLOW_WRITES: '0' }, stderr: 'pipe' });
const client = new Client({ name: 'edits-read-only-smoke', version: '0.1.0' });
try {
  await client.connect(transport, { timeout: 15000 });
  const tools = await client.listTools();
  const status = await client.callTool({ name: 'edits_status', arguments: {} });
  if (status.isError) throw new Error('Local status failed.');
  const report = JSON.parse(status.content[0].text);
  const result = { bridgeConnected: true, bridgeTools: tools.tools.map(tool => tool.name),
    installed: report.installed, appVersion: report.version, signatureValid: report.identityVerified,
    nativeCatalog: 'not_requested', nativeToolCount: null, editsDispatched: 0 };
  if (live) {
    const catalog = await client.callTool({ name: 'edits_catalog', arguments: {} }, undefined,
      { timeout: Number(process.env.EDITS_TIMEOUT_MS || 10000) + 5000 });
    if (catalog.isError) { result.nativeCatalog = 'failed'; process.exitCode = 2; }
    else { result.nativeCatalog = 'passed'; result.nativeToolCount = JSON.parse(catalog.content[0].text).tools.length; }
  }
  console.log(JSON.stringify(result, null, 2));
} catch {
  console.error('Smoke test failed. Check local installation, server settings, port and token file.');
  process.exitCode = 1;
} finally { await client.close().catch(() => {}); }
