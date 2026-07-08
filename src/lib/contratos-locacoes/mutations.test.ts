import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomer,
  updateCustomer,
  type ContractsLocacoesMutationClient,
} from './mutations';
import type {
  Customer,
  CustomerContact,
  CustomerSite,
} from './types';

afterEach(() => {
  vi.restoreAllMocks();
});

class FakeMutationClient implements ContractsLocacoesMutationClient {
  constructor(
    private readonly options: {
      failUpsertSites?: string;
      failUpsertContacts?: string;
    } = {}
  ) {}

  public readonly organizationId = 'org-1';
  public insertedCustomer: Omit<Customer, 'id' | 'created_at' | 'updated_at'> | null = null;
  public updatedCustomer: { customerId: string; patch: Partial<Customer> } | null = null;
  public upsertedSites: CustomerSite[] = [];
  public upsertedContacts: CustomerContact[] = [];
  public readonly deletedSiteCalls: Array<{ customerId: string; keepIds: string[] }> = [];
  public readonly deletedContactCalls: Array<{ customerId: string; keepIds: string[] }> = [];
  public readonly callOrder: string[] = [];

  async getCurrentOrganizationId() {
    return this.organizationId;
  }

  async insertCustomer(record: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) {
    this.callOrder.push('insertCustomer');
    this.insertedCustomer = record;
    return {
      id: 'customer-1',
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...record,
    };
  }

  async updateCustomer(customerId: string, patch: Partial<Customer>) {
    this.callOrder.push('updateCustomer');
    this.updatedCustomer = { customerId, patch };
    return {
      id: customerId,
      organization_id: this.organizationId,
      legal_name: 'Atualizado',
      trade_name: 'Atualizado',
      tax_id: null,
      state_registration: null,
      municipal_registration: null,
      notes: null,
      active: true,
      created_at: '2026-07-06T00:00:00.000Z',
      updated_at: '2026-07-06T00:00:00.000Z',
      ...patch,
    };
  }

  async upsertCustomerSites(records: CustomerSite[]) {
    this.callOrder.push('upsertCustomerSites');
    if (this.options.failUpsertSites) {
      throw new Error(this.options.failUpsertSites);
    }

    this.upsertedSites = records;
    return records;
  }

  async upsertCustomerContacts(records: CustomerContact[]) {
    this.callOrder.push('upsertCustomerContacts');
    if (this.options.failUpsertContacts) {
      throw new Error(this.options.failUpsertContacts);
    }

    this.upsertedContacts = records;
    return records;
  }

  async deleteMissingCustomerSites(customerId: string, keepIds: string[]) {
    this.callOrder.push('deleteMissingCustomerSites');
    this.deletedSiteCalls.push({ customerId, keepIds });
  }

  async deleteMissingCustomerContacts(customerId: string, keepIds: string[]) {
    this.callOrder.push('deleteMissingCustomerContacts');
    this.deletedContactCalls.push({ customerId, keepIds });
  }

  async insertContract(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async updateContract(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async upsertRentalItems(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }

  async deleteMissingRentalItems(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
}

describe('customer mutations', () => {
  it('creates a customer with generated UUIDs for new sites and contacts', async () => {
    const client = new FakeMutationClient();
    const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
    randomUuidSpy
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444');

    const result = await createCustomer(client, {
      legal_name: 'Radial Energia LTDA',
      trade_name: 'Radial',
      tax_id: '12.345.678/0001-90',
      state_registration: '',
      municipal_registration: '',
      notes: '',
      active: true,
      sites: [
        {
          id: 'site-local-1',
          name: 'Matriz',
          address_line: 'Rua A',
          number: '100',
          district: 'Centro',
          city: 'Campinas',
          state: 'SP',
          postal_code: '13000-000',
          complement: '',
          notes: '',
          active: true,
        },
        {
          id: 'site-local-2',
          name: 'Filial',
          address_line: 'Rua B',
          number: '200',
          district: 'Bairro',
          city: 'Sorocaba',
          state: 'sp',
          postal_code: '18000-000',
          complement: '',
          notes: '',
          active: true,
        },
      ],
      contacts: [
        {
          id: 'contact-local-1',
          name: 'Ana Financeiro',
          job_title: 'Financeiro',
          department: '',
          phone: '',
          whatsapp: '',
          email: 'financeiro@radial.com',
          site_id: null,
          is_primary: true,
          receives_billing: true,
          receives_technical: false,
          notes: '',
        },
        {
          id: 'contact-local-2',
          name: 'Carlos Obra',
          job_title: 'Obra',
          department: '',
          phone: '',
          whatsapp: '',
          email: 'obra@radial.com',
          site_id: 'site-local-2',
          is_primary: false,
          receives_billing: false,
          receives_technical: true,
          notes: '',
        },
      ],
    });

    expect(result.customer.id).toBe('customer-1');
    expect(client.insertedCustomer?.organization_id).toBe('org-1');
    expect(client.upsertedSites).toHaveLength(2);
    expect(client.upsertedSites[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(client.upsertedSites[1].id).toBe('22222222-2222-4222-8222-222222222222');
    expect(client.upsertedSites[1].organization_id).toBe('org-1');
    expect(client.upsertedContacts[0].id).toBe('33333333-3333-4333-8333-333333333333');
    expect(client.upsertedContacts[1].id).toBe('44444444-4444-4444-8444-444444444444');
    expect(client.upsertedContacts[0].site_id).toBeNull();
    expect(client.upsertedContacts[1].site_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(client.upsertedContacts[1].customer_id).toBe('customer-1');
    expect(client.deletedSiteCalls).toEqual([
      {
        customerId: 'customer-1',
        keepIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
    ]);
    expect(client.deletedContactCalls).toEqual([
      {
        customerId: 'customer-1',
        keepIds: [
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ],
      },
    ]);
    expect(client.callOrder).toEqual([
      'insertCustomer',
      'upsertCustomerSites',
      'upsertCustomerContacts',
      'deleteMissingCustomerSites',
      'deleteMissingCustomerContacts',
    ]);
  });

  it('updates a customer and tracks ids that must be kept', async () => {
    const client = new FakeMutationClient();

    await updateCustomer(client, 'customer-9', {
      legal_name: 'Cliente Atualizado',
      trade_name: '',
      tax_id: '',
      state_registration: '',
      municipal_registration: '',
      notes: '',
      active: true,
      sites: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'Obra Revisada',
          address_line: 'Rua C',
          number: '10',
          district: 'Centro',
          city: 'Jundiai',
          state: 'SP',
          postal_code: '13200-000',
          complement: '',
          notes: '',
          active: true,
        },
      ],
      contacts: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Contato Geral',
          job_title: '',
          department: '',
          phone: '',
          whatsapp: '',
          email: '',
          site_id: null,
          is_primary: true,
          receives_billing: true,
          receives_technical: true,
          notes: '',
        },
      ],
    });

    expect(client.updatedCustomer?.customerId).toBe('customer-9');
    expect(client.deletedSiteCalls).toEqual([
      {
        customerId: 'customer-9',
        keepIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      },
    ]);
    expect(client.deletedContactCalls).toEqual([
      {
        customerId: 'customer-9',
        keepIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      },
    ]);
    expect(client.upsertedSites[0].customer_id).toBe('customer-9');
    expect(client.upsertedContacts[0].organization_id).toBe('org-1');
  });

  it('surfaces relation failures with explicit cleanup after creating the base customer', async () => {
    const client = new FakeMutationClient({
      failUpsertContacts: 'Não foi possível salvar os contatos: invalid input syntax for type uuid',
    });
    const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
    randomUuidSpy
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');

    await expect(() =>
      createCustomer(client, {
        legal_name: 'Cliente QA Manual App Ltda',
        trade_name: 'Cliente QA Manual App',
        tax_id: null,
        state_registration: '',
        municipal_registration: '',
        notes: '',
        active: true,
        sites: [
          {
            id: 'site-local-1',
            name: 'Obra QA Manual App',
            address_line: 'Rua QA',
            number: '10',
            district: 'Centro',
            city: 'Campinas',
            state: 'SP',
            postal_code: '13000-000',
            complement: '',
            notes: '',
            active: true,
          },
        ],
        contacts: [
          {
            id: 'contact-local-1',
            name: 'Contato QA Manual App',
            job_title: '',
            department: '',
            phone: '',
            whatsapp: '',
            email: 'qa@example.com',
            site_id: 'site-local-1',
            is_primary: true,
            receives_billing: true,
            receives_technical: false,
            notes: '',
          },
        ],
      })
    ).rejects.toThrow(/Não foi possível concluir o cadastro completo do cliente/i);

    expect(client.upsertedSites[0].id).toBe('11111111-1111-4111-8111-111111111111');
    expect(client.deletedContactCalls).toEqual([
      {
        customerId: 'customer-1',
        keepIds: [],
      },
    ]);
    expect(client.deletedSiteCalls).toEqual([
      {
        customerId: 'customer-1',
        keepIds: [],
      },
    ]);
    expect(client.callOrder).toEqual([
      'insertCustomer',
      'upsertCustomerSites',
      'upsertCustomerContacts',
      'deleteMissingCustomerContacts',
      'deleteMissingCustomerSites',
    ]);
  });
});
