export type Annotation = {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  rotation: number; // degrees
};

export type AnnotationAction =
  | { type: 'add'; annotation: Annotation }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; width: number; height: number }
  | { type: 'delete'; id: string }
  | { type: 'clear' };

export function generateId(): string {
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function applyAction(
  annotations: Annotation[],
  action: AnnotationAction,
): Annotation[] {
  switch (action.type) {
    case 'add':
      return [...annotations, action.annotation];
    case 'move':
      return annotations.map((a) =>
        a.id === action.id ? { ...a, x: action.x, y: action.y } : a,
      );
    case 'resize':
      return annotations.map((a) =>
        a.id === action.id ? { ...a, width: action.width, height: action.height } : a,
      );
    case 'delete':
      return annotations.filter((a) => a.id !== action.id);
    case 'clear':
      return [];
  }
}

export async function renderAnnotationsToCanvas(
  imageSrc: string,
  annotations: Annotation[],
  maxWidth: number,
): Promise<Blob> {
  const img = await loadImage(imageSrc);

  let canvasWidth = img.naturalWidth;
  let canvasHeight = img.naturalHeight;

  if (canvasWidth > maxWidth) {
    const ratio = maxWidth / canvasWidth;
    canvasWidth = maxWidth;
    canvasHeight = Math.round(canvasHeight * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível preparar o canvas para anotação.');
  }

  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  const scaleX = canvasWidth / 100;
  const scaleY = canvasHeight / 100;
  const refStroke = 6;

  for (const ann of annotations) {
    const cx = ann.x * scaleX;
    const cy = ann.y * scaleY;
    const rx = (ann.width / 2) * scaleX;
    const ry = (ann.height / 2) * scaleY;

    ctx.save();
    ctx.translate(cx, cy);
    if (ann.rotation !== 0) {
      ctx.rotate((ann.rotation * Math.PI) / 180);
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, 2 * Math.PI);
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = refStroke * (canvasWidth / 2400);
    ctx.fillStyle = 'transparent';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Não foi possível gerar a imagem anotada.')),
      'image/jpeg',
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    img.src = src;
  });
}
