import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { authorize, readToken } from './config.mjs';
import { validateArguments } from './validation.mjs';

export class Backend {
  constructor(config) { this.config = config; }
  async session(operation, callerSignal) {
    if (callerSignal?.aborted) throw new Error('CANCELLED: Request cancelled before dispatch.');
    const token = readToken(this.config);
    const client = new Client({ name: 'edits-local-bridge', version: '0.1.0' });
    // One deadline covers initialization, all catalog pages and the native call.
    const timeoutMs = this.config.timeoutMs;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    const requestOptions = { timeout: timeoutMs, signal };
    const guardedFetch = async (url, init = {}) => {
      if (new URL(url).href !== this.config.url.href) throw new Error('Unexpected upstream URL.');
      const response = await fetch(url, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
      if (!response.body) return response;
      let size = 0;
      const bounded = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > 8 * 1024 * 1024) throw new Error('Upstream response exceeds 8 MiB.');
        controller.enqueue(chunk);
      } }));
      return new Response(bounded, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
    const transport = new StreamableHTTPClientTransport(this.config.url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: guardedFetch,
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 }
    });
    try {
      await client.connect(transport, requestOptions);
      return await operation(client, requestOptions);
    } catch (error) {
      if (callerSignal?.aborted) throw new Error('CANCELLED: Request cancelled. An already dispatched edit may have completed; inspect Edits.');
      // Never echo SDK/HTTP exception text, which can contain response text/secrets.
      if (/^(POLICY_DENIED:|TOOL_NOT_FOUND:|INVALID_ARGUMENTS:|SCHEMA_UNSUPPORTED:)/.test(error.message)) throw error;
      throw new Error('UPSTREAM_FAILED: Check Edits Automation, port, token, app version and MCP compatibility. No action is automatically retried.');
    } finally { await client.close().catch(() => {}); }
  }
  async list(client, requestOptions) {
    const tools = [];
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 100; page++) {
      const result = await client.listTools(cursor ? { cursor } : {}, requestOptions);
      tools.push(...result.tools);
      if (tools.length > 2000) throw new Error('Catalog too large.');
      cursor = result.nextCursor;
      if (!cursor) {
        if (new Set(tools.map(t => t.name)).size !== tools.length) throw new Error('Duplicate native tool names.');
        return tools;
      }
      if (cursors.has(cursor)) throw new Error('Repeated catalog cursor.');
      cursors.add(cursor);
    }
    throw new Error('Too many catalog pages.');
  }
  catalog(signal) { return this.session((client, options) => this.list(client, options), signal); }
  invoke(name, args, signal) {
    return this.session(async (client, options) => {
      const tools = await this.list(client, options);
      const tool = tools.find(t => t.name === name);
      if (!tool) throw new Error('TOOL_NOT_FOUND: Refresh edits_catalog on the current Edits screen.');
      authorize(this.config, tool);
      validateArguments(tool.inputSchema, args);
      return client.callTool({ name, arguments: args }, undefined, options);
    }, signal);
  }
}
