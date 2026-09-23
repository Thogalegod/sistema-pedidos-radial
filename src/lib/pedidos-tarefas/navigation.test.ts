import { describe, expect, it } from 'vitest';
import { buildOrderHref, resolveOrdersPageIntent } from './navigation';

describe('orders page navigation intents', () => {
  it('builds and resolves a deep-link for the requested order', () => {
    const href = buildOrderHref('pedido 42');
    expect(href).toBe('/?pedido=pedido%2042');
    expect(resolveOrdersPageIntent(new URLSearchParams(href.split('?')[1]))).toEqual({
      orderId: 'pedido 42',
      openNewOrder: false,
    });
  });

  it('resolves the existing page as the new-order entry point', () => {
    expect(resolveOrdersPageIntent(new URLSearchParams('action=new-order'))).toEqual({
      orderId: null,
      openNewOrder: true,
    });
  });
});
