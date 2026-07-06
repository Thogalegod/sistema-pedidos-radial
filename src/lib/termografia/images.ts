export type CropPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function nomeFotoPonto(id: string, tipo: 'digital' | 'termica'): string {
  return `${id}-${tipo}.jpg`;
}

export function nomeFotoPontoVersionada(
  id: string,
  tipo: 'digital' | 'termica',
  revisao = Date.now(),
): string {
  return `${id}-${revisao}-${tipo}.jpg`;
}

export function nomeFotoOriginalVersionada(id: string, revisao = Date.now()): string {
  return `${id}-${revisao}-digital-original.jpg`;
}

export async function recortarImagem(file: File, area: CropPixels): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const valores = [area.x, area.y, area.width, area.height];
    if (!valores.every(Number.isFinite) || area.width <= 0 || area.height <= 0) {
      throw new Error('A área de recorte é inválida.');
    }

    const sourceX = Math.max(0, Math.round(area.x));
    const sourceY = Math.max(0, Math.round(area.y));
    const sourceRight = Math.min(bitmap.width, Math.round(area.x + area.width));
    const sourceBottom = Math.min(bitmap.height, Math.round(area.y + area.height));
    const sourceWidth = sourceRight - sourceX;
    const sourceHeight = sourceBottom - sourceY;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error('A área de recorte está fora da imagem.');
    }
    if (sourceWidth * sourceHeight > 20_000_000) {
      throw new Error('A área de recorte é grande demais.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('O navegador não conseguiu preparar o recorte.');
    }

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error('Não foi possível gerar a imagem recortada.')),
        'image/jpeg',
        0.9,
      );
    });

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
