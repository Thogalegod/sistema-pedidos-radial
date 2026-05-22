type TapResult = {
  tensaoAt: number;
  relacaoTeorica: number;
  relH1H2: number;
  relH2H3: number;
  relH3H1: number;
  correnteAt: number;
};

type TransformerValues = {
  correnteBt: number;
  taps: TapResult[];
  perdaVazioP: number;
  perdaVazioI1: number;
  perdaVazioI2: number;
  perdaVazioI3: number;
  perdaVazioImed: number;
  perdaCargaPcc75: number;
  perdaCargaPcc22: number;
  impedanciaPercent75: number;
  tensaoCurtoCircuito: number;
  tensaoAplicadaPrimKv: number;
  tensaoAplicadaSecKv: number;
  tensaoInduzidaV: number;
  isolAtBt: number;
  isolAtMassa: number;
  isolBtMassa: number;
  rigidezKv: number;
  temperaturaC: number;
};

type TransformerExtraData = {
  resfriamento?: string;
  grupoLigacao?: string;
  tipoOleo?: string;
  procedenciaOleo?: string;
  observacoes?: string;
};

type CabineTransformerSheetProps = {
  data: {
    numero_relatorio: string;
    cliente_nome: string;
    cliente_endereco?: string | null;
    cliente_cidade?: string | null;
    cliente_uf?: string | null;
    cabo_temperatura?: number | string | null;
    cabo_umidade?: number | string | null;
    trafo_numero_serie?: string | null;
    trafo_potencia_kva?: number | string | null;
    trafo_tensao_bt?: string | null;
    trafo_fabricante?: string | null;
    trafo_tap_despacho?: number | string | null;
  };
  trafo: TransformerValues;
  extra?: TransformerExtraData;
};

function tensaoBtLabel(tensaoBt?: string | null) {
  const map: Record<string, string> = {
    '220': '220 / 127 V',
    '380': '380 / 220 V',
    '440': '440 / 254 V',
  };
  return tensaoBt ? map[tensaoBt] ?? `${tensaoBt} V` : '-';
}

function erroPercentual(tap: TapResult) {
  const max = Math.max(tap.relH1H2, tap.relH2H3, tap.relH3H1);
  const min = Math.min(tap.relH1H2, tap.relH2H3, tap.relH3H1);
  return (((max - min) / tap.relacaoTeorica) * 100).toFixed(2);
}

export function CabineTransformerSheet({ data, trafo, extra }: CabineTransformerSheetProps) {
  const tapMin = Math.min(...trafo.taps.map((tap) => tap.tensaoAt));
  const btLabel = tensaoBtLabel(data.trafo_tensao_bt);
  const resfriamento = extra?.resfriamento ?? 'LN';
  const grupoLigacao = extra?.grupoLigacao ?? 'Subtrativa';
  const tipoOleo = extra?.tipoOleo ?? 'Mineral';
  const procedenciaOleo = extra?.procedenciaOleo ?? 'BR';
  const observacoes = extra?.observacoes || 'Nenhuma';
  const tapDespacho = data.trafo_tap_despacho ?? trafo.taps[0]?.tensaoAt ?? 0;

  const titleClass = 'bg-[#1e3a5f] text-white py-0.5 px-2 font-bold text-center border border-[#ccc] uppercase';
  const tableClass = 'w-full text-center';
  const headCellClass = 'bg-[#f5f7fa] font-semibold';

  return (
    <div className="trafo-sheet text-[7.2pt] leading-tight border border-[#1e3a5f] bg-white">
      <div className="grid grid-cols-3 border-b border-[#1e3a5f] items-center">
        <div className="p-1 font-bold text-[#1e3a5f]">RADIAL ENERGIA</div>
        <div className="p-1 text-center font-bold text-[8.5pt] leading-tight">
          FICHA DE ENSAIO<br />TRANSFORMADOR TRIFASICO
        </div>
        <div className="p-1 text-right font-bold text-[7pt]">Nº: {data.numero_relatorio}</div>
      </div>

      <div className="grid grid-cols-2 border-b border-[#1e3a5f]">
        <div className="p-1 border-r border-[#1e3a5f] space-y-0.5">
          <p><strong>Cliente:</strong> {data.cliente_nome}</p>
          <p><strong>Endereço:</strong> {data.cliente_endereco}</p>
          <p><strong>Cidade/UF:</strong> {data.cliente_cidade} - {data.cliente_uf}</p>
          <p><strong>Observações:</strong> {observacoes}</p>
          <p className="pt-0.5 border-t border-[#ccc]">
            <strong>Temperatura:</strong> {trafo.temperaturaC ?? data.cabo_temperatura ?? '--'} °C
            <span> | </span>
            <strong>Umidade:</strong> {data.cabo_umidade ?? '--'}%
          </p>
        </div>
        <div className="p-1">
          <h3 className="font-bold text-center border-b border-[#ccc] pb-0.5 mb-0.5">CARACTERISTICAS TECNICAS</h3>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <p><strong>Nº de Série:</strong> {data.trafo_numero_serie || 'S/N'}</p>
            <p><strong>Potência:</strong> {data.trafo_potencia_kva} kVA</p>
            <p><strong>AT:</strong> 13800 a {tapMin} V</p>
            <p><strong>BT:</strong> {btLabel}</p>
            <p><strong>Fases:</strong> 3</p>
            <p><strong>Hz:</strong> 60</p>
            <p><strong>Classe:</strong> 15 kV</p>
            <p><strong>Resfriamento:</strong> {resfriamento}</p>
            <p><strong>Polaridade:</strong> {grupoLigacao}</p>
            <p><strong>Fabricante:</strong> {data.trafo_fabricante || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-[#1e3a5f]">
        <div className="py-0.5 px-2 border-b border-[#ccc] font-bold">
          TENSÃO DE DESPACHO AT: {Number(tapDespacho).toLocaleString('pt-BR')} V
        </div>
        <div className={titleClass}>Relação de Transformação</div>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={`${headCellClass} text-left w-24`}>TAP [V]:</th>
              {trafo.taps.map((tap) => <th key={tap.tensaoAt}>{tap.tensaoAt}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td className={`${headCellClass} text-left`}>FASE 1</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt}>{tap.relH1H2}</td>)}</tr>
            <tr><td className={`${headCellClass} text-left`}>FASE 2</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt}>{tap.relH2H3}</td>)}</tr>
            <tr><td className={`${headCellClass} text-left`}>FASE 3</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt}>{tap.relH3H1}</td>)}</tr>
            <tr><td className={`${headCellClass} text-left`}>ERRO [%]:</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt} className="font-bold">{erroPercentual(tap)}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="border-b border-[#1e3a5f]">
        <div className={titleClass}>Correntes Nominais</div>
        <table className={tableClass}>
          <tbody>
            <tr><td className={`${headCellClass} w-12`}>V</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt}>{tap.tensaoAt}</td>)}<td className={headCellClass}>{btLabel}</td></tr>
            <tr><td className={headCellClass}>A</td>{trafo.taps.map((tap) => <td key={tap.tensaoAt}>{tap.correnteAt}</td>)}<td className="font-bold bg-[#f5f7fa]">{trafo.correnteBt}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 border-b border-[#1e3a5f]">
        <div className="border-r border-[#1e3a5f]">
          <div className={titleClass}>Perdas em Vazio</div>
          <table className={tableClass}>
            <thead><tr><th>I1 (A)</th><th>I2 (A)</th><th>I3 (A)</th><th>I Méd (A)</th><th>P (W)</th></tr></thead>
            <tbody><tr><td>{trafo.perdaVazioI1}</td><td>{trafo.perdaVazioI2}</td><td>{trafo.perdaVazioI3}</td><td>{trafo.perdaVazioImed}</td><td>{trafo.perdaVazioP}</td></tr></tbody>
          </table>
        </div>
        <div>
          <div className={titleClass}>Perdas em Carga e Impedância</div>
          <table className={tableClass}>
            <thead><tr><th>IN (A)</th><th>Vcc (V)</th><th>Z (%)</th><th>P a 22°C (W)</th><th>P a 75°C (W)</th></tr></thead>
            <tbody><tr><td>{trafo.correnteBt}</td><td>{trafo.tensaoCurtoCircuito}</td><td>{trafo.impedanciaPercent75}</td><td>{trafo.perdaCargaPcc22}</td><td>{trafo.perdaCargaPcc75}</td></tr></tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-[#1e3a5f]">
        <div className="border-r border-[#1e3a5f]">
          <div className={titleClass}>Tensão Aplicada</div>
          <table className="w-full text-left">
            <tbody>
              <tr><td colSpan={2} className={`${headCellClass} text-center`}>TENSÃO APLICADA EM 60 Hz</td></tr>
              <tr><td className={headCellClass}>Tempo [s]</td><td className="text-center">60</td></tr>
              <tr><td className={headCellClass}>AT x BT [kV]</td><td className="text-center">{trafo.tensaoAplicadaPrimKv}</td></tr>
              <tr><td className={headCellClass}>AT x Massa [kV]</td><td className="text-center">{trafo.tensaoAplicadaPrimKv}</td></tr>
              <tr><td className={headCellClass}>BT x Massa [kV]</td><td className="text-center">{trafo.tensaoAplicadaSecKv}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className={titleClass}>Tensão Induzida</div>
          <table className="w-full text-left">
            <tbody>
              <tr><td className={headCellClass}>TENSÃO INDUZIDA [V]:</td><td className="text-center">{trafo.tensaoInduzidaV}</td></tr>
              <tr><td className={headCellClass}>FREQUÊNCIA [Hz]:</td><td className="text-center">120</td></tr>
              <tr><td className={headCellClass}>TEMPO DO ENSAIO [S]:</td><td className="text-center">60</td></tr>
              <tr><td className={headCellClass}>MÉTODO DO ENSAIO:</td><td className="text-center">NORMAL</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-[#1e3a5f]">
        <div className="border-r border-[#1e3a5f]">
          <div className={titleClass}>Resistência de Isolamento</div>
          <table className={tableClass}>
            <thead><tr><th>Posição</th><th>Tensão Aplicada [V]</th><th>Resistência [MΩ]</th></tr></thead>
            <tbody>
              <tr><td className="font-semibold text-left">AT x BT</td><td>5000</td><td className="font-bold">{trafo.isolAtBt}</td></tr>
              <tr><td className="font-semibold text-left">AT x Massa</td><td>5000</td><td className="font-bold">{trafo.isolAtMassa}</td></tr>
              <tr><td className="font-semibold text-left">BT x Massa</td><td>2500</td><td className="font-bold">{trafo.isolBtMassa}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className={titleClass}>Rigidez Dielétrica do Óleo</div>
          <table className="w-full text-left">
            <tbody>
              <tr><td className={headCellClass}>Rigidez Dielétrica [kV]</td><td className="text-center font-bold">{trafo.rigidezKv}</td></tr>
              <tr><td className={headCellClass}>Temperatura [°C]</td><td className="text-center">{trafo.temperaturaC}</td></tr>
              <tr><td className={headCellClass}>Tipo</td><td className="text-center">{tipoOleo}</td></tr>
              <tr><td className={headCellClass}>Procedência</td><td className="text-center">{procedenciaOleo}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-1.5 bg-[#f5f7fa]">
        <h3 className="font-bold uppercase mb-0.5 text-center text-[#1e6db5]">Conclusão Técnica do Transformador</h3>
        <p className="italic text-justify leading-snug">
          Os ensaios realizados neste equipamento apresentaram resultados dentro dos limites estabelecidos pelas normas ABNT NBR 5356 e ABNT NBR IEC 60156, abrangendo os ensaios de relação de transformação, correntes nominais, perdas em vazio, perdas em carga e impedância, tensão aplicada, tensão induzida, resistência de isolamento e rigidez dielétrica do óleo isolante.
          <br />
          Com base nos resultados obtidos, o transformador encontra-se em condições técnicas satisfatórias, estando apto para energização e operação em plena carga dentro de suas especificações nominais.
        </p>
      </div>
    </div>
  );
}
