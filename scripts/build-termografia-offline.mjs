import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const publicAssets = ['/logo.png', '/termografia/manifest.webmanifest', '/termografia/icon.svg', '/termografia/icon-192.png', '/termografia/icon-512.png'];

function staticPath(value) {
  if (typeof value !== 'string') return null;
  const clean = value.split('?')[0];
  const normalized = clean.startsWith('static/') ? '/_next/' + clean : clean;
  return /^\/_next\/static\/[\w/\.~\-]+$/.test(normalized) && !normalized.split('/').some(segment => segment === '..' || segment === '.') ? normalized : null;
}
function gather(value, result) {
  if (typeof value === 'string') { const url = staticPath(value); if (url) result.add(url); }
  else if (Array.isArray(value)) value.forEach(item => gather(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => gather(item, result));
}

/** Build output only. Never fetch/cache live authenticated HTML or private responses. */
export async function generateOfflinePackage(root = process.cwd()) {
  const read = name => readFile(path.join(root, name));
  const buildId = (await read('.next/BUILD_ID')).toString().trim();
  if (!/^[\w-]+$/.test(buildId)) throw new Error('BUILD_ID offline inválido.');
  const route = '.next/server/app/termografia/nova';
  const html = await read(route + '.html');
  const sandbox = { globalThis: {} };
  runInNewContext((await read(route + '/page_client-reference-manifest.js')).toString(), sandbox, { timeout: 1000 });
  const manifest = sandbox.globalThis.__RSC_MANIFEST?.['/termografia/nova/page'];
  if (!manifest) throw new Error('Manifesto do coletor ausente; não publicar preparação incompleta.');
  const urls = new Set();
  gather(manifest, urls);
  const runtime = JSON.parse((await read(route + '/page/build-manifest.json')).toString());
  gather(runtime.rootMainFiles, urls); gather(runtime.polyfillFiles, urls);
  const dom = new JSDOM(html.toString());
  for (const element of dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"],link[rel="preload"],link[rel="modulepreload"]')) {
    const source = element.getAttribute('src') ?? element.getAttribute('href');
    if (!source || source.startsWith('data:')) continue;
    const url = staticPath(source);
    if (!url && !publicAssets.includes(source)) throw new Error(`Dependência do shell fora do pacote público: ${source}`);
    if (url) urls.add(url);
  }
  dom.window.close();
  if (!urls.size) throw new Error('Coletor sem dependências estáticas verificáveis.');
  const files = new Map();
  // CSS may reference additional Unicode font subsets that Next does not preload.
  for (const url of urls) {
    const bytes = await read('.next/' + url.slice('/_next/'.length));
    files.set(url, bytes);
    if (!url.endsWith('.css')) continue;
    const css = bytes.toString();
    const references = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)].map(match => match[2]);
    references.push(...[...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map(match => match[1]));
    for (const reference of references) {
      if (reference.startsWith('data:')) continue;
      const resolved = new URL(reference, 'https://offline.invalid' + url);
      const dependency = resolved.origin === 'https://offline.invalid' && staticPath(resolved.pathname);
      if (!dependency) throw new Error(`Dependência CSS não disponível offline: ${reference}`);
      urls.add(dependency);
    }
  }
  for (const url of publicAssets) files.set(url, await read('public' + url));
  const prefix = `/termografia/offline/${buildId}`;
  const output = {
    version: 1, buildId,
    shell: { url: prefix + '/shell.html', sha256: digest(html), size: html.byteLength },
    assets: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([url, bytes]) => ({ url, sha256: digest(bytes), size: bytes.byteLength })),
  };
  const folder = path.join(root, 'public', prefix);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'shell.html'), html);
  await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(output));
  // Descriptor last: a failed build never advertises a partially assembled package.
  await writeFile(path.join(root, 'public/termografia/offline/latest.json'), JSON.stringify({ version: 1, buildId, manifestUrl: prefix + '/manifest.json' }));
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await generateOfflinePackage();
  console.log(`Termografia offline: ${result.assets.length} arquivos, build ${result.buildId}.`);
}
