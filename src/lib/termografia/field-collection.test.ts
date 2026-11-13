// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFieldCollection, createFieldPoint, validateFieldCollection, validateReadyToQueue, pointMetadata } from './field-collection';

export const scope = { projectId: 'project-a', origin: 'https://example.test', userId: 'user-a', organizationId: 'org-a' };

describe('field collection', () => {
  it('persists the occurrence choice offline and prevents silently sending it without a description', () => {
    const draft = createFieldCollection(scope, { cliente_nome: 'Cliente' });
    const point = createFieldPoint({ setor: 'Entrada', local: 'Q1' });
    point.inspectionStatus = 'inspected'; point.occurrenceSelected = true; draft.points.push(point);
    expect(validateFieldCollection(JSON.parse(JSON.stringify(draft))).points[0].occurrenceSelected).toBe(true);
    expect(() => validateReadyToQueue(draft)).toThrow(/descrição/);
    expect(pointMetadata(point)).not.toHaveProperty('occurrenceSelected');
  });
  it('creates stable UUIDs and lossless versioned point metadata', () => {
    const draft = createFieldCollection(scope);
    const point = createFieldPoint({ setor: 'Entrada', local: 'Q1' });
    draft.points.push(point);
    draft.activePointId = point.id;
    expect(draft.id).toMatch(/^[\da-f-]{36}$/);
    expect(draft.report.equipamento).toBe('InfiRay T2S Plus');
    expect(validateFieldCollection(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(pointMetadata(point)).toEqual({ version: 1, inspectionStatus: 'pending', inspectionReason: '', hotspots: [], annotations: [], photoIds: [] });
  });
  it('rejects object URLs, malformed references and invalid annotation coordinates', () => {
    const draft = createFieldCollection(scope);
    const point = createFieldPoint({ setor: '', local: '' });
    draft.points.push(point);
    expect(() => validateFieldCollection({ ...draft, preview: 'blob:private' })).toThrow();
    point.hotspots.push({ id: crypto.randomUUID(), photoId: crypto.randomUUID(), componente: '', temperatura: '', conclusao: '' });
    expect(() => validateFieldCollection(draft)).toThrow(/refer/i);
    point.hotspots = [];
    point.annotations.push({ id: crypto.randomUUID(), photoId: crypto.randomUUID(), tool: 'point', color: '#ff0000', strokeWidth: .01, points: [{ x: 2, y: .5 }] });
    expect(() => validateFieldCollection(draft)).toThrow();
  });
});
