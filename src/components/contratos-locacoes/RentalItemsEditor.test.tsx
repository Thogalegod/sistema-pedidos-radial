'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RentalItemsEditor } from './RentalItemsEditor';
import type { RentalAsset } from '@/lib/contratos-locacoes/types';

const assets: RentalAsset[] = [
  {
    id: 'asset-1',
    organization_id: 'org-1',
    description: 'Gerador cadastrado',
    equipment_type: 'Gerador',
    capacity: '150 kVA',
    serial_number: 'SN-1',
    internal_code: 'RAD-1',
    operational_status: 'active',
    notes: null,
    created_at: '',
    updated_at: '',
  },
];

describe('RentalItemsEditor', () => {
  it('adds and updates multiple manual rental items', () => {
    const onChange = vi.fn();

    render(
      <RentalItemsEditor
        items={[
          {
            id: 'item-1',
            asset_id: null,
            description: '',
            equipment_type: '',
            capacity: null,
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

    expect(screen.getByLabelText(/valor unitário/i)).toHaveValue('R$ 0,00');
    fireEvent.change(screen.getAllByLabelText(/descrição do item/i)[0], {
      target: { value: 'Gerador principal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }));

    const lastPayload = onChange.mock.calls.at(-1)?.[0];
    expect(lastPayload).toHaveLength(2);
  });

  it('fills item fields and locks quantity when a physical asset is selected', () => {
    const onChange = vi.fn();

    render(
      <RentalItemsEditor
        availableAssets={assets}
        items={[
          {
            id: 'item-1',
            asset_id: null,
            description: '',
            equipment_type: '',
            capacity: null,
            serial_number: null,
            internal_code: null,
            quantity: 2,
            unit_amount: '0',
            status: 'rented',
            notes: null,
          },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/ativo físico/i), {
      target: { value: 'asset-1' },
    });

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        asset_id: 'asset-1',
        description: 'Gerador cadastrado',
        equipment_type: 'Gerador',
        capacity: '150 kVA',
        serial_number: 'SN-1',
        internal_code: 'RAD-1',
        quantity: 1,
      }),
    ]);
  });
});
