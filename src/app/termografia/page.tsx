'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Offline collector needs document navigation rather than an uncached RSC request. */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listTermografiaReports, type TermografiaReportListItem } from '@/lib/termografia/report-actions';
import { backendProjectId, readLocalIdentity, subscribeLocalIdentity } from '@/lib/termografia/local-identity';
import { scopeKey, type FieldCollection } from '@/lib/termografia/field-collection';
import { DraftStore } from '@/lib/termografia/offline-store';
import { buttonClass, cardClass, fieldClass, primaryClass } from '@/components/termografia/collectorStyles';

export default function TermografiaListPage() {
  const [reports, setReports] = useState<TermografiaReportListItem[]>([]);
  const [drafts, setDrafts] = useState<FieldCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string>();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true, revoked = false;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const identity = url ? readLocalIdentity(backendProjectId(url), window.location.origin) : null;
    const store = identity ? new DraftStore(identity.scope) : null;
    const unsubscribe = subscribeLocalIdentity(() => {
      const next = url ? readLocalIdentity(backendProjectId(url), window.location.origin) : null;
      if (!identity || !next || scopeKey(next.scope) !== scopeKey(identity.scope)) {
        revoked = true; setReports([]); setDrafts([]); setLoading(false);
        setError('A conta mudou. Reabra a página após entrar na conta desejada.'); store?.close();
      }
    });
    if (store) void store.list().then(list => { if (alive && !revoked) setDrafts(list); }).catch(() => { if (alive && !revoked) setError('Não foi possível ler as coletas locais. Abra o coletor para tentar novamente.'); });
    void listTermografiaReports(supabase).then(list => { if (alive && !revoked) { setReports(list); setLoading(false); } }).catch(cause => {
      if (alive && !revoked) { setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os relatórios. Suas coletas locais continuam no celular.'); setLoading(false); }
    });
    return () => { alive = false; unsubscribe(); store?.close(); };
  }, []);
  const deleteLocal = async (draft: FieldCollection) => {
    if (deleting || !['draft', 'synced'].includes(draft.sync.status)) return;
    if (!window.confirm(draft.sync.status === 'synced' ? 'Excluir esta cópia do celular? O relatório enviado continuará na sua conta.' : 'Excluir esta coleta e suas fotos deste celular? Ela ainda não foi enviada e não poderá ser recuperada sem uma cópia ZIP.')) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const identity = url ? readLocalIdentity(backendProjectId(url), window.location.origin) : null;
    if (!identity || scopeKey(identity.scope) !== scopeKey(draft.scope)) { setError('A conta mudou. Reabra a lista.'); return; }
    const store = new DraftStore(identity.scope); setDeleting(draft.id);
    try { await store.delete(draft.id, draft.revision); setDrafts(list => list.filter(item => item.id !== draft.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a cópia local.'); }
    finally { store.close(); setDeleting(undefined); }
  };
  const filtered = reports.filter(report => `${report.numero_relatorio} ${report.cliente_nome}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <main className="min-h-screen bg-slate-50 pb-20 text-slate-900"><div className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-blue-800">RADIAL ENERGIA</p><h1 className="text-2xl font-bold">Relatórios de termografia</h1></div><a href="/termografia/nova?nova=1" className={primaryClass}>Nova coleta</a></header>
    <section className={`${cardClass} space-y-3`}><h2 className="text-lg font-semibold">Suas coletas neste aparelho</h2><p className="text-sm text-slate-600">Use a mesma coleta com ou sem internet. Antes de sair para o cliente, abra a coleta com conexão e aguarde “Pronto para usar sem internet”. A preparação é automática.</p><a href={drafts.length ? `/termografia/nova?rascunho=${drafts[0].id}` : "/termografia/nova"} className={primaryClass}>{drafts.length ? `Continuar coleta (${drafts.length})` : 'Iniciar coleta'}</a>
      {drafts.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{drafts.map(draft => <div key={draft.id} className="space-y-2 rounded-xl border border-slate-200 p-3"><a href={`/termografia/nova?rascunho=${draft.id}`} className={`${buttonClass} min-w-0 flex-col items-start text-left`}><span className="w-full break-words">{draft.report.cliente_nome || 'Nova coleta'}</span><span className="text-xs text-slate-600">{draft.points.length} quadros · {draft.photos.length} fotos · {draft.sync.status === 'draft' ? 'rascunho local' : draft.sync.status === 'synced' ? 'enviado' : 'fila autorizada'}</span></a><button type="button" className={`${buttonClass} text-red-800`} disabled={!!deleting || !['draft', 'synced'].includes(draft.sync.status)} onClick={() => void deleteLocal(draft)}>{deleting === draft.id ? 'Excluindo…' : 'Excluir do celular'}</button></div>)}</div>}
    </section>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Relatórios enviados</h2><label className="block text-sm">Buscar por número ou cliente<input className={fieldClass} type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {loading ? <p role="status" className={cardClass}>Consultando relatórios…</p> : !filtered.length ? <p className={`${cardClass} text-sm text-slate-600`}>Nenhum relatório encontrado.</p> : <div className="grid gap-3 sm:grid-cols-2">{filtered.map(report => <article key={report.id} className={`${cardClass} space-y-3`}><div><p className="text-sm font-semibold text-blue-800">{report.numero_relatorio}</p><h3 className="break-words font-semibold">{report.cliente_nome}</h3></div><p className="text-sm text-slate-600">{report.data_execucao.split('-').reverse().join('/')} · {report.pontos_count} quadros · {report.ocorrencias_count} aquecimentos / ocorrências</p><a href={`/termografia/${report.id}`} className={buttonClass}>Abrir relatório</a></article>)}</div>}
    </section>
  </div></main>;
}
