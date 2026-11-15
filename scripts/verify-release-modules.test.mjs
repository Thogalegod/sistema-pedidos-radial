import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/verify-release-modules.mjs');
const routes = ['/contratos-locacoes/page', '/contratos-locacoes/ativos/page',
  '/contratos-locacoes/clientes/page', '/contratos-locacoes/clientes/novo/page',
  '/contratos-locacoes/clientes/[id]/page', '/contratos-locacoes/contratos/page',
  '/contratos-locacoes/contratos/novo/page', '/contratos-locacoes/contratos/[id]/page',
  '/contratos-locacoes/cobrancas/page', '/contratos-locacoes/recibos/[id]/page',
  '/api/contratos-locacoes/cobrancas/[billingId]/enviar/route'];

function fixture(t, omitted = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radial-release-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const route of routes.filter(route => route !== omitted)) {
    const file = path.join(root, 'src/app', route + (route.endsWith('/route') ? '.ts' : '.tsx'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export default function Page() {}');
  }
  return root;
}

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('rejects a release with the rentals source missing before upload', t => {
  const root = fixture(t, '/contratos-locacoes/ativos/page');
  const result = run('--source', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contratos-locacoes\/ativos\/page/);
});

test('accepts the complete rentals source', t => {
  const result = run('--source', fixture(t));
  assert.equal(result.status, 0, result.stderr);
});

test('rejects an incomplete compiled app even when all sources are present', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/app-paths-manifest.json'), JSON.stringify({ '/termografia/page': 'app/termografia/page.js' }));
  const result = run('--build', root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contratos-locacoes\/cobrancas\/page/);
});

test('accepts a compiled app with every required route', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/app-paths-manifest.json'), JSON.stringify(Object.fromEntries(routes.map(route => [route, 'app' + route + '.js']))));
  const result = run('--build', root);
  assert.equal(result.status, 0, result.stderr);
});

test('fails closed for missing manifests and invalid arguments', t => {
  const result = run('--build', fixture(t));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /app-paths-manifest/);
  assert.equal(run('--unexpected').status, 1);
});
