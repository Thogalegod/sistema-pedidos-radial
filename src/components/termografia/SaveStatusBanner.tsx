'use client';

export type SaveStatus = 'salvando' | 'salvo' | 'offline' | 'erro';

type SaveStatusBannerProps = {
  status: SaveStatus;
  salvoEm?: Date;
  onRetry?: () => void;
};

function formatarHorario(data: Date): string {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

export function SaveStatusBanner({ status, salvoEm, onRetry }: SaveStatusBannerProps) {
  const mensagem = {
    salvando: 'Salvando…',
    salvo: salvoEm
      ? `Rascunho salvo às ${formatarHorario(salvoEm)} — você pode sair e continuar depois.`
      : 'Rascunho salvo — você pode sair e continuar depois.',
    offline: 'Sem conexão — alterações ainda não enviadas.',
    erro: 'Falha ao salvar — tentar novamente.',
  }[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm"
    >
      <span>{mensagem}</span>
      {status === 'erro' && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
