import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

// Review the exact release in a separate index/object directory. The user's real
// index, branch and deliberately dirty working files are never rewritten here.
const root = process.cwd();
const release = JSON.parse(fs.readFileSync('docs/architecture/2026-11-14-locacoes-restoration-manifest.json', 'utf8'));
const cache = path.resolve(root, 'node_modules/.cache/rental-git-review-20261114');
fs.mkdirSync(path.join(cache, 'objects'), { recursive: true });
const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
const env = { ...process.env, GIT_INDEX_FILE: path.join(cache, 'index'),
  GIT_OBJECT_DIRECTORY: path.join(cache, 'objects'),
  GIT_ALTERNATE_OBJECT_DIRECTORIES: path.resolve(root, common, 'objects') };
const git = (...args) => execFileSync('git', args, { cwd: root, env, maxBuffer: 24 * 1024 * 1024 });
const parent = git('rev-parse', 'HEAD').toString().trim();
if (parent !== release.base) throw new Error('Base changed; review before staging.');
git('read-tree', parent);
const records = new Map();
for (const entry of release.files) {
  const bytes = fs.readFileSync(path.join(release.sourceDirectory, entry.file));
  if (crypto.createHash('sha1').update(bytes).digest('hex') !== entry.sha) throw new Error(`Release changed: ${entry.file}`);
  records.set(entry.file, bytes);
}
const extras = [
  'src/app/contratos-locacoes/page.test.tsx',
  'src/components/contratos-locacoes/RentalAccessGate.test.tsx',
  'src/components/contratos-locacoes/RentalRouteAccess.test.tsx',
  'src/components/contratos-locacoes/BillingPaymentForm.test.tsx',
  'src/components/contratos-locacoes/BillingMoneyForms.test.tsx',
  'src/lib/contratos-locacoes/dashboard.test.ts',
  'src/lib/contratos-locacoes/payment-rpc.test.ts',
  'src/lib/contratos-locacoes/billing-mutations.test.ts',
  'src/lib/contratos-locacoes/billing.test.ts',
  'scripts/verify-release-modules.test.mjs',
  'scripts/prepare-rental-restoration.mjs',
  'scripts/read-rental-release-chunk.mjs',
  'scripts/prepare-rental-git-index.mjs',
  'supabase/migrations/20261114212102_rental_owner_access_payments.sql',
  'supabase/verification/rental-owner-config-iurq.sql',
  'supabase/verification/rental-owner-payments-qa.sql',
  'docs/AI_CHECKPOINT.md',
  'docs/superpowers/handoffs/2026-11-14-recuperacao-locacoes.md',
  'docs/superpowers/plans/2026-11-14-recuperacao-locacoes.md',
  'docs/architecture/2026-11-14-locacoes-seguranca-ux.md',
  'docs/architecture/2026-11-14-locacoes-restoration-manifest.json',
  'docs/architecture/2026-11-14-locacoes-preview-verification.json',
];
for (const file of extras) records.set(file, fs.readFileSync(file));
for (const [file, bytes] of records) {
  // Apply the repository's normal clean filters, just as selective git add does.
  const sha = execFileSync('git', ['hash-object', '-w', '--path=' + file, '--stdin'], { cwd: root, env, input: bytes, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  git('update-index', '--add', '--cacheinfo', '100644', sha, file);
}
const gate = spawnSync('npm run ai:gate:staged', { cwd: root, env, shell: true, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
fs.writeFileSync(path.join(cache, 'staged-gate.txt'), (gate.stdout ?? '') + (gate.stderr ?? ''));
if (gate.status !== 0) throw new Error(`Staged gate failed: ${gate.stdout}\n${gate.stderr}`);
const tree = git('write-tree').toString().trim();
const changed = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(Boolean);
const entries = changed.map(file => {
  const bytes = git('show', ':' + file);
  return { path: file, mode: '100644', type: 'blob',
    sha: git('rev-parse', ':' + file).toString().trim(), size: bytes.length, content: bytes.toString('base64') };
});
fs.writeFileSync(path.join(cache, 'candidate.json'), JSON.stringify({ parent, baseTree: git('rev-parse', 'HEAD^{tree}').toString().trim(), tree, entries }));
const candidate = path.join(cache, 'candidate');
fs.mkdirSync(candidate, { recursive: true });
const indexedFiles = git('ls-files', '-z').toString().split('\0').filter(Boolean);
for (const file of indexedFiles) {
  if (!/^(src\/|(?:package(?:-lock)?\.json|tsconfig.json|next-env.d.ts|next.config.ts|vitest.config.ts)$)/.test(file)) continue;
  const dest = path.resolve(candidate, file);
  if (!dest.startsWith(candidate + path.sep)) throw new Error('Invalid candidate path.');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, git('show', ':' + file));
}
console.log(JSON.stringify({ parent, tree, changedFiles: entries.length, gate: 'STAGED_GATE_PASS', candidate }));
