'use client';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardCards } from './DashboardCards';

describe('DashboardCards', () => {
  it('renders the billing summary with urgent counters and open totals', () => {
    render(
      <DashboardCards
        snapshot={{
          summary: {
            active_contracts: 4,
            paused_contracts: 1,
            billings_to_issue_count: 2,
            due_soon_count: 3,
            due_today_count: 1,
            overdue_count: 2,
            paid_count: 6,
            open_total_amount: '540000',
            overdue_total_amount: '120000',
          },
          alerts: [],
          upcoming: [],
        }}
      />
    );

    expect(screen.getByText(/cobranças a emitir/i)).toBeInTheDocument();
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText(/R\$ 5\.400,00/i)).toBeInTheDocument();
  });
});
