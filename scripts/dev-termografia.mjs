import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const server = spawn(process.execPath, [next, 'dev', '--webpack', '--hostname', '0.0.0.0', '--port', '3001'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, RADIAL_NEXT_DIST_DIR: `.next-termografia-local/session-${Date.now()}` },
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', code => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
