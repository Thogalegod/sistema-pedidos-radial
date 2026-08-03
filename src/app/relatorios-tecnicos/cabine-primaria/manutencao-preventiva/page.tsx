'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  History,
  Layers3,
  Plus,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import {
  createSupabaseContractsLocacoesMutationClient,
  createCustomer,
  type ContractsLocacoesMutationClient,
} from '@/lib/contratos-locacoes/mutations';
import {
  createSupabaseContractsLocacoesReadClient,
  getCustomer,
  listCustomers,
  type ContractsLocacoesReadClient,
  type CustomerListItem,
} from '@/lib/contratos-locacoes/queries';
import type { CustomerSite } from '@/lib/contratos-locacoes/types';
import {
  buildFichaTransformadorSearchParams,
} from '@/lib/manutencao-preventiva/ficha-transformador';
import {
  buildFichaDisjuntorSearchParams,
} from '@/lib/manutencao-preventiva/ficha-disjuntor';
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
import type {
  CabineEquipamento,
  CabinePrimaria,
  ManutencaoPreventiva,
} from '@/lib/manutencao-preventiva/types';

const inputClass = 'w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionClass = 'bg-white p-5 rounded-xl shadow-sm border border-gray-200';

const equipmentItems = [
  { name: 'Transformadores', status: 'Primeira ficha' },
  { name: 'Disjuntores 15 kV', status: 'Em integração' },
  { name: 'Chaves seccionadoras', status: 'Depois' },
  { name: 'Para-raios', status: 'Depois' },
  { name: 'TC / TP', status: 'Depois' },
  { name: 'Cabos de média tensão', status: 'Depois' },
  { name: 'Aterramento', status: 'Depois' },
];

const reportSections = [
  'Capa e dados do cliente',
  'Objetivo e abrangência',
  'Resumo de ocorrências e recomendações',
  'Serviços realizados',
  'Fichas dos equipamentos',
  'Relatório fotográfico das ocorrências',
  'Conclusão e disposições finais',
  'Anexos técnicos',
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentYear() {
  return new Date().getFullYear();
}

function withFixedOrganizationId<T extends { getCurrentOrganizationId(): Promise<string> }>(
  client: T,
  organizationId: string
): T {
  return {
    ...client,
    getCurrentOrganizationId: async () => organizationId,
  } as T;
}

export default function ManutencaoPreventivaCabinePage() {
  const router = useRouter();
  const savingRef = useRef(false);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [cabines, setCabines] = useState<CabinePrimaria[]>([]);
  const [equipamentos, setEquipamentos] = useState<CabineEquipamento[]>([]);
  const [disjuntores, setDisjuntores] = useState<CabineEquipamento[]>([]);
  const [manutencoes, setManutencoes] = useState<ManutencaoPreventiva[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedCabineId, setSelectedCabineId] = useState('');
  const [selectedEquipamentoId, setSelectedEquipamentoId] = useState('');
  const [selectedDisjuntorId, setSelectedDisjuntorId] = useState('');
  const [selectedManutencaoId, setSelectedManutencaoId] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingCabines, setLoadingCabines] = useState(false);
  const [loadingEquipamentos, setLoadingEquipamentos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({
    legal_name: '',
    trade_name: '',
    tax_id: '',
    site_name: '',
    address_line: '',
    number: '',
    district: '',
    city: '',
    state: 'SP',
    postal_code: '',
    contact_name: '',
    contact_email: '',
  });
  const [cabineDraft, setCabineDraft] = useState({
    nome: '',
    identificacao: '',
    tipo: 'convencional',
    observacoes: '',
  });
  const [transformadorDraft, setTransformadorDraft] = useState({
    tag: '',
    descricao: '',
    fabricante: '',
    numero_serie: '',
    potencia_kva: '',
  });
  const [disjuntorDraft, setDisjuntorDraft] = useState({
    tag: '',
    fabricante: '',
    modelo: '',
    numero_serie: '',
  });
  const [manutencaoDraft, setManutencaoDraft] = useState({
    ano_referencia: String(currentYear()),
    data_execucao: todayIsoDate(),
    responsavel_nome: '',
    responsavel_crea: '',
    observacoes: '',
  });

  const selectedEquipamento = useMemo(
    () => equipamentos.find((equipamento) => equipamento.id === selectedEquipamentoId) ?? null,
    [equipamentos, selectedEquipamentoId]
  );
  const selectedManutencao = useMemo(
    () => manutencoes.find((manutencao) => manutencao.id === selectedManutencaoId) ?? null,
    [manutencoes, selectedManutencaoId]
  );
  const selectedDisjuntor = useMemo(
    () => disjuntores.find((disjuntor) => disjuntor.id === selectedDisjuntorId) ?? null,
    [disjuntores, selectedDisjuntorId]
  );
  const fichaHref = useMemo(() => {
    if (!selectedManutencao || !selectedEquipamento) return '';
    if (
      selectedEquipamento.cabine_id !== selectedCabineId
      || selectedManutencao.cabine_id !== selectedCabineId
      || selectedEquipamento.cabine_id !== selectedManutencao.cabine_id
    ) {
      return '';
    }

    return `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-transformador?${buildFichaTransformadorSearchParams({
      manutencaoId: selectedManutencao.id,
      equipamentoId: selectedEquipamento.id,
    })}`;
  }, [selectedCabineId, selectedEquipamento, selectedManutencao]);
  const fichaDisjuntorHref = useMemo(() => {
    if (!selectedManutencao || !selectedDisjuntor) return '';
    if (
      selectedDisjuntor.cabine_id !== selectedCabineId
      || selectedManutencao.cabine_id !== selectedCabineId
      || selectedDisjuntor.cabine_id !== selectedManutencao.cabine_id
    ) {
      return '';
    }

    return `/relatorios-tecnicos/cabine-primaria/manutencao-preventiva/ficha-disjuntor?${buildFichaDisjuntorSearchParams({
      manutencaoId: selectedManutencao.id,
      equipamentoId: selectedDisjuntor.id,
    })}`;
  }, [selectedCabineId, selectedDisjuntor, selectedManutencao]);

  const getStrictOrganizationId = async () => {
    const client = createSupabaseManutencaoPreventivaClient(supabase);
    return client.getCurrentOrganizationId();
  };

  const createScopedContractsReadClient = async (): Promise<ContractsLocacoesReadClient> => {
    const organizationId = await getStrictOrganizationId();
    return withFixedOrganizationId(
      createSupabaseContractsLocacoesReadClient(supabase),
      organizationId
    );
  };

  const createScopedContractsMutationClient = async (): Promise<ContractsLocacoesMutationClient> => {
    const organizationId = await getStrictOrganizationId();
    return withFixedOrganizationId(
      createSupabaseContractsLocacoesMutationClient(supabase),
      organizationId
    );
  };

  const runWithSaving = async (action: () => Promise<void>) => {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
      await action();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const clearFromCabine = () => {
    setEquipamentos([]);
    setDisjuntores([]);
    setManutencoes([]);
    setSelectedEquipamentoId('');
    setSelectedDisjuntorId('');
    setSelectedManutencaoId('');
  };

  const clearFromSite = () => {
    setCabines([]);
    setSelectedCabineId('');
    clearFromCabine();
  };

  const handleCustomerChange = (customerId: string) => {
    if (customerId === selectedCustomerId) return;

    setSelectedCustomerId(customerId);
    setSites([]);
    setSelectedSiteId('');
    clearFromSite();
  };

  const handleSiteChange = (siteId: string) => {
    if (siteId === selectedSiteId) return;

    setSelectedSiteId(siteId);
    clearFromSite();
  };

  const handleCabineChange = (cabineId: string) => {
    if (cabineId === selectedCabineId) return;

    setSelectedCabineId(cabineId);
    clearFromCabine();
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoadingCustomers(true);
      try {
        const readClient = await createScopedContractsReadClient();
        const data = await listCustomers(readClient, { status: 'active' });

        if (!cancelled) {
          setCustomers(data);
          setSelectedCustomerId((current) => current || data[0]?.id || '');
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar clientes.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedCustomerId) {
        setSites([]);
        setSelectedSiteId('');
        return;
      }

      setLoadingSites(true);
      try {
        const readClient = await createScopedContractsReadClient();
        const detail = await getCustomer(readClient, selectedCustomerId);
        const activeSites = detail.sites.filter((site) => site.active);

        if (!cancelled) {
          setSites(activeSites);
          setSelectedSiteId((current) => (
            activeSites.some((site) => site.id === current) ? current : activeSites[0]?.id || ''
          ));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar obras do cliente.');
        }
      } finally {
        if (!cancelled) {
          setLoadingSites(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedSiteId) {
        setCabines([]);
        setSelectedCabineId('');
        return;
      }

      setLoadingCabines(true);
      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const data = await listCabinesBySite(client, selectedSiteId);

        if (!cancelled) {
          setCabines(data);
          setSelectedCabineId((current) => (
            data.some((cabine) => cabine.id === current) ? current : data[0]?.id || ''
          ));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar cabines.');
        }
      } finally {
        if (!cancelled) {
          setLoadingCabines(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedCabineId) {
        setEquipamentos([]);
        setManutencoes([]);
        setSelectedEquipamentoId('');
        setSelectedManutencaoId('');
        return;
      }

      setLoadingEquipamentos(true);
      try {
        const client = createSupabaseManutencaoPreventivaClient(supabase);
        const [equipamentosData, disjuntoresData, manutencoesData] = await Promise.all([
          listCabineEquipamentos(client, selectedCabineId),
          listDisjuntoresCabine(client, selectedCabineId),
          listManutencoesPreventivasByCabine(client, selectedCabineId),
        ]);
        const transformadores = equipamentosData.filter((equipamento) => equipamento.tipo === 'transformador' && equipamento.status === 'ativo');

        if (!cancelled) {
          setEquipamentos(transformadores);
          setDisjuntores(disjuntoresData);
          setManutencoes(manutencoesData);
          setSelectedEquipamentoId((current) => (
            transformadores.some((equipamento) => equipamento.id === current) ? current : transformadores[0]?.id || ''
          ));
          setSelectedDisjuntorId((current) => (
            disjuntoresData.some((disjuntor) => disjuntor.id === current) ? current : disjuntoresData[0]?.id || ''
          ));
          setSelectedManutencaoId((current) => (
            manutencoesData.some((manutencao) => manutencao.id === current) ? current : manutencoesData[0]?.id || ''
          ));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Não foi possível carregar equipamentos e manutenções.');
        }
      } finally {
        if (!cancelled) {
          setLoadingEquipamentos(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedCabineId]);

  const handleCreateCustomer = async () => {
    await runWithSaving(async () => {
      const mutationClient = await createScopedContractsMutationClient();
      const result = await createCustomer(mutationClient, {
        legal_name: quickCustomer.legal_name,
        trade_name: quickCustomer.trade_name,
        tax_id: quickCustomer.tax_id,
        state_registration: null,
        municipal_registration: null,
        notes: null,
        active: true,
        sites: [{
          id: 'site-quick',
          name: quickCustomer.site_name,
          address_line: quickCustomer.address_line,
          number: quickCustomer.number,
          complement: null,
          district: quickCustomer.district,
          city: quickCustomer.city,
          state: quickCustomer.state,
          postal_code: quickCustomer.postal_code,
          notes: null,
          active: true,
        }],
        contacts: [{
          id: 'contact-quick',
          name: quickCustomer.contact_name,
          job_title: null,
          department: null,
          phone: null,
          whatsapp: null,
          email: quickCustomer.contact_email || null,
          site_id: 'site-quick',
          is_primary: true,
          receives_billing: false,
          receives_technical: true,
          notes: null,
        }],
      });
      const readClient = await createScopedContractsReadClient();
      const refreshedCustomers = await listCustomers(readClient, { status: 'active' });

      setCustomers(refreshedCustomers);
      setSites(result.sites);
      setSelectedCustomerId(result.customer.id);
      setSelectedSiteId(result.sites[0]?.id || '');
      setCabines([]);
      setSelectedCabineId('');
      clearFromCabine();
      setQuickCustomer((current) => ({
        ...current,
        legal_name: '',
        trade_name: '',
        tax_id: '',
        site_name: '',
        address_line: '',
        number: '',
        district: '',
        city: '',
        postal_code: '',
        contact_name: '',
        contact_email: '',
      }));
      toast.success('Cliente e obra cadastrados.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível cadastrar cliente e obra.');
    });
  };

  const handleCreateCabine = async () => {
    if (!selectedCustomerId || !selectedSiteId) return;

    await runWithSaving(async () => {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const created = await createCabinePrimaria(client, {
        customer_id: selectedCustomerId,
        site_id: selectedSiteId,
        nome: cabineDraft.nome,
        identificacao: cabineDraft.identificacao,
        tipo: cabineDraft.tipo,
        observacoes: cabineDraft.observacoes,
      });

      setCabines((current) => [...current, created].sort((a, b) => a.nome.localeCompare(b.nome)));
      setSelectedCabineId(created.id);
      clearFromCabine();
      setCabineDraft({ nome: '', identificacao: '', tipo: 'convencional', observacoes: '' });
      toast.success('Cabine primária cadastrada.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível cadastrar a cabine.');
    });
  };

  const handleCreateTransformador = async () => {
    if (!selectedCabineId) return;

    await runWithSaving(async () => {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const created = await createTransformadorCabine(client, {
        cabine_id: selectedCabineId,
        tipo: 'transformador',
        tag: transformadorDraft.tag,
        descricao: transformadorDraft.descricao,
        fabricante: transformadorDraft.fabricante,
        numero_serie: transformadorDraft.numero_serie,
        potencia_kva: transformadorDraft.potencia_kva,
        dados_tecnicos: {},
      });

      setEquipamentos((current) => [...current, created].sort((a, b) => a.tag.localeCompare(b.tag)));
      setSelectedEquipamentoId(created.id);
      setTransformadorDraft({ tag: '', descricao: '', fabricante: '', numero_serie: '', potencia_kva: '' });
      toast.success('Transformador cadastrado.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível cadastrar o transformador.');
    });
  };

  const handleCreateDisjuntor = async () => {
    if (!selectedCabineId) return;

    await runWithSaving(async () => {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const created = await createDisjuntorCabine(client, {
        cabine_id: selectedCabineId,
        tipo: 'disjuntor_15kv',
        tag: disjuntorDraft.tag,
        fabricante: disjuntorDraft.fabricante,
        numero_serie: disjuntorDraft.numero_serie,
        dados_tecnicos: {
          modelo: disjuntorDraft.modelo,
        },
      });

      setDisjuntores((current) => [...current, created].sort((a, b) => a.tag.localeCompare(b.tag)));
      setSelectedDisjuntorId(created.id);
      setDisjuntorDraft({ tag: '', fabricante: '', modelo: '', numero_serie: '' });
      toast.success('Disjuntor 15 kV cadastrado.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível cadastrar o disjuntor.');
    });
  };

  const handleCreateManutencao = async () => {
    if (!selectedCabineId) return;

    await runWithSaving(async () => {
      const client = createSupabaseManutencaoPreventivaClient(supabase);
      const created = await createManutencaoPreventiva(client, {
        cabine_id: selectedCabineId,
        ano_referencia: manutencaoDraft.ano_referencia,
        data_execucao: manutencaoDraft.data_execucao,
        responsavel_nome: manutencaoDraft.responsavel_nome,
        responsavel_crea: manutencaoDraft.responsavel_crea,
        observacoes: manutencaoDraft.observacoes,
      });

      setManutencoes((current) => [created, ...current]);
      setSelectedManutencaoId(created.id);
      toast.success('Manutenção preventiva criada.');
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a manutenção preventiva.');
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/relatorios-tecnicos/cabine-primaria" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            &larr; Voltar à Cabine Primária
          </Link>
          <div className="mt-4">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Manutenção Preventiva Completa</h1>
            <p className="text-gray-500 mt-1">
              Cadastre ou selecione cliente, obra, cabine, transformador e manutenção para abrir a ficha persistida.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Cliente e obra</h2>
                <p className="text-sm text-gray-500">Use a base existente de clientes e obras.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cliente cadastrado</label>
                <select value={selectedCustomerId} onChange={(event) => handleCustomerChange(event.target.value)} className={inputClass}>
                  <option value="">{loadingCustomers ? 'Carregando clientes...' : 'Selecione'}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.legal_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Obra/local</label>
                <select value={selectedSiteId} onChange={(event) => handleSiteChange(event.target.value)} className={inputClass} disabled={!selectedCustomerId || loadingSites}>
                  <option value="">{loadingSites ? 'Carregando obras...' : 'Selecione'}</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} - {site.city}/{site.state}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <FilePlus2 size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-900">Cadastro rápido</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={quickCustomer.legal_name} onChange={(event) => setQuickCustomer((current) => ({ ...current, legal_name: event.target.value }))} placeholder="Razão social" className={inputClass} />
                <input value={quickCustomer.trade_name} onChange={(event) => setQuickCustomer((current) => ({ ...current, trade_name: event.target.value }))} placeholder="Nome fantasia" className={inputClass} />
                <input value={quickCustomer.tax_id} onChange={(event) => setQuickCustomer((current) => ({ ...current, tax_id: event.target.value }))} placeholder="CPF/CNPJ" className={inputClass} />
                <input value={quickCustomer.site_name} onChange={(event) => setQuickCustomer((current) => ({ ...current, site_name: event.target.value }))} placeholder="Nome da obra/local" className={inputClass} />
                <input value={quickCustomer.address_line} onChange={(event) => setQuickCustomer((current) => ({ ...current, address_line: event.target.value }))} placeholder="Endereço" className={inputClass} />
                <input value={quickCustomer.number} onChange={(event) => setQuickCustomer((current) => ({ ...current, number: event.target.value }))} placeholder="Número" className={inputClass} />
                <input value={quickCustomer.district} onChange={(event) => setQuickCustomer((current) => ({ ...current, district: event.target.value }))} placeholder="Bairro" className={inputClass} />
                <input value={quickCustomer.city} onChange={(event) => setQuickCustomer((current) => ({ ...current, city: event.target.value }))} placeholder="Cidade" className={inputClass} />
                <input value={quickCustomer.state} onChange={(event) => setQuickCustomer((current) => ({ ...current, state: event.target.value }))} placeholder="UF" maxLength={2} className={inputClass} />
                <input value={quickCustomer.postal_code} onChange={(event) => setQuickCustomer((current) => ({ ...current, postal_code: event.target.value }))} placeholder="CEP" className={inputClass} />
                <input value={quickCustomer.contact_name} onChange={(event) => setQuickCustomer((current) => ({ ...current, contact_name: event.target.value }))} placeholder="Contato técnico" className={inputClass} />
                <input value={quickCustomer.contact_email} onChange={(event) => setQuickCustomer((current) => ({ ...current, contact_email: event.target.value }))} placeholder="Email do contato" className={inputClass} />
              </div>
              <button type="button" onClick={handleCreateCustomer} disabled={saving} className="mt-3 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
                <Plus size={16} />
                Salvar cliente e obra
              </button>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <Layers3 size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Cabine primária</h2>
                <p className="text-sm text-gray-500">A cabine fica vinculada à obra selecionada.</p>
              </div>
            </div>

            <label className={labelClass}>Cabine cadastrada</label>
            <select value={selectedCabineId} onChange={(event) => handleCabineChange(event.target.value)} className={inputClass} disabled={!selectedSiteId || loadingCabines}>
              <option value="">{loadingCabines ? 'Carregando cabines...' : 'Selecione'}</option>
              {cabines.map((cabine) => (
                <option key={cabine.id} value={cabine.id}>
                  {cabine.nome}{cabine.identificacao ? ` - ${cabine.identificacao}` : ''}
                </option>
              ))}
            </select>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={cabineDraft.nome} onChange={(event) => setCabineDraft((current) => ({ ...current, nome: event.target.value }))} placeholder="Nome da cabine" className={inputClass} />
              <input value={cabineDraft.identificacao} onChange={(event) => setCabineDraft((current) => ({ ...current, identificacao: event.target.value }))} placeholder="Identificação" className={inputClass} />
              <select value={cabineDraft.tipo} onChange={(event) => setCabineDraft((current) => ({ ...current, tipo: event.target.value }))} className={inputClass}>
                <option value="convencional">Convencional</option>
                <option value="simplificada">Simplificada</option>
              </select>
              <input value={cabineDraft.observacoes} onChange={(event) => setCabineDraft((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Observações" className={inputClass} />
            </div>
            <button type="button" onClick={handleCreateCabine} disabled={saving || !selectedCustomerId || !selectedSiteId} className="mt-3 inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
              <Plus size={16} />
              Salvar cabine
            </button>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <Wrench size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Transformador</h2>
                <p className="text-sm text-gray-500">Primeiro equipamento integrado à manutenção preventiva.</p>
              </div>
            </div>

            <label className={labelClass}>Transformador cadastrado</label>
            <select value={selectedEquipamentoId} onChange={(event) => setSelectedEquipamentoId(event.target.value)} className={inputClass} disabled={!selectedCabineId || loadingEquipamentos}>
              <option value="">{loadingEquipamentos ? 'Carregando transformadores...' : 'Selecione'}</option>
              {equipamentos.map((equipamento) => (
                <option key={equipamento.id} value={equipamento.id}>
                  {equipamento.tag}{equipamento.potencia_kva ? ` - ${equipamento.potencia_kva} kVA` : ''}
                </option>
              ))}
            </select>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={transformadorDraft.tag} onChange={(event) => setTransformadorDraft((current) => ({ ...current, tag: event.target.value }))} placeholder="TAG" className={inputClass} />
              <input value={transformadorDraft.potencia_kva} onChange={(event) => setTransformadorDraft((current) => ({ ...current, potencia_kva: event.target.value }))} placeholder="Potência kVA" className={inputClass} />
              <input value={transformadorDraft.numero_serie} onChange={(event) => setTransformadorDraft((current) => ({ ...current, numero_serie: event.target.value }))} placeholder="Nº série" className={inputClass} />
              <input value={transformadorDraft.fabricante} onChange={(event) => setTransformadorDraft((current) => ({ ...current, fabricante: event.target.value }))} placeholder="Fabricante" className={inputClass} />
              <input value={transformadorDraft.descricao} onChange={(event) => setTransformadorDraft((current) => ({ ...current, descricao: event.target.value }))} placeholder="Descrição" className={`${inputClass} md:col-span-2`} />
            </div>
            <button type="button" onClick={handleCreateTransformador} disabled={saving || !selectedCabineId} className="mt-3 inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
              <Plus size={16} />
              Salvar transformador
            </button>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Manutenção preventiva</h2>
                <p className="text-sm text-gray-500">Crie ou selecione a manutenção anual da cabine.</p>
              </div>
            </div>

            <label className={labelClass}>Manutenção cadastrada</label>
            <select value={selectedManutencaoId} onChange={(event) => setSelectedManutencaoId(event.target.value)} className={inputClass} disabled={!selectedCabineId || loadingEquipamentos}>
              <option value="">{loadingEquipamentos ? 'Carregando manutenções...' : 'Selecione'}</option>
              {manutencoes.map((manutencao) => (
                <option key={manutencao.id} value={manutencao.id}>
                  {manutencao.ano_referencia} - {manutencao.data_execucao} - {manutencao.status}
                </option>
              ))}
            </select>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={manutencaoDraft.ano_referencia} onChange={(event) => setManutencaoDraft((current) => ({ ...current, ano_referencia: event.target.value }))} placeholder="Ano" className={inputClass} />
              <input type="date" value={manutencaoDraft.data_execucao} onChange={(event) => setManutencaoDraft((current) => ({ ...current, data_execucao: event.target.value }))} className={inputClass} />
              <input value={manutencaoDraft.responsavel_nome} onChange={(event) => setManutencaoDraft((current) => ({ ...current, responsavel_nome: event.target.value }))} placeholder="Responsável" className={inputClass} />
              <input value={manutencaoDraft.responsavel_crea} onChange={(event) => setManutencaoDraft((current) => ({ ...current, responsavel_crea: event.target.value }))} placeholder="CREA" className={inputClass} />
              <input value={manutencaoDraft.observacoes} onChange={(event) => setManutencaoDraft((current) => ({ ...current, observacoes: event.target.value }))} placeholder="Observações" className={`${inputClass} md:col-span-2`} />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleCreateManutencao} disabled={saving || !selectedCabineId} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
                <Plus size={16} />
                Criar manutenção
              </button>
              <button type="button" onClick={() => fichaHref && router.push(fichaHref)} disabled={!fichaHref || loadingEquipamentos} className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
                Abrir ficha do transformador <ArrowRight size={16} />
              </button>
            </div>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Wrench size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Disjuntor 15 kV</h2>
                <p className="text-sm text-gray-500">Segunda ficha integrada à manutenção preventiva.</p>
              </div>
            </div>

            <label className={labelClass}>Disjuntor cadastrado</label>
            <select value={selectedDisjuntorId} onChange={(event) => setSelectedDisjuntorId(event.target.value)} className={inputClass} disabled={!selectedCabineId || loadingEquipamentos}>
              <option value="">{loadingEquipamentos ? 'Carregando disjuntores...' : 'Selecione'}</option>
              {disjuntores.map((disjuntor) => {
                const modelo = typeof disjuntor.dados_tecnicos.modelo === 'string'
                  ? disjuntor.dados_tecnicos.modelo
                  : '';

                return (
                  <option key={disjuntor.id} value={disjuntor.id}>
                    {disjuntor.tag}{modelo ? ` - ${modelo}` : ''}
                  </option>
                );
              })}
            </select>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={disjuntorDraft.tag} onChange={(event) => setDisjuntorDraft((current) => ({ ...current, tag: event.target.value }))} placeholder="TAG do disjuntor" className={inputClass} />
              <input value={disjuntorDraft.fabricante} onChange={(event) => setDisjuntorDraft((current) => ({ ...current, fabricante: event.target.value }))} placeholder="Fabricante do disjuntor" className={inputClass} />
              <input value={disjuntorDraft.modelo} onChange={(event) => setDisjuntorDraft((current) => ({ ...current, modelo: event.target.value }))} placeholder="Modelo do disjuntor" className={inputClass} />
              <input value={disjuntorDraft.numero_serie} onChange={(event) => setDisjuntorDraft((current) => ({ ...current, numero_serie: event.target.value }))} placeholder="Nº série do disjuntor" className={inputClass} />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleCreateDisjuntor} disabled={saving || !selectedCabineId} className="inline-flex items-center gap-2 bg-purple-700 hover:bg-purple-800 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
                <Plus size={16} />
                Salvar disjuntor
              </button>
              <button type="button" onClick={() => fichaDisjuntorHref && router.push(fichaDisjuntorHref)} disabled={!fichaDisjuntorHref || loadingEquipamentos} className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 text-white px-4 py-2 rounded-md text-sm font-medium">
                Abrir ficha do disjuntor <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                <Wrench size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Equipamentos da cabine</h2>
                <p className="text-sm text-gray-500">Transformador integrado; disjuntor 15 kV em integração local.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {equipmentItems.map((item) => (
                <span
                  key={item.name}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    item.status === 'Primeira ficha'
                      ? 'bg-green-100 text-green-700'
                      : item.status === 'Em integração'
                        ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {item.name}
                </span>
              ))}
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                <RefreshCw size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">IDs do fluxo</h2>
                <p className="text-sm text-gray-500">Os vínculos reais são carregados da persistência.</p>
              </div>
            </div>
            <div className="space-y-2 text-xs text-gray-600 break-all">
              <div><b>customer_id:</b> {selectedCustomerId || '-'}</div>
              <div><b>site_id:</b> {selectedSiteId || '-'}</div>
              <div><b>cabine_id:</b> {selectedCabineId || '-'}</div>
              <div><b>equipamento_id:</b> {selectedEquipamentoId || '-'}</div>
              <div><b>disjuntor_id:</b> {selectedDisjuntorId || '-'}</div>
              <div><b>manutencao_id:</b> {selectedManutencaoId || '-'}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={sectionClass}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Esqueleto do relatório</h2>
                <p className="text-sm text-gray-500">Base para o PDF completo em uma etapa futura.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reportSections.map((section) => (
                <div key={section} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                  {section}
                </div>
              ))}
            </div>
          </div>

          <div className={sectionClass}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center">
                <History size={20} />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-gray-900">Histórico por cabine</h2>
                <p className="text-sm text-gray-500">
                  A lista de manutenções é carregada por `cabine_id`; a ficha do transformador é salva por `manutencao_id` e `equipamento_id`.
                </p>
              </div>
              <CheckCircle2 size={18} className="text-green-600 hidden sm:block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
