'use client';

import { useId, useState } from 'react';
import type { TermografiaDadosGerais, TermografiaRelatorio } from '@/lib/termografia/types';

type GeneralDataEditorProps = {
  relatorio: TermografiaRelatorio;
  onSave: (dados: TermografiaDadosGerais) => void | Promise<void>;
  onClose: () => void;
};

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

function Campo({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelClass}>{rotulo}</label>
      <input value={valor} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}

export function GeneralDataEditor({ relatorio, onSave, onClose }: GeneralDataEditorProps) {
  const titleId = useId();
  const [dados, setDados] = useState<TermografiaDadosGerais>(() => ({
    cliente_nome: relatorio.cliente_nome,
    cliente_cnpj: relatorio.cliente_cnpj ?? '',
    cliente_endereco: relatorio.cliente_endereco,
    cliente_cidade: relatorio.cliente_cidade,
    cliente_uf: relatorio.cliente_uf,
    cliente_cep: relatorio.cliente_cep ?? '',
    data_execucao: relatorio.data_execucao,
    objetivo: relatorio.objetivo,
    equipamento: relatorio.equipamento,
    responsavel_nome: relatorio.responsavel_nome,
    responsavel_crea: relatorio.responsavel_crea,
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleSave = async () => {
    if (!dados.cliente_nome.trim()) {
      setErro('Informe o nome do cliente.');
      return;
    }
    if (!dados.data_execucao.trim()) {
      setErro('Informe a data de execução.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const limpo: TermografiaDadosGerais = {
        cliente_nome: dados.cliente_nome.trim(),
        cliente_cnpj: dados.cliente_cnpj.trim(),
        cliente_endereco: dados.cliente_endereco.trim(),
        cliente_cidade: dados.cliente_cidade.trim(),
        cliente_uf: dados.cliente_uf.trim(),
        cliente_cep: dados.cliente_cep.trim(),
        data_execucao: dados.data_execucao.trim(),
        objetivo: dados.objetivo.trim(),
        equipamento: dados.equipamento.trim(),
        responsavel_nome: dados.responsavel_nome.trim(),
        responsavel_crea: dados.responsavel_crea.trim(),
      };
      await onSave(limpo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">Editar dados gerais</h2>
          <button type="button" onClick={onClose} disabled={salvando} className="min-h-11 px-3 text-slate-500 hover:text-slate-800">
            Cancelar
          </button>
        </header>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Bloqueados */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2">
            <div className="text-sm">
              <span className="font-medium text-gray-600">Nº do relatório: </span>
              <span className="text-gray-900">{relatorio.numero_relatorio}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-gray-600">Criado em: </span>
              <span className="text-gray-900">{new Date(relatorio.criado_em).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          {/* Editáveis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Campo rotulo="Cliente *" valor={dados.cliente_nome} onChange={(v) => setDados((d) => ({ ...d, cliente_nome: v }))} />
            </div>
            <Campo rotulo="CNPJ" valor={dados.cliente_cnpj} onChange={(v) => setDados((d) => ({ ...d, cliente_cnpj: v }))} />
            <Campo rotulo="Data de execução" valor={dados.data_execucao} onChange={(v) => setDados((d) => ({ ...d, data_execucao: v }))} />
            <div className="md:col-span-2">
              <Campo rotulo="Endereço" valor={dados.cliente_endereco} onChange={(v) => setDados((d) => ({ ...d, cliente_endereco: v }))} />
            </div>
            <Campo rotulo="Cidade" valor={dados.cliente_cidade} onChange={(v) => setDados((d) => ({ ...d, cliente_cidade: v }))} />
            <Campo rotulo="UF" valor={dados.cliente_uf} onChange={(v) => setDados((d) => ({ ...d, cliente_uf: v }))} />
            <Campo rotulo="CEP" valor={dados.cliente_cep} onChange={(v) => setDados((d) => ({ ...d, cliente_cep: v }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo rotulo="Responsável técnico" valor={dados.responsavel_nome} onChange={(v) => setDados((d) => ({ ...d, responsavel_nome: v }))} />
            <Campo rotulo="CREA" valor={dados.responsavel_crea} onChange={(v) => setDados((d) => ({ ...d, responsavel_crea: v }))} />
          </div>

          <div className="space-y-4">
            <Campo rotulo="Objetivo" valor={dados.objetivo} onChange={(v) => setDados((d) => ({ ...d, objetivo: v }))} />
            <Campo rotulo="Equipamento" valor={dados.equipamento} onChange={(v) => setDados((d) => ({ ...d, equipamento: v }))} />
          </div>

          {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        </div>

        <footer className="flex justify-end gap-3 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} disabled={salvando} className="min-h-12 rounded-xl border border-slate-300 px-6 font-semibold text-slate-700">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={salvando}
            className="min-h-12 rounded-xl bg-blue-600 px-6 font-semibold text-white disabled:bg-slate-300"
          >
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </footer>
      </section>
    </div>
  );
}
