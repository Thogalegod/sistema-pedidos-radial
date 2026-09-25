'use client';

import type { TemplateRecord } from '@/lib/pedidos-tarefas/templates';
import { cn } from '../StatusBadge';

type TemplatePickerProps = {
  templates: TemplateRecord[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  onManage?: () => void;
  error?: string | null;
};

export function TemplatePicker({
  templates,
  selectedId,
  onSelect,
  disabled = false,
  onManage,
  error = null,
}: TemplatePickerProps) {
  const usingTemplate = selectedId !== null;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Como deseja começar?</h3>
          <p className="text-xs text-slate-600">Em branco mantém o fluxo atual. Um template cria as etapas prontas.</p>
        </div>
        {onManage && (
          <button type="button" onClick={onManage} disabled={disabled}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50">
            Gerenciar templates
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled} onClick={() => onSelect(null)}
          className={cn('rounded-lg border px-3 py-2 text-sm font-medium',
            !usingTemplate ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700')}>
          Em branco
        </button>
        <button type="button" disabled={disabled || templates.length === 0}
          onClick={() => onSelect(selectedId ?? templates[0]?.id ?? null)}
          className={cn('rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
            usingTemplate ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700')}>
          Usar template
        </button>
      </div>
      {usingTemplate && (
        <label className="block space-y-1 text-xs font-medium text-slate-700">
          Template do Pedido
          <select aria-label="Template do Pedido" value={selectedId ?? ''} disabled={disabled}
            onChange={event => onSelect(event.target.value || null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
            {templates.map(template => (
              <option key={template.id} value={template.id}>{template.name} (v{template.version})</option>
            ))}
          </select>
        </label>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      ) : templates.length === 0 && (
        <p className="text-xs text-slate-500">Nenhum template cadastrado. Você pode criar o primeiro em “Gerenciar templates”.</p>
      )}
    </section>
  );
}
