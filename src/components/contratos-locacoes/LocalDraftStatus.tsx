'use client';

import type { LocalDraftStatus as LocalDraftStatusValue } from '@/lib/contratos-locacoes/use-local-draft';

type LocalDraftStatusProps = {
  status: LocalDraftStatusValue;
  savedAt: string | null;
  onRestore?: () => void;
  onDiscard?: () => void;
};

function formatSavedAt(savedAt: string | null): string | null {
  if (!savedAt) {
    return null;
  }

  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

export function LocalDraftStatus({
  status,
  savedAt,
  onRestore,
  onDiscard,
}: LocalDraftStatusProps) {
  if (status === 'idle') {
    return null;
  }

  const formattedSavedAt = formatSavedAt(savedAt);
  const cardClass =
    status === 'conflict'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-sky-200 bg-sky-50 text-sky-900';

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${cardClass}`}>
      {status === 'saving_local' ? (
        <p>Salvando rascunho neste navegador...</p>
      ) : null}

      {status === 'saved_local' ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p>
            Rascunho local salvo neste navegador
            {formattedSavedAt ? ` em ${formattedSavedAt}` : ''}. Ainda não enviado ao servidor.
          </p>
          {onDiscard ? (
            <button
              className="rounded-lg border border-sky-300 px-3 py-1.5 font-medium text-sky-900 hover:bg-sky-100"
              onClick={onDiscard}
              type="button"
            >
              Descartar rascunho local
            </button>
          ) : null}
        </div>
      ) : null}

      {status === 'synced' ? <p>Dados sincronizados com o servidor.</p> : null}

      {status === 'conflict' ? (
        <div className="flex flex-col gap-3">
          <p>
            Existe um rascunho local desta tela
            {formattedSavedAt ? ` salvo em ${formattedSavedAt}` : ''}, mas os dados do servidor mudaram desde a última edição.
            Revise antes de restaurar.
          </p>
          <div className="flex flex-wrap gap-2">
            {onRestore ? (
              <button
                className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
                onClick={onRestore}
                type="button"
              >
                Restaurar rascunho local
              </button>
            ) : null}
            {onDiscard ? (
              <button
                className="rounded-lg border border-amber-300 px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
                onClick={onDiscard}
                type="button"
              >
                Descartar rascunho local
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
