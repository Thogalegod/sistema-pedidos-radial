import { applyAction, generateId, renderAnnotationsToCanvas, type Annotation } from './annotations';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock canvas for renderAnnotationsToCanvas
const mockContext = {
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  beginPath: vi.fn(),
  ellipse: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
};

const mockToBlob = vi.fn((_cb: BlobCallback, _type: string, _quality: number) => {
  const blob = new Blob(['fake-jpeg'], { type: 'image/jpeg' });
  _cb(blob);
});

class MockImage {
  naturalWidth = 800;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  private _src = '';
  get src() { return this._src; }
  set src(_val: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateId', () => {
  it('retorna IDs únicos', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('retorna formato ann-timestamp-random', () => {
    const id = generateId();
    expect(id).toMatch(/^ann-\d+-[a-z0-9]+$/);
  });
});

describe('applyAction', () => {
  const base: Annotation[] = [];

  it('adiciona uma anotação', () => {
    const ann: Annotation = {
      id: 'a1',
      x: 50,
      y: 50,
      width: 15,
      height: 20,
      rotation: 0,
    };
    const result = applyAction(base, { type: 'add', annotation: ann });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(ann);
  });

  it('move uma anotação', () => {
    const ann: Annotation = {
      id: 'a1',
      x: 50,
      y: 50,
      width: 15,
      height: 20,
      rotation: 0,
    };
    const moved = applyAction([ann], { type: 'move', id: 'a1', x: 30, y: 40 });
    expect(moved[0].x).toBe(30);
    expect(moved[0].y).toBe(40);
    expect(moved[0].width).toBe(15); // unchanged
  });

  it('redimensiona uma anotação', () => {
    const ann: Annotation = {
      id: 'a1',
      x: 50,
      y: 50,
      width: 15,
      height: 20,
      rotation: 0,
    };
    const resized = applyAction([ann], {
      type: 'resize',
      id: 'a1',
      width: 25,
      height: 30,
    });
    expect(resized[0].width).toBe(25);
    expect(resized[0].height).toBe(30);
    expect(resized[0].x).toBe(50); // unchanged
  });

  it('remove uma anotação', () => {
    const ann1: Annotation = {
      id: 'a1',
      x: 50,
      y: 50,
      width: 15,
      height: 20,
      rotation: 0,
    };
    const ann2: Annotation = {
      id: 'a2',
      x: 30,
      y: 30,
      width: 10,
      height: 10,
      rotation: 0,
    };
    const result = applyAction([ann1, ann2], { type: 'delete', id: 'a1' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a2');
  });

  it('limpa todas as anotações', () => {
    const anns: Annotation[] = [
      { id: 'a1', x: 50, y: 50, width: 15, height: 20, rotation: 0 },
      { id: 'a2', x: 30, y: 30, width: 10, height: 10, rotation: 0 },
    ];
    const result = applyAction(anns, { type: 'clear' });
    expect(result).toHaveLength(0);
  });
});

describe('renderAnnotationsToCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', MockImage);

    vi.stubGlobal(
      'document',
      (() => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => mockContext),
          toBlob: mockToBlob,
        };
        return {
          createElement: vi.fn(() => canvas),
        };
      })(),
    );
  });

  it('carrega imagem e retorna blob JPEG', async () => {
    const annotations: Annotation[] = [
      { id: 'a1', x: 50, y: 50, width: 15, height: 20, rotation: 0 },
    ];
    const blob = await renderAnnotationsToCanvas(
      'data:image/jpeg;base64,fake',
      annotations,
      2400,
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('redimensiona canvas quando maxWidth é menor que a imagem', async () => {
    class TallImage extends MockImage {
      override naturalWidth = 3200;
      override naturalHeight = 2400;
    }
    vi.stubGlobal('Image', TallImage);

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toBlob: mockToBlob,
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });

    await renderAnnotationsToCanvas('data:image/fake', [], 2400);
    expect(canvas.width).toBe(2400);
    expect(canvas.height).toBe(1800);
  });

  it('desenha elipses para cada anotação', async () => {
    const annotations: Annotation[] = [
      { id: 'a1', x: 50, y: 50, width: 15, height: 20, rotation: 0 },
      { id: 'a2', x: 25, y: 75, width: 10, height: 10, rotation: 45 },
    ];
    await renderAnnotationsToCanvas('data:image/fake', annotations, 2400);
    expect(mockContext.ellipse).toHaveBeenCalledTimes(2);
    expect(mockContext.stroke).toHaveBeenCalledTimes(2);
  });
});
