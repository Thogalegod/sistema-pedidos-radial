import { Order, Priority } from '../types';
import { StatusBadge, cn } from './StatusBadge';
import { X, MapPin, Building2, Calendar, CheckSquare, Square, Plus, Trash2, MessageSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useState } from 'react';

interface OrderDrawerProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleTask: (orderId: string, taskId: string) => void;
  onChangePriority: (orderId: string, priority: Priority) => void;
  onAddTask: (orderId: string, title: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onAddAtividade: (orderId: string, descricao: string) => void;
  today?: Date;
}

export function OrderDrawer({ order, isOpen, onClose, onToggleTask, onChangePriority, onAddTask, onDeleteOrder, onAddAtividade, today = new Date('2026-04-29') }: OrderDrawerProps) {
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newAtividade, setNewAtividade] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset input when order changes
  useEffect(() => {
    setNewTaskTitle('');
    setNewAtividade('');
    setIsDeleting(false);
  }, [order?.id]);
  
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Prevent scroll on body when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        )}
      >
        {order ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Detalhes do Pedido</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsDeleting(true)}
                  className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
                  title="Deletar pedido"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Delete Confirmation */}
            {isDeleting && (
              <div className="bg-red-50 border-b border-red-100 p-4">
                <p className="text-sm text-red-800 font-medium mb-3">
                  Tem certeza que deseja deletar este pedido? Esta ação é irreversível.
                </p>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      onDeleteOrder(order.id);
                      setIsDeleting(false);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md transition-colors shadow-sm"
                  >
                    Sim, deletar
                  </button>
                  <button 
                    onClick={() => setIsDeleting(false)}
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-semibold rounded-md hover:bg-red-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Title & Status section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                    ID: {order.orderNumber}
                  </span>
                  <select 
                    value={order.priority}
                    onChange={(e) => onChangePriority(order.id, e.target.value as Priority)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium border cursor-pointer focus:outline-none appearance-none pr-6 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_4px_center] bg-[length:12px]",
                      order.priority === 'Alta' ? "bg-red-50 text-red-700 border-red-200" :
                      order.priority === 'Normal' ? "bg-gray-50 text-gray-600 border-gray-200" :
                      "bg-green-50 text-green-700 border-green-200"
                    )}
                  >
                    <option value="Baixa">Prioridade Baixa</option>
                    <option value="Normal">Prioridade Normal</option>
                    <option value="Alta">Prioridade Alta</option>
                  </select>
                </div>
                
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                  {order.title}
                </h1>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge order={order} today={today} />
                </div>
              </div>

              {/* Info section */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-100">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-0.5">Cliente</p>
                    <p className="text-sm font-medium text-gray-900">{order.client}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-0.5">Endereço da Obra</p>
                    <p className="text-sm font-medium text-gray-900">{order.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-0.5">Criado em</p>
                    <p className="text-sm font-medium text-gray-900">
                      {format(parseISO(order.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Checklist section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                  Checklist de Tarefas
                </h3>
                
                <div className="space-y-2">
                  {order.tasks.map(task => (
                    <label 
                      key={task.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        task.completed ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/30"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        className="sr-only"
                        checked={task.completed}
                        onChange={() => onToggleTask(order.id, task.id)}
                      />
                      <div className="mt-0.5 flex-shrink-0">
                        {task.completed ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300" />
                        )}
                      </div>
                      <span className={cn(
                        "text-sm font-medium",
                        task.completed ? "text-gray-400 line-through" : "text-gray-700"
                      )}>
                        {task.title}
                      </span>
                    </label>
                  ))}
                  
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newTaskTitle.trim()) return;
                      onAddTask(order.id, newTaskTitle.trim());
                      setNewTaskTitle('');
                    }} 
                    className="flex items-center gap-2 mt-3"
                  >
                    <input 
                      type="text" 
                      placeholder="Nova tarefa..." 
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <button 
                      type="submit"
                      disabled={!newTaskTitle.trim()}
                      className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>

              {/* Atividades / Resumo de Reunião */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                  Histórico e Resumos
                </h3>
                
                <div className="space-y-3">
                  {order.atividades && order.atividades.length > 0 ? (
                    order.atividades.map(atividade => (
                      <div key={atividade.id} className="bg-purple-50/50 border border-purple-100 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-purple-700">{atividade.usuario}</span>
                          <span className="text-xs text-purple-400">
                            {format(parseISO(atividade.criado_em), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{atividade.descricao}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 italic">Nenhum registro ainda.</p>
                  )}
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newAtividade.trim()) return;
                    onAddAtividade(order.id, newAtividade.trim());
                    setNewAtividade('');
                  }} 
                  className="mt-3 flex flex-col gap-2"
                >
                  <textarea 
                    placeholder="Adicionar resumo de reunião ou observação..." 
                    value={newAtividade}
                    onChange={(e) => setNewAtividade(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all resize-none"
                  />
                  <button 
                    type="submit"
                    disabled={!newAtividade.trim()}
                    className="self-end px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Salvar Registro
                  </button>
                </form>
              </div>

            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-gray-100 bg-gray-50">
               <button 
                  onClick={onClose}
                  className="w-full py-2.5 px-4 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
               >
                 Fechar
               </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Carregando...
          </div>
        )}
      </div>
    </>
  );
}
