export type Priority = 'Baixa' | 'Normal' | 'Alta';
export type OrderStatus = import('@/lib/pedidos-tarefas/types').OrderStatusV1;
export type TeamMember = string;

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  assignee?: TeamMember;
  assigneeUserId?: string | null;
  dueDate?: string; // ISO format YYYY-MM-DD
  completedAt?: string; // ISO timestamp
  subtarefas?: Subtarefa[];
  comentarios?: ComentarioTarefa[];
}

export interface Subtarefa {
  id: string;
  tarefa_id: string;
  descricao: string;
  concluida: boolean;
  criado_em: string;
}

export interface ComentarioTarefa {
  id: string;
  tarefa_id: string;
  texto: string;
  usuario: string;
  criado_em: string;
  event_type?: string | null;
}

export interface Atividade {
  id: string;
  descricao: string;
  usuario: string;
  criado_em: string;
  kind?: 'manual' | 'system';
}

export interface Anexo {
  id: string;
  pedido_id: string;
  frente_id?: string | null;
  tarefa_id?: string | null;
  atividade_id?: string | null;
  nome_arquivo: string;
  legenda?: string;
  storage_path: string;
  signed_url?: string;
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
