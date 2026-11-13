import type { FieldHotspot } from './field-collection';
import type { TermografiaArquivo, TermografiaPonto, TermografiaRelatorio } from './types';

export type PrintOccurrence = FieldHotspot & { number: number };
export interface PrintPhotoSheet { digital?: TermografiaArquivo; thermal?: TermografiaArquivo; occurrences: PrintOccurrence[] }
export interface PrintEntry {
  point: TermografiaPonto; number: number; page: number; files: TermografiaArquivo[];
  occurrences: PrintOccurrence[]; occurrenceCount: number; temperature: string; status: string;
  sheets: PrintPhotoSheet[]; details: { heading: string; text: string }[][];
}

export function formatReportTemperature(value?: string) {
  return value?.trim().replace(/\s*[°º]?\s*c\s*$/i, '').replace(/(\d)\.(\d)/g, '$1,$2') || '—';
}
export function formatReportDate(value?: string, long = false) {
  const date = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!date) return '—';
  if (!long) return `${date[3]}/${date[2]}/${date[1]}`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date[0]}T12:00:00Z`));
}
export function reportFiles(point: TermografiaPonto): TermografiaArquivo[] {
  if (point.arquivos?.length) return point.arquivos;
  return (['digital', 'termica'] as const).flatMap(tipo => {
    const path = tipo === 'digital' ? point.fotoDigitalUrl : point.fotoTermicaUrl;
    const id = tipo === 'digital' ? point.fotoDigitalArquivoId : point.fotoTermicaArquivoId;
    return path ? [{ id: id || `${point.id}-${tipo}`, tipo, storagePath: path, fileName: path.split('/').pop()?.split('?')[0] || tipo, contentType: 'image/jpeg' }] : [];
  });
}
export function reportOccurrences(point: TermografiaPonto): PrintOccurrence[] {
  if (point.metadata) return point.metadata.hotspots.map((h, i) => ({ ...h, number: i + 1 }));
  return point.ocorrencia ? [{ id: `${point.id}-occurrence`, number: 1, photoId: point.fotoTermicaArquivoId || `${point.id}-termica`, digitalPhotoId: point.fotoDigitalArquivoId || undefined, componente: point.componente || '', temperatura: point.temperatura || '', conclusao: point.conclusao || '', classificacao: point.classificacao, risco: point.risco }] : [];
}
function photoSheets(files: TermografiaArquivo[], occurrences: PrintOccurrence[]): PrintPhotoSheet[] {
  const digitals = files.filter(f => f.tipo === 'digital'), thermals = files.filter(f => f.tipo === 'termica');
  const sheets: PrintPhotoSheet[] = [], assigned = new Set<string>();
  for (const [index, thermal] of thermals.entries()) {
    const linked = occurrences.filter(h => h.photoId === thermal.id);
    const digitalIds = [...new Set(linked.map(h => h.digitalPhotoId).filter(Boolean))];
    const matches = digitalIds.length ? digitalIds.map(id => digitals.find(d => d.id === id)).filter((d): d is TermografiaArquivo => !!d) : [digitals.length === 1 ? digitals[0] : digitals[index]].filter(Boolean);
    for (const digital of matches.length ? matches : [undefined]) {
      const owned = linked.filter(h => !assigned.has(h.id) && (!h.digitalPhotoId || h.digitalPhotoId === digital?.id));
      owned.forEach(h => assigned.add(h.id));
      sheets.push({ digital, thermal, occurrences: owned });
    }
  }
  for (const digital of digitals) if (!sheets.some(s => s.digital?.id === digital.id)) sheets.push({ digital, occurrences: [] });
  if (!sheets.length) sheets.push({ occurrences: [] });
  // Legacy occurrences may have no surviving photo; their text must still appear.
  sheets[0].occurrences.push(...occurrences.filter(h => !assigned.has(h.id)));
  return sheets;
}
export function occurrenceText(h: PrintOccurrence) {
  return [h.componente, h.descricao, h.classificacao && `Classificação: ${h.classificacao}`, h.risco && `Risco: ${h.risco}`, h.conclusao && `Conclusão: ${h.conclusao}`].filter(Boolean).join('\n');
}
function detailPages(sheets: PrintPhotoSheet[]) {
  const paragraphs = sheets.flatMap(s => {
    if (hasInlineDescriptions(s)) return [];
    return s.occurrences.flatMap(h => {
      const text = occurrenceText(h) || 'Ocorrência registrada sem descrição complementar.';
      // Bound unstructured field notes without truncating anything.
      return splitDescription(text).map((part, i) => ({ heading: `Ocorrência ${h.number}${i ? ' (continuação)' : ''} · ${formatReportTemperature(h.temperatura)}${h.temperatura ? ' °C' : ''}`, text: part }));
    });
  });
  return chunks(paragraphs, 3);
}
export function hasInlineDescriptions(sheet: PrintPhotoSheet) {
  const text = sheet.occurrences.map(occurrenceText).join('\n');
  return sheet.occurrences.length <= 2 && text.length <= 240 && text.split('\n').length <= 5;
}
function splitDescription(text: string) {
  const parts: string[] = [];
  let start = 0, lines = 0, lineWidth = 0;
  for (let i = 0; i < text.length; i++) {
    lineWidth++;
    if (text[i] === '\n' || lineWidth >= 85) { lines++; lineWidth = 0; }
    if (lines >= 12 || i - start >= 899) { parts.push(text.slice(start, i + 1)); start = i + 1; lines = 0; lineWidth = 0; }
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}
export function chunks<T>(items: T[], count: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / count) }, (_, i) => items.slice(i * count, (i + 1) * count));
}
export function buildPrintReport(report: TermografiaRelatorio) {
  const entries: PrintEntry[] = report.pontos.map(point => {
    const files = reportFiles(point), occurrences = reportOccurrences(point), sheets = photoSheets(files, occurrences);
    const temperatures = [...new Set([point.temperatura, ...occurrences.map(h => h.temperatura)].filter(v => v?.trim()).map(formatReportTemperature))];
    const inspection = point.metadata?.inspectionStatus;
    const status = occurrences.length ? 'Ocorrência térmica' : inspection === 'no-load' ? 'Sem carga' : inspection === 'inaccessible' ? 'Sem acesso' : inspection === 'pending' || !point.inspecionado ? 'Não inspecionado' : !files.some(f => f.tipo === 'termica') ? 'Sem registro térmico' : 'Sem ocorrência registrada';
    const notes = !occurrences.length && point.conclusao && point.conclusao.length > 240
      ? chunks(splitDescription(point.conclusao).map(text => ({ heading: 'Conclusão registrada na medição', text })), 3) : [];
    return { point, files, occurrences, occurrenceCount: occurrences.length, sheets, details: [...detailPages(sheets), ...notes], temperature: temperatures.join(' / ') || '—', status, number: 0, page: 0 };
  }).sort((a, b) => Number(b.occurrenceCount > 0) - Number(a.occurrenceCount > 0));
  const relationPages = chunks(entries, 20);
  if (!relationPages.length) relationPages.push([]);
  const occurrenceEntries = entries.filter(e => e.occurrenceCount > 0);
  const summaryPages = Math.max(1, Math.ceil(occurrenceEntries.length / 12));
  const relationPage = 3 + summaryPages;
  const identificationPage = relationPage + relationPages.length;
  const criteriaPage = identificationPage + 1;
  let next = criteriaPage + 1;
  entries.forEach((entry, i) => { entry.number = i + 1; entry.page = next; next += entry.sheets.length + entry.details.length; });
  const conclusionPage = next;
  const pendingEntries = entries.filter(e => e.status !== 'Sem ocorrência registrada');
  const actionPages = chunks(pendingEntries, 3);
  if (!actionPages.length) actionPages.push([]);
  const conclusionPages = Math.max(1, Math.ceil(occurrenceEntries.length / 12));
  const actionPage = conclusionPage + conclusionPages;
  const referencePage = actionPage + actionPages.length;
  const signaturePage = referencePage + 3;
  return { entries, relationPages, relationPage, summaryPages, occurrenceEntries, pendingEntries, identificationPage, criteriaPage, conclusionPage, conclusionPages, actionPage, actionPages, referencePage, signaturePage, totalPages: signaturePage,
    files: entries.flatMap(e => e.files), occurrenceCount: entries.reduce((n, e) => n + e.occurrenceCount, 0), normalThermalCount: entries.filter(e => e.status === 'Sem ocorrência registrada').length,
  };
}
export type PrintReportModel = ReturnType<typeof buildPrintReport>;
