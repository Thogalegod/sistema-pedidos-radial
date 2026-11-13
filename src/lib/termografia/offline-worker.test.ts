// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const origin = 'https://radial.test';
async function harness() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const buckets = new Map<string, Map<string, Response>>();
  const key = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name: string) {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const data = buckets.get(name)!;
      return { async put(req: string | Request, response: Response) { data.set(key(req), response.clone()); }, async match(req: string | Request) { return data.get(key(req))?.clone(); } };
    },
    async keys() { return [...buckets.keys()]; },
    async delete(name: string) { return buckets.delete(name); },
  };
  const server = new Map<string, Response>();
  const fetched: string[] = [];
  const fetcher = async (req: string | Request) => { const url = key(req); fetched.push(url); const response = server.get(url); if (!response) throw new Error('offline'); return response.clone(); };
  runInNewContext(readFileSync('public/termografia/sw.js', 'utf8'), {
    self: { location: { origin }, clients: { async get() { return { url: origin + '/termografia/nova' }; } }, addEventListener(name: string, handler: typeof listeners[string]) { listeners[name] = handler; } },
    caches, fetch: fetcher, crypto: webcrypto, URL, Response, Request, TextEncoder, console,
  });
  async function publish(buildId: string, broken = false) {
    const shell = '<html>public collector ' + buildId + '</html>';
    const asset = '/* bundle ' + buildId + ' */';
    const digest = async (text: string) => Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toString('hex');
    const prefix = '/termografia/offline/' + buildId;
    const manifest = { version: 1, buildId, shell: { url: prefix + '/shell.html', sha256: await digest(shell), size: shell.length }, assets: [{ url: '/_next/static/chunks/' + buildId + '.js', sha256: await digest(asset), size: asset.length }] };
    server.set(origin + '/termografia/offline/latest.json', Response.json({ version: 1, buildId, manifestUrl: prefix + '/manifest.json' }));
    server.set(origin + prefix + '/manifest.json', Response.json(manifest));
    server.set(origin + prefix + '/shell.html', new Response(shell, { headers: { 'content-type': 'text/html' } }));
    server.set(origin + manifest.assets[0].url, new Response(broken ? 'broken bundle' : asset, { headers: { 'content-type': 'application/javascript' } }));
  }
  async function message(type: string) {
    let pending: Promise<unknown> = Promise.resolve(); let result: Record<string, unknown> = {};
    listeners.message({ data: { type }, source: { id: 'collector' }, ports: [{ postMessage(value: Record<string, unknown>) { if (value.type !== 'PROGRESS') result = value; } }], waitUntil(value: Promise<unknown>) { pending = value; } });
    await pending; return result;
  }
  async function request(path: string, options: Record<string, unknown> = {}) {
    let handled: Promise<Response> | undefined;
    listeners.fetch({ request: { url: origin + path, method: 'GET', mode: 'navigate', headers: new Headers(), ...options }, respondWith(value: Promise<Response>) { handled = value; } });
    return handled ? await handled : undefined;
  }
  return { publish, message, request, server, buckets, fetched };
}

describe('thermography public offline shell', () => {
  it('checks for updates without downloading the same verified build again', async () => {
    const h = await harness(); await h.publish('build-one'); await h.message('PREPARE');
    h.fetched.length = 0;
    expect(await h.message('PREPARE')).toMatchObject({ ready: true });
    expect(h.fetched).toEqual([origin + '/termografia/offline/latest.json', origin + '/termografia/offline/build-one/manifest.json']);
    h.buckets.get('radial-termografia-shell-v1-build-one')!.delete(origin + '/_next/static/chunks/build-one.js');
    expect(await h.message('STATUS')).toMatchObject({ ready: false });
    expect(await h.message('PREPARE')).toMatchObject({ ready: true });
    expect(h.fetched).toContain(origin + '/_next/static/chunks/build-one.js');
  });
  it('opens a verified complete shell offline and preserves prior build when an update is incomplete', async () => {
    const h = await harness(); await h.publish('build-one');
    expect(await h.message('PREPARE')).toMatchObject({ ready: true, buildId: 'build-one' });
    await h.publish('build-two', true);
    expect(await h.message('PREPARE')).toMatchObject({ ready: false });
    h.server.clear();
    expect(await (await h.request('/termografia/nova?draft=local-id'))!.text()).toContain('build-one');
    expect(await h.message('STATUS')).toMatchObject({ ready: true, buildId: 'build-one' });
  });
  it('never handles private report, REST, RSC, or other-module requests as cached shell', async () => {
    const h = await harness(); await h.publish('build-one'); await h.message('PREPARE');
    expect(await h.request('/termografia/private-id')).toBeUndefined();
    expect(await h.request('/rest/v1/relatorios')).toBeUndefined();
    expect(await h.request('/termografia/nova?_rsc=1')).toBeUndefined();
    expect(await h.request('/termografia/nova', { headers: new Headers({ RSC: '1' }) })).toBeUndefined();
    expect(await h.request('/pedidos')).toBeUndefined();
  });
});
