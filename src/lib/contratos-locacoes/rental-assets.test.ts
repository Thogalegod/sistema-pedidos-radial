import { describe, expect, it } from 'vitest';
import {
  findConflictingAssetIds,
  isRentalAssetOperationallyAvailable,
  listAvailableRentalAssets,
  type RentalAssetAvailabilityContract,
  type RentalAssetAvailabilityItem,
  type RentalAssetReadClient,
} from './rental-assets';
import type { RentalAsset } from './types';

function makeAsset(overrides: Partial<RentalAsset> = {}): RentalAsset {
  return {
    id: 'asset-1',
    organization_id: 'org-1',
    description: 'Gerador 150 kVA',
    equipment_type: 'Gerador',
    capacity: '150 kVA',
    serial_number: 'SN-150',
    internal_code: 'RAD-150',
    operational_status: 'active',
    notes: null,
    created_at: '2026-08-12T00:00:00.000Z',
    updated_at: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<RentalAssetAvailabilityItem> = {}): RentalAssetAvailabilityItem {
  return {
    id: 'item-1',
    organization_id: 'org-1',
    contract_id: 'contract-1',
    asset_id: 'asset-1',
    status: 'rented',
    returned_at: null,
    ...overrides,
  };
}

function makeContract(overrides: Partial<RentalAssetAvailabilityContract> = {}): RentalAssetAvailabilityContract {
  return {
    id: 'contract-1',
    organization_id: 'org-1',
    kind: 'rental',
    start_date: '2026-08-10',
    end_date: '2026-08-20',
    status: 'active',
    ...overrides,
  };
}

class FakeRentalAssetReadClient implements RentalAssetReadClient {
  constructor(
    private readonly assets: RentalAsset[],
    private readonly items: RentalAssetAvailabilityItem[],
    private readonly contracts: RentalAssetAvailabilityContract[]
  ) {}

  async getCurrentOrganizationId() {
    return 'org-1';
  }

  async listRentalAssetsByOrganization(organizationId: string) {
    return this.assets.filter((asset) => asset.organization_id === organizationId);
  }

  async listRentalItemsByAssetIds(organizationId: string, assetIds: string[]) {
    return this.items.filter(
      (item) => item.organization_id === organizationId && item.asset_id && assetIds.includes(item.asset_id)
    );
  }

  async listContractsByIds(organizationId: string, contractIds: string[]) {
    return this.contracts.filter(
      (contract) => contract.organization_id === organizationId && contractIds.includes(contract.id)
    );
  }
}

describe('rental asset availability', () => {
  it('marks an active asset without conflicts as available', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient([makeAsset()], [], []),
      { start_date: '2026-08-12', end_date: '2026-08-15' }
    );

    expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
  });

  it.each(['maintenance', 'inactive', 'retired'] as const)(
    'marks %s assets as operationally unavailable',
    (status) => {
      expect(isRentalAssetOperationallyAvailable(makeAsset({ operational_status: status }))).toBe(false);
    }
  );

  it('marks an active asset with an overlapping rental interval as unavailable', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient([makeAsset()], [makeItem()], [makeContract()]),
      { start_date: '2026-08-15', end_date: '2026-08-25' }
    );

    expect(assets).toEqual([]);
  });

  it('keeps assets from the edited rental visible while preserving conflicts from other rentals', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient(
        [makeAsset(), makeAsset({ id: 'asset-2' })],
        [
          makeItem(),
          makeItem({ id: 'item-2', asset_id: 'asset-2', contract_id: 'contract-2' }),
        ],
        [makeContract(), makeContract({ id: 'contract-2' })]
      ),
      { start_date: '2026-08-15', end_date: '2026-08-25', exclude_contract_id: 'contract-1' }
    );

    expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
  });

  it('keeps an active asset available when the existing rental does not overlap', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient([makeAsset()], [makeItem()], [makeContract()]),
      { start_date: '2026-08-21', end_date: '2026-08-30' }
    );

    expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
  });

  it('treats the same existing end date and requested start date as a conflict', () => {
    const conflicts = findConflictingAssetIds({
      items: [makeItem()],
      contracts: [makeContract({ start_date: '2026-08-10', end_date: '2026-08-20' })],
      requestedInterval: { start_date: '2026-08-20', end_date: '2026-08-30' },
    });

    expect(conflicts.has('asset-1')).toBe(true);
  });

  it('ignores rental items without asset_id for physical asset conflicts', () => {
    const conflicts = findConflictingAssetIds({
      items: [makeItem({ asset_id: null })],
      contracts: [makeContract()],
      requestedInterval: { start_date: '2026-08-15', end_date: '2026-08-25' },
    });

    expect(conflicts.size).toBe(0);
  });

  it('treats an existing rental without end_date as blocking future intervals', () => {
    const conflicts = findConflictingAssetIds({
      items: [makeItem()],
      contracts: [makeContract({ end_date: null })],
      requestedInterval: { start_date: '2026-09-01', end_date: '2026-09-10' },
    });

    expect(conflicts.has('asset-1')).toBe(true);
  });

  it('keeps an asset unavailable while an awaiting_return contract still has no returned_at', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient(
        [makeAsset()],
        [makeItem()],
        [makeContract({ status: 'awaiting_return', end_date: '2026-08-20' })]
      ),
      { start_date: '2026-09-01', end_date: '2026-09-10' }
    );

    expect(assets).toEqual([]);
  });

  it('keeps returned assets conflicting on returned_at because intervals are closed', () => {
    const conflicts = findConflictingAssetIds({
      items: [makeItem({ status: 'returned', returned_at: '2026-08-20' })],
      contracts: [makeContract({ status: 'closed', end_date: '2026-08-20' })],
      requestedInterval: { start_date: '2026-08-20', end_date: '2026-08-25' },
    });

    expect(conflicts.has('asset-1')).toBe(true);
  });

  it('makes a returned asset available after the closed returned_at interval ends', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient(
        [makeAsset()],
        [makeItem({ status: 'returned', returned_at: '2026-08-20' })],
        [makeContract({ status: 'closed', end_date: '2026-08-20' })]
      ),
      { start_date: '2026-08-21', end_date: '2026-08-30' }
    );

    expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
  });

  it('keeps closed historical occupancy blocking through end_date when returned_at is absent', () => {
    const conflicts = findConflictingAssetIds({
      items: [makeItem({ status: 'rented', returned_at: null })],
      contracts: [makeContract({ status: 'closed', end_date: '2026-08-20' })],
      requestedInterval: { start_date: '2026-08-20', end_date: '2026-08-25' },
    });

    expect(conflicts.has('asset-1')).toBe(true);
  });

  it.each([
    ['without returned_at', null],
    ['with returned_at', '2026-08-20'],
  ] as const)(
    'keeps cancelled contracts non-blocking for availability %s',
    async (_caseName, returnedAt) => {
      const assets = await listAvailableRentalAssets(
        new FakeRentalAssetReadClient(
          [makeAsset()],
          [makeItem({ status: returnedAt ? 'returned' : 'rented', returned_at: returnedAt })],
          [makeContract({ status: 'cancelled', end_date: '2026-08-20' })]
        ),
        { start_date: '2026-08-20', end_date: '2026-08-25' }
      );

      expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
    }
  );

  it('keeps availability isolated by organization_id', async () => {
    const assets = await listAvailableRentalAssets(
      new FakeRentalAssetReadClient(
        [makeAsset(), makeAsset({ id: 'asset-2', organization_id: 'org-2' })],
        [makeItem({ organization_id: 'org-2', asset_id: 'asset-2', contract_id: 'contract-2' })],
        [makeContract({ organization_id: 'org-2', id: 'contract-2' })]
      ),
      { start_date: '2026-08-15', end_date: '2026-08-25' }
    );

    expect(assets.map((asset) => asset.id)).toEqual(['asset-1']);
  });
});
