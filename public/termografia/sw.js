/* Public collector shell only. User data and photos live in scoped IndexedDB, never in these caches. */
const PREFIX = 'radial-termografia-shell-v1-';
const META = 'radial-termografia-ready-v1';
const POINTER = '/termografia/offline/ready';
const DESCRIPTOR = '/termografia/offline/latest.json';
const publicAssets = new Set(['/logo.png', '/termografia/manifest.webmanifest', '/termografia/icon.svg', '/termografia/icon-192.png', '/termografia/icon-512.png']);
let preparation;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function validAsset(path) {
  return typeof path === 'string' && (/^\/_next\/static\/[\w/\.~\-]+$/.test(path) || publicAssets.has(path)) && !path.split('/').some(segment => segment === '..' || segment === '.');
}
function checkManifest(manifest) {
  if (manifest?.version !== 1 || !/^[\w-]+$/.test(manifest.buildId)) throw new Error('Versão offline incompatível.');
  if (manifest.shell?.url !== `/termografia/offline/${manifest.buildId}/shell.html` || !Array.isArray(manifest.assets) || !manifest.assets.length) throw new Error('Pacote offline incompleto.');
  const entries = [manifest.shell, ...manifest.assets];
  if (new Set(entries.map(item => item.url)).size !== entries.length || manifest.assets.some(item => !validAsset(item.url))
      || manifest.assets.some(item => item.downloadUrl !== undefined && item.downloadUrl !== `/termografia/offline/${manifest.buildId}/assets${item.url}`)
      || entries.some(item => !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.size) || item.size <= 0)) throw new Error('Pacote offline inválido.');
  return manifest;
}
async function currentManifest() {
  const response = await (await caches.open(META)).match(POINTER);
  if (!response) return null;
  try { return checkManifest(await response.json()); } catch { return null; }
}
async function readiness() {
  const manifest = await currentManifest();
  if (!manifest) return { ready: false };
  const cache = await caches.open(PREFIX + manifest.buildId);
  for (const entry of [manifest.shell, ...manifest.assets]) if (!await cache.match(entry.url)) return { ready: false };
  return { ready: true, buildId: manifest.buildId, assetCount: manifest.assets.length, bytes: [manifest.shell, ...manifest.assets].reduce((sum, entry) => sum + entry.size, 0) };
}
async function publicResponse(path) {
  const response = await fetch(new URL(path, self.location.origin).href, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok || response.type === 'opaque' || response.redirected) throw new Error(`Falha no download offline (HTTP ${response.status}): ${path}. Seus dados locais foram preservados.`);
  return response;
}
async function prepare(port) {
  const descriptor = await (await publicResponse(DESCRIPTOR)).json();
  if (descriptor?.version !== 1 || !/^[\w-]+$/.test(descriptor.buildId) || descriptor.manifestUrl !== `/termografia/offline/${descriptor.buildId}/manifest.json`) throw new Error('Preparação offline indisponível nesta versão.');
  const manifest = checkManifest(await (await publicResponse(descriptor.manifestUrl)).json());
  if (manifest.buildId !== descriptor.buildId) throw new Error('A versão mudou durante a preparação. Tente novamente.');
  const previous = await currentManifest();
  if (previous?.buildId === manifest.buildId && JSON.stringify(previous) !== JSON.stringify(manifest)) throw new Error('O pacote mudou sem atualizar a versão. A preparação anterior foi mantida.');
  if (previous?.buildId === manifest.buildId) {
    const saved = await readiness();
    if (saved.ready) return saved;
  }
  const entries = [manifest.shell, ...manifest.assets];
  const cache = await caches.open(PREFIX + manifest.buildId);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const response = await publicResponse(entry.downloadUrl ?? entry.url);
    const contentType = response.headers.get('content-type') ?? '';
    if ((i === 0 && !contentType.includes('text/html')) || (entry.url.endsWith('.js') && !/javascript/.test(contentType)) || (entry.url.endsWith('.css') && !contentType.includes('text/css'))) throw new Error('Um arquivo offline recebeu uma resposta incompatível.');
    const bytes = await response.clone().arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== entry.size || digest !== entry.sha256) throw new Error(`Arquivo offline diferente da versão esperada: ${entry.url}. A preparação anterior foi mantida.`);
    await cache.put(entry.url, response);
    port?.postMessage({ type: 'PROGRESS', done: i + 1, total: entries.length });
  }
  for (const entry of entries) if (!await cache.match(entry.url)) throw new Error('O navegador não confirmou o armazenamento do app.');
  // Select only an entirely verified build. A failed preparation never replaces the previous pointer.
  await (await caches.open(META)).put(POINTER, Response.json(manifest));
  return readiness();
}
self.addEventListener('message', event => {
  const port = event.ports?.[0];
  if (!port || !['PREPARE', 'STATUS'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      const client = event.source?.id ? await self.clients.get(event.source.id) : null;
      if (!client || new URL(client.url).origin !== self.location.origin || new URL(client.url).pathname !== '/termografia/nova') throw new Error('Abra a coleta para preparar o uso offline.');
      if (event.data.type === 'STATUS') { port.postMessage(await readiness()); return; }
      if (!preparation) preparation = prepare(port).finally(() => { preparation = null; });
      port.postMessage(await preparation);
    } catch (error) { port.postMessage({ ready: false, error: error instanceof Error ? error.message : 'Falha ao preparar o app offline.' }); }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.searchParams.has('_rsc') || request.headers.has('RSC') || request.headers.has('Next-Action') || request.headers.has('Next-Router-Prefetch')) return;
  if (request.mode === 'navigate' && url.pathname === '/termografia/nova') {
    event.respondWith((async () => {
      const manifest = await currentManifest();
      if (manifest) {
        const response = await (await caches.open(PREFIX + manifest.buildId)).match(manifest.shell.url);
        if (response) return response;
      }
      return fetch(request);
    })());
  } else if (validAsset(url.pathname)) {
    event.respondWith((async () => {
      // Old clients can still need an older build's hashed chunks; activation never deletes their cache.
      const current = await currentManifest();
      const preferred = current ? PREFIX + current.buildId : null;
      const names = (await caches.keys()).filter(name => name.startsWith(PREFIX));
      if (preferred && names.includes(preferred)) names.splice(0, 0, ...names.splice(names.indexOf(preferred), 1));
      for (const name of names) {
        const response = await (await caches.open(name)).match(url.pathname);
        if (response) return response;
      }
      return fetch(request);
    })());
  }
});
