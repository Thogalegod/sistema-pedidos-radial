import { createTermografiaPoint, createTermografiaReport, type TermografiaReportInput } from './report-actions';
import { saveTermografiaPhoto } from './storage';
import type { TermografiaPonto } from './types';

export type CollectionPoint = TermografiaPonto & { _fotoDigitalFile?: File; _fotoTermicaFile?: File };
export type CollectionInput = { report: TermografiaReportInput; points: CollectionPoint[] };

export function createCollectionProgress() {
  return {
    reportId: crypto.randomUUID(),
    pointIds: new Map<string, string>(),
    photos: new Map<string, { id: string; prepared?: File; complete: boolean }>(),
  };
}

export async function saveCollection(
  client: Parameters<typeof createTermografiaReport>[0],
  input: CollectionInput,
  progress: ReturnType<typeof createCollectionProgress>,
  deps = {
    report: createTermografiaReport, point: createTermografiaPoint,
    photo: saveTermografiaPhoto, prepare: async (file: File) => file,
  },
) {
  const report = await deps.report(client, input.report, progress.reportId);
  for (const [index, point] of input.points.entries()) {
    if (!progress.pointIds.has(point.id)) progress.pointIds.set(point.id, crypto.randomUUID());
    const row = await deps.point(client, report.id, {
      setor: point.setor.trim(), local: point.local.trim(), inspecionado: point.inspecionado,
      ocorrencia: point.ocorrencia, componente: point.componente, temperatura: point.temperatura,
      data_hora_foto: point.dataHoraFoto, classificacao: point.classificacao,
      risco: point.risco, conclusao: point.conclusao,
    }, index + 1, progress.pointIds.get(point.id));
    for (const kind of ['digital', 'termica'] as const) {
      const file = kind === 'digital' ? point._fotoDigitalFile : point._fotoTermicaFile;
      if (!file) continue;
      const key = `${point.id}/${kind}`;
      if (!progress.photos.has(key)) progress.photos.set(key, { id: crypto.randomUUID(), complete: false });
      const photo = progress.photos.get(key)!;
      if (photo.complete) continue;
      photo.prepared ??= await deps.prepare(file);
      await deps.photo(client, {
        organizationId: report.organization_id, reportId: report.id, pointId: row.id,
        fileId: photo.id, kind, file: photo.prepared,
      });
      photo.complete = true;
    }
  }
  return report.id;
}
