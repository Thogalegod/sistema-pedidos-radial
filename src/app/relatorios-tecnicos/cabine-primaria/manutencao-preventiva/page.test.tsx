'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ManutencaoPreventivaCabinePage from './page';
import toast from 'react-hot-toast';
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
  createChaveSeccionadoraCabine,
  createTransformadorCabine,
  deleteCabinePrimaria,
  deleteManutencaoPreventiva,
  createParaRaiosCabine,
  createTcTpCabine,
  createCaboMediaTensaoCabine,
  createAterramentoCabine,
  listDisjuntoresCabine,
  listEquipamentosComplementaresCabine,
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
  createChaveSeccionadoraCabine: vi.fn(),
  createTransformadorCabine: vi.fn(),
  deleteCabinePrimaria: vi.fn(),
  deleteManutencaoPreventiva: vi.fn(),
  createParaRaiosCabine: vi.fn(),
  createTcTpCabine: vi.fn(),
  createCaboMediaTensaoCabine: vi.fn(),
  createAterramentoCabine: vi.fn(),
  listDisjuntoresCabine: vi.fn(),
  listEquipamentosComplementaresCabine: vi.fn(),
  listCabineEquipamentos: vi.fn(),
  listCabinesBySite: vi.fn(),
  listManutencoesPreventivasByCabine: vi.fn(),
}));

const customer = {
  id: '00000000-0000-4000-8000-000000000001',
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
  id: '00000000-0000-4000-8000-000000000002',
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
  id: '00000000-0000-4000-8000-000000000003',
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
  id: '00000000-0000-4000-8000-000000000004',
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
  id: '00000000-0000-4000-8000-000000000005',
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

const equipamentosComplementares = {
  chave_seccionadora: {
    id: '00000000-0000-4000-8000-000000000006',
    organization_id: 'org-1',
    cabine_id: cabine.id,
    tipo: 'chave_seccionadora' as const,
    tag: 'CH-QA',
    descricao: null,
    fabricante: 'Fabricante CH',
    numero_serie: null,
    potencia_kva: null,
    status: 'ativo' as const,
    dados_tecnicos: { modelo: 'M-CH' },
    created_by: 'user-1',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  para_raios: {
    id: '00000000-0000-4000-8000-000000000007',
    organization_id: 'org-1',
    cabine_id: cabine.id,
    tipo: 'para_raios' as const,
    tag: 'PR-QA',
    descricao: null,
    fabricante: 'Fabricante PR',
    numero_serie: null,
    potencia_kva: null,
    status: 'ativo' as const,
    dados_tecnicos: { modelo: 'M-PR' },
    created_by: 'user-1',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  tc_tp: {
    id: '00000000-0000-4000-8000-000000000008',
    organization_id: 'org-1',
    cabine_id: cabine.id,
    tipo: 'tc_tp' as const,
    tag: 'TC-QA',
    descricao: null,
    fabricante: 'Fabricante TC',
    numero_serie: null,
    potencia_kva: null,
    status: 'ativo' as const,
    dados_tecnicos: { tipoInstrumento: 'TC', relacao: '100/5' },
    created_by: 'user-1',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  cabo_media_tensao: {
    id: '00000000-0000-4000-8000-000000000009',
    organization_id: 'org-1',
    cabine_id: cabine.id,
    tipo: 'cabo_media_tensao' as const,
    tag: 'CB-QA',
    descricao: null,
    fabricante: null,
    numero_serie: null,
    potencia_kva: null,
    status: 'ativo' as const,
    dados_tecnicos: { origem: 'Cubiculo A', destino: 'TR-01' },
    created_by: 'user-1',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  aterramento: {
    id: '00000000-0000-4000-8000-000000000010',
    organization_id: 'org-1',
    cabine_id: cabine.id,
    tipo: 'aterramento' as const,
    tag: 'AT-QA',
    descricao: null,
    fabricante: null,
    numero_serie: null,
    potencia_kva: null,
    status: 'ativo' as const,
    dados_tecnicos: { local: 'Malha principal', tipoAterramento: 'Malha' },
    created_by: 'user-1',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
};

const manutencao = {
  id: '00000000-0000-4000-8000-000000000011',
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
    vi.mocked(listEquipamentosComplementaresCabine).mockImplementation(async (_client, _cabineId, tipo) => [
      equipamentosComplementares[tipo as keyof typeof equipamentosComplementares],
    ]);
    vi.mocked(listManutencoesPreventivasByCabine).mockResolvedValue([manutencao]);
    vi.mocked(createCabinePrimaria).mockResolvedValue(cabine);
    vi.mocked(createTransformadorCabine).mockResolvedValue(equipamento);
    vi.mocked(createDisjuntorCabine).mockResolvedValue(disjuntor);
    vi.mocked(createChaveSeccionadoraCabine).mockResolvedValue(equipamentosComplementares.chave_seccionadora);
    vi.mocked(createParaRaiosCabine).mockResolvedValue(equipamentosComplementares.para_raios);
    vi.mocked(createTcTpCabine).mockResolvedValue(equipamentosComplementares.tc_tp);
    vi.mocked(createCaboMediaTensaoCabine).mockResolvedValue(equipamentosComplementares.cabo_media_tensao);
    vi.mocked(createAterramentoCabine).mockResolvedValue(equipamentosComplementares.aterramento);
    vi.mocked(createManutencaoPreventiva).mockResolvedValue(manutencao);
    vi.mocked(deleteManutencaoPreventiva).mockResolvedValue(undefined);
    vi.mocked(deleteCabinePrimaria).mockResolvedValue(undefined);
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
      '/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-disjuntor?manutencaoId=00000000-0000-4000-8000-000000000011&equipamentoId=00000000-0000-4000-8000-000000000005'
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

  it('opens the five remaining sheets with real maintenance and equipment ids', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    const expectedButtons = [
      [/abrir ficha da chave seccionadora/i, 'ficha-chave-seccionadora', '00000000-0000-4000-8000-000000000006'],
      [/abrir ficha de para-raios/i, 'ficha-para-raios', '00000000-0000-4000-8000-000000000007'],
      [/abrir ficha de tc\/tp/i, 'ficha-tc-tp', '00000000-0000-4000-8000-000000000008'],
      [/abrir ficha de cabos de média tensão/i, 'ficha-cabos-media-tensao', '00000000-0000-4000-8000-000000000009'],
      [/abrir ficha de aterramento/i, 'ficha-aterramento', '00000000-0000-4000-8000-000000000010'],
    ] as const;

    for (const [buttonName, route, equipamentoId] of expectedButtons) {
      await waitFor(() => expect(screen.getByRole('button', { name: buttonName })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      expect(pushMock).toHaveBeenLastCalledWith(
        `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/${route}?manutencaoId=00000000-0000-4000-8000-000000000011&equipamentoId=${equipamentoId}`
      );
    }
  });

  it('creates one complementary equipment when its save button is double-clicked', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /salvar chave seccionadora/i })).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('TAG da chave seccionadora'), {
      target: { value: 'CH-02' },
    });
    fireEvent.change(screen.getByPlaceholderText('Fabricante da chave seccionadora'), {
      target: { value: 'Fabricante CH' },
    });
    fireEvent.change(screen.getByPlaceholderText('Modelo da chave seccionadora'), {
      target: { value: 'M-CH' },
    });

    const saveButton = screen.getByRole('button', { name: /salvar chave seccionadora/i });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(createChaveSeccionadoraCabine).toHaveBeenCalledTimes(1));
    expect(createChaveSeccionadoraCabine).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cabine_id: cabine.id,
      tipo: 'chave_seccionadora',
      tag: 'CH-02',
      fabricante: 'Fabricante CH',
      dados_tecnicos: expect.objectContaining({ modelo: 'M-CH' }),
    }));
  });

  it('requires confirmation before deleting the selected maintenance and removes it from the selector', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /excluir manutenção/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /excluir manutenção/i }));

    await waitFor(() => expect(deleteManutencaoPreventiva).toHaveBeenCalledWith(expect.anything(), manutencao.id));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/manutenção e suas fichas serão removidas/i));
    await waitFor(() => expect(getSelects()[5]).toHaveValue(''));
    expect(toast.success).toHaveBeenCalledWith('Manutenção preventiva excluída.');
  });

  it('does not allow cabine deletion while a maintenance is still linked', async () => {
    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(getSelects()[2]).toHaveValue(cabine.id));
    await waitFor(() => expect(getSelects()[5]).toHaveValue(manutencao.id));
    await waitFor(() => expect(screen.getByRole('button', { name: /excluir cabine/i })).toBeDisabled());

    expect(screen.getByText(/exclua as manutenções vinculadas antes de excluir a cabine/i)).toBeInTheDocument();
    expect(deleteCabinePrimaria).not.toHaveBeenCalled();
  });

  it('requires confirmation before deleting a cabine without linked maintenances', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(listManutencoesPreventivasByCabine).mockResolvedValue([]);

    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /excluir cabine/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /excluir cabine/i }));

    await waitFor(() => expect(deleteCabinePrimaria).toHaveBeenCalledWith(expect.anything(), cabine.id));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/cabine e seus equipamentos serão removidos/i));
    await waitFor(() => expect(getSelects()[2]).toHaveValue(''));
    expect(toast.success).toHaveBeenCalledWith('Cabine primária excluída.');
  });

  it('shows an objective message when maintenance deletion fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(deleteManutencaoPreventiva).mockRejectedValue(new Error('RLS bloqueou exclusão'));

    render(<ManutencaoPreventivaCabinePage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /excluir manutenção/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /excluir manutenção/i }));

    await waitFor(() => expect(deleteManutencaoPreventiva).toHaveBeenCalledWith(expect.anything(), manutencao.id));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('RLS bloqueou exclusão'));
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(getSelects()[5]).toHaveValue(manutencao.id));
  });
});
