// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_MAX_FILE_BYTES, prepareFieldPhoto } from './prepared-photo';
import type { FieldPhoto } from './field-collection';

function photo(blob: Blob, kind: FieldPhoto['kind']): FieldPhoto { return { id: crypto.randomUUID(), pointId: crypto.randomUUID(), kind, fileName: 'original.jpg', contentType: blob.type, size: blob.size }; }
afterEach(() => vi.unstubAllGlobals());
describe('browser image preparation', () => {
  it('preserves exact thermal bytes with no canvas transformation and validates decoding', async () => {
    const original = new Blob(['thermal-colors-and-scale'], { type: 'image/jpeg' }); const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 480, close })));
    const result = await prepareFieldPhoto(original, photo(original, 'termica'));
    expect(result.blob).toBe(original); expect(await result.blob.text()).toBe('thermal-colors-and-scale'); expect(close).toHaveBeenCalledOnce();
  });
  it('resizes a separate digital derivative without upscaling and validates its dimensions', async () => {
    const original = new Blob(['original'], { type: 'image/jpeg' }); const derivative = new Blob(['prepared-jpeg'], { type: 'image/jpeg' });
    const drawImage = vi.fn(); const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob: (done: (blob: Blob) => void) => done(derivative) };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('createImageBitmap', vi.fn(async (blob: Blob) => ({ width: blob === original ? 5000 : 2048, height: blob === original ? 4000 : 1638, close: vi.fn() })));
    const result = await prepareFieldPhoto(original, photo(original, 'digital'));
    expect(result.blob).toBe(derivative); expect(result).toMatchObject({ width: 2048, height: 1638 }); expect(await original.text()).toBe('original');
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 2048, 1638]);
  });
  it('rejects undecodable or oversized thermal files explicitly', async () => {
    const original = new Blob(['unsupported'], { type: 'image/heic' });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('Unsupported'); }));
    await expect(prepareFieldPhoto(original, photo(original, 'termica'))).rejects.toThrow(/original.*preservad/i);
    const large = new Blob([new Uint8Array(MOBILE_MAX_FILE_BYTES + 1)], { type: 'image/jpeg' });
    await expect(prepareFieldPhoto(large, photo(large, 'termica'))).rejects.toThrow(/10 MiB/);
  });
});
