'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { Priority, OrderStatus } from '../types';
import { X, Save, Search, MapPin, Loader2 } from 'lucide-react';
import { cn } from './StatusBadge';
import type { TemplateRecord } from '@/lib/pedidos-tarefas/templates';
import { TemplatePicker } from './pedidos-tarefas/TemplatePicker';

export type NewOrderTemplateSelection = {
  templateId: string;
  expectedVersion: number;
  requestId: string;
  timeZone: string;
};

export interface NewOrderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: {
    orderNumber: string;
    title: string;
    client: string;
    address: string;
    cep: string;
    priority: Priority;
    status: OrderStatus;
    template: NewOrderTemplateSelection | null;
  }) => boolean | Promise<boolean>;
  templates?: TemplateRecord[];
  templatesError?: string | null;
  onManageTemplates?: () => void;
}

interface ViaCepResponse {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export function NewOrderDrawer({
  isOpen,
  onClose,
  onSave,
  templates = [],
  templatesError = null,
  onManageTemplates,
}: NewOrderDrawerProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const status: OrderStatus = 'Em andamento';
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [cepError, setCepError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // Monta o endereço completo para salvar
  const fullAddress = [street, number, neighborhood, city, uf].filter(Boolean).join(', ');

  const resetForm = useCallback(() => {
    setOrderNumber('');
    setTitle('');
    setClient('');
    setCep('');
    setStreet('');
    setNumber('');
    setNeighborhood('');
    setCity('');
    setUf('');
    setPriority('Normal');
    setCepError('');
    setSelectedTemplateId(null);
    requestIdRef.current = null;
  }, []);

  const closeDrawer = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [closeDrawer]);

  const fetchCep = async (rawCep: string) => {
    const cleaned = rawCep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;

    setIsFetchingCep(true);
    setCepError('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data: ViaCepResponse = await res.json();

      if (data.erro) {
        setCepError('CEP não encontrado.');
        return;
      }

      setStreet(data.logradouro || '');
      setNeighborhood(data.bairro || '');
      setCity(data.localidade || '');
      setUf(data.uf || '');
    } catch {
      setCepError('Erro ao buscar CEP. Verifique sua conexão.');
    } finally {
      setIsFetchingCep(false);
    }
  };

  const handleCepChange = (value: string) => {
    // Máscara: 00000-000
    const masked = value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
    setCep(masked);
    if (masked.replace(/\D/g, '').length === 8) {
      fetchCep(masked);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || !title || !client || !street || isSaving) return;

    setIsSaving(true);
    try {
      const succeeded = await onSave({
        orderNumber,
        title,
        client,
        address: fullAddress || street,
        cep,
        priority,
        status,
        template: (() => {
          const selected = templates.find(template => template.id === selectedTemplateId);
          if (!selected) return null;
          requestIdRef.current ??= crypto.randomUUID();
          return {
            templateId: selected.id,
            expectedVersion: selected.version,
            requestId: requestIdRef.current,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          };
        })(),
      });
      if (succeeded !== false) closeDrawer();
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Novo Pedido</h2>
          <button
            onClick={closeDrawer}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">

          <TemplatePicker
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={id => {
              setSelectedTemplateId(id);
              requestIdRef.current = null;
            }}
            disabled={isSaving}
            onManage={onManageTemplates}
            error={templatesError}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Número do Pedido *</label>
            <input
              required
              type="text"
              placeholder="Ex: PED-2050"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nome do Projeto/Pedido *</label>
            <input
              required
              type="text"
              placeholder="Ex: Instalação de Painel Solar"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nome do Cliente *</label>
            <input
              required
              type="text"
              placeholder="Ex: Empresa Silva"
              value={client}
              onChange={e => setClient(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Endereço com ViaCEP */}
          <div className="space-y-3 p-4 bg-blue-50/40 rounded-xl border border-blue-100">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Endereço da Obra</span>
            </div>

            {/* CEP */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">CEP</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={cep}
                  onChange={e => handleCepChange(e.target.value)}
                  className={cn(inputClass, "pr-10", cepError && "border-red-400 focus:border-red-500")}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isFetchingCep
                    ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    : <Search className="w-4 h-4 text-gray-400" />
                  }
                </div>
              </div>
              {cepError && <p className="text-xs text-red-500">{cepError}</p>}
            </div>

            {/* Logradouro + Número */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-gray-600">Rua / Logradouro *</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Rua das Flores"
                  value={street}
                  onChange={e => setStreet(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-xs font-medium text-gray-600">Número</label>
                <input
                  type="text"
                  placeholder="123"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Bairro */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Bairro</label>
              <input
                type="text"
                placeholder="Ex: Centro"
                value={neighborhood}
                onChange={e => setNeighborhood(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Cidade + UF */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-gray-600">Cidade</label>
                <input
                  type="text"
                  placeholder="Ex: São Paulo"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="w-20 space-y-1">
                <label className="text-xs font-medium text-gray-600">UF</label>
                <input
                  type="text"
                  placeholder="SP"
                  maxLength={2}
                  value={uf}
                  onChange={e => setUf(e.target.value.toUpperCase())}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Preview do endereço completo */}
            {fullAddress && (
              <div className="flex items-start gap-1.5 text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{fullAddress}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Prioridade</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Baixa', 'Normal', 'Alta'] as Priority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                    priority === p
                      ? p === 'Alta' ? "bg-red-50 border-red-500 text-red-700"
                        : p === 'Normal' ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-green-50 border-green-500 text-green-700"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Status Inicial</label>
            <select
              value={status}
              disabled
              className={inputClass}
            >
              <option value="Em andamento">Em andamento</option>
            </select>
          </div>

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Salvando...' : 'Salvar Pedido'}
            </button>
          </div>

        </form>
      </div>
    </>
  );
}
