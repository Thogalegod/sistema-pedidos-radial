'use client';

/* eslint-disable @next/next/no-html-link-for-pages -- Prepared offline entry requires document navigation rather than an uncached RSC request. */

import { useRef, useState } from 'react';
import { createFieldPoint, validateReadyToQueue, type FieldPoint } from '@/lib/termografia/field-collection';
import { useFieldCollector } from './useFieldCollector';
import { FieldPhotos } from './FieldPhotos';
import { BrazilianDateField } from './BrazilianDateField';
import { buttonClass, cardClass, fieldClass, primaryClass } from './collectorStyles';
import { collectorUrl, initialCollectorView, knownSectors, type CollectorView } from './collectorNavigation';

export function FieldCollector() {
  const collector = useFieldCollector();
  if (collector.loading) return <main className="min-h-screen bg-slate-50 p-5 text-slate-800"><p role="status">Abrindo coletas deste celular…</p></main>;
  if (!collector.state) return <main className="mx-auto max-w-xl space-y-4 p-5 text-slate-900"><h1 className="text-2xl font-bold">Coleta de termografia</h1><p role="alert">{collector.error ?? 'Entre na sua conta para iniciar a coleta.'}</p><a className={buttonClass} href="/termografia">Voltar às minhas coletas</a><button type="button" className={primaryClass} onClick={() => window.location.reload()}>Tentar novamente</button><a className={buttonClass} href="/login">Entrar na conta</a></main>;
  return <CollectionScreens key={collector.state.draft.id} collector={collector} />;
}

function CollectionScreens({ collector }: { collector: ReturnType<typeof useFieldCollector> }) {
  const { state, loading, busy, error, readiness, progress, online, preparingOffline, offlineProgress, offlineError } = collector;
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState('');
  const [routeSector, setRouteSector] = useState('');
  const [navigation, setNavigation] = useState<{ id: string; view: CollectorView }>(() => ({ id: collector.state!.draft.id, view: initialCollectorView(collector.state!.draft, window.location.search) }));
  const [sectorPicker, setSectorPicker] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const stepLock = useRef(false);
  const [viewedPoint, setViewedPoint] = useState('');
  const [backupError, setBackupError] = useState<string>();
  if (loading) return <main className="min-h-screen bg-slate-50 p-5 text-slate-800"><p role="status">Abrindo coletas deste celular…</p></main>;
  if (!state) return <main className="mx-auto max-w-xl space-y-4 p-5 text-slate-900"><h1 className="text-2xl font-bold">Coleta de termografia</h1><p role="alert">{error ?? 'Entre na sua conta para iniciar a coleta.'}</p><a className={buttonClass} href="/termografia">Voltar às minhas coletas</a><button type="button" className={primaryClass} onClick={() => window.location.reload()}>Tentar novamente</button><a className={buttonClass} href="/login">Entrar na conta</a><a className={buttonClass} href="/termografia/nova">Tentar abrir novamente</a></main>;
  const draft = state.draft;
  const view = navigation?.id === draft.id ? navigation.view : initialCollectorView(draft, window.location.search);
  const frozen = draft.sync.status !== 'draft';
  const disabled = busy || frozen || savingStep;
  const active = draft.points.find(p => p.id === viewedPoint) ?? draft.points.find(p => p.id === draft.activePointId) ?? draft.points[0];
  const sectors = knownSectors(draft, active?.id);
  const go = (next: CollectorView) => {
    setNavigation({ id: draft.id, view: next }); setBackupError(undefined); setSectorPicker(false);
    window.history.replaceState(window.history.state, '', collectorUrl(draft.id, next));
    document.getElementById('collection-top')?.scrollIntoView?.({ block: 'start' });
  };
  const saveThen = async (next: CollectorView, update?: () => void) => {
    if (stepLock.current) return;
    stepLock.current = true; setSavingStep(true); setBackupError(undefined);
    try { update?.(); await collector.flush(); go(next); }
    catch (cause) { setBackupError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Mantenha esta tela aberta e tente novamente.'); }
    finally { stepLock.current = false; setSavingStep(false); }
  };
  const openPoint = (id: string) => {
    if (!frozen) collector.edit(d => { d.activePointId = id; });
    setViewedPoint(id); go('point');
  };
  const updatePoint = (update: (point: FieldPoint) => void) => { if (active) collector.edit(d => { const point = d.points.find(p => p.id === active.id); if (point) update(point); }); };
  const patchPoint = (patch: Partial<FieldPoint>) => updatePoint(point => Object.assign(point, patch));
  const patchReport = (key: keyof typeof draft.report, value: string) => collector.edit(d => { Object.assign(d.report, { [key]: value }); });
  const addPoint = () => {
    const point = createFieldPoint({ setor: active?.setor ?? draft.points.at(-1)?.setor ?? '' });
    collector.edit(d => { d.points.push(point); d.activePointId = point.id; });
    setViewedPoint(point.id); go('point');
  };
  const finishPoint = () => {
    if (!active) return;
    if (!active.setor.trim() || !active.local.trim()) { setBackupError('Preencha o setor e o nome do quadro.'); return; }
    if ((active.inspectionStatus === 'no-load' || active.inspectionStatus === 'inaccessible') && !active.inspectionReason.trim()) { setBackupError('Informe o motivo para este quadro.'); return; }
    void saveThen('hub', () => patchPoint({ setor: active.setor.trim(), local: active.local.trim(), ...(active.inspectionStatus === 'pending' ? { inspectionStatus: 'inspected' as const } : {}) }));
  };
  const statuses = { occurrence: 'Inspecionado (Ocorrência)', inspected: 'Inspecionado (Sem ocorrência)', 'no-load': 'Sem carga', inaccessible: 'Não acessível' };
  const syncLabel = { draft: '', queued: 'Pendente de envio', syncing: 'Enviando', failed: 'Falha ao enviar', synced: 'Enviado' }[draft.sync.status];
  const saveLabel = state.error ? 'Falha ao salvar localmente' : state.saving || !state.saved ? 'Salvando no celular…' : 'Salvo no celular';
  const missingThermal = draft.points.filter(p => !draft.photos.some(photo => photo.pointId === p.id && photo.kind === 'termica'));
  const missingDigital = draft.points.filter(p => !draft.photos.some(photo => photo.pointId === p.id && photo.kind === 'digital'));
  const pending = draft.points.filter(p => p.inspectionStatus === 'pending');
  let blocking: string | undefined;
  try { validateReadyToQueue(draft); } catch (cause) { blocking = cause instanceof Error ? cause.message : 'Confira os dados obrigatórios.'; }
  const filtered = draft.points.filter(p => `${p.setor} ${p.local}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const download = async () => {
    setBackupError(undefined);
    try {
      const blob = await collector.exportBackup(); if (!blob) return;
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `termografia-${draft.id}.zip`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { setBackupError(cause instanceof Error ? cause.message : 'Não foi possível exportar a cópia.'); }
  };
  return <main id="collection-top" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 py-3 sm:px-5">
      <div className="min-w-0"><p className="text-[11px] font-bold tracking-widest text-blue-800">RADIAL ENERGIA</p><p className="truncate text-base font-semibold">{draft.report.cliente_nome || 'Nova termografia'}</p></div>
      {view === 'hub' ? <div className="flex shrink-0 gap-1"><button className={buttonClass} disabled={busy || savingStep} onClick={() => go('client')}>Dados</button><button aria-label="Mais opções da coleta" className={buttonClass} disabled={busy || savingStep} onClick={() => go('more')}>Mais</button></div> : draft.report.cliente_nome && <button className={`${buttonClass} shrink-0`} disabled={busy || savingStep} onClick={() => void saveThen('hub')}>← Quadros</button>}
    </div></header>
    <div className="mx-auto max-w-4xl space-y-4 px-3 pt-3 sm:px-5">
      <section className="space-y-2" aria-label="Gravação e preparação offline">
        <div role="status" aria-live="polite" className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium"><span className={state.error ? 'text-red-800' : state.saved ? 'text-emerald-800' : 'text-amber-800'}>{saveLabel}</span>{syncLabel && <span className="text-blue-800">{syncLabel}</span>}</div>
        {state.error && <div className="space-y-2"><p role="alert" className="text-sm text-red-800">{state.error}</p><p className="text-sm text-slate-700">Sua edição e arquivos pendentes continuam nesta aba. Mantenha-a aberta.</p><button type="button" className={buttonClass} onClick={() => void (state.conflict ? collector.reload() : collector.retryLocal())}>{state.conflict ? 'Reabrir versão salva' : 'Tentar salvar novamente'}</button></div>}
        {(error || draft.sync.error || backupError) && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-900">{error || draft.sync.error || backupError}</p>}
        {progress && <p role="status" className="text-sm text-blue-900">{progress}</p>}
        <div className={`space-y-1 text-xs ${readiness.ready ? 'text-emerald-800' : 'text-amber-800'}`}>
          <p role="status" className="font-semibold">{readiness.ready ? online ? 'Pronto para usar sem internet' : 'Sem internet · continue sua coleta normalmente' : preparingOffline ? offlineProgress ? `Preparando uso sem internet: ${offlineProgress.done}/${offlineProgress.total} arquivos` : 'Preparando uso sem internet…' : 'Ainda não está pronto para reabrir sem internet'}</p>
          {view === 'more' && <p>{readiness.ready ? 'Não precisa ativar nenhum modo. Fotos e dados são salvos neste aparelho, com ou sem sinal.' : preparingOffline ? 'Isso acontece automaticamente. Você já pode preencher a coleta; aguarde a confirmação antes de sair para um local sem sinal.' : 'Você pode continuar nesta tela. Conecte-se à internet para preparar a reabertura da coleta sem sinal.'}</p>}
          {!readiness.ready && !preparingOffline && <p>Os dados e fotos salvos ficam neste aparelho, mas a reabertura sem sinal ainda não está garantida.</p>}
          {offlineError && <p>{readiness.ready ? 'A atualização não terminou. A versão já preparada continua disponível.' : offlineError}</p>}
          {offlineError && online && !preparingOffline && <button type="button" className={buttonClass} onClick={() => void collector.prepareOffline()}>Tentar preparação novamente</button>}
        </div>
        {view === 'more' && <details className="text-sm text-slate-600"><summary className="min-h-11 cursor-pointer py-3">Como usar no campo</summary>
          <ol className="list-decimal space-y-2 pl-5"><li>Antes de sair, abra esta tela com internet e aguarde “Pronto para usar sem internet”.</li><li>No cliente, preencha os quadros e anexe as fotos normalmente. Aguarde “Salvo no celular” antes de fechar.</li><li>Ao terminar, toque em “Terminar coleta” e envie à sua conta para continuar no computador. Para concluir o envio, deixe o app aberto com internet.</li></ol>
          <p className="mt-3">Salve <a className="font-medium text-blue-800 underline" href="/termografia/nova">esta tela de coleta</a> nos favoritos ou na tela inicial para abri-la sem internet. Use o mesmo navegador e aparelho.</p>
          <p className="mt-2">Guarde também uma cópia ZIP. Limpar os dados do navegador pode apagar coletas que ainda não foram enviadas.</p>
        </details>}
      </section>
      {view === 'more' && <section className={`${cardClass} space-y-3`} aria-label="Rascunhos do celular">
        <h1 className="text-xl font-bold">Mais opções</h1><a href="/termografia" className={buttonClass}>Relatórios da conta</a>
        <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1 text-sm">Coletas deste celular<select className={fieldClass} disabled={busy || !state.saved} value={draft.id} onChange={e => void collector.open(e.target.value)}>
          {collector.drafts.map(d => <option key={d.id} value={d.id}>{(d.id === draft.id ? draft.report.cliente_nome : d.report.cliente_nome) || 'Nova coleta'} · {d.points.length} quadros · {d.sync.status === 'draft' ? 'rascunho' : d.sync.status === 'synced' ? 'enviado' : 'fila autorizada'}</option>)}
        </select></label><button type="button" className={`${buttonClass} self-end`} disabled={busy || !state.saved} onClick={() => void collector.create()}>Nova coleta</button></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || !state.saved} onClick={() => void download()}>Exportar cópia ZIP</button>
          <label className={`${buttonClass} relative cursor-pointer`}>Recuperar ZIP<input aria-label="Recuperar cópia ZIP" type="file" accept=".zip,application/zip" disabled={busy || !state.saved} className="absolute inset-0 w-full opacity-0" onChange={e => { const file = e.target.files?.[0]; if (file) void collector.importBackup(file); e.target.value = ''; }} /></label>
          {frozen && <button type="button" className={buttonClass} disabled={busy} onClick={() => void collector.copy()}>Criar cópia editável</button>}
        </div><p className="text-xs text-slate-600">A cópia inclui os originais. Recuperar cria outra coleta com novos IDs na conta atual. Arquivos ZIP têm proteção de tamanho; guarde a cópia original se houver erro.</p>
      </section>}
      {view === 'client' && <form className={`${cardClass} space-y-4`} aria-label="Dados gerais da coleta" onSubmit={event => { event.preventDefault(); if (!draft.report.cliente_nome.trim() || !draft.report.data_execucao) { setBackupError('Informe o cliente e a data.'); return; } void saveThen('hub'); }}>
        <div><h1 className="text-xl font-bold">{draft.points.length ? 'Dados do cliente' : 'Começar termografia'}</h1><p className="mt-1 text-sm text-slate-600">Só o essencial agora. Os outros dados podem ser completados depois.</p></div>
        <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="text-sm">Cliente *<input required className={fieldClass} value={draft.report.cliente_nome} onChange={e => patchReport('cliente_nome', e.target.value)} autoComplete="organization" /></label>
          <BrazilianDateField value={draft.report.data_execucao} onChange={value => patchReport('data_execucao', value)} />
        </fieldset>
        {draft.points.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Endereço, responsável e outros dados</summary><fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">
          {([['cliente_cnpj', 'CNPJ'], ['cliente_endereco', 'Endereço'], ['cliente_cidade', 'Cidade'], ['cliente_uf', 'UF'], ['cliente_cep', 'CEP'], ['responsavel_nome', 'Responsável'], ['responsavel_crea', 'CREA'], ['objetivo', 'Objetivo']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input className={fieldClass} value={draft.report[key] ?? ''} onChange={e => patchReport(key, e.target.value)} /></label>)}
        </fieldset></details>}
        <button type="submit" className={`${primaryClass} w-full`} disabled={busy || savingStep}>{savingStep ? 'Salvando…' : draft.points.length ? 'Voltar aos quadros' : 'Começar coleta'}</button>
      </form>}
      {view === 'hub' && <section className="space-y-4" aria-label="Roteiro de quadros">
        <div><h1 className="text-2xl font-bold">Quadros</h1><p className="text-sm text-slate-600">{draft.points.length} cadastrados · {draft.points.length - pending.length} inspecionados</p></div>
        {!frozen && <button type="button" className={`${primaryClass} w-full`} disabled={disabled} onClick={() => addPoint()}>Adicionar quadro</button>}
        <label className="block text-sm">Buscar quadro<input className={fieldClass} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Setor ou nome do quadro" /></label>
        {draft.points.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center"><p className="font-medium">Vamos ao primeiro quadro</p><p className="mt-1 text-sm text-slate-600">Adicione o nome, escolha o setor e anexe as fotos.</p></div>}
        {draft.points.length > 0 && filtered.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Nenhum quadro encontrado.</p>}
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{filtered.map((point, index) => {
          const photos = draft.photos.filter(photo => photo.pointId === point.id);
          return <button type="button" key={point.id} disabled={busy || savingStep} aria-label={`Abrir ${point.local || `Quadro ${index + 1}`}`} className="flex min-h-20 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => openPoint(point.id)}>
            <span className="min-w-0"><span className="block break-words font-semibold">{point.local || `Quadro ${index + 1}`}</span><span className="mt-1 block break-words text-xs text-slate-500">{point.setor || 'Setor não informado'} · {photos.filter(p => p.kind === 'digital').length} digital · {photos.filter(p => p.kind === 'termica').length} térmica(s)</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${point.occurrenceSelected || point.hotspots.length ? 'bg-red-100 text-red-800' : point.inspectionStatus === 'no-load' ? 'bg-blue-100 text-blue-800' : point.inspectionStatus === 'inaccessible' ? 'bg-yellow-100 text-yellow-900' : 'bg-green-100 text-green-800'}`}>{statuses[point.occurrenceSelected || point.hotspots.length ? 'occurrence' : point.inspectionStatus === 'pending' ? 'inspected' : point.inspectionStatus]} ›</span>
          </button>;
        })}</div>
      </section>}
      {view === 'more' && <section className={cardClass}>
        {!frozen && <details><summary className="min-h-11 cursor-pointer py-3 font-medium">Preparar roteiro com vários quadros</summary><div className="space-y-3">
          <label className="block text-sm">Setor do roteiro<input className={fieldClass} value={routeSector} onChange={e => setRouteSector(e.target.value)} placeholder={active?.setor || 'Ex.: Produção'} disabled={busy} /></label>
          <label className="block text-sm">Um nome de quadro por linha<textarea className={fieldClass} rows={4} value={route} onChange={e => setRoute(e.target.value)} placeholder={'QD-01\nQD-02\nQGBT'} disabled={busy} /></label>
          <button className={buttonClass} type="button" disabled={busy || !route.trim()} onClick={() => {
            const points = route.split(/\r?\n/).map(name => name.trim()).filter(Boolean).map(local => createFieldPoint({ setor: routeSector || active?.setor || '', local }));
            collector.edit(d => { d.points.push(...points); if (!d.activePointId) d.activePointId = points[0]?.id; }); setRoute(''); go('hub');
          }}>Adicionar roteiro sem fotos</button>
        </div></details>}
      </section>}
      {view === 'point' && active && <section className="space-y-4" aria-label="Quadro selecionado">
        <div className={`${cardClass} space-y-3`}><h1 className="break-words text-xl font-bold">{active.local || 'Novo quadro'}</h1>
          <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="text-sm">Nome / local do quadro *<input className={fieldClass} value={active.local} onChange={e => patchPoint({ local: e.target.value })} /></label>
            <div><label className="block text-sm">Setor / área *<input className={fieldClass} value={active.setor} onChange={e => patchPoint({ setor: e.target.value })} placeholder="Digite um novo setor" /></label>
              {sectors.length > 0 && <button type="button" className="min-h-11 text-sm font-medium text-blue-800 underline" aria-expanded={sectorPicker} onClick={() => setSectorPicker(!sectorPicker)}>Escolher setor já usado</button>}
              {sectorPicker && <div aria-label="Setores já usados" className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">{sectors.map(sector => <button type="button" className={`${buttonClass} w-full justify-start text-left`} key={sector} onClick={() => { patchPoint({ setor: sector }); setSectorPicker(false); }}>{sector}</button>)}</div>}
            </div>
            <label className="text-sm sm:col-span-2">Situação da inspeção<select className={fieldClass} value={active.occurrenceSelected || active.hotspots.length ? 'occurrence' : active.inspectionStatus === 'pending' ? 'inspected' : active.inspectionStatus} onChange={e => {
              const occurrence = e.target.value === 'occurrence';
              if (!occurrence && active.hotspots.length && !window.confirm('Esta alteração remove as descrições de ocorrência deste quadro. As fotos e os desenhos serão mantidos. Continuar?')) return;
              updatePoint(p => { p.inspectionStatus = occurrence ? 'inspected' : e.target.value as FieldPoint['inspectionStatus']; p.occurrenceSelected = occurrence; if (!occurrence) { p.hotspots = []; p.annotations.forEach(annotation => { delete annotation.hotspotId; }); } });
            }}>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {(active.inspectionStatus === 'no-load' || active.inspectionStatus === 'inaccessible') && <label className="text-sm sm:col-span-2">Motivo *<textarea className={fieldClass} value={active.inspectionReason} onChange={e => patchPoint({ inspectionReason: e.target.value })} placeholder="Descreva brevemente o motivo" /></label>}
          </fieldset>
        </div>
        <FieldPhotos key={active.id} store={collector.store} draft={draft} point={active} disabled={disabled} localSaved={state.saved} attach={collector.attach} removePhoto={collector.removePhoto} updatePoint={updatePoint} flush={collector.flush} />
      </section>}
      {frozen && view === 'hub' && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Esta versão está reservada para envio. Os originais permanecem no celular. Para alterar, use “Criar cópia editável” em Mais.</p>}
      {view === 'finish' && !frozen && <section className={`${cardClass} space-y-4`} aria-label="Conclusão da coleta">
        <h1 className="text-xl font-bold">Terminar coleta</h1>
        <p className="text-sm text-slate-700">Os dados e fotos estão neste aparelho. Envie à sua conta para abrir o relatório no computador e completar os dados.</p>
        {blocking && <p role="alert" className="text-sm text-red-800">{blocking}</p>}
        <p className="text-sm">{pending.length} quadro(s) a inspecionar · {missingThermal.length} quadro(s) sem foto térmica · {missingDigital.length} quadro(s) sem foto digital.</p>
        {(pending.length > 0 || missingThermal.length > 0 || missingDigital.length > 0) && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-amber-900">Ver quadros com pendências</summary><div className="space-y-2">{[...new Set([...pending, ...missingThermal, ...missingDigital].map(p => p.id))].map(id => { const point = draft.points.find(p => p.id === id)!; return <button type="button" className={`${buttonClass} w-full justify-start text-left`} key={id} onClick={() => openPoint(id)}>{point.setor} / {point.local || 'Sem identificação'}: {statuses[point.occurrenceSelected || point.hotspots.length ? 'occurrence' : point.inspectionStatus === 'pending' ? 'inspected' : point.inspectionStatus]}{!draft.photos.some(photo => photo.pointId === id && photo.kind === 'termica') ? ' · sem térmica' : ''}{!draft.photos.some(photo => photo.pointId === id && photo.kind === 'digital') ? ' · sem digital' : ''}</button>; })}</div></details>}
        <p className="text-sm text-slate-600">Depois do envio, novas alterações ficam em uma revisão. Isso ainda não emite o laudo final.</p>
        {!online && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-950">Sem internet agora. O envio autorizado continua quando este app estiver aberto com conexão.</p>}
        <div className="grid gap-2"><button type="button" className={primaryClass} disabled={busy || !!blocking || !state.saved} onClick={() => { go('hub'); void collector.authorizeSend(); }}>Enviar à minha conta</button><button type="button" className={buttonClass} onClick={() => go('hub')}>Continuar depois neste aparelho</button></div>
      </section>}
      {(view === 'hub' || view === 'point') && <footer className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-xl sm:border">
        {view === 'point' ? <><button type="button" className={buttonClass} disabled={busy || savingStep} onClick={() => void saveThen('hub')}>{frozen ? 'Voltar à lista' : 'Voltar sem concluir'}</button>{!frozen && <button type="button" className={primaryClass} disabled={disabled} onClick={finishPoint}>{savingStep ? 'Salvando…' : 'Concluir quadro'}</button>}</> : <>
          <p className="text-xs text-slate-500">{draft.photos.length} fotos salvas</p>
          {!frozen ? <button type="button" className={primaryClass} disabled={busy || savingStep || !draft.points.length} onClick={() => void saveThen('finish')}>Terminar coleta</button> : draft.sync.status !== 'synced' ? <button type="button" className={primaryClass} disabled={busy} onClick={() => void collector.resume()}>Retomar envio</button> : <a className={primaryClass} href={`/termografia/${draft.id}`}>Abrir relatório enviado</a>}
        </>}
      </footer>}
    </div>
  </main>;
}
