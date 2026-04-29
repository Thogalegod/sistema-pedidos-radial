export type Priority = 'Baixa' | 'Normal' | 'Alta';
export type OrderStatus = 'Ação Pendente' | 'Aguardando Cliente' | 'Prazo Concessionária' | 'Concluído';
export type TeamMember = 'Thomás' | 'Roberto' | 'Katlyn';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  assignee?: TeamMember;
  dueDate?: string; // ISO format YYYY-MM-DD
  completedAt?: string; // ISO timestamp
}

export interface Atividade {
  id: string;
  descricao: string;
  usuario: string;
  criado_em: string;
}

export interface Anexo {
  id: string;
  pedido_id: string;
  nome_arquivo: string;
  legenda?: string;
  url: string;
  tipo: string;
  criado_em: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  title: string;
  client: string;
  address: string;
  priority: Priority;
  status: OrderStatus;
  assignee?: TeamMember;
  dueDate?: string; // ISO date string e.g. "2026-05-10"
  tasks: Task[];
  atividades?: Atividade[];
  anexos?: Anexo[];
  createdAt: string;
}
