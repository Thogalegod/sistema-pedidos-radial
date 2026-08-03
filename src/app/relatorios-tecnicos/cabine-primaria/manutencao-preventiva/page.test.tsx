'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ManutencaoPreventivaCabinePage from './page';
import {
  createSupabaseContractsLocacoesReadClient,
  getCustomer,
  listCustomers,
} from '@/lib/contratos-locacoes/queries';
import {
  createCabinePrimaria,
  createDisjuntorCabine,
  createManutencaoPreventiva,
  createSupabaseManutencaoPreventivaClient,
  createTransformadorCabine,
  listDisjuntoresCabine,
  listCabineEquipamentos,
  listCabinesBySite,
  listManutencoesPreventivasByCabine,
} from '@/lib/manutencao-preventiva/queries-mutations';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

vi.mock('@/lib/contratos-locacoes/queries', () => ({
  createSupabaseContractsLocacoesReadClient: vi.fn(),
  getCustomer: vi.fn(),
  listCustomers: vi.fn(),
}));

vi.mock('@/lib/contratos-locacoes/mutations', () => ({
  createSupabaseContractsLocacoesMutationClient: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock('@/lib/manutencao-preventiva/queries-mutations', () => ({
  createCabinePrimaria: vi.fn(),
  createDisjuntorCabine: vi.fn(),
  createManutencaoPreventiva: vi.fn(),
  createSupabaseManutencaoPreventivaClient: vi.fn(),
  createTransformadorCabine: vi.fn(),
  listDisjuntoresCabine: vi.fn(),
  listCabineEquipamentos: vi.fn(),
  listCabinesBySite: vi.fn(),
  listManutencoesPreventivasByCabine: vi.fn(),
}));

const customer = {
  id: 'customer-1',
  organization_id: 'org-1',
  legal_name: 'Cliente QA',
  trade_name: 'QA',
  tax_id: null,
  state_registration: null,
  municipal_registration: null,
  notes: null,
  active: true,
  site_count: 1,
  contact_count: 0,
  cities: ['Campinas'],
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const site = {
  id: 'site-1',
  organization_id: 'org-1',
  customer_id: customer.id,
  name: 'Obra QA',
  address_line: 'Rua A',
  number: '100',
  complement: null,
  district: 'Centro',
  city: 'Campinas',
  state: 'SP',
  postal_code: '13000-000',
  notes: null,
  active: true,
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const cabine = {
  id: 'cabine-1',
  organization_id: 'org-1',
  customer_id: customer.id,
  site_id: site.id,
  nome: 'Cabine QA',
  identificacao: 'CAB-QA',
  tipo: 'convencional' as const,
  status: 'ativa' as const,
  observacoes: null,
  created_by: 'user-1',
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const equipamento = {
  id: 'equipamento-1',
  organization_id: 'org-1',
  cabine_id: cabine.id,
  tipo: 'transformador' as const,
  tag: 'TR-QA',
  descricao: null,
  fabricante: null,
  numero_serie: null,
  potencia_kva: 500,
  status: 'ativo' as const,
  dados_tecnicos: {},
  created_by: 'user-1',
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const disjuntor = {
  id: 'disjuntor-1',
  organization_id: 'org-1',
  cabine_id: cabine.id,
  tipo: 'disjuntor_15kv' as const,
  tag: 'DJ-QA',
  descricao: null,
  fabricante: 'Fabricante QA',
  numero_serie: 'SER-DJ-QA',
  potencia_kva: null,
  status: 'ativo' as const,
  dados_tecnicos: {},
  created_by: 'user-1',
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const manutencao = {
  id: 'manutencao-1',
  organization_id: 'org-1',
  cabine_id: cabine.id,
  ano_referencia: 2026,
  data_execucao: '2026-08-03',
  responsavel_nome: 'Responsavel QA',
  responsavel_crea: 'CREA-QA',
  status: 'rascunho' as const,
  observacoes: null,
  created_by: 'user-1',
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

function getSelects() {
  return Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
}

describe('ManutencaoPreventivaCabinePage', () => {
  beforeEach(() => {
    vi.mocked(createSupabaseContractsLocacoesReadClient).mockReturnValue({
      getCurrentOrganizationId: vi.fn().mockResolvedValue('org-1'),
    } as never);
    vi.mocked(createSupabaseManutencaoPreventivaClient).mockReturnValue({
      getCurrentOrganizationId: vi.fn().mockResolvedValue('org-1'),
    } as never);
    vi.mocked(listCustomers).mockResolvedValue([customer]);
    vi.mocked(getCustomer).mockResolvedValue({
      customer,
      sites: [site],
      contacts: [],
    });
    vi.mocked(listCabinesBySite).mockResolvedValue([cabine]);
    vi.mocked(listCabineEquipamentos).mockResolvedValue([equipamento]);
    vi.mocked(listDisjuntoresCabine).mockResolvedValue([disjuntor]);
    vi.mocked(listManutencoesPreventivasByCabine).mockResolvedValue([manutencao]);
    vi.mocked(createCabinePrimaria).mockResolvedValue(cabine);
    vi.mocked(createTransformadorCabine).mockResolvedValue(equipamento);
    vi.mocked(createDisjuntorCabine).mockResolvedValue(disjuntor);
    vi.mocked(createManutencaoPreventiva).mockResolvedValue(manutencao);
  });

  afterEach(() => {
    vi.clearAllMocks();
    pushMock.mockClear();
    document.body.innerHTML = '';
  });

  it('keeps transformer and maintenance selections when the current cabine is selected again', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(getSelects()[4]).toHaveValue(equipamento.id));
    expect(getSelects()[5]).toHaveValue(manutencao.id);

    fireEvent.change(getSelects()[2], { target: { value: cabine.id } });

    await waitFor(() => expect(getSelects()[4]).toHaveValue(equipamento.id));
    expect(getSelects()[5]).toHaveValue(manutencao.id);
  });

  it('opens the disjuntor sheet with real maintenance and equipment ids', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /abrir ficha do disjuntor/i })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /abrir ficha do disjuntor/i }));

    expect(pushMock).toHaveBeenCalledWith(
      '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-disjuntor?manutencaoId=manutencao-1&equipamentoId=disjuntor-1'
    );
  });

  it('creates one disjuntor when the save button is double-clicked', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /salvar disjuntor/i })).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('TAG do disjuntor'), {
      target: { value: 'DJ-02' },
    });
    fireEvent.change(screen.getByPlaceholderText('Fabricante do disjuntor'), {
      target: { value: 'Fabricante QA' },
    });
    fireEvent.change(screen.getByPlaceholderText('Modelo do disjuntor'), {
      target: { value: '15KV-MOD' },
    });
    fireEvent.change(screen.getByPlaceholderText('Nº série do disjuntor'), {
      target: { value: 'SER-DJ-02' },
    });

    const saveButton = screen.getByRole('button', { name: /salvar disjuntor/i });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(createDisjuntorCabine).toHaveBeenCalledTimes(1));
    expect(createDisjuntorCabine).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cabine_id: cabine.id,
      tipo: 'disjuntor_15kv',
      tag: 'DJ-02',
      fabricante: 'Fabricante QA',
      dados_tecnicos: expect.objectContaining({ modelo: '15KV-MOD' }),
    }));
  });
});
