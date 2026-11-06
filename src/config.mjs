import fs from 'node:fs';
import path from 'node:path';

export function loadConfig(env = process.env) {
  const url = new URL(env.EDITS_MCP_URL || 'http://127.0.0.1:19501/mcp');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.pathname !== '/mcp' || url.username || url.password || url.search || url.hash) {
    throw new Error('EDITS_MCP_URL must be http://127.0.0.1:<port>/mcp, without credentials/query/fragment.');
  }
  const allowed = JSON.parse(env.EDITS_ALLOWED_TOOLS || '[]');
  if (!Array.isArray(allowed) || allowed.some(x => typeof x !== 'string' || !x || x === '*')) {
    throw new Error('EDITS_ALLOWED_TOOLS must be a JSON array of exact tool names; no wildcard.');
  }
  if (env.EDITS_ALLOW_WRITES && !['0', '1'].includes(env.EDITS_ALLOW_WRITES)) {
    throw new Error('EDITS_ALLOW_WRITES must be 0 or 1.');
  }
  const rawTimeout = env.EDITS_TIMEOUT_MS ?? '10000';
  if (!/^\d+$/.test(rawTimeout) || Number(rawTimeout) < 100 || Number(rawTimeout) > 120000) {
    throw new Error('EDITS_TIMEOUT_MS must be an integer from 100 through 120000.');
  }
  const tokenFile = env.EDITS_TOKEN_FILE;
  if (tokenFile && !path.isAbsolute(tokenFile)) throw new Error('EDITS_TOKEN_FILE must be absolute.');
  return { url, tokenFile, allowed: new Set(allowed), allowWrites: env.EDITS_ALLOW_WRITES === '1', timeoutMs: Number(rawTimeout) };
}

export function readToken(config) {
  if (!config.tokenFile) throw new Error('TOKEN_MISSING: Set EDITS_TOKEN_FILE after enabling Automation in Edits Settings.');
  const fd = fs.openSync(config.tokenFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 16384 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
      throw new Error('TOKEN_FILE_UNSAFE: Require an owned regular file, max 16 KiB, permissions 0600.');
    }
    const bytes = Buffer.alloc(16385);
    const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (length > 16384) throw new Error('TOKEN_FILE_UNSAFE: Token exceeds 16 KiB.');
    const token = bytes.subarray(0, length).toString('utf8').trim();
    if (!token || /[^\x21-\x7e]/.test(token)) throw new Error('TOKEN_INVALID: Expected a single nonempty token.');
    return token;
  } finally { fs.closeSync(fd); }
}

export function authorize(config, tool) {
  if (!config.allowed.has(tool.name)) throw new Error('POLICY_DENIED: Tool is not in EDITS_ALLOWED_TOOLS.');
  // Annotations are hints. The operator must review and explicitly allow every tool.
  if (!config.allowWrites && (tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint === true)) {
    throw new Error('POLICY_DENIED: Write/unknown/destructive tools require EDITS_ALLOW_WRITES=1.');
  }
}
