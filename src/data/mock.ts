import { Order } from '../types';

// The current date in the simulation is 2026-04-29.
// We'll set due dates relative to this to test sorting.

export const initialOrders: Order[] = [
  {
    id: 'ord-001',
    orderNumber: 'PED-1020',
    title: 'Projeto Cabine Primária 1000kVA',
    client: 'Indústria Metalúrgica Atlas',
    address: 'Av. das Nações Unidas, 15000 - São Paulo, SP',
    priority: 'Alta',
    status: 'Ação Pendente',
    assignee: 'Thomás',
    dueDate: '2026-04-29', // Today, High Priority -> Should be 2nd
    createdAt: '2026-04-20',
    tasks: [
      { id: 't1', title: 'Levantamento de Carga', completed: true },
      { id: 't2', title: 'Desenho Unifilar', completed: false },
      { id: 't3', title: 'Memorial Descritivo', completed: false },
    ],
  },
  {
    id: 'ord-002',
    orderNumber: 'PED-1021',
    title: 'Aprovação de Projeto na Enel SP',
    client: 'Condomínio Residencial Parque das Árvores',
    address: 'Rua das Figueiras, 45 - Guarulhos, SP',
    priority: 'Normal',
    status: 'Prazo Concessionária',
    dueDate: '2026-05-15', // Future -> Should be 4th
    createdAt: '2026-04-10',
    tasks: [
      { id: 't1', title: 'Protocolar projeto físico', completed: true },
      { id: 't2', title: 'Aguardar análise (30 dias)', completed: false },
    ],
  },
  {
    id: 'ord-003',
    orderNumber: 'PED-1022',
    title: 'Instalação de Rede Aérea 15kV',
    client: 'Fazenda Boa Esperança',
    address: 'Rodovia SP-332, Km 120 - Campinas, SP',
    priority: 'Alta',
    status: 'Ação Pendente',
    assignee: 'Equipe de Campo',
    dueDate: '2026-04-25', // Overdue! -> Should be 1st
    createdAt: '2026-04-01',
    tasks: [
      { id: 't1', title: 'Locação de Postes', completed: true },
      { id: 't2', title: 'Lançamento de Cabos', completed: false },
      { id: 't3', title: 'Instalação de Transformador', completed: false },
    ],
  },
  {
    id: 'ord-004',
    orderNumber: 'PED-1023',
    title: 'Laudo de SPDA e Aterramento',
    client: 'Shopping Center Norte',
    address: 'Travessa Casalbuono, 120 - São Paulo, SP',
    priority: 'Normal',
    status: 'Aguardando Cliente',
    assignee: 'Thomás',
    dueDate: '2026-05-02', // Normal task, waiting -> Should be 4th
    createdAt: '2026-04-22',
    tasks: [
      { id: 't1', title: 'Medição de Continuidade', completed: true },
      { id: 't2', title: 'Relatório Fotográfico', completed: true },
      { id: 't3', title: 'Aguardando ART assinada pelo cliente', completed: false },
    ],
  },
  {
    id: 'ord-005',
    orderNumber: 'PED-1024',
    title: 'Manutenção Preventiva Subestação',
    client: 'Hospital São Luiz',
    address: 'Rua Doutor Alceu de Campos Rodrigues, 95 - São Paulo, SP',
    priority: 'Normal',
    status: 'Ação Pendente',
    assignee: 'Thomás',
    dueDate: '2026-05-05', // Normal task, pending -> Should be 3rd
    createdAt: '2026-04-28',
    tasks: [
      { id: 't1', title: 'Desligamento programado', completed: false },
      { id: 't2', title: 'Limpeza de contatos', completed: false },
      { id: 't3', title: 'Reaperto de conexões', completed: false },
    ],
  },
];
