import type { JsonObject } from './types';

export type InspectionStatus = 'C' | 'N/C' | 'N/A';

export interface FichaDisjuntorSnapshot {
  data: Record<string, string>;
  inspectionStatus: Record<string, InspectionStatus>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createEmptyFichaDisjuntorSnapshot(): FichaDisjuntorSnapshot {
  return {
    data: {},
    inspectionStatus: {},
  };
}

export const emptyFichaDisjuntorSnapshot: FichaDisjuntorSnapshot = createEmptyFichaDisjuntorSnapshot();

export function isValidFichaDisjuntorId(value: string) {
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

function isInspectionStatus(value: unknown): value is InspectionStatus {
  return value === 'C' || value === 'N/C' || value === 'N/A';
}

function inspectionStatusRecord(value: unknown): Record<string, InspectionStatus> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, InspectionStatus] => (
      typeof entry[0] === 'string' && isInspectionStatus(entry[1])
    ))
  );
}

export function normalizeFichaDisjuntorSnapshot(value: unknown): FichaDisjuntorSnapshot {
  if (!isRecord(value)) {
    return createEmptyFichaDisjuntorSnapshot();
  }

  return {
    data: stringRecord(value.data),
    inspectionStatus: inspectionStatusRecord(value.inspectionStatus),
  };
}

export function fichaDisjuntorSnapshotToJson(
  snapshot: FichaDisjuntorSnapshot
): JsonObject {
  return snapshot as unknown as JsonObject;
}

export function buildFichaDisjuntorSearchParams(input: {
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
