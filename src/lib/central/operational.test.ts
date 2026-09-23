import { describe, expect, it } from 'vitest';
import { buildCentralOperationalSnapshot, type CentralOperationalInput } from './operational';

const TODAY = '2026-09-22';

describe('Central operational snapshot', () => {
  it('counts overdue and today tasks, excluding tomorrow and completed tasks', () => {
    const snapshot = buildCentralOperationalSnapshot(makeInput({
      tasks: [
        task('late', '2026-09-21'),
        task('today', TODAY),
        task('tomorrow', '2026-09-23'),
        task('done', '2026-09-20', true),
      ],
    }));

    expect(snapshot.summary).toMatchObject({ overdueTasks: 1, tasksToday: 1 });
    expect(snapshot.tasks.map((item) => item.id)).toEqual(['late', 'today']);
  });

  it.each(['active', 'closing_requested', 'awaiting_return'] as const)(
    'flags a finished period without its next cycle while %s equipment is not returned',
    (status) => {
      const snapshot = buildCentralOperationalSnapshot(makeInput({
        contracts: [contract({ status })],
        rentalItems: [rentalItem()],
        billingCycles: [billing({ period_start: '2026-08-22', period_end: '2026-09-21' })],
      }));

      expect(snapshot.periodsToBill).toHaveLength(1);
      expect(snapshot.periodsToBill[0]).toMatchObject({
        contractId: 'contract-1',
        previousPeriodEnd: '2026-09-21',
        nextPeriodStart: '2026-09-22',
      });
    }
  );

  it('does not flag a period when the next cycle already exists', () => {
    const snapshot = buildCentralOperationalSnapshot(makeInput({
      contracts: [contract()],
      rentalItems: [rentalItem()],
      billingCycles: [
        billing({ id: 'billing-1', sequence_number: 1, period_start: '2026-08-22', period_end: '2026-09-21' }),
        billing({ id: 'billing-2', sequence_number: 2, period_start: '2026-09-22', period_end: '2026-10-21' }),
      ],
    }));

    expect(snapshot.periodsToBill).toEqual([]);
  });

  it('flags a new period for an active rental with a manual item', () => {
    const snapshot = buildCentralOperationalSnapshot(makeInput({
      contracts: [contract()],
      rentalItems: [rentalItem({ asset_id: null })],
      billingCycles: [billing({ period_start: '2026-08-22', period_end: '2026-09-21' })],
    }));

    expect(snapshot.periodsToBill).toHaveLength(1);
    expect(snapshot.periodsToBill[0].nextPeriodStart).toBe('2026-09-22');
  });

  it.each(['active', 'awaiting_return'] as const)(
    'does not flag a period after the equipment was physically returned for %s rental',
    (status) => {
      const snapshot = buildCentralOperationalSnapshot(makeInput({
        contracts: [contract({ status })],
        rentalItems: [rentalItem({ returned_at: '2026-09-21' })],
        billingCycles: [billing({ period_start: '2026-08-22', period_end: '2026-09-21' })],
      }));

      expect(snapshot.periodsToBill).toEqual([]);
    }
  );

  it('keeps only overdue billings with positive balance and the effective financial status', () => {
    const snapshot = buildCentralOperationalSnapshot(makeInput({
      billingCycles: [
        billing({ id: 'partial', total_amount: '100000', due_date: '2026-09-20', status: 'issued' }),
        billing({ id: 'paid', total_amount: '50000', due_date: '2026-09-20', status: 'paid' }),
        billing({ id: 'draft', due_date: '2026-09-20', status: 'draft' }),
        billing({ id: 'cancelled', due_date: '2026-09-20', status: 'cancelled' }),
        billing({ id: 'exempt', due_date: '2026-09-20', status: 'exempt' }),
      ],
      payments: [
        { id: 'payment-partial', billing_cycle_id: 'partial', amount: '25000' },
        { id: 'payment-paid', billing_cycle_id: 'paid', amount: '50000' },
      ],
    }));

    expect(snapshot.overdueBillings).toHaveLength(1);
    expect(snapshot.overdueBillings[0]).toMatchObject({ id: 'partial', balanceAmount: '75000' });
  });
});

function makeInput(overrides: Partial<CentralOperationalInput> = {}): CentralOperationalInput {
  return {
    today: TODAY,
    tasks: [],
    orders: [{ id: 'order-1', numero_pedido: 'OS-42', projeto: 'Projeto', cliente: 'Cliente Pedido' }],
    contracts: [contract()],
    customers: [{ id: 'customer-1', legal_name: 'Cliente Locação' }],
    rentalItems: [],
    billingCycles: [],
    payments: [],
    ...overrides,
  };
}

function task(id: string, vencimento: string, concluido = false) {
  return { id, pedido_id: 'order-1', descricao: `Tarefa ${id}`, vencimento, concluido };
}

function contract(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contract-1',
    internal_number: '123',
    customer_id: 'customer-1',
    start_date: '2026-08-22',
    kind: 'rental' as const,
    status: 'active' as const,
    ...overrides,
  };
}

function rentalItem(overrides: Record<string, unknown> = {}) {
  return { id: 'item-1', contract_id: 'contract-1', asset_id: 'asset-1', returned_at: null, ...overrides };
}

function billing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'billing-1',
    contract_id: 'contract-1',
    sequence_number: 1,
    period_start: '2026-08-22',
    period_end: '2026-09-21',
    due_date: '2026-09-30',
    total_amount: '100000',
    status: 'issued' as const,
    ...overrides,
  };
}
