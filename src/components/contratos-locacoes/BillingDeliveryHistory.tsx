import type { BillingDeliveryEvent } from '@/lib/contratos-locacoes/types';

function formatSentAt(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BillingDeliveryHistory({ events }: { events: BillingDeliveryEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="mt-4 border-t border-blue-100 pt-3">
      <p className="text-xs font-semibold uppercase text-blue-800">Histórico de envios</p>
      <ol className="mt-2 grid gap-2">
        {events.map((event) => (
          <li className="rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-700" key={event.id}>
            <p className="font-semibold text-gray-900">Enviada em {formatSentAt(event.sent_at)}</p>
            <p className="mt-1"><span className="font-semibold">Para:</span> {event.recipients.join(', ')}</p>
            {event.additional_message ? (
              <p className="mt-1 whitespace-pre-wrap"><span className="font-semibold">Mensagem:</span> {event.additional_message}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
