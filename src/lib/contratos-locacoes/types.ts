export type ContractKind = 'rental' | 'energy_management' | 'recurring_service' | 'other';
export type ContractCompany = 'fontes' | 'radial';

export type ContractStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'closing_requested'
  | 'awaiting_return'
  | 'inspection'
  | 'closed'
  | 'cancelled';

export type RentalItemStatus =
  | 'rented'
  | 'returned'
  | 'replaced'
  | 'lost_damaged'
  | 'suspended_exempt';

export type BillingStatus =
  | 'draft'
  | 'issued'
  | 'paid'
  | 'overdue'
  | 'exempt'
  | 'cancelled';

export type InspectionKind = 'departure' | 'return';

export type SyncState = 'local' | 'uploading' | 'synced' | 'failed';

// Supabase/Postgres commonly returns bigint and numeric columns as strings.
export type DbBigInt = string;
export type DbNumeric = string;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: 'admin' | 'member';
  created_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name: string;
  tax_id: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSite {
  id: string;
  organization_id: string;
  customer_id: string;
  name: string;
  address_line: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerContact {
  id: string;
  organization_id: string;
  customer_id: string;
  site_id: string | null;
  name: string;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_primary: boolean;
  receives_billing: boolean;
  receives_technical: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contract {
  id: string;
  organization_id: string;
  internal_number: DbBigInt;
  kind: ContractKind;
  contract_company: ContractCompany;
  customer_id: string;
  site_id: string;
  legacy_order_number: string | null;
  transport_notes: string | null;
  has_remittance_invoice: boolean;
  remittance_invoice_number: string | null;
  remittance_invoice_issuer: string | null;
  remittance_invoice_amount: DbBigInt | null; // stored in cents
  remittance_invoice_issue_date: string | null;
  start_date: string;
  end_date: string | null;
  recurrence_days: number;
  pricing_model: 'fixed' | 'variable' | 'percentage' | 'fixed_plus_variable';
  base_amount: DbBigInt; // stored in cents
  percentage_rate: DbNumeric | null; // e.g. 5.5 for 5.5%
  status: ContractStatus;
  pause_started_at: string | null;
  pause_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalItem {
  id: string;
  organization_id: string;
  contract_id: string;
  description: string;
  equipment_type: string;
  capacity: string;
  serial_number: string;
  internal_code: string;
  quantity: number;
  unit_amount: DbBigInt; // stored in cents
  status: RentalItemStatus;
  future_inventory_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingCycle {
  id: string;
  organization_id: string;
  contract_id: string;
  sequence_number: number;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  base_amount: DbBigInt; // stored in cents
  discount_amount: DbBigInt; // stored in cents
  surcharge_amount: DbBigInt; // stored in cents
  exemption_amount: DbBigInt; // stored in cents
  total_amount: DbBigInt; // stored in cents
  document_type: 'receipt' | 'nfe' | 'legacy' | 'other';
  document_number: string | null;
  status: BillingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type BillingLineKind = 'recurring' | 'damage' | 'discount' | 'surcharge';

export interface BillingLine {
  id: string;
  organization_id: string;
  billing_cycle_id: string;
  rental_item_id: string | null;
  description: string;
  quantity: number;
  unit_amount: DbBigInt; // stored in cents
  total_amount: DbBigInt; // stored in cents
  kind: BillingLineKind;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  billing_cycle_id: string;
  paid_at: string;
  amount: DbBigInt; // stored in cents
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inspection {
  id: string;
  organization_id: string;
  contract_id: string;
  rental_item_id: string;
  kind: InspectionKind;
  inspected_at: string;
  responsible_user_id: string;
  condition_notes: string | null;
  accessories: string[] | null;
  existing_damage: string | null;
  return_damage: string | null;
  missing_accessories: string[] | null;
  estimated_cost: DbBigInt | null; // stored in cents
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionPhoto {
  id: string;
  organization_id: string;
  inspection_id: string;
  client_idempotency_key: string;
  storage_path: string;
  thumbnail_path: string | null;
  sync_state: SyncState;
  caption: string | null;
  taken_at: string;
  created_at: string;
  updated_at: string;
}

export interface Signature {
  id: string;
  organization_id: string;
  inspection_id: string;
  client_idempotency_key: string;
  storage_path: string;
  signer_name: string;
  signer_document: string;
  signed_at: string;
  sync_state: SyncState;
  created_at: string;
  updated_at: string;
}

export interface ContractDocument {
  id: string;
  organization_id: string;
  contract_id: string;
  billing_cycle_id: string | null;
  inspection_id: string | null;
  kind: 'order' | 'shipping' | 'contract' | 'receipt_nf' | 'payment_proof' | 'other';
  storage_path: string;
  file_name: string;
  content_type: string;
  created_by: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  organization_id: string;
  actor_user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  organization_id: string;
  file_name: string;
  checksum: string;
  status: 'pending' | 'success' | 'failed';
  summary: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

export interface ImportRow {
  id: string;
  batch_id: string;
  source_file: string;
  source_sheet: string;
  source_row: number;
  entity_type: string;
  source_key: string;
  status: 'imported' | 'skipped' | 'failed';
  errors: Record<string, unknown> | null;
  imported_entity_id: string | null;
  created_at: string;
}
