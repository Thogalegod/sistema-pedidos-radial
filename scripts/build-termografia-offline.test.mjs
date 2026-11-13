import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateOfflinePackage } from './build-termografia-offline.mjs';

const roots = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'radial-offline-build-')); roots.push(root);
  const write = async (name, content) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), content); };
  await write('.next/BUILD_ID', 'qa-build');
  await write('.next/server/app/termografia/nova.html', '<html><head><link rel="stylesheet" href="/_next/static/chunks/collector.css"></head><body><script src="/_next/static/chunks/collector.js"></script></body></html>');
  await write('.next/server/app/termografia/nova/page_client-reference-manifest.js', `globalThis.__RSC_MANIFEST={'/termografia/nova/page':{clientModules:{x:{chunks:['/_next/static/chunks/collector.js']}},entryCSSFiles:{x:[{path:'static/chunks/collector.css'}]}}};`);
  await write('.next/server/app/termografia/nova/page/build-manifest.json', JSON.stringify({ rootMainFiles: ['static/chunks/runtime..js'], polyfillFiles: [] }));
  await write('.next/static/chunks/collector.js', '/* collector */');
  await write('.next/static/chunks/runtime..js', '/* runtime */');
  await write('.next/static/chunks/collector.css', '@font-face{font-family:test;src:url(../media/latin.woff2)} @font-face{font-family:test;src:url("../media/extra.woff2")}');
  await write('.next/static/media/latin.woff2', 'font-one'); await write('.next/static/media/extra.woff2', 'font-two');
  await write('public/termografia/manifest.webmanifest', '{}'); await write('public/termografia/icon.svg', '<svg/>');
  await write('public/logo.png', 'logo');
  await write('public/termografia/icon-192.png', 'icon192'); await write('public/termografia/icon-512.png', 'icon512');
  return { root, write };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
describe('offline build package', () => {
  it('includes every CSS font subset and emits a hash-pinned public shell', async () => {
    const { root } = await fixture(); const result = await generateOfflinePackage(root);
    expect(result.assets.map(asset => asset.url)).toContain('/_next/static/media/extra.woff2');
    expect(result.assets.map(asset => asset.url)).toContain('/_next/static/chunks/runtime..js');
    const runtime = result.assets.find(asset => asset.url === '/_next/static/chunks/runtime..js');
    expect(runtime.downloadUrl).toBe('/termografia/offline/qa-build/assets/_next/static/chunks/runtime..js');
    expect(await readFile(path.join(root, 'public', runtime.downloadUrl), 'utf8')).toBe('/* runtime */');
    expect(result.shell.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(path.join(root, 'public/termografia/offline/latest.json'), 'utf8')).buildId).toBe('qa-build');
  });
  it('fails closed for a missing chunk instead of publishing a ready descriptor', async () => {
    const { root, write } = await fixture();
    await write('.next/server/app/termografia/nova/page/build-manifest.json', JSON.stringify({ rootMainFiles: ['static/chunks/missing.js'] }));
    await expect(generateOfflinePackage(root)).rejects.toThrow();
    await expect(readFile(path.join(root, 'public/termografia/offline/latest.json'))).rejects.toThrow();
  });
});
