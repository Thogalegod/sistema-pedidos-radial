import { Children, useState, type ReactNode } from 'react';
import type { TermografiaArquivo, TermografiaRelatorio } from '@/lib/termografia/types';
import { chunks, formatReportDate, formatReportTemperature, hasInlineDescriptions, type PrintEntry, type PrintPhotoSheet, type PrintReportModel } from '@/lib/termografia/print-report';
import { DigitalAnnotationOverlay } from './DigitalAnnotationOverlay';
import { reportPrintStyles } from './report-print-styles';

const pad = (n: number) => String(n).padStart(2, '0');
const pageRange = (first: number, last: number) => first === last ? pad(first) : `${pad(first)}–${pad(last)}`;
const address = (report: TermografiaRelatorio) => [report.cliente_endereco, [report.cliente_cidade, report.cliente_uf].filter(Boolean).join('/'), report.cliente_cep && `CEP ${report.cliente_cep}`].filter(Boolean).join(' · ') || '—';

function Sheet({ report, model, page, kicker, title, status, children, cover = false }: {
  report: TermografiaRelatorio; model: PrintReportModel; page: number; kicker?: string; title?: string; status?: string; children: ReactNode; cover?: boolean;
}) {
  return <section className={`tr-sheet${cover ? ' tr-cover' : ''}${status === 'Ocorrência térmica' ? ' tr-has-occurrences' : ''}`} data-report-page={page}>
    <header className="tr-header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/termografia/report-logo.png" alt="Radial Energia" />
      {!cover && <div><strong>{report.cliente_nome}</strong><span>INSPEÇÃO TERMOGRÁFICA | {formatReportDate(report.data_execucao)}</span></div>}
    </header>
    <div className="tr-content">
      {kicker && <p className="tr-kicker">{kicker}</p>}
      {title && <div className="tr-title-row"><h2>{title}</h2>{status && <span className={`tr-status${status === 'Ocorrência térmica' ? ' tr-danger-text' : ''}`}>{status}</span>}</div>}
      {Children.toArray(children)}
    </div>
    <footer className="tr-footer"><div><strong>RADIAL ENERGIA</strong><span>www.radialenergia.com.br | radial@radialenergia.com.br</span></div><span>REV. {pad(report.revisao)} | {pad(page)} / {pad(model.totalPages)}</span></footer>
  </section>;
}
function DataTable({ rows }: { rows: [string, ReactNode][] }) {
  return <table className="tr-table tr-data"><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value == null || value === '' ? '—' : value}</td></tr>)}</tbody></table>;
}
function MaintenanceFields() {
  return <div className="tr-maintenance" aria-label="Campos de acompanhamento da manutenção">
    <div><strong>Correções necessárias</strong><span /></div><div><strong>Correções executadas</strong><span /></div>
    <div className="tr-two-fields"><strong>Responsável</strong><span /><strong>Data</strong><span /></div>
    <div><strong>Reinspeção e resultado</strong><span /></div>
    <div className="tr-two-fields"><strong>Data da reinspeção</strong><span /><strong>Situação</strong><span /></div>
  </div>;
}
function Photo({ file, entry, url, onLoad, onError }: { file?: TermografiaArquivo; entry: PrintEntry; url?: string; onLoad: (id: string) => void; onError: () => void }) {
  const [ratio, setRatio] = useState(file?.width && file.height ? file.width / file.height : 1);
  const type = file?.tipo === 'termica' ? 'térmica' : 'digital';
  const label = file ? `${file.tipo === 'digital' ? 'D' : 'T'}${entry.files.filter(f => f.tipo === file.tipo).findIndex(f => f.id === file.id) + 1}` : '';
  return <div className="tr-photo-frame">{file && url ? <div className="tr-photo-image" style={{ width: `min(100%, calc(var(--tr-photo-height) * ${ratio}))` }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img data-report-photo-id={file.id} src={url} alt={`Foto ${type} ${label} — ${entry.point.local}`} onLoad={event => { const img = event.currentTarget; if (img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight); onLoad(file.id); }} onError={onError} />
    {file.tipo === 'digital' && <DigitalAnnotationOverlay annotations={entry.point.metadata?.annotations.filter(a => a.photoId === file.id) || []} hotspots={entry.point.metadata?.hotspots} className="tr-annotations" />}
  </div> : <span className="tr-photo-empty">{file ? 'Carregando foto…' : 'Sem imagem registrada'}</span>}</div>;
}
function recommendedAction(entry: PrintEntry) {
  if (!entry.occurrenceCount && entry.point.conclusao?.trim() && entry.point.conclusao.length <= 240) return entry.point.conclusao;
  if (entry.occurrenceCount) return 'Avaliar os componentes e as conexões nas regiões indicadas, definir e executar as correções necessárias e realizar nova termografia após a intervenção.';
  if (entry.status === 'Sem ocorrência registrada') return 'Manter acompanhamento periódico e realizar nova inspeção termográfica em 12 meses.';
  if (entry.status === 'Sem carga') return 'Realizar nova inspeção com o equipamento em condição de carga adequada à avaliação térmica.';
  if (entry.status === 'Sem acesso') return 'Programar acesso ao equipamento para concluir a inspeção termográfica.';
  return 'Complementar o registro termográfico e concluir a avaliação do equipamento.';
}
function InspectionSheet({ entry, photoSheet, index, report, urls, onLoad, onError }: { entry: PrintEntry; photoSheet: PrintPhotoSheet; index: number; report: TermografiaRelatorio; urls: Record<string, string>; onLoad: (id: string) => void; onError: () => void }) {
  const digitalCount = entry.files.filter(f => f.tipo === 'digital').length;
  const thermalCount = entry.files.length - digitalCount;
  const sheetTemps = [...new Set(photoSheet.occurrences.map(h => h.temperatura).filter(Boolean).map(formatReportTemperature))];
  const temperature = sheetTemps.join(' / ') || (index === 0 ? entry.temperature : '—');
  return <>
    <table className="tr-table tr-inspection"><colgroup><col /><col /><col /><col /></colgroup><tbody>
      <tr><th>Equipamento analisado</th><td colSpan={3}>{entry.point.local || '—'}</td></tr>
      <tr><th>Setor / área</th><td>{entry.point.setor || '—'}</td><th>Inspeção</th><td>{formatReportDate(report.data_execucao)}</td></tr>
      <tr><th>Termovisor</th><td>{report.equipamento || '—'}</td><th>Emissividade</th><td>—</td></tr>
      <tr><th>Temperatura registrada</th><td className={entry.occurrenceCount ? 'tr-danger-text' : ''}>{temperature}{temperature !== '—' && ' °C'}</td><th>Pontos com ocorrência térmica</th><td>{entry.occurrenceCount}</td></tr>
      <tr><th>Quantidade de fotos</th><td>{entry.files.length}</td><th>Visual / termograma</th><td>{digitalCount} / {thermalCount}</td></tr>
    </tbody></table>
    {entry.point.metadata?.inspectionReason && <p className="tr-inspection-reason">{entry.point.metadata.inspectionReason}</p>}
    <div className="tr-photo-pair">{(['digital', 'thermal'] as const).map(kind => {
      const file = photoSheet[kind];
      const code = file ? `${file.tipo === 'digital' ? 'D' : 'T'}${entry.files.filter(f => f.tipo === file.tipo).findIndex(f => f.id === file.id) + 1}` : '';
      return <figure key={kind}><figcaption>{kind === 'digital' ? 'Fotografia visual' : 'Imagem termográfica'}</figcaption><Photo file={file} entry={entry} url={file && urls[file.id]} onLoad={onLoad} onError={onError} /><p className="tr-filename">{file ? `${code} · ${file.fileName}` : '—'}</p></figure>;
    })}</div>
    {photoSheet.occurrences.length > 0 && <div className="tr-occurrence-notes">{hasInlineDescriptions(photoSheet) ? photoSheet.occurrences.map(h => <div key={h.id} className="tr-occurrence-description"><strong>Ocorrência {h.number}{h.temperatura ? ` · ${formatReportTemperature(h.temperatura)} °C` : ''}</strong>{h.componente && <span>{h.componente}</span>}{h.descricao && <span>{h.descricao}</span>}{h.classificacao && <span>Classificação: {h.classificacao}{h.risco ? ` · Risco: ${h.risco}` : ''}</span>}{h.risco && !h.classificacao && <span>Risco: {h.risco}</span>}{h.conclusao && <span>{h.conclusao}</span>}</div>) : <p>Ocorrências {photoSheet.occurrences.map(h => h.number).join(', ')}: descrição completa nas páginas de continuação desta ficha.</p>}</div>}
    <div className="tr-action"><h3 className={entry.occurrenceCount ? 'tr-danger-text' : ''}>Ação recomendada</h3><p>{recommendedAction(entry)}</p></div>
    <MaintenanceFields />
  </>;
}

export function PrintReportDocument({ report, model, urls, onLoad, onError, scale = 1 }: { report: TermografiaRelatorio; model: PrintReportModel; urls: Record<string, string>; onLoad: (id: string) => void; onError: () => void; scale?: number }) {
  const shared = { report, model };
  const digitalCount = model.files.filter(f => f.tipo === 'digital').length;
  const thermalCount = model.files.length - digitalCount;
  const occurrenceStart = model.occurrenceEntries[0]?.page;
  const normalStart = model.entries.find(e => !e.occurrenceCount)?.page;
  const sections: [string, string][] = [
    ['Resumo da inspeção', pageRange(3, model.relationPage - 1)],
    ['Relação de equipamentos e imagens', pageRange(model.relationPage, model.identificationPage - 1)],
    ['Objetivo e identificação da inspeção', pad(model.identificationPage)],
    ['Leitura dos resultados e acompanhamento', pad(model.criteriaPage)],
    ...(occurrenceStart ? [['Fichas com ocorrência térmica', pageRange(occurrenceStart, (normalStart || model.conclusionPage) - 1)] as [string, string]] : []),
    ...(normalStart ? [['Fichas dos demais equipamentos', pageRange(normalStart, model.conclusionPage - 1)] as [string, string]] : []),
    ['Conclusão técnica', pageRange(model.conclusionPage, model.actionPage - 1)],
    ['Controle consolidado das ações', pageRange(model.actionPage, model.referencePage - 1)],
    ['Referencial técnico de classificação', pageRange(model.referencePage, model.referencePage + 2)],
    ['Responsabilidade técnica e assinatura', pad(model.signaturePage)],
  ];
  const summaryEntries = chunks(model.occurrenceEntries, 12);
  const summaryTable = (entries: PrintEntry[]) => <table key="occurrence-summary" className="tr-table tr-summary-occurrences"><thead><tr><th>Ficha</th><th>Setor / equipamento</th><th>Temp. °C</th><th>Ocorrências</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.point.id} className="tr-occurrence-row"><td>{pad(entry.number)}</td><td>{entry.point.setor} · {entry.point.local}</td><td>{entry.temperature}</td><td>{entry.occurrenceCount}</td></tr>)}</tbody></table>;
  return <div className="tr-document" style={{ zoom: scale }}>
    <style>{reportPrintStyles}</style>
    <Sheet {...shared} page={1} cover>
      <p className="tr-kicker">Relatório técnico</p><h1>Inspeção<br />termográfica</h1><h2 className="tr-cover-client">{report.cliente_nome}</h2><p className="tr-cover-subtitle">Quadros e equipamentos elétricos</p>
      <DataTable rows={[
        ['Cliente', report.cliente_nome], ['CNPJ', report.cliente_cnpj], ['Local', address(report)], ['Inspeção', formatReportDate(report.data_execucao, true)], ['Emissão', formatReportDate(report.criado_em, true)], ['Revisão', pad(report.revisao)],
      ]} />
      <div className="tr-metrics"><div><strong>{pad(model.entries.length)}</strong><span>equipamentos</span></div><div><strong>{pad(model.files.length)}</strong><span>fotografias</span></div><div><strong className="tr-danger-text">{pad(model.occurrenceCount)}</strong><span>pontos com ocorrência</span></div></div>
      <p className="tr-cover-note">Registro da inspeção, resultados e acompanhamento das ações de manutenção.</p>
    </Sheet>
    <Sheet {...shared} page={2} kicker="Navegação" title="Índice">
      <div className="tr-index">{sections.map(([title, pages], i) => <div key={title}><span>{pad(i + 1)}</span><strong>{title}</strong><span>{pages}</span></div>)}</div>
      <h3>Consulta por equipamento</h3><p>A relação de equipamentos e imagens identifica cada ficha, as fotografias associadas, a temperatura registrada, o número de ocorrências e a página de consulta. As fichas com ocorrência são apresentadas primeiro.</p>
      <h3>Campos para acompanhamento</h3><p>As fichas individuais e o controle consolidado reservam campos para registrar correções, responsável, datas e resultado da reinspeção.</p>
    </Sheet>
    {Array.from({ length: model.summaryPages }, (_, i) => <Sheet {...shared} key={`summary-${i}`} page={3 + i} kicker="Resumo" title={`Resumo da inspeção${i ? ' (continuação)' : ''}`}><div>
      {!i && <DataTable key="inspection-totals" rows={[
        ['Equipamentos registrados', model.entries.length], ['Fotografias visuais', digitalCount], ['Imagens termográficas', thermalCount], ['Total de fotografias', model.files.length], ['Pontos com ocorrência térmica', model.occurrenceCount], ['Com termograma e sem ocorrência', model.normalThermalCount], ['Sem avaliação térmica concluída', model.pendingEntries.filter(e => !e.occurrenceCount).length],
      ]} />}
      <h3>Ocorrências para acompanhamento</h3>{model.occurrenceCount ? summaryTable(summaryEntries[i] || []) : <p>Nenhuma ocorrência térmica registrada.</p>}
      <p>O número de ocorrências corresponde aos pontos registrados em cada medição. Uma fotografia pode conter mais de uma ocorrência.</p>
      {!!model.pendingEntries.filter(e => !e.occurrenceCount).length && <p className="tr-notice">Os registros sem avaliação térmica concluída exigem complementação. Ausência de termograma não confirma condição térmica normal.</p>}
    </div></Sheet>)}
    {model.relationPages.map((entries, i) => <Sheet {...shared} key={`relation-${i}`} page={model.relationPage + i} kicker="Controle das imagens" title="Relação de equipamentos e imagens"><div>
      <p className="tr-subtitle">Fichas {pad(entries[0]?.number || 0)} a {pad(entries.at(-1)?.number || 0)} | Identificação e localização dos registros</p>
      <table className="tr-table tr-relation"><colgroup><col style={{ width: '6%' }} /><col style={{ width: '15%' }} /><col style={{ width: '24%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} /></colgroup>
        <thead><tr><th>Ficha</th><th>Setor / área</th><th>Equipamento</th><th>Foto visual</th><th>Foto térmica</th><th>Temp. °C</th><th>Ocorrências</th><th>Pág.</th></tr></thead>
        <tbody>{entries.map(entry => <tr key={entry.point.id} className={entry.occurrenceCount ? 'tr-occurrence-row' : ''} data-measurement-id={entry.point.id}><td><strong>{pad(entry.number)}{entry.occurrenceCount ? ' *' : entry.status !== 'Sem ocorrência registrada' ? ' †' : ''}</strong></td><td>{entry.point.setor}</td><td>{entry.point.local}</td>{(['digital', 'termica'] as const).map(tipo => <td key={tipo}>{entry.files.filter(f => f.tipo === tipo).map((f, n) => <span className="tr-file-code" key={f.id}>{f.fileName.match(/WA\d+/)?.[0] || `${tipo === 'digital' ? 'D' : 'T'}${n + 1}`}</span>)}</td>)}<td>{entry.temperature}</td><td className="tr-occurrence-cell"><strong>{entry.occurrenceCount}</strong></td><td>{entry.page}</td></tr>)}</tbody>
      </table>
      <p className="tr-legend">* Ocorrência térmica: linha destacada. † Avaliação térmica não concluída. 0 = nenhuma ocorrência registrada.</p><p className="tr-legend">As identificações das fotos correspondem às imagens e aos nomes de arquivo apresentados em cada ficha. Temperatura “—” = leitura não informada.</p>
    </div></Sheet>)}
    <Sheet {...shared} page={model.identificationPage} kicker="Identificação e escopo" title="Objetivo e identificação da inspeção">
      <p>{report.objetivo || 'A inspeção termográfica dos quadros e equipamentos elétricos tem como objetivo registrar a distribuição de temperaturas, identificar ocorrências térmicas e orientar o acompanhamento das condições dos componentes inspecionados.'}</p>
      <DataTable rows={[
        ['Contratante', report.cliente_nome], ['CNPJ', report.cliente_cnpj], ['Local de execução', address(report)], ['Data de inspeção', formatReportDate(report.data_execucao)], ['Empresa executora', 'Radial Energia'], ['Responsável técnico', report.responsavel_nome], ['CREA', report.responsavel_crea], ['Instrumento informado', report.equipamento], ['Emissividade padrão', '—'],
      ]} />
      <h3>Equipamento utilizado</h3><p>{report.equipamento || 'Instrumento não informado.'}</p>
      <h3>Abrangência documental</h3><p>O relatório reúne {model.entries.length} fichas individuais distribuídas por {new Set(model.entries.map(e => e.point.setor)).size} setores ou áreas. A relação de imagens permite localizar cada equipamento, consultar sua leitura e rastrear os arquivos fotográficos associados.</p>
    </Sheet>
    <Sheet {...shared} page={model.criteriaPage} kicker="Critérios e acompanhamento" title="Leitura dos resultados e acompanhamento">
      <h3>Temperatura registrada</h3><p>A temperatura apresentada corresponde à leitura registrada na medição ou nas descrições das ocorrências. As fotografias visuais e termográficas são identificadas pelos respectivos nomes de arquivo e apresentadas em quadros de dimensões iguais, com preservação de suas proporções. Leituras não preenchidas aparecem como “—”.</p>
      <h3>Ocorrências térmicas</h3><p>As fichas com ocorrência são apresentadas primeiro e destacadas na relação das imagens. A coluna “Ocorrências” informa a quantidade de pontos registrados em cada medição, inclusive quando houver mais de um na mesma fotografia.</p>
      <h3>Registros incompletos, sem carga ou sem acesso</h3><p>Os motivos registrados na coleta permanecem nas fichas correspondentes. A ausência de imagem térmica ou de condição adequada de inspeção não equivale à confirmação de condição térmica normal.</p>
      <h3>Acompanhamento das correções</h3><p>As fichas permitem descrever as correções necessárias e executadas, identificar o responsável e registrar a data da intervenção. O encerramento deve contemplar a reinspeção e o registro do resultado após a correção.</p>
      <h3>Inspeção periódica</h3><p>Para equipamentos sem ocorrência registrada e com termograma, recomenda-se acompanhamento periódico e nova inspeção termográfica em 12 meses. Os pontos com ocorrência devem ser reinspecionados após as intervenções.</p>
      <p className="tr-legend">O referencial de classificação e risco ao sistema produtivo está organizado ao final deste relatório, nas páginas {model.referencePage} a {model.referencePage + 2}.</p>
    </Sheet>
    {model.entries.flatMap(entry => [
      ...entry.sheets.map((photoSheet, i) => <Sheet {...shared} key={`${entry.point.id}-photos-${i}`} page={entry.page + i} kicker={entry.occurrenceCount ? 'Fichas com ocorrência' : 'Fichas dos demais equipamentos'} title={`Ficha de inspeção ${pad(entry.number)}${i ? ` · ${i + 1}/${entry.sheets.length}` : ''}`} status={entry.status}><InspectionSheet entry={entry} photoSheet={photoSheet} index={i} report={report} urls={urls} onLoad={onLoad} onError={onError} /></Sheet>),
      ...entry.details.map((details, i) => <Sheet {...shared} key={`${entry.point.id}-details-${i}`} page={entry.page + entry.sheets.length + i} kicker="Detalhes da medição" title={`Ficha ${pad(entry.number)} · continuação`} status={entry.status}><div><h3>{entry.point.setor} · {entry.point.local}</h3>{details.map((detail, j) => <div className="tr-detail" key={j}><h3>{detail.heading}</h3><p>{detail.text}</p></div>)}</div></Sheet>),
    ])}
    {Array.from({ length: model.conclusionPages }, (_, i) => <Sheet {...shared} key={`conclusion-${i}`} page={model.conclusionPage + i} kicker="Encerramento técnico" title={`Conclusão técnica${i ? ' (continuação)' : ''}`}><div>
      {!i && <><p>A inspeção realizada em {formatReportDate(report.data_execucao, true)}, no cliente {report.cliente_nome}, compreendeu {model.entries.length} equipamentos, documentados por {digitalCount} fotografias visuais e {thermalCount} imagens termográficas, totalizando {model.files.length} fotografias.</p><p>{model.occurrenceCount ? `Foram registrados ${model.occurrenceCount} pontos com ocorrência térmica em ${model.occurrenceEntries.length} equipamentos. Os pontos indicados requerem avaliação técnica, definição das intervenções pertinentes e verificação térmica após a correção.` : 'Não foram registradas ocorrências térmicas nesta inspeção.'}</p></>}
      {model.occurrenceCount > 0 && summaryTable(summaryEntries[i] || [])}
      {model.normalThermalCount > 0 && <p>Os {model.normalThermalCount} equipamentos com termograma e sem ocorrência registrada devem permanecer em acompanhamento periódico, com nova inspeção termográfica em 12 meses.</p>}
      {model.pendingEntries.some(e => !e.occurrenceCount) && <p>Os registros sem avaliação térmica concluída requerem complementação conforme os motivos indicados nas respectivas fichas.</p>}
      <h3>Encaminhamento à manutenção</h3><p>Registrar as ações necessárias e executadas nas fichas correspondentes, incluindo responsável, data da intervenção e resultado da reinspeção. As ocorrências devem permanecer em acompanhamento até a verificação das condições após o serviço.</p>
      <p className="tr-legend">A conclusão expressa as condições documentadas durante a inspeção. O acompanhamento da evolução térmica e o registro das intervenções permitem verificar a eficácia das correções e manter a rastreabilidade do histórico dos equipamentos.</p>
    </div></Sheet>)}
    {model.actionPages.map((entries, i) => <Sheet {...shared} key={`actions-${i}`} page={model.actionPage + i} kicker="Acompanhamento da manutenção" title="Controle consolidado das ações"><div><p className="tr-subtitle">Preencher após a programação, execução e verificação dos serviços</p>{entries.length ? entries.map(entry => <div className="tr-action-card" key={entry.point.id}><h3>Ficha {pad(entry.number)} | {entry.point.setor} · {entry.point.local}</h3><p>{recommendedAction(entry)}</p>{['Correção / serviço executado', 'Responsável / data', 'Reinspeção / situação'].map(label => <div key={label}><span>{label}</span></div>)}</div>) : <p>Sem ações corretivas registradas. Manter o acompanhamento periódico.</p>}</div></Sheet>)}
    <ReferencePages report={report} model={model} />
    <Sheet {...shared} page={model.signaturePage} kicker="Responsabilidade técnica" title="Assinatura do responsável técnico">
      <DataTable rows={[
        ['Relatório', report.numero_relatorio], ['Cliente', report.cliente_nome], ['Data da inspeção', formatReportDate(report.data_execucao)], ['Revisão', pad(report.revisao)],
      ]} />
      <div className="tr-signature" aria-label="Campo para assinatura do responsável técnico">
        <p className="tr-signature-hint">Espaço reservado para assinatura digital</p>
        <div className="tr-signature-space" />
        <strong>{report.responsavel_nome?.trim() || 'Roberto Fontes Lopes'}</strong>
        <p>Responsável técnico</p>
        <p>CREA {report.responsavel_crea?.trim() || (!report.responsavel_nome?.trim() || report.responsavel_nome.trim() === 'Roberto Fontes Lopes' ? '0601049229' : '—')}</p>
        <p className="tr-signature-company">Radial Energia</p>
      </div>
    </Sheet>
  </div>;
}

function ReferencePages({ report, model }: { report: TermografiaRelatorio; model: PrintReportModel }) {
  const shared = { report, model, kicker: 'Referencial técnico' };
  return <>
    <Sheet {...shared} page={model.referencePage} title="Critério de classificação dos aquecimentos">
      <p>O Critério Flexível de Classificação de Aquecimentos (CFCA) relaciona o aquecimento do componente ao máximo aquecimento admissível. Sua aplicação depende dos parâmetros de avaliação e dos limites do componente. As fichas desta inspeção permanecem organizadas pelas ocorrências registradas.</p>
      <table className="tr-table"><thead><tr><th>Relação</th><th>Definição</th></tr></thead><tbody>
        <tr><td>A = TC − TA</td><td>A: aquecimento medido; TC: temperatura do componente; TA: temperatura ambiente.</td></tr>
        <tr><td>AC = A × FCC × FCV</td><td>AC: aquecimento corrigido; FCC: fator de correção de carga; FCV: fator de correção de vento.</td></tr>
        <tr><td>MAA = MTA − TA</td><td>MAA: máximo aquecimento admissível; MTA: máxima temperatura admissível do componente.</td></tr>
      </tbody></table>
      <h3>Matriz de referência do CFCA</h3><table className="tr-table"><thead><tr><th>Comparação</th><th>Diagnóstico</th><th>Classificação</th><th>Prazo de referência</th></tr></thead><tbody>{[
        ['AC ≥ 1,2 MAA', 'Falha iminente', 'Crítico', 'Até 7 dias'], ['0,9 MAA ≤ AC < 1,2 MAA', 'Falha potencial', 'Intervenção imediata', 'Até 14 dias'], ['0,6 MAA ≤ AC < 0,9 MAA', 'Falha provável', 'Intervenção programada', 'Até 21 dias'], ['0,3 MAA ≤ AC < 0,6 MAA', 'Suspeita de falha', 'Observação', 'Mensal'], ['AC < 0,3 MAA', 'Normal', 'Normal', '—'],
      ].map(row => <tr key={row[0]}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table>
      <p>Os prazos acima integram a matriz de referência do método e não constituem prazos atribuídos às fichas desta campanha. A definição da intervenção deve considerar a avaliação do componente e sua condição operacional.</p>
      <p>A intervenção pode compreender correção de conexões, limpeza ou substituição, conforme avaliação técnica. A observação corresponde ao acompanhamento periódico da evolução térmica.</p>
    </Sheet>
    <Sheet {...shared} page={model.referencePage + 1} title="Temperaturas de referência do método">
      <p>Valores de máxima temperatura admissível (MTA) utilizados como referência na metodologia. A definição aplicável ao equipamento deve considerar sua classe de isolação e as especificações do fabricante.</p>
      <table className="tr-table tr-reference-temperatures"><thead><tr><th>Grupo</th><th>Componente</th><th>MTA (°C)</th></tr></thead><tbody>{[
        ['Componentes industriais', 'Fios encapados, conforme a classe de isolação', '70 a 110'], ['Componentes industriais', 'Régua de bornes', '70'], ['Componentes industriais', 'Cabos isolados até 15 kV', '70'], ['Componentes industriais', 'Conexões mediante parafusos', '90'], ['Componentes industriais', 'Conexões e barramentos de baixa tensão', '90'], ['Componentes industriais', 'Conexões de linha de transmissão aérea', '70'], ['Componentes industriais', 'Conexões recobertas de prata ou níquel', '90'], ['Componentes industriais', 'Disjuntores de baixa tensão', '50'], ['Componentes industriais', 'Fusíveis - corpo', '100'], ['Componentes industriais', 'Base fusível', '50'], ['AT em subestações e distribuição', 'Seccionadoras', '50'], ['AT em subestações e distribuição', 'Conexões', '60'], ['AT em subestações e distribuição', 'Cabos', '60'], ['Transformadores a óleo', 'Conexões', '90'], ['Transformadores a óleo', 'Corpo', '80'], ['Transformadores secos', 'Ponto mais aquecido - classe de isolação 105', '65'], ['Transformadores secos', 'Ponto mais aquecido - classe de isolação 130', '90'], ['Transformadores secos', 'Ponto mais aquecido - classe de isolação 155', '115'], ['Transformadores secos', 'Ponto mais aquecido - classe de isolação 180', '140'],
      ].map(row => <tr key={row.join('-')}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table>
      <p>A leitura isolada de temperatura não substitui a avaliação técnica do componente e não foi utilizada para criar novas ocorrências nesta inspeção.</p>
    </Sheet>
    <Sheet {...shared} page={model.referencePage + 2} title="Abrangência e acompanhamento técnico">
      <p>A abrangência expressa o impacto de uma falha sobre a unidade. O método distingue alcance local, setorial e global para apoiar a definição das ações de manutenção.</p>
      <table className="tr-table"><thead><tr><th>Abrangência</th><th>Caracterização</th></tr></thead><tbody><tr><td>Local</td><td>Falha contornável por manobra ou redundância, sem interrupção da produção.</td></tr><tr><td>Setorial</td><td>Falha com impacto restrito a parte da unidade ou do processo.</td></tr><tr><td>Global</td><td>Falha que afeta o fornecimento de energia ou a operação de toda a unidade.</td></tr></tbody></table>
      <h3>Matriz de risco ao sistema produtivo</h3><table className="tr-table"><thead><tr><th>Classificação</th><th>Local</th><th>Setorial</th><th>Global</th></tr></thead><tbody>{[['Crítico', 'Médio', 'Alto', 'Alto'], ['Intervenção imediata', 'Médio', 'Médio', 'Alto'], ['Intervenção programada', 'Baixo', 'Médio', 'Médio'], ['Observação', 'Baixo', 'Baixo', 'Médio']].map(row => <tr key={row[0]}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table>
      <h3>Responsabilidades no acompanhamento</h3><p>A inspeção registra as imagens e identifica os equipamentos. A análise técnica orienta as ações de manutenção. O acompanhamento local apoia a identificação e o acesso aos pontos inspecionados. A manutenção registra a execução e disponibiliza os equipamentos para a verificação posterior.</p>
      <h3>Referências de apresentação das imagens</h3><p className="tr-legend">FLIR. The secret to a good thermal image. Orientações sobre imagem radiométrica, contraste térmico e paletas.<br />FLIR. Saving and working with images. Distinção entre dados radiométricos e representação visual.</p>
    </Sheet>
  </>;
}
