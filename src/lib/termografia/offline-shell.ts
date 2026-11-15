export interface OfflineReadiness { ready: boolean; buildId?: string; assetCount?: number; bytes?: number; error?: string; persistentStorage?: boolean }

function askWorker(worker: ServiceWorker, type: 'PREPARE' | 'STATUS', onProgress?: (done: number, total: number) => void): Promise<OfflineReadiness> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const expire = () => { channel.port1.close(); reject(new Error('O download ficou sem avançar. Confira a conexão e tente novamente; seus dados e fotos locais não foram apagados.')); };
    let timeout = window.setTimeout(expire, type === 'PREPARE' ? 120_000 : 10_000);
    channel.port1.onmessage = event => {
      if (event.data?.type === 'PROGRESS') { clearTimeout(timeout); timeout = window.setTimeout(expire, 120_000); onProgress?.(event.data.done, event.data.total); return; }
      clearTimeout(timeout); channel.port1.close(); resolve(event.data as OfflineReadiness);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
async function activeWorker(registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  if (registration.active) return registration.active;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Não foi possível instalar o modo offline.');
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (worker.state === 'activated') { clearTimeout(timeout); worker.removeEventListener('statechange', finish); resolve(worker); }
      else if (worker.state === 'redundant') { clearTimeout(timeout); worker.removeEventListener('statechange', finish); reject(new Error('A instalação offline falhou.')); }
    };
    const timeout = window.setTimeout(() => { worker.removeEventListener('statechange', finish); reject(new Error('A instalação offline não terminou. Tente novamente.')); }, 15_000);
    worker.addEventListener('statechange', finish); finish();
  });
}
export async function getOfflineReadiness(): Promise<OfflineReadiness> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return { ready: false };
  const registration = await navigator.serviceWorker.getRegistration('/termografia/');
  if (!registration?.active) return { ready: false };
  return askWorker(registration.active, 'STATUS');
}
export async function prepareOfflineShell(onProgress?: (done: number, total: number) => void, options: { requestPersistence?: boolean } = {}): Promise<OfflineReadiness> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('Este navegador não oferece a preparação offline. Use um navegador atualizado e o endereço HTTPS do app.');
  const persistent = (options.requestPersistence === false ? navigator.storage?.persisted?.() : navigator.storage?.persist?.())?.catch(() => false) ?? Promise.resolve(false);
  const registration = await navigator.serviceWorker.register('/termografia/sw.js', { scope: '/termografia/', updateViaCache: 'none' });
  const result = await askWorker(await activeWorker(registration), 'PREPARE', onProgress);
  return { ...result, persistentStorage: await persistent };
}
