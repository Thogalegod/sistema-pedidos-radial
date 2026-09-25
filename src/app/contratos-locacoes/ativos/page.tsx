'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { Edit2, Plus, Search } from 'lucide-react';
import {
  createSupabaseContractsLocacoesReadClient,
  listRentalAssets,
} from '@/lib/contratos-locacoes/queries';
import {
  createRentalAsset,
  createSupabaseContractsLocacoesMutationClient,
  updateRentalAsset,
} from '@/lib/contratos-locacoes/mutations';
import type { RentalAssetDraftInput } from '@/lib/contratos-locacoes/schemas';
import type { RentalAsset, RentalAssetOperationalStatus } from '@/lib/contratos-locacoes/types';
import { useDebouncedValue } from '@/lib/contratos-locacoes/use-debounced-value';
import { supabase } from '@/lib/supabase';

const emptyDraft: RentalAssetDraftInput = {
  description: '',
  equipment_type: null,
  capacity: null,
  serial_number: null,
  internal_code: null,
  operational_status: 'active',
  notes: null,
};

const statusLabels: Record<RentalAssetOperationalStatus, string> = {
  active: 'Ativo',
  maintenance: 'Manutenção',
  inactive: 'Inativo',
  retired: 'Baixado',
};

function draftFromAsset(asset: RentalAsset): RentalAssetDraftInput {
  return {
    description: asset.description,
    equipment_type: asset.equipment_type,
    capacity: asset.capacity,
    serial_number: asset.serial_number,
    internal_code: asset.internal_code,
    operational_status: asset.operational_status,
    notes: asset.notes,
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export default function RentalAssetsPage() {
  const [assets, setAssets] = useState<RentalAsset[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | RentalAssetOperationalStatus>('all');
  const [draft, setDraft] = useState<RentalAssetDraftInput>(emptyDraft);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const debouncedSearch = useDebouncedValue(search, 300);

  const loadAssets = useMemo(() => async () => {
    setLoading(true);
    try {
      const readClient = createSupabaseContractsLocacoesReadClient(supabase);
      setAssets(await listRentalAssets(readClient, {
        search: debouncedSearch,
        status,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar ativos.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingAssetId(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startTransition(async () => {
      try {
        const mutationClient = createSupabaseContractsLocacoesMutationClient(supabase);
        if (editingAssetId) {
          await updateRentalAsset(mutationClient, editingAssetId, draft);
          toast.success('Ativo atualizado.');
        } else {
          await createRentalAsset(mutationClient, draft);
          toast.success('Ativo criado.');
        }
        resetForm();
        await loadAssets();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o ativo.');
      }
    });
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Buscar por descrição, tipo, código ou série"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="maintenance">Manutenção</option>
            <option value="inactive">Inativo</option>
            <option value="retired">Baixado</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">Carregando ativos...</div>
        ) : assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
            <p className="text-base font-semibold text-gray-900">Nenhum ativo encontrado</p>
            <p className="mt-1 text-sm text-gray-500">Cadastre equipamentos físicos para usar na seleção da nova locação.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {assets.map((asset) => (
              <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" key={asset.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-900">{asset.description}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {statusLabels[asset.operational_status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {[asset.equipment_type, asset.capacity, asset.internal_code, asset.serial_number]
                        .filter(Boolean)
                        .join(' | ') || 'Sem detalhes técnicos'}
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    type="button"
                    onClick={() => {
                      setDraft(draftFromAsset(asset));
                      setEditingAssetId(asset.id);
                    }}
                  >
                    <Edit2 size={16} />
                    Editar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{editingAssetId ? 'Editar ativo' : 'Novo ativo'}</h2>
          <button
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"
            type="button"
            onClick={resetForm}
          >
            <Plus size={16} />
            Novo
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-description">Descrição</label>
          <input
            className={inputClass}
            id="asset-description"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-type">Tipo</label>
            <input
              className={inputClass}
              id="asset-type"
              value={draft.equipment_type ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, equipment_type: normalizeText(event.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-capacity">Capacidade</label>
            <input
              className={inputClass}
              id="asset-capacity"
              value={draft.capacity ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, capacity: normalizeText(event.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-serial">Número de série</label>
            <input
              className={inputClass}
              id="asset-serial"
              value={draft.serial_number ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, serial_number: normalizeText(event.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-code">Código interno</label>
            <input
              className={inputClass}
              id="asset-code"
              value={draft.internal_code ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, internal_code: normalizeText(event.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-status">Status operacional</label>
          <select
            className={inputClass}
            id="asset-status"
            value={draft.operational_status}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                operational_status: event.target.value as RentalAssetOperationalStatus,
              }))
            }
          >
            <option value="active">Ativo</option>
            <option value="maintenance">Manutenção</option>
            <option value="inactive">Inativo</option>
            <option value="retired">Baixado</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-notes">Observações</label>
          <textarea
            className={inputClass}
            id="asset-notes"
            rows={3}
            value={draft.notes ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, notes: normalizeText(event.target.value) }))}
          />
        </div>
        <button
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {editingAssetId ? 'Salvar alterações' : 'Criar ativo'}
        </button>
      </form>
    </div>
  );
}
