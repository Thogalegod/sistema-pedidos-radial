import fs from 'node:fs';
import path from 'node:path';

// Verify actual files/build routes, never the Git metadata attached to a deployment.
const routes = [
  '/contratos-locacoes/page',
  '/contratos-locacoes/ativos/page',
  '/contratos-locacoes/clientes/page',
  '/contratos-locacoes/clientes/novo/page',
  '/contratos-locacoes/clientes/[id]/page',
  '/contratos-locacoes/contratos/page',
  '/contratos-locacoes/contratos/novo/page',
  '/contratos-locacoes/contratos/[id]/page',
  '/contratos-locacoes/cobrancas/page',
  '/contratos-locacoes/recibos/[id]/page',
  '/api/contratos-locacoes/cobrancas/[billingId]/enviar/route',
];

try {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!['--source', '--build'].includes(mode) || extra.length) {
    throw new Error('Uso: node scripts/verify-release-modules.mjs --source [diretório] | --build [diretório Next]');
  }
  const root = path.resolve(directory ?? (mode === '--source' ? '.' : process.env.RADIAL_NEXT_DIST_DIR || '.next'));
  const manifest = mode === '--build'
    ? JSON.parse(fs.readFileSync(path.join(root, 'server/app-paths-manifest.json'), 'utf8'))
    : null;
  const missing = routes.filter(route => mode === '--build'
    ? !Object.hasOwn(manifest, route)
    : !fs.existsSync(path.join(root, 'src/app', route + (route.endsWith('/route') ? '.ts' : '.tsx'))));
  if (missing.length) throw new Error(`Publicação incompleta: faltam ${missing.join(', ')}`);
  console.log(`Locações: ${routes.length} rotas verificadas (${mode.slice(2)}).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falha ao verificar os módulos.');
  process.exitCode = 1;
}
