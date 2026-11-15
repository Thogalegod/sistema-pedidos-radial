import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Local review package only: never commits, uploads, deploys, or reads environment files.
const root = process.cwd();
const output = path.join(root, 'node_modules/.cache/rental-restoration-20261114-r7');
const baseline = JSON.parse(fs.readFileSync('docs/architecture/2026-11-13-termografia-relatorio-recorte-release.json', 'utf8'));
const downloads = JSON.parse(fs.readFileSync('node_modules/.cache/rental-restoration-source/downloads.json', 'utf8'));
const gitDownloads = JSON.parse(fs.readFileSync('node_modules/.cache/rental-restoration-source/git-downloads.json', 'utf8'));
const sha = bytes => crypto.createHash('sha1').update(bytes).digest('hex');
const sources = ['C:/Users/thoma/AppData/Local/Temp/radial-termografia-release-20261112',
  path.join(root, 'node_modules/.cache/termografia-release-20261112'),
  path.join(root, 'node_modules/.cache/radial-auth-recovery-20261111'), root];
const files = new Map();
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const base = git('rev-parse', 'HEAD').toString().trim();
const tracked = git('ls-tree', '-r', '--name-only', 'HEAD').toString().trim().split(/\r?\n/);
for (const file of tracked) {
  if (!/^(src\/|public\/|scripts\/ai\/|(?:package(?:-lock)?\.json|next.config.ts|tsconfig.json|postcss.config.mjs|eslint.config.mjs)$)/.test(file)) continue;
  if (/\.test\.|\.spec\.|^src\/test\//.test(file) || file.startsWith('public/termografia/offline/')) continue;
  files.set(file, git('show', `HEAD:${file}`));
}
// Restoring shared navigation/styles is explicit; thermography implementation stays byte-identical.
const shared = new Set(['src/app/layout.tsx', 'src/app/globals.css', 'src/app/hub/page.tsx',
  'src/components/app-shell/PageHeader.tsx', 'src/types/index.ts', 'src/app/page.tsx',
  'src/components/NewOrderDrawer.tsx', 'src/components/OrderCard.tsx',
  'src/components/OrderDrawer.tsx', 'src/components/StatusBadge.tsx',
  'src/data/mock.ts', 'src/lib/sorting.ts']);
let preserved = 0;
for (const entry of baseline.files) {
  if (shared.has(entry.file)) continue;
  const download = downloads.find(file => file.file === entry.file);
  const gitDownload = gitDownloads.find(file => file.file === entry.file);
  let bytes = gitDownload ? Buffer.from(gitDownload.text) : download ? Buffer.from(download.data, 'base64') : null;
  if (!bytes || sha(bytes) !== entry.sha) {
    bytes = null;
    for (const folder of sources) {
      const candidate = path.join(folder, entry.file);
      if (!fs.existsSync(candidate)) continue;
      const content = fs.readFileSync(candidate);
      if (sha(content) === entry.sha) { bytes = content; break; }
    }
  }
  if (!bytes) throw new Error(`Fonte publicada não conferida: ${entry.file}`);
  files.set(entry.file, bytes);
  preserved++;
}
const overlay = ['src/lib/contratos-locacoes/dashboard.ts', 'src/app/contratos-locacoes/page.tsx',
  'src/app/contratos-locacoes/layout.tsx', 'src/app/contratos-locacoes/contratos/[id]/page.tsx',
  'src/components/contratos-locacoes/RentalAccessGate.tsx', 'src/components/contratos-locacoes/RentalRouteAccess.tsx',
  'src/components/contratos-locacoes/RentalHubShortcut.tsx',
  'src/components/contratos-locacoes/BillingPaymentForm.tsx', 'src/components/contratos-locacoes/ContractBillingSection.tsx',
  'src/lib/contratos-locacoes/mutations.ts', 'src/lib/contratos-locacoes/schemas.ts',
  'src/lib/contratos-locacoes/payment-errors.ts',
  'scripts/verify-release-modules.mjs', 'scripts/verify-rental-environment.mjs'];
for (const file of overlay) files.set(file, fs.readFileSync(path.join(root, file)));
// Add the same shortcut to the stable Hub without promoting pending Hub redesign work.
const hubFile = 'src/app/hub/page.tsx';
const hubSource = files.get(hubFile).toString();
if (!hubSource.includes('RentalHubShortcut')) {
  const importAnchor = "import { useShellUser } from '@/components/app-shell/AppShell';";
  const renderAnchor = '      {loadError &&';
  if (!hubSource.includes(importAnchor) || !hubSource.includes(renderAnchor)) throw new Error('Unexpected stable Hub source.');
  files.set(hubFile, Buffer.from(hubSource.replace(importAnchor, importAnchor + "\nimport { RentalHubShortcut } from '@/components/contratos-locacoes/RentalHubShortcut';")
    .replace(renderAnchor, '      <RentalHubShortcut />\n' + renderAnchor)));
}
const pkg = JSON.parse(files.get('package.json').toString());
const stablePkg = JSON.parse(git('show', 'HEAD:package.json').toString());
pkg.dependencies = { ...stablePkg.dependencies, ...pkg.dependencies };
pkg.devDependencies = { ...stablePkg.devDependencies, ...pkg.devDependencies };
pkg.scripts.build = 'node scripts/verify-rental-environment.mjs && node scripts/verify-release-modules.mjs --source && next build && node scripts/verify-release-modules.mjs --build && node scripts/build-termografia-offline.mjs';
files.set('package.json', Buffer.from(JSON.stringify(pkg, null, 2) + '\n'));
files.set('package-lock.json', fs.readFileSync('package-lock.json'));
// Generated by Next; a development-only type import must not enter an isolated build.
files.set('next-env.d.ts', Buffer.from('/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n'));
// Remove legacy trailing whitespace that otherwise fails the required staged gate.
for (const file of ['src/app/cabine/nova/page.tsx', 'src/app/inspecoes/actions.ts']) {
  files.set(file, Buffer.from(files.get(file).toString().replace(/[\t ]+(?=\r?$)/gm, '')));
}
if (fs.existsSync(output)) throw new Error('Pacote já existe; use o pacote conferido ou um novo diretório explícito.');
for (const [file, bytes] of files) {
  const destination = path.resolve(output, file);
  if (!destination.startsWith(output + path.sep)) throw new Error('Caminho fora do pacote.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}
execFileSync(process.execPath, [path.join(root, 'scripts/verify-release-modules.mjs'), '--source', output], { stdio: 'inherit' });
const manifest = { state: 'LOCAL_REVIEW_ONLY', base, deployedBaseline: baseline.deployment,
  sourceDirectory: output, financialAccess: 'IURQ_OWNER_ONLY_VERIFIED',
  authorization: 'User explicitly requested commit, push and production deploy on 2026-11-14',
  changedSharedFiles: [...shared], overlay,
  preservedBaselineFilesBeforeBuildConfigAdjustments: preserved,
  files: [...files].map(([file, bytes]) => ({ file, sha: sha(bytes), size: bytes.length })) };
fs.writeFileSync('docs/architecture/2026-11-14-locacoes-restoration-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ output, files: files.size, base, deployedBaseline: baseline.deployment, state: manifest.state }));
