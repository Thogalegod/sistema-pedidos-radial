import { z } from 'zod';

/** Normalized bounds in the original, browser-oriented digital photograph. */
export const photoCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(.02).max(1), height: z.number().min(.02).max(1),
}).strict().refine(crop => crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9, 'Recorte fora da foto.');
export type PhotoCrop = z.infer<typeof photoCropSchema>;
export const FULL_PHOTO: PhotoCrop = { x: 0, y: 0, width: 1, height: 1 };
export function canonicalCrop(crop?: PhotoCrop): PhotoCrop | undefined {
  if (!crop) return undefined;
  const valid = photoCropSchema.parse(crop);
  return valid.x === 0 && valid.y === 0 && valid.width === 1 && valid.height === 1 ? undefined : valid;
}
export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function moveCrop(start: PhotoCrop, handle: CropHandle, dx: number, dy: number): PhotoCrop {
  if (handle === 'move') return { ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) };
  const right = start.x + start.width, bottom = start.y + start.height;
  const minWidth = Math.min(.08, start.width), minHeight = Math.min(.08, start.height);
  const x = handle.includes('w') ? clamp(start.x + dx, 0, right - minWidth) : start.x;
  const y = handle.includes('n') ? clamp(start.y + dy, 0, bottom - minHeight) : start.y;
  return { x, y, width: handle.includes('e') ? clamp(start.width + dx, minWidth, 1 - x) : right - x,
    height: handle.includes('s') ? clamp(start.height + dy, minHeight, 1 - y) : bottom - y };
}
