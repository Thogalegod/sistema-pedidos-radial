export function buildOrderHref(orderId: string) {
  return `/?pedido=${encodeURIComponent(orderId)}`;
}

export function buildTaskHref(taskId: string, orderId: string | null) {
  const task = `tarefa=${encodeURIComponent(taskId)}`;
  return orderId ? `/?pedido=${encodeURIComponent(orderId)}&${task}` : `/?${task}`;
}

export function buildNewOrderHref() {
  return '/?action=new-order';
}

export function resolveOrdersPageIntent(searchParams: Pick<URLSearchParams, 'get'>) {
  return {
    orderId: searchParams.get('pedido'),
    taskId: searchParams.get('tarefa'),
    openNewOrder: searchParams.get('action') === 'new-order',
  };
}
