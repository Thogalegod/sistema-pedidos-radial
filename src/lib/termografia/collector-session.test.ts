// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { DraftStore } from './offline-store';
import { createFieldCollection, createFieldPoint } from './field-collection';
import { CollectorSession } from './collector-session';

const scope = { projectId: 'project', origin: 'http://localhost:3000', userId: 'user', organizationId: 'org' };
async function setup() {
  const store = new DraftStore(scope, { name: `collector-${crypto.randomUUID()}` });
  const draft = createFieldCollection(scope); draft.points.push(createFieldPoint({ setor: 'Sala', local: 'QD-1' })); draft.activePointId = draft.points[0].id;
  return { store, draft: await store.create(draft) };
}
describe('collector serial local commits', () => {
  it('continues saving text and photos after flushing an already saved draft', async () => {
    const { store, draft } = await setup(); const session = new CollectorSession(store, draft);
    await session.flush(); // Preparing offline / exporting ZIP / saving before Xtherm.
    session.edit(d => { d.report.cliente_nome = 'Depois do preparo'; });
    const id = session.attach(draft.points[0].id, new File(['original'], 'foto.jpg', { type: 'image/jpeg' }), 'termica');
    await session.flush();
    expect(session.state.saved).toBe(true);
    expect((await store.get(draft.id))?.report.cliente_nome).toBe('Depois do preparo');
    expect(await (await store.getBlob(draft.id, id))?.text()).toBe('original'); store.close();
  });
  it('reopens text, active point and exact original after overlapping edits and attachment', async () => {
    const { store, draft } = await setup(); const session = new CollectorSession(store, draft);
    session.edit(d => { d.report.cliente_nome = 'Cliente A'; });
    const photoId = session.attach(draft.points[0].id, new File(['original'], 'termica.jpg', { type: 'image/jpeg' }), 'termica');
    session.edit(d => { d.report.cliente_nome = 'Cliente AB'; d.points[0].local = 'QGBT'; });
    await session.flush();
    const recovered = new CollectorSession(store, (await store.get(draft.id))!);
    expect(recovered.state.draft.report.cliente_nome).toBe('Cliente AB');
    expect(recovered.state.draft.points[0].local).toBe('QGBT');
    expect(recovered.state.draft.activePointId).toBe(draft.activePointId);
    expect(recovered.state.saved).toBe(true);
    expect(await (await store.getBlob(draft.id, photoId))?.text()).toBe('original');
    store.close();
  });
  it('retains unsaved edits and selected original after failed commit, then retries', async () => {
    const { store, draft } = await setup(); const session = new CollectorSession(store, draft);
    const original = store.attachPhoto.bind(store);
    vi.spyOn(store, 'attachPhoto').mockRejectedValueOnce(new Error('Sem espaço')).mockImplementation(original);
    session.attach(draft.points[0].id, new File(['photo'], 'digital.png', { type: 'image/png' }), 'digital');
    session.edit(d => { d.report.cliente_nome = 'Ainda na tela'; });
    await expect(session.flush()).rejects.toThrow('Sem espaço');
    expect(session.state.saved).toBe(false); expect(session.state.error).toContain('Sem espaço');
    expect(session.state.draft.photos).toHaveLength(1);
    expect(session.state.draft.report.cliente_nome).toBe('Ainda na tela');
    await session.retry(); expect(session.state.saved).toBe(true);
    expect((await store.get(draft.id))?.report.cliente_nome).toBe('Ainda na tela'); store.close();
  });
  it('surfaces a revision conflict and never overwrites another tab', async () => {
    const { store, draft } = await setup(); const session = new CollectorSession(store, draft);
    await store.save({ ...draft, report: { ...draft.report, cliente_nome: 'Outra aba' } });
    session.edit(d => { d.report.cliente_nome = 'Minha edição'; });
    await expect(session.flush()).rejects.toThrow('outra aba');
    expect(session.state.conflict).toBe(true); expect(session.state.saved).toBe(false);
    expect(session.state.draft.report.cliente_nome).toBe('Minha edição');
    expect((await store.get(draft.id))?.report.cliente_nome).toBe('Outra aba'); store.close();
  });
  it('retries a new point plus photo without mutating the queued point identity', async () => {
    const { store, draft } = await setup(); const session = new CollectorSession(store, draft);
    const save = store.save.bind(store); vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('Disco ocupado')).mockImplementation(save);
    const point = createFieldPoint({ setor: 'A', local: 'Novo' });
    session.edit(d => { d.points.push(point); d.activePointId = point.id; });
    session.attach(point.id, new File(['original'], 'foto.jpg', { type: 'image/jpeg' }), 'termica');
    await expect(session.flush()).rejects.toThrow();
    await session.retry();
    expect(session.state.saved).toBe(true); expect((await store.get(draft.id))?.photos).toHaveLength(1); store.close();
  });
});
