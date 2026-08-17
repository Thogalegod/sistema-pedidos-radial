import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const port = process.env.E2E_PORT ?? '3101';
const runRoot = path.join(tmpdir(), `radial-e2e-next-${process.pid}-${Date.now()}`);
const excludedNames = new Set([
  '.git',
  '.next',
  '.next-bloqueada-20260804',
  '.e2e-run-smoke',
  'node_modules',
  'playwright-report',
  'test-results',
]);

function shouldCopy(source) {
  const name = path.basename(source);

  if (name.startsWith('pw-report') || name.startsWith('pw-results')) {
    return false;
  }

  return !excludedNames.has(name);
}

function nextBin(root) {
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
}

async function prepareRunRoot() {
  const sourceNodeModules = path.join(projectRoot, 'node_modules');
  if (!existsSync(sourceNodeModules)) {
    throw new Error('node_modules nao encontrado. Execute npm install antes do E2E.');
  }

  await mkdir(runRoot, { recursive: true });
  await cp(projectRoot, runRoot, {
    recursive: true,
    filter: shouldCopy,
  });

  await symlink(
    sourceNodeModules,
    path.join(runRoot, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}

async function cleanup() {
  await rm(runRoot, { force: true, recursive: true, maxRetries: 3 }).catch(() => {});
}

await prepareRunRoot();

const nextCommand = nextBin(runRoot);
const childCommand = process.platform === 'win32' ? 'cmd.exe' : nextCommand;
const childArgs = process.platform === 'win32'
  ? ['/c', nextCommand, 'dev', '--webpack', '-H', 'localhost', '-p', port]
  : ['dev', '--webpack', '-H', 'localhost', '-p', port];

const child = spawn(childCommand, childArgs, {
  cwd: runRoot,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: 'inherit',
  windowsHide: true,
});

const stop = async (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
  await cleanup();
};

process.on('SIGTERM', () => {
  void stop('SIGTERM').finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  void stop('SIGINT').finally(() => process.exit(0));
});

child.on('exit', (code) => {
  void cleanup().finally(() => process.exit(code ?? 0));
});
