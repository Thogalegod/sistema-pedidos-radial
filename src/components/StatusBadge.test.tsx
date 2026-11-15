import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Order } from '@/types';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);
it('preserves the current high-priority due-today indicator alongside normalized status', () => {
  const order: Order = { id: 'a', orderNumber: '1', title: '', client: '', address: '',
    priority: 'Alta', status: 'Em andamento', tasks: [], createdAt: '', dueDate: '2026-09-24' };
  render(<StatusBadge order={order} today={new Date(2026, 8, 24)} />);
  expect(screen.getByText('Em andamento')).toBeInTheDocument();
  expect(screen.getByText('Urgente para Hoje')).toBeInTheDocument();
});
it.each(['Em andamento', 'Finalizado', 'Cancelado'] as const)('renders %s as text, including closed orders with expired dates', status => {
  const order: Order = { id: 'a', orderNumber: '1', title: '', client: '', address: '',
    priority: 'Normal', status, tasks: [], createdAt: '', dueDate: '2020-01-01' };
  render(<StatusBadge order={order} today={new Date(2026, 8, 24)} />);
  expect(screen.getByText(status)).toBeInTheDocument();
  if (status !== 'Em andamento') expect(screen.queryByText(/Vencido/)).not.toBeInTheDocument();
});
