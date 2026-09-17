import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');

const suspiciousPatterns = [/https?:\/\/127\.0\.0\.1/, /https?:\/\/localhost:\d+/];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(js|html)$/.test(entry)) files.push(full);
  }
  return files;
}

const offenders = [];
for (const file of walk(distDir)) {
  const content = readFileSync(file, 'utf8');
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      offenders.push(`${path.relative(projectRoot, file)} (matched ${pattern})`);
      break;
    }
  }
}

if (offenders.length > 0) {
  console.error(
    '\n[check-dist-no-localhost] Production build contains local dev URLs:\n' +
      offenders.map((o) => `  - ${o}`).join('\n') +
      '\nThis usually means .env.local leaked into the build. Rebuild without .env.local present.\n'
  );
  process.exit(1);
}
