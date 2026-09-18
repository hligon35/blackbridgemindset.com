// Safely builds for production even when .env.local exists for local dev.
// Temporarily moves .env.local out of the way for the duration of the build,
// then restores it afterwards (success or failure).
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envLocalBackupPath = path.join(projectRoot, '.env.local.build-backup');

const hadEnvLocal = existsSync(envLocalPath);
if (hadEnvLocal) {
  console.log('[build-prod] Temporarily moving .env.local aside for production build...');
  renameSync(envLocalPath, envLocalBackupPath);
}

function restoreEnvLocal() {
  if (hadEnvLocal && existsSync(envLocalBackupPath)) {
    renameSync(envLocalBackupPath, envLocalPath);
    console.log('[build-prod] Restored .env.local.');
  }
}

// Ensure restoration on any exit path (including Ctrl+C).
process.on('exit', restoreEnvLocal);
process.on('SIGINT', () => process.exit(1));
process.on('SIGTERM', () => process.exit(1));

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCmd, ['run', 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
