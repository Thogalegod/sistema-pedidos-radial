import type { ContractStatus, RentalAsset, RentalItemStatus } from './types';

export interface RentalAssetAvailabilityInterval {
  start_date: string;
  end_date: string | null;
  exclude_contract_id?: string;
}

export interface RentalAssetAvailabilityItem {
  id: string;
  organization_id: string;
  contract_id: string;
  asset_id: string | null;
  status: RentalItemStatus;
  returned_at: string | null;
}

export interface RentalAssetAvailabilityContract {
  id: string;
  organization_id: string;
  kind: 'rental';
  start_date: string;
  end_date: string | null;
  status: ContractStatus;
}

export interface RentalAssetReadClient {
  getCurrentOrganizationId(): Promise<string>;
  listRentalAssetsByOrganization(
    organizationId: string,
    filters?: { status?: RentalAsset['operational_status'] }
  ): Promise<RentalAsset[]>;
  listRentalItemsByAssetIds(
    organizationId: string,
    assetIds: string[]
  ): Promise<RentalAssetAvailabilityItem[]>;
  listContractsByIds(
    organizationId: string,
    contractIds: string[]
  ): Promise<RentalAssetAvailabilityContract[]>;
}

const BLOCKING_CONTRACT_STATUSES = new Set<ContractStatus>([
  'active',
  'paused',
  'closing_requested',
  'awaiting_return',
  'inspection',
]);

const BLOCKING_ITEM_STATUSES = new Set<RentalItemStatus>([
  'rented',
  'lost_damaged',
  'suspended_exempt',
]);

function getPhysicalOccupancyInterval(
  item: RentalAssetAvailabilityItem,
  contract: RentalAssetAvailabilityContract
): RentalAssetAvailabilityInterval | null {
  if (!item.asset_id) {
    return null;
  }

  if (item.returned_at) {
    return {
      start_date: contract.start_date,
      end_date: item.returned_at,
    };
  }

  if (contract.status === 'closed') {
    return {
      start_date: contract.start_date,
      end_date: contract.end_date,
    };
  }

  if (!BLOCKING_ITEM_STATUSES.has(item.status)) {
    return null;
  }

  return {
    start_date: contract.start_date,
    end_date: contract.status === 'awaiting_return' ? null : contract.end_date,
  };
}

function dateOrInfinity(value: string | null) {
  return value ?? '9999-12-31';
}

export function rentalIntervalsOverlap(
  left: RentalAssetAvailabilityInterval,
  right: RentalAssetAvailabilityInterval
) {
  return left.start_date <= dateOrInfinity(right.end_date)
    && right.start_date <= dateOrInfinity(left.end_date);
}

export function isRentalAssetOperationallyAvailable(asset: RentalAsset) {
  return asset.operational_status === 'active';
}

export function findConflictingAssetIds({
  items,
  contracts,
  requestedInterval,
  excludeContractId,
}: {
  items: RentalAssetAvailabilityItem[];
  contracts: RentalAssetAvailabilityContract[];
  requestedInterval: RentalAssetAvailabilityInterval;
  excludeContractId?: string;
}) {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));
  const conflictingAssetIds = new Set<string>();

  items.forEach((item) => {
    if (!item.asset_id) {
      return;
    }

    const contract = contractsById.get(item.contract_id);
    if (contract?.id === excludeContractId) {
      return;
    }
    if (contract?.status === 'cancelled') {
      return;
    }

    if (
      !contract ||
      (
        !BLOCKING_CONTRACT_STATUSES.has(contract.status) &&
        contract.status !== 'closed' &&
        !item.returned_at
      )
    ) {
      return;
    }

    const occupancyInterval = getPhysicalOccupancyInterval(item, contract);

    if (occupancyInterval && rentalIntervalsOverlap(requestedInterval, occupancyInterval)) {
      conflictingAssetIds.add(item.asset_id);
    }
  });

  return conflictingAssetIds;
}

export async function listAvailableRentalAssets(
  client: RentalAssetReadClient,
  interval: RentalAssetAvailabilityInterval
) {
  const organizationId = await client.getCurrentOrganizationId();
  const activeAssets = (await client.listRentalAssetsByOrganization(organizationId, { status: 'active' }))
    .filter(isRentalAssetOperationallyAvailable);
  const assetIds = activeAssets.map((asset) => asset.id);
  const items = await client.listRentalItemsByAssetIds(organizationId, assetIds);
  const contractIds = [...new Set(items.map((item) => item.contract_id))];
  const contracts = await client.listContractsByIds(organizationId, contractIds);
  const conflictingAssetIds = findConflictingAssetIds({
    items,
    contracts,
    requestedInterval: interval,
    excludeContractId: interval.exclude_contract_id,
  });

  return activeAssets.filter((asset) => !conflictingAssetIds.has(asset.id));
}
