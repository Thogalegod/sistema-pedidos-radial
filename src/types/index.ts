export type Priority = 'Baixa' | 'Normal' | 'Alta';
export type OrderStatus = 'Ação Pendente' | 'Aguardando Cliente' | 'Prazo Concessionária' | 'Concluído';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  assignee?: string;
}

export interface Atividade {
  id: string;
  descricao: string;
  usuario: string;
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
  assignee?: string; // e.g. "Thomás"
  dueDate?: string; // ISO date string e.g. "2026-05-10"
  tasks: Task[];
  atividades?: Atividade[];
  createdAt: string;
}
