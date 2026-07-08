'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RentalItemsEditor } from './RentalItemsEditor';

describe('RentalItemsEditor', () => {
  it('adds and updates multiple manual rental items', () => {
    const onChange = vi.fn();

    render(
      <RentalItemsEditor
        items={[
          {
            id: 'item-1',
            description: '',
            equipment_type: '',
            capacity: '',
            serial_number: null,
            internal_code: null,
            quantity: 1,
            unit_amount: '0',
            status: 'rented',
            notes: null,
          },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getAllByLabelText(/descrição do item/i)[0], {
      target: { value: 'Gerador principal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

    const lastPayload = onChange.mock.calls.at(-1)?.[0];
    expect(lastPayload).toHaveLength(2);
  });
});
