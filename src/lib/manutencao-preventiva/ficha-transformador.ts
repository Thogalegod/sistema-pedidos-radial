import type { JsonObject } from './types';

export type InspectionStatus = 'C' | 'N/C' | 'N/A';

export interface FichaTransformadorSnapshot {
  data: Record<string, string>;
  photos: { placa?: string; equipamento?: string };
  selectedTaps: string[];
  visualItems: string[];
  visualStatus: Record<string, InspectionStatus>;
  insulationRows: Array<{ id: string; position: string; voltage: string; current: string }>;
  occurrences: Array<{ id: string; priority: string; text: string; source?: string }>;
  coolingType: string;
  ttrConnections: string[];
  windingRows: Array<{ winding: string; connection: string }>;
  oilRows: Array<{ test: string; method: string; specified: string; result: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createEmptyFichaTransformadorSnapshot(): FichaTransformadorSnapshot {
  return {
    data: {},
    photos: {},
    selectedTaps: [],
    visualItems: [],
    visualStatus: {},
    insulationRows: [],
    occurrences: [],
    coolingType: 'Óleo isolante',
    ttrConnections: [],
    windingRows: [],
    oilRows: [],
  };
}

export const emptyFichaTransformadorSnapshot: FichaTransformadorSnapshot = createEmptyFichaTransformadorSnapshot();

export function isValidFichaTransformadorId(value: string) {
  return UUID_REGEX.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyPersistedValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value == null) return '';

  return null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const normalized = stringifyPersistedValue(entry);
      return normalized == null ? [] : [[key, normalized]];
    })
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function typedArray<T>(value: unknown, guard: (entry: unknown) => entry is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function isInspectionStatus(value: unknown): value is InspectionStatus {
  return value === 'C' || value === 'N/C' || value === 'N/A';
}

function isInsulationRow(value: unknown): value is FichaTransformadorSnapshot['insulationRows'][number] {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.position === 'string'
    && typeof value.voltage === 'string'
    && typeof value.current === 'string';
}

function isOccurrence(value: unknown): value is FichaTransformadorSnapshot['occurrences'][number] {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.priority === 'string'
    && typeof value.text === 'string'
    && (value.source === undefined || typeof value.source === 'string');
}

function isWindingRow(value: unknown): value is FichaTransformadorSnapshot['windingRows'][number] {
  return isRecord(value)
    && typeof value.winding === 'string'
    && typeof value.connection === 'string';
}

function isOilRow(value: unknown): value is FichaTransformadorSnapshot['oilRows'][number] {
  return isRecord(value)
    && typeof value.test === 'string'
    && typeof value.method === 'string'
    && typeof value.specified === 'string'
    && typeof value.result === 'string';
}

export function normalizeFichaTransformadorSnapshot(value: unknown): FichaTransformadorSnapshot {
  if (!isRecord(value)) {
    return createEmptyFichaTransformadorSnapshot();
  }

  const data = stringRecord(value.data);
  const photos = stringRecord(value.photos);
  const selectedTaps = stringArray(value.selectedTaps);
  const visualItems = stringArray(value.visualItems);
  const insulationRows = typedArray(value.insulationRows, isInsulationRow);
  const occurrences = typedArray(value.occurrences, isOccurrence);
  const ttrConnections = stringArray(value.ttrConnections);
  const windingRows = typedArray(value.windingRows, isWindingRow);
  const oilRows = typedArray(value.oilRows, isOilRow);
  const visualStatusEntries = isRecord(value.visualStatus)
    ? Object.entries(value.visualStatus).filter((entry): entry is [string, InspectionStatus] => (
      typeof entry[0] === 'string' && isInspectionStatus(entry[1])
    ))
    : [];

  return {
    data,
    photos,
    selectedTaps,
    visualItems,
    visualStatus: Object.fromEntries(visualStatusEntries),
    insulationRows,
    occurrences,
    coolingType: typeof value.coolingType === 'string'
      ? value.coolingType
      : emptyFichaTransformadorSnapshot.coolingType,
    ttrConnections,
    windingRows,
    oilRows,
  };
}

export function fichaTransformadorSnapshotToJson(
  snapshot: FichaTransformadorSnapshot
): JsonObject {
  return snapshot as unknown as JsonObject;
}

export function buildFichaTransformadorSearchParams(input: {
  manutencaoId: string;
  equipamentoId: string;
  fichaId?: string;
}) {
  const params = new URLSearchParams({
    manutencaoId: input.manutencaoId,
    equipamentoId: input.equipamentoId,
  });

  if (input.fichaId) {
    params.set('fichaId', input.fichaId);
  }

  return params.toString();
}
