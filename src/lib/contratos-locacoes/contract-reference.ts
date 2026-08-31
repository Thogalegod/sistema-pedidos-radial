interface RentalListReferenceInput {
  legacyOrderNumber: string | null;
  internalNumber: string;
}

interface BillingListReferenceInput {
  legacyOrderNumber: string | null;
  documentNumber: string | null;
}

export interface ContractReference {
  primary: string;
  secondary: string | null;
}

export function buildRentalListReference({
  legacyOrderNumber,
  internalNumber,
}: RentalListReferenceInput): ContractReference {
  if (legacyOrderNumber) {
    return {
      primary: legacyOrderNumber,
      secondary: null,
    };
  }

  return {
    primary: `Locação #${internalNumber}`,
    secondary: null,
  };
}

export function buildBillingListReference({
  legacyOrderNumber,
  documentNumber,
}: BillingListReferenceInput): ContractReference {
  if (documentNumber) {
    return {
      primary: documentNumber,
      secondary: legacyOrderNumber ? `Pedido ${legacyOrderNumber}` : null,
    };
  }

  return {
    primary: legacyOrderNumber ? `Pedido ${legacyOrderNumber}` : 'Cobrança sem número',
    secondary: null,
  };
}
