import { expect, it } from 'vitest';
import type { Order } from '@/types';
import { sortOrders } from './sorting';

const order = (id: string, status: Order['status'], dueDate?: string): Order => ({
  id, status, dueDate, orderNumber: id, title: id, client: '', address: '',
  priority: 'Normal', tasks: [], createdAt: '2026-09-23T12:00:00Z',
});

it('keeps closed orders below active ones regardless of expired legacy dates, with deterministic ties', () => {
  const input = [order('c', 'Cancelado', '2020-01-01'), order('b', 'Finalizado', '2020-01-01'),
    order('z', 'Em andamento'), order('a', 'Em andamento')];
  expect(sortOrders(input, new Date(2026, 8, 24)).map(o => o.id)).toEqual(['a', 'z', 'b', 'c']);
  expect(input[0].id).toBe('c');
});
