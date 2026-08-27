import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingDeliveryHistory } from './BillingDeliveryHistory';
import type { BillingDeliveryEvent } from '@/lib/contratos-locacoes/types';

afterEach(cleanup);

describe('BillingDeliveryHistory', () => {
  it('shows immutable business history while hiding technical identifiers', () => {
    const events: BillingDeliveryEvent[] = [{
      id: 'technical-event-id',
      organization_id: 'org-1',
      billing_cycle_id: 'billing-1',
      sent_at: '2026-08-20T15:30:00.000Z',
      recipients: ['financeiro@cliente.com', 'compras@cliente.com'],
      provider_message_id: 'provider-secret-id',
      send_request_id: 'request-secret-id',
      additional_message: 'Referente ao período de agosto.',
      created_by: 'user-1',
      created_at: '2026-08-20T15:30:01.000Z',
    }];

    render(<BillingDeliveryHistory events={events} />);

    expect(screen.getByText(/20\/08\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/financeiro@cliente.com, compras@cliente.com/)).toBeInTheDocument();
    expect(screen.getByText('Referente ao período de agosto.')).toBeInTheDocument();
    expect(screen.queryByText(/technical-event-id|provider-secret-id|request-secret-id/)).not.toBeInTheDocument();
  });

  it('renders no section when there is no delivery', () => {
    const { container } = render(<BillingDeliveryHistory events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
