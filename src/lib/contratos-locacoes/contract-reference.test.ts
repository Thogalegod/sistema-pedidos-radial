import { describe, expect, it } from 'vitest';
import { buildBillingListReference, buildRentalListReference } from './contract-reference';

describe('buildRentalListReference', () => {
  it('shows only the order number for rentals with a legacy order', () => {
    expect(buildRentalListReference({
      legacyOrderNumber: '20260807',
      internalNumber: '8',
    })).toEqual({
      primary: '20260807',
      secondary: null,
    });
  });

  it('uses a comprehensible rental fallback for historical records without an order', () => {
    expect(buildRentalListReference({
      legacyOrderNumber: null,
      internalNumber: '8',
    })).toEqual({
      primary: 'Locação #8',
      secondary: null,
    });
  });
});

describe('buildBillingListReference', () => {
  it('shows the financial document as the billing title and the order second', () => {
    expect(buildBillingListReference({
      documentNumber: 'R000008001',
      legacyOrderNumber: '20260807',
    })).toEqual({
      primary: 'R000008001',
      secondary: 'Pedido 20260807',
    });
  });

  it('falls back to the order without exposing the internal rental number', () => {
    expect(buildBillingListReference({
      documentNumber: null,
      legacyOrderNumber: '20260807',
    })).toEqual({
      primary: 'Pedido 20260807',
      secondary: null,
    });
  });
});
