'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Eye, FileImage, Plus, Save, Trash2 } from 'lucide-react';

type InspectionStatus = 'C' | 'N/C' | 'N/A';

type InsulationMeasurement = {
  id: string;
  position: string;
  voltage: string;
  current: string;
};

type TapOption = {
  label: string;
  reportLabel: string;
};

type Occurrence = {
  id: string;
  priority: string;
  text: string;
  source?: string;
};

type OccurrenceDraft = {
  priority: string;
  text: string;
};

const fillOrder = [
  'Fotos do equipamento e placa',
  'Informações gerais do transformador',
  'Inspeção visual / mecânica / elétrica',
  'Ensaios elétricos',
  'Análise de óleo quando aplicável, ocorrências e comentários',
];

const baseVisualItems = [
  'Placa de características',
  'Pintura / corrosão',
  'Limpeza',
  'Fixação',
  'Aterramento',
  'Nível de óleo',
  'Buchas A.T.',
  'Buchas B.T.',
  'Relé térmico',
  'Relé Buchholz',
];

const tapOptions: TapOption[] = [
  { label: '13,8', reportLabel: '13,8' },
  { label: '13,2', reportLabel: '13,2' },
  { label: '12,6', reportLabel: '12,6' },
  { label: '12,0', reportLabel: '12,0' },
  { label: '11,4', reportLabel: '11,4' },
  { label: '10,8', reportLabel: '10,8' },
  { label: '10,2', reportLabel: '10,2' },
];

const ttrConnections = [
  'H2-H3 / X0-X3',
  'H3-H1 / X0-X1',
  'H1-H2 / X0-X2',
];

const windingRows = [
  { winding: 'H1', connection: 'H1-H3' },
  { winding: 'H2', connection: 'H1-H2' },
  { winding: 'H3', connection: 'H2-H3' },
  { winding: 'X1', connection: 'X0-X1' },
  { winding: 'X2', connection: 'X0-X2' },
  { winding: 'X3', connection: 'X0-X3' },
];

const oilRows = [
  { test: 'Cor', method: 'NBR-14483', specified: '3 à 4', result: '' },
  { test: 'Densidade (20/4 g/cm³)', method: 'NBR-7148', specified: '0,861 à 0,9', result: '' },
  { test: 'Tensão interfacial', method: 'NBR-6234', specified: '>= 22', result: '' },
  { test: 'Acidez (mg KOH/g)', method: 'NBR-14248', specified: '<= 0,15', result: '' },
  { test: 'Teor de água (ppm)', method: 'NBR-10710', specified: '10 à 20', result: '' },
  { test: 'Rigidez dielétrica', method: 'NBR-6869', specified: '>= 25 kV', result: '' },
  { test: 'Observação visual', method: '-', specified: 'Límpido', result: '' },
];

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const inspectionStatusClass: Record<InspectionStatus, string> = {
  C: 'bg-green-100 text-green-700 border-green-300 focus:border-green-500 focus:ring-green-500',
  'N/A': 'bg-yellow-100 text-yellow-800 border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500',
  'N/C': 'bg-red-100 text-red-700 border-red-300 focus:border-red-500 focus:ring-red-500',
};
const priorityStyles: Record<string, string> = {
  Baixa: 'bg-sky-100 text-sky-700 border-sky-200',
  Média: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Alta: 'bg-orange-100 text-orange-800 border-orange-200',
  Crítica: 'bg-red-100 text-red-700 border-red-200',
};

export default function FichaTransformadorManutencaoPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [photos, setPhotos] = useState({ placa: '', equipamento: '' });
  const [btVoltage, setBtVoltage] = useState('220/127');
  const [insulationClass, setInsulationClass] = useState('15');
  const [coolingType, setCoolingType] = useState('Óleo isolante');
  const [priority, setPriority] = useState('Sem ocorrência');
  const [occurrenceText, setOccurrenceText] = useState('');
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [visualOccurrenceDrafts, setVisualOccurrenceDrafts] = useState<Record<string, OccurrenceDraft>>({});
  const [selectedTaps, setSelectedTaps] = useState(['13,8', '13,2', '12,6', '12,0', '11,4']);
  const [dispatchTap, setDispatchTap] = useState('13,8');
  const visualItems = useMemo(() => (
    coolingType === 'Seco'
      ? baseVisualItems.filter((item) => !['Nível de óleo', 'Relé Buchholz'].includes(item))
      : baseVisualItems
  ), [coolingType]);
  const [visualStatus, setVisualStatus] = useState<Record<string, InspectionStatus>>(
    Object.fromEntries(baseVisualItems.map((item) => [item, 'C'])) as Record<string, InspectionStatus>
  );
  const [insulationRows, setInsulationRows] = useState<InsulationMeasurement[]>([
    { id: 'at-bt', position: 'A.T. / B.T.', voltage: '5 kVcc', current: '' },
    { id: 'at-m', position: 'A.T. / Massa', voltage: '5 kVcc', current: '' },
    { id: 'bt-m', position: 'B.T. / Massa', voltage: '2,5 kVcc', current: '' },
  ]);

  const handlePhoto = (key: 'placa' | 'equipamento', file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotos((current) => ({ ...current, [key]: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const updateInsulation = (id: string, field: keyof InsulationMeasurement, value: string) => {
    setInsulationRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };

  const toggleTap = (tap: string) => {
    setSelectedTaps((current) => {
      const next = current.includes(tap)
        ? current.filter((item) => item !== tap)
        : [...current, tap];
      const ordered = tapOptions.map((option) => option.label).filter((label) => next.includes(label));
      if (!ordered.length) return current;
      if (!ordered.includes(dispatchTap)) {
        setDispatchTap(ordered[0]);
      }
      return ordered;
    });
  };

  const handlePreview = () => {
    if (!formRef.current) return;
    const data = Object.fromEntries(new FormData(formRef.current).entries());
    const textData = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
    const snapshot = {
      data: textData,
      photos,
      selectedTaps,
      visualItems,
      visualStatus,
      insulationRows,
      occurrences,
      coolingType,
      ttrConnections,
      windingRows,
      oilRows,
    };
    window.localStorage.setItem('radial:ficha-transformador-preview', JSON.stringify(snapshot));
    router.push('/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador/visualizar');
  };

  const addOccurrence = () => {
    if (priority === 'Sem ocorrência' || !occurrenceText.trim()) return;
    setOccurrences((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, priority, text: occurrenceText.trim() },
    ]);
    setOccurrenceText('');
    setPriority('Sem ocorrência');
  };

  const updateVisualStatus = (item: string, status: InspectionStatus) => {
    setVisualStatus((current) => ({ ...current, [item]: status }));

    if (status === 'N/C') {
      setVisualOccurrenceDrafts((current) => ({
        ...current,
        [item]: current[item] ?? {
          priority: 'Média',
          text: `${item} em não conformidade.`,
        },
      }));
    }
  };

  const updateVisualOccurrenceDraft = (item: string, patch: Partial<OccurrenceDraft>) => {
    setVisualOccurrenceDrafts((current) => ({
      ...current,
      [item]: {
        priority: current[item]?.priority ?? 'Média',
        text: current[item]?.text ?? `${item} em não conformidade.`,
        ...patch,
      },
    }));
  };

  const addVisualOccurrence = (item: string) => {
    const draft = visualOccurrenceDrafts[item];
    if (!draft?.text.trim()) return;

    setOccurrences((current) => [
      ...current.filter((occurrence) => occurrence.source !== item),
      { id: `visual-${item}-${Date.now()}`, source: item, priority: draft.priority, text: draft.text.trim() },
    ]);
  };

  const pendingVisualOccurrences = visualItems.filter((item) => visualStatus[item] === 'N/C');

  const removeOccurrence = (id: string) => {
    setOccurrences((current) => current.filter((occurrence) => occurrence.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link href="/relatorios-tecnicos/cabine-primaria/manutencao-preventiva" className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
            <ArrowLeft size={16} />
            Voltar à Manutenção Preventiva
          </Link>
          <div className="mt-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ficha do Transformador</h1>
            <p className="text-gray-500 mt-1">
              Primeira versão da ficha interna que depois fará parte do relatório completo de manutenção da cabine.
            </p>
          </div>
        </div>

        <form ref={formRef}>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Ordem de preenchimento</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {fillOrder.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">{index + 1}</span>
                <span className="text-sm text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {[
            { key: 'placa' as const, title: 'Foto da placa de identificação' },
            { key: 'equipamento' as const, title: 'Foto do equipamento' },
          ].map((photo) => (
            <div key={photo.key} className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Camera size={20} />
                </div>
                <h2 className="font-bold text-gray-900">{photo.title}</h2>
              </div>
              <label className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden">
                {photos[photo.key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[photo.key]} alt={photo.title} className="h-56 w-full object-cover" />
                ) : (
                  <div className="h-56 flex flex-col items-center justify-center text-gray-500">
                    <FileImage size={34} className="mb-2 text-gray-400" />
                    <span className="text-sm font-medium">Selecionar imagem</span>
                  </div>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(event) => handlePhoto(photo.key, event.target.files?.[0])} />
              </label>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Informações gerais</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>TAG</label>
              <input name="tag" placeholder="Ex.: TR-01 / Subestação 1" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Potência [kVA]</label>
              <input name="potencia" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Nº Série</label>
              <input name="serie" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>A.T. [kV]</label>
              <div className="flex flex-wrap gap-2 rounded-md border border-gray-300 p-2">
                {tapOptions.map((tap) => (
                  <label key={tap.label} className={`cursor-pointer rounded-md px-2.5 py-1 text-sm border ${selectedTaps.includes(tap.label) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                    <input type="checkbox" checked={selectedTaps.includes(tap.label)} onChange={() => toggleTap(tap.label)} className="sr-only" />
                    {tap.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>B.T. [V]</label>
              <select name="bt" value={btVoltage} onChange={(event) => setBtVoltage(event.target.value)} className={inputClass}>
                <option value="440/254">440/254</option>
                <option value="380/220">380/220</option>
                <option value="220/127">220/127</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Classe de isolação [kV]</label>
              <select name="classeIsolacao" value={insulationClass} onChange={(event) => setInsulationClass(event.target.value)} className={inputClass}>
                <option value="15">15</option>
                <option value="25">25</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Fabricação</label>
              <input name="fabricacao" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fabricante</label>
              <input name="fabricante" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tap de despacho [kV]</label>
              <select name="tapDespacho" value={dispatchTap} onChange={(event) => setDispatchTap(event.target.value)} className={inputClass}>
                {selectedTaps.map((tap) => (
                  <option key={tap} value={tap}>{tap}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Volume [L]</label>
              <input name="volume" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Peso [kg]</label>
              <input name="peso" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Refrigeração</label>
              <select name="refrigeracao" value={coolingType} onChange={(event) => setCoolingType(event.target.value)} className={inputClass}>
                <option value="Óleo isolante">Óleo isolante</option>
                <option value="Seco">Seco</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Inspeção visual / mecânica / elétrica</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visualItems.map((item) => (
              <div key={item} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                <span className="text-sm text-gray-700">{item}</span>
                <select
                  name={`visual-${item}`}
                  value={visualStatus[item]}
                  onChange={(event) => updateVisualStatus(item, event.target.value as InspectionStatus)}
                  onInput={(event) => updateVisualStatus(item, event.currentTarget.value as InspectionStatus)}
                  className={`rounded-md border p-1.5 text-sm font-semibold ${inspectionStatusClass[visualStatus[item]]}`}
                >
                  <option value="C">C</option>
                  <option value="N/C">N/C</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">C: Conforme | N/C: Não conforme | N/A: Não se aplica</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Resistência de isolamento</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">Posição</th>
                    <th className="py-2 pr-3">Leitura [MΩ]</th>
                  </tr>
                </thead>
                <tbody>
                  {insulationRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium text-gray-800">{row.position}</td>
                      <td className="py-2 pr-3"><input name={`megger-${row.id}`} value={row.current} onChange={(event) => updateInsulation(row.id, 'current', event.target.value)} className={`${inputClass} min-w-24`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Relação de transformação</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b">
                  <th className="py-2 pr-3">Conexões</th>
                  {selectedTaps.map((tap) => (
                    <th key={tap} className="py-2 pr-3">{tap} kV</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ttrConnections.map((connection) => (
                  <tr key={connection} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{connection}</td>
                    {selectedTaps.map((tap) => (
                      <td key={`${connection}-${tap}`} className="py-2 pr-3">
                        <input name={`ttr-${connection}-${tap}`} className={`${inputClass} min-w-20`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Resistência elétrica dos enrolamentos</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">Enrolamento</th>
                    <th className="py-2 pr-3">Conexão</th>
                    <th className="py-2 pr-3">Leitura</th>
                  </tr>
                </thead>
                <tbody>
                  {windingRows.map((row) => (
                    <tr key={`${row.winding}-${row.connection}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.winding}</td>
                      <td className="py-2 pr-3">{row.connection}</td>
                      <td className="py-2 pr-3"><input name={`enrolamento-${row.winding}`} className={`${inputClass} min-w-24`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Análise físico-química do óleo isolante</h2>
            {coolingType === 'Seco' ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                Não aplicável para transformador seco.
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">Ensaio</th>
                    <th className="py-2 pr-3">Método</th>
                    <th className="py-2 pr-3">Especificado</th>
                    <th className="py-2 pr-3">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {oilRows.map((row) => (
                    <tr key={row.test} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.test}</td>
                      <td className="py-2 pr-3">{row.method}</td>
                      <td className="py-2 pr-3">{row.specified}</td>
                      <td className="py-2 pr-3"><input name={`oleo-${row.test}`} defaultValue={row.result} className={`${inputClass} min-w-24`} /></td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-5">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Comentários, ocorrências e recomendação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pendingVisualOccurrences.length > 0 && (
              <div className="md:col-span-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="text-sm font-bold text-red-800 mb-2">Não conformidades da inspeção visual</h3>
                <p className="text-xs text-red-700 mb-3">
                  Cada item marcado como N/C aparece aqui para você definir prioridade e texto antes de enviar para o resumo do relatório.
                </p>
                <div className="space-y-3">
                  {pendingVisualOccurrences.map((item) => {
                    const draft = visualOccurrenceDrafts[item] ?? { priority: 'Média', text: `${item} em não conformidade.` };

                    return (
                      <div key={item} className="rounded-lg border border-red-100 bg-white p-3">
                        <div className="font-semibold text-gray-900 mb-2">{item}</div>
                        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-2">
                          <select value={draft.priority} onChange={(event) => updateVisualOccurrenceDraft(item, { priority: event.target.value })} className={inputClass}>
                            <option>Baixa</option>
                            <option>Média</option>
                            <option>Alta</option>
                            <option>Crítica</option>
                          </select>
                          <textarea value={draft.text} onChange={(event) => updateVisualOccurrenceDraft(item, { text: event.target.value })} className={inputClass} rows={2} />
                          <button type="button" onClick={() => addVisualOccurrence(item)} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium">
                            <Plus size={16} />
                            Adicionar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className={labelClass}>Prioridade da ocorrência</label>
              <select name="prioridade" className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option>Sem ocorrência</option>
                <option>Baixa</option>
                <option>Média</option>
                <option>Alta</option>
                <option>Crítica</option>
              </select>
            </div>
            {priority !== 'Sem ocorrência' && (
              <div className="md:col-span-2">
                <label className={labelClass}>Comentário / ocorrência para o resumo inicial</label>
                <div className="flex gap-2">
                  <textarea value={occurrenceText} onChange={(event) => setOccurrenceText(event.target.value)} className={inputClass} rows={3} placeholder="Descreva o apontamento que deve aparecer no resumo inicial do relatório final." />
                  <button type="button" onClick={addOccurrence} className="self-start inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium">
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>
              </div>
            )}
            <div className="md:col-span-3">
              <h3 className="text-sm font-bold text-gray-700 mb-2">Ocorrências adicionadas</h3>
              {occurrences.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">
                  Nenhuma ocorrência adicionada.
                </div>
              ) : (
                <div className="space-y-2">
                  {occurrences.map((occurrence) => (
                    <div key={occurrence.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${priorityStyles[occurrence.priority]}`}>
                          {occurrence.priority}
                        </span>
                        <p className="text-sm text-gray-700 mt-2">{occurrence.text}</p>
                      </div>
                      <button type="button" onClick={() => removeOccurrence(occurrence.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>Comentários internos do equipamento</label>
              <textarea name="comentariosInternos" className={inputClass} rows={3} placeholder="Anotações internas da equipe para conferência posterior." />
              <p className="text-xs text-gray-500 mt-1">
                Este campo não vai para o relatório final do cliente. Fica salvo apenas para consulta interna posterior.
              </p>
            </div>
          </div>
        </div>

        </form>

        <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur border-t border-gray-200 py-4 flex justify-end gap-3">
          <button type="button" onClick={handlePreview} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium">
            <Eye size={18} />
            Gerar ficha completa
          </button>
          <button disabled className="inline-flex items-center gap-2 bg-gray-300 text-gray-600 px-5 py-2 rounded-md font-medium cursor-not-allowed">
            <Save size={18} />
            Salvar ficha será a próxima etapa
          </button>
        </div>
      </div>
    </div>
  );
}
