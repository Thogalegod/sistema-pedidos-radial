import { describe, expect, it } from 'vitest';
import { buildOrderHref, buildTaskHref, resolveOrdersPageIntent } from './navigation';

describe('orders page navigation intents', () => {
  it('builds and resolves a deep-link for the requested order', () => {
    const href = buildOrderHref('pedido 42');
    expect(href).toBe('/?pedido=pedido%2042');
    expect(resolveOrdersPageIntent(new URLSearchParams(href.split('?')[1]))).toEqual({
      orderId: 'pedido 42',
      taskId: null,
      openNewOrder: false,
    });
  });

  it('resolves the existing page as the new-order entry point', () => {
    expect(resolveOrdersPageIntent(new URLSearchParams('action=new-order'))).toEqual({
      orderId: null,
      taskId: null,
      openNewOrder: true,
    });
  });

  it('keeps the Pedido context for linked tasks and standalone tasks', () => {
    expect(buildTaskHref('t 1', 'p 1')).toBe('/?pedido=p%201&tarefa=t%201');
    expect(buildTaskHref('t 1', null)).toBe('/?tarefa=t%201');
    expect(resolveOrdersPageIntent(new URLSearchParams('pedido=p1&tarefa=t1'))).toEqual({
      orderId: 'p1', taskId: 't1', openNewOrder: false,
    });
  });
});
