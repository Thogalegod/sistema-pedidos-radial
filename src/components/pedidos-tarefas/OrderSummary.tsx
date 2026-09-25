import type { NextAction, TaskSummary } from '@/lib/pedidos-tarefas/indicators';
import type { Front, Id, OrderV1 } from '@/lib/pedidos-tarefas/types';

export function OrderSummary({ order, summary, frontSummaries, nextAction, recent, onOpenTask }: {
  order: OrderV1;
  summary: TaskSummary;
  frontSummaries: Array<{ front: Front; summary: TaskSummary }>;
  nextAction: NextAction | null;
  recent: { text: string; at: string; author: string } | null;
  onOpenTask: (id: Id) => void;
}) {
  return <section aria-label={`Resumo do Pedido ${order.number}`} className="space-y-5">
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h3 className="font-semibold text-gray-900">Progresso do Pedido</h3>
      {summary.total === 0 ? <p className="mt-2 text-sm text-gray-600">Nenhuma tarefa neste Pedido.</p> : <>
        <p className="mt-2 text-2xl font-bold text-blue-800">{summary.percent}%</p>
        <p className="text-sm text-gray-600">{summary.completed} de {summary.total} tarefas concluídas</p>
      </>}
      {summary.readyToFinish && order.status === 'Em andamento' &&
        <p className="mt-2 text-sm text-emerald-700">Todas as tarefas concluídas; o Pedido pode ser finalizado manualmente.</p>}
    </div>
    {summary.total > 0 && <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
      <p>Atrasadas: {summary.overdue}</p><p>Vencem hoje: {summary.today}</p>
      <p>Aguardando: {summary.waiting}</p><p>Follow-ups: {summary.followUps}</p>
      <p>Bloqueadas: {summary.blocked}</p>
    </div>}
    {frontSummaries.length > 0 && <div>
      <h3 className="font-semibold text-gray-900">Por Frente</h3>
      <div className="mt-2 space-y-2">{frontSummaries.map(({ front, summary: frontSummary }) =>
        <div key={front.id} className="flex justify-between rounded-lg border border-gray-100 p-3 text-sm">
          <span>{front.name}</span><span>{frontSummary.completed}/{frontSummary.total} · {frontSummary.percent ?? 0}%</span>
        </div>)}</div>
    </div>}
    <div>
      <h3 className="font-semibold text-gray-900">Próxima ação</h3>
      {nextAction ? <button type="button" onClick={() => onOpenTask(nextAction.taskId)}
        className="mt-2 w-full rounded-lg border border-blue-200 p-3 text-left text-sm text-blue-800 hover:bg-blue-50">
        {nextAction.label}
      </button> : <p className="mt-2 text-sm text-gray-600">Nenhuma próxima ação com prazo definida.</p>}
    </div>
    <div>
      <h3 className="font-semibold text-gray-900">Atualização recente</h3>
      {recent ? <div className="mt-2 rounded-lg border border-gray-100 p-3 text-sm">
        <p>{recent.text}</p><p className="mt-1 text-xs text-gray-500">{recent.author} · {new Date(recent.at).toLocaleString('pt-BR')}</p>
      </div> : <p className="mt-2 text-sm text-gray-600">Nenhuma atualização registrada.</p>}
    </div>
  </section>;
}
