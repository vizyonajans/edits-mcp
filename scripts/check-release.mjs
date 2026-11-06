import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignored = new Set(['node_modules', '.git', '__pycache__', 'coverage']);
const textExtensions = new Set(['.md', '.mjs', '.py', '.json', '.yml', '.txt', '.svg']);
const problems = [];
let checked = 0;
function inspect(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(item.name)) continue;
    const file = path.join(dir, item.name);
    const relative = path.relative(root, file);
    if (item.isSymbolicLink()) { problems.push(`${relative}: symlink`); continue; }
    if (item.isDirectory()) { inspect(file); continue; }
    checked++;
    if (item.name.endsWith('.token') || item.name.startsWith('.env') || item.name === 'verification.json') {
      problems.push(`${relative}: private/generated file`);
    }
    if (!textExtensions.has(path.extname(file)) && !['LICENSE', '.gitignore', '.gitattributes'].includes(item.name)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const homePrefix = ['', 'Users', ''].join('/');
    if (text.includes(homePrefix)) problems.push(`${relative}: personal home-directory path`);
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    for (const email of text.match(emailPattern) || []) {
      if (email !== 'info@vizyoncreative.com' && !email.endsWith('@users.noreply.github.com')) {
        problems.push(`${relative}: non-approved email address`);
      }
    }
    if (/\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(text) || /github_pat_[A-Za-z0-9_]{30,}/.test(text)) {
      problems.push(`${relative}: possible GitHub credential`);
    }
    if (new RegExp(['-----BEGIN', '[A-Z ]*PRIVATE KEY-----'].join(' ')).test(text)) {
      problems.push(`${relative}: possible private key`);
    }
  }
}
inspect(root);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.license !== 'MIT') problems.push('package.json: license mismatch');
if (!pkg.private) problems.push('package.json: accidental npm publishing is not blocked');
if (!fs.existsSync(path.join(root, 'LICENSE'))) problems.push('Missing LICENSE');
const live = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/live-acceptance.json'), 'utf8'));
if (Object.values(live.privacy).some(value => value !== false)) problems.push('Live report privacy flags are not all false');
if (problems.length) {
  // Print only file names and issue classes, never matched secrets or addresses.
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Release checks passed: ${checked} files; no personal paths, unapproved emails, token files or recognizable credentials detected.`);
  console.log('Manual review is still required for private data that pattern checks cannot identify.');
}
