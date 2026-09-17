import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envLocalPath = path.join(projectRoot, '.env.local');

if (existsSync(envLocalPath) && !process.env.ALLOW_ENV_LOCAL_BUILD) {
  console.error(
    '\n[guard-prod-build] Refusing to build: ".env.local" exists and would override ' +
      'production values (e.g. VITE_SCHEDULE_API_BASE pointing at 127.0.0.1) in this build.\n' +
      'Rename/remove .env.local before building for production, or set ALLOW_ENV_LOCAL_BUILD=1 to bypass.\n'
  );
  process.exit(1);
}
