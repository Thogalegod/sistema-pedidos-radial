'use client';

import { useId, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { RentalItemDraftInput } from '@/lib/contratos-locacoes/schemas';

type RentalItemsEditorProps = {
  items: RentalItemDraftInput[];
  onChange: (items: RentalItemDraftInput[]) => void;
};

function normalizeReactId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function createEmptyRentalItem(id: string): RentalItemDraftInput {
  return {
    id,
    description: '',
    equipment_type: '',
    capacity: '',
    serial_number: null,
    internal_code: null,
    quantity: 1,
    unit_amount: '0',
    status: 'rented',
    notes: null,
  };
}

export function RentalItemsEditor({ items, onChange }: RentalItemsEditorProps) {
  const itemIdSeed = normalizeReactId(useId());
  const itemCounterRef = useRef(0);
  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
  const createItemDraft = () => createEmptyRentalItem(`item-${itemIdSeed}-${itemCounterRef.current++}`);

  const updateItem = (
    itemId: string,
    key: keyof RentalItemDraftInput,
    value: string | number | null
  ) => {
    onChange(
      items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item))
    );
  };

  const removeItem = (itemId: string) => {
    const next = items.filter((item) => item.id !== itemId);
    onChange(next.length > 0 ? next : [createItemDraft()]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Itens da locação</h3>
          <p className="text-sm text-gray-500">Adicione vários itens manuais para a mesma locação.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          type="button"
          onClick={() => onChange([...items, createItemDraft()])}
        >
          <Plus size={16} />
          Adicionar item
        </button>
      </div>

      {items.map((item, index) => (
        <div className="rounded-2xl border border-gray-200 p-4" key={item.id}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-gray-900">Item {index + 1}</h4>
            <button
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
              type="button"
              onClick={() => removeItem(item.id)}
            >
              <Trash2 size={16} />
              Remover
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-description-${item.id}`}>Descrição do item</label>
              <input
                aria-label="Descrição do item"
                className={inputClass}
                id={`item-description-${item.id}`}
                value={item.description}
                onChange={(event) => updateItem(item.id, 'description', event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-type-${item.id}`}>Tipo do item</label>
              <input
                aria-label="Tipo do item"
                className={inputClass}
                id={`item-type-${item.id}`}
                value={item.equipment_type}
                onChange={(event) => updateItem(item.id, 'equipment_type', event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-capacity-${item.id}`}>Capacidade</label>
              <input
                aria-label="Capacidade"
                className={inputClass}
                id={`item-capacity-${item.id}`}
                value={item.capacity}
                onChange={(event) => updateItem(item.id, 'capacity', event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-serial-${item.id}`}>Série</label>
              <input
                className={inputClass}
                id={`item-serial-${item.id}`}
                value={item.serial_number ?? ''}
                onChange={(event) => updateItem(item.id, 'serial_number', event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-code-${item.id}`}>Código interno</label>
              <input
                className={inputClass}
                id={`item-code-${item.id}`}
                value={item.internal_code ?? ''}
                onChange={(event) => updateItem(item.id, 'internal_code', event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-quantity-${item.id}`}>Quantidade</label>
              <input
                className={inputClass}
                id={`item-quantity-${item.id}`}
                min={1}
                type="number"
                value={item.quantity}
                onChange={(event) => updateItem(item.id, 'quantity', Number(event.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`item-amount-${item.id}`}>Valor unitário</label>
              <input
                aria-label="Valor unitário"
                className={inputClass}
                id={`item-amount-${item.id}`}
                value={item.unit_amount}
                onChange={(event) => updateItem(item.id, 'unit_amount', event.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
