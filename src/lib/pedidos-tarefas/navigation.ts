export function buildOrderHref(orderId: string) {
  return `/?pedido=${encodeURIComponent(orderId)}`;
}

export function buildNewOrderHref() {
  return '/?action=new-order';
}

export function resolveOrdersPageIntent(searchParams: Pick<URLSearchParams, 'get'>) {
  return {
    orderId: searchParams.get('pedido'),
    openNewOrder: searchParams.get('action') === 'new-order',
  };
}
