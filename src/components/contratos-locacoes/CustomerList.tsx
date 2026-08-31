'use client';

import Link from 'next/link';
import { Building2, MapPin, Plus, Search, Users } from 'lucide-react';
import type { CustomerListItem } from '@/lib/contratos-locacoes/queries';

type CustomerListProps = {
  customers: CustomerListItem[];
  loading: boolean;
  search: string;
  status: 'active' | 'inactive' | 'all';
  onSearchChange: (value: string) => void;
  onStatusChange: (value: 'active' | 'inactive' | 'all') => void;
};

export function CustomerList({
  customers,
  loading,
  search,
  status,
  onSearchChange,
  onStatusChange,
}: CustomerListProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            className="w-full rounded-xl border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Buscar por cliente, CNPJ/CPF ou cidade"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as 'active' | 'inactive' | 'all')}
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>

          <Link
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            href="/contratos-locacoes/clientes/novo"
          >
            <Plus size={16} />
            Novo cliente
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
            Carregando clientes...
          </div>
        ) : customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-sm">
            <Building2 className="mx-auto mb-3 text-gray-300" size={36} />
            <p className="text-base font-semibold text-gray-900">Nenhum cliente encontrado</p>
            <p className="mt-1 text-sm text-gray-500">Ajuste os filtros ou cadastre o primeiro cliente deste módulo.</p>
          </div>
        ) : (
          customers.map((customer) => (
            <Link
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              href={`/contratos-locacoes/clientes/${customer.id}`}
              key={customer.id}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">{customer.legal_name}</h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        customer.active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {customer.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{customer.trade_name}</p>
                  {customer.tax_id ? (
                    <p className="mt-1 text-xs text-gray-500">CNPJ/CPF: {customer.tax_id}</p>
                  ) : null}
                </div>

                <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-3 md:min-w-[320px]">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-gray-400" />
                    <span>{customer.site_count} obra(s)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-gray-400" />
                    <span>{customer.contact_count} contato(s)</span>
                  </div>
                  <div className="text-gray-500">
                    {customer.cities.length > 0 ? customer.cities.join(', ') : 'Sem cidade'}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
