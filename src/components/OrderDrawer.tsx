import { Order, Priority, TeamMember, Anexo } from '../types';
import { StatusBadge, cn, memberColor } from './StatusBadge';
import { X, MapPin, Building2, Calendar, CheckSquare, Square, Plus, Trash2, MessageSquare, Paperclip, UploadCloud, Camera, FileText, Image as ImageIcon, ChevronDown, ChevronUp, Mic, Navigation } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useEffect, useState } from 'react';

interface OrderDrawerProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleTask: (orderId: string, taskId: string) => void;
  onChangePriority: (orderId: string, priority: Priority) => void;
  onAddTask: (orderId: string, title: string, assignee: TeamMember, dueDate?: string) => void;
  onDeleteTask: (orderId: string, taskId: string) => void;
  onDeleteOrder: (orderId: string) => void;
  onAddAtividade: (orderId: string, descricao: string) => void;
  onDeleteAtividade: (orderId: string, atividadeId: string) => void;
  onEditOrderField?: (orderId: string, field: 'orderNumber' | 'title' | 'client' | 'address', newValue: string) => Promise<void>;
  onUploadFiles?: (orderId: string, stagedFiles: { file: File, legenda: string }[]) => Promise<void>;
  onDeleteAnexo?: (orderId: string, anexoId: string, url: string) => Promise<void>;
  onEditTaskTitle: (orderId: string, taskId: string, newTitle: string) => Promise<void>;
  onEditTaskDueDate?: (orderId: string, taskId: string, newDueDate: string | undefined) => Promise<void>;
  onAddSubtarefa?: (orderId: string, taskId: string, descricao: string) => Promise<void>;
  onToggleSubtarefa?: (orderId: string, taskId: string, subtaskId: string) => Promise<void>;
  onDeleteSubtarefa?: (orderId: string, taskId: string, subtaskId: string) => Promise<void>;
  onAddComentarioTarefa?: (orderId: string, taskId: string, texto: string) => Promise<void>;
  onDeleteComentarioTarefa?: (orderId: string, taskId: string, comentarioId: string) => Promise<void>;
  today?: Date;
  currentUser: TeamMember;
}

export function OrderDrawer({ order, isOpen, onClose, onToggleTask, onChangePriority, onAddTask, onEditTaskTitle, onEditTaskDueDate, onEditOrderField, onDeleteTask, onDeleteOrder, onAddAtividade, onDeleteAtividade, onUploadFiles, onDeleteAnexo, onAddSubtarefa, onToggleSubtarefa, onDeleteSubtarefa, onAddComentarioTarefa, onDeleteComentarioTarefa, today = new Date('2026-04-29'), currentUser }: OrderDrawerProps) {
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState<TeamMember>('Thomás');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newAtividade, setNewAtividade] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDueDateId, setEditingTaskDueDateId] = useState<string | null>(null);
  const [editingTaskDueDateValue, setEditingTaskDueDateValue] = useState('');
  
  const [stagedFiles, setStagedFiles] = useState<{ file: File, legenda: string }[]>([]);
  
  const [editingOrderField, setEditingOrderField] = useState<'orderNumber' | 'title' | 'client' | 'address' | null>(null);
  const [editingOrderValue, setEditingOrderValue] = useState('');

  const [expandedTasks, setExpandedTasks] = useState<string[]>([]);
  const [newSubtarefaText, setNewSubtarefaText] = useState<{ [taskId: string]: string }>({});
  const [newComentarioText, setNewComentarioText] = useState<{ [taskId: string]: string }>({});
  const [isRecording, setIsRecording] = useState<{ [taskId: string]: boolean }>({});

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
  };

  const startVoiceInput = (taskId: string) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Seu navegador não suporta reconhecimento de voz.');
      return;
    }
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(prev => ({ ...prev, [taskId]: true }));
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewComentarioText(prev => ({
        ...prev,
        [taskId]: (prev[taskId] ? prev[taskId] + ' ' : '') + transcript
      }));
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(prev => ({ ...prev, [taskId]: false }));
    };

    recognition.onend = () => {
      setIsRecording(prev => ({ ...prev, [taskId]: false }));
    };

    recognition.start();
  };

  // Reset input when order changes
  useEffect(() => {
    setNewTaskTitle('');
    setNewTaskDueDate('');
    setNewAtividade('');
    setIsDeleting(false);
    setStagedFiles([]);
    setEditingOrderField(null);
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
                {currentUser === 'Thomás' && (
                  <button 
                    onClick={() => setIsDeleting(true)}
                    className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
                    title="Deletar pedido"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
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
                  {editingOrderField === 'orderNumber' ? (
                    <input
                      type="text"
                      value={editingOrderValue}
                      onChange={(e) => setEditingOrderValue(e.target.value)}
                      onBlur={() => {
                        if (editingOrderValue.trim() && editingOrderValue !== order.orderNumber && onEditOrderField) {
                          onEditOrderField(order.id, 'orderNumber', editingOrderValue.trim());
                        }
                        setEditingOrderField(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setEditingOrderField(null);
                      }}
                      autoFocus
                      className="text-xs font-medium tracking-wide uppercase border-b border-blue-500 focus:outline-none bg-transparent w-32"
                    />
                  ) : (
                    <span 
                      className="text-xs text-gray-500 font-medium tracking-wide uppercase cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => { setEditingOrderField('orderNumber'); setEditingOrderValue(order.orderNumber); }}
                      title="Editar ID"
                    >
                      ID: {order.orderNumber}
                    </span>
                  )}
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
                {editingOrderField === 'title' ? (
                  <textarea
                    value={editingOrderValue}
                    onChange={(e) => setEditingOrderValue(e.target.value)}
                    onBlur={() => {
                      if (editingOrderValue.trim() && editingOrderValue !== order.title && onEditOrderField) {
                        onEditOrderField(order.id, 'title', editingOrderValue.trim());
                      }
                      setEditingOrderField(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Escape') setEditingOrderField(null);
                    }}
                    autoFocus
                    rows={2}
                    className="w-full text-2xl font-bold text-gray-900 leading-tight border-b-2 border-blue-500 focus:outline-none bg-transparent resize-none overflow-hidden"
                  />
                ) : (
                  <h1 
                    className="text-2xl font-bold text-gray-900 leading-tight cursor-pointer hover:text-blue-600 transition-colors"
                    onClick={() => { setEditingOrderField('title'); setEditingOrderValue(order.title); }}
                    title="Editar Título do Projeto"
                  >
                    {order.title}
                  </h1>
                )}

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
                      {editingOrderField === 'client' ? (
                        <input
                          type="text"
                          value={editingOrderValue}
                          onChange={(e) => setEditingOrderValue(e.target.value)}
                          onBlur={() => {
                            if (editingOrderValue.trim() && editingOrderValue !== order.client && onEditOrderField) {
                              onEditOrderField(order.id, 'client', editingOrderValue.trim());
                            }
                            setEditingOrderField(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditingOrderField(null);
                          }}
                          autoFocus
                          className="w-full text-sm font-medium text-gray-900 border-b border-blue-500 focus:outline-none bg-transparent"
                        />
                      ) : (
                        <p 
                          className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => { setEditingOrderField('client'); setEditingOrderValue(order.client); }}
                          title="Editar Cliente"
                        >
                          {order.client}
                        </p>
                      )}
                    </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-medium mb-0.5">Endereço da Obra</p>
                      {editingOrderField === 'address' ? (
                        <input
                          type="text"
                          value={editingOrderValue}
                          onChange={(e) => setEditingOrderValue(e.target.value)}
                          onBlur={() => {
                            if (editingOrderValue.trim() && editingOrderValue !== order.address && onEditOrderField) {
                              onEditOrderField(order.id, 'address', editingOrderValue.trim());
                            }
                            setEditingOrderField(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditingOrderField(null);
                          }}
                          autoFocus
                          className="w-full text-sm font-medium text-gray-900 border-b border-blue-500 focus:outline-none bg-transparent"
                        />
                      ) : (
                        <p 
                          className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => { setEditingOrderField('address'); setEditingOrderValue(order.address); }}
                          title="Editar Endereço"
                        >
                          {order.address}
                        </p>
                      )}
                      {/* Botões de navegação */}
                      {order.address && (
                        <div className="flex items-center gap-2 mt-2">
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
                            title="Abrir no Google Maps"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Google Maps
                          </a>
                          <a
                            href={`https://waze.com/ul?q=${encodeURIComponent(order.address)}&navigate=yes`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-lg transition-colors border border-sky-200"
                            title="Abrir no Waze"
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            Waze
                          </a>
                        </div>
                      )}
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
                  {order.tasks.map(task => {
                    const isExpanded = expandedTasks.includes(task.id);
                    const subtasksTotal = task.subtarefas?.length || 0;
                    const subtasksCompleted = task.subtarefas?.filter(s => s.concluida).length || 0;
                    return (
                    <div key={task.id} className="flex flex-col gap-1">
                      <div 
                        className={cn(
                          "group flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                          task.completed ? "bg-gray-50 border-gray-200" : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50/30",
                          isExpanded && "border-blue-300 bg-blue-50/10"
                        )}
                        onClick={(e) => {
                          // Prevent toggling accordion when clicking interactive inner elements
                          const target = e.target as HTMLElement;
                          if (target.closest('.no-accordion') || target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'button') {
                            return;
                          }
                          toggleTaskExpanded(task.id);
                        }}
                      >
                        <div className="flex items-start gap-3 flex-1 no-accordion" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="sr-only"
                            checked={task.completed}
                            onChange={() => onToggleTask(order.id, task.id)}
                          />
                          <div className="mt-0.5 flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); onToggleTask(order.id, task.id); }}>
                            {task.completed ? (
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-300" />
                            )}
                          </div>
                          <div className="flex flex-col flex-1">
                            {editingTaskId === task.id ? (
                              <input
                                type="text"
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                onBlur={() => {
                                  if (editingTaskTitle.trim() && editingTaskTitle !== task.title) {
                                    onEditTaskTitle(order.id, task.id, editingTaskTitle.trim());
                                  }
                                  setEditingTaskId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setEditingTaskId(null);
                                  }
                                }}
                                autoFocus
                                className="w-full text-sm font-medium text-gray-900 border-b border-blue-500 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span 
                                  className={cn(
                                    "text-sm font-medium transition-colors hover:text-blue-600 cursor-text",
                                    task.completed ? "text-gray-400 line-through" : "text-gray-700"
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditingTaskId(task.id);
                                    setEditingTaskTitle(task.title);
                                  }}
                                  title="Clique para editar"
                                >
                                  {task.title}
                                </span>
                                {subtasksTotal > 0 && (
                                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                                    {subtasksCompleted}/{subtasksTotal}
                                  </span>
                                )}
                              </div>
                            )}
                            {task.assignee && (
                              <span className={cn(
                                "text-[10px] uppercase font-bold tracking-wider mt-1 px-2 py-0.5 rounded-full w-fit",
                                memberColor(task.assignee).badge
                              )}>
                                {task.assignee}
                              </span>
                            )}
                            {editingTaskDueDateId === task.id ? (
                              <input
                                type="date"
                                value={editingTaskDueDateValue}
                                onChange={(e) => setEditingTaskDueDateValue(e.target.value)}
                                onBlur={() => {
                                  if (onEditTaskDueDate) {
                                    onEditTaskDueDate(order.id, task.id, editingTaskDueDateValue || undefined);
                                  }
                                  setEditingTaskDueDateId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setEditingTaskDueDateId(null);
                                  }
                                }}
                                autoFocus
                                className="mt-1 text-xs px-2 py-0.5 border-b border-blue-500 focus:outline-none bg-transparent"
                              />
                            ) : !task.completed && (
                              <span 
                                className={cn(
                                  "text-[10px] uppercase font-bold tracking-wider mt-1 px-1.5 py-0.5 rounded-full w-fit cursor-pointer hover:bg-gray-200 transition-colors",
                                  task.dueDate 
                                    ? (new Date(`${task.dueDate}T00:00:00`) < new Date(today.toISOString().split('T')[0] + 'T00:00:00')
                                      ? "bg-red-100 text-red-600 animate-pulse border border-red-200"
                                      : task.dueDate === today.toISOString().split('T')[0]
                                      ? "bg-orange-100 text-orange-600 border border-orange-200"
                                      : "text-gray-500 bg-gray-100")
                                    : "text-gray-400 bg-gray-50 border border-dashed border-gray-200"
                                )}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingTaskDueDateId(task.id);
                                  setEditingTaskDueDateValue(task.dueDate || '');
                                }}
                                title="Clique para editar o prazo"
                              >
                                {task.dueDate 
                                  ? (new Date(`${task.dueDate}T00:00:00`) < new Date(today.toISOString().split('T')[0] + 'T00:00:00') 
                                    ? 'Vencido: ' 
                                    : task.dueDate === today.toISOString().split('T')[0] 
                                    ? 'Vence Hoje' 
                                    : 'Prazo: ') + (task.dueDate !== today.toISOString().split('T')[0] ? format(parseISO(task.dueDate), "dd/MM/yyyy", { locale: ptBR }) : '')
                                  : '+ Adicionar Prazo'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 no-accordion" onClick={(e) => e.stopPropagation()}>
                          {currentUser === 'Thomás' && (
                            <button 
                              onClick={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation();
                                if (window.confirm('Deseja excluir esta tarefa permanentemente?')) {
                                  onDeleteTask(order.id, task.id); 
                                }
                              }}
                              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                              title="Deletar tarefa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleTaskExpanded(task.id); }}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex-shrink-0"
                          >
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Panel */}
                      {isExpanded && (
                        <div className="pl-11 pr-3 pb-3 space-y-4">
                          {/* Subtasks */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Subtarefas</h4>
                            {task.subtarefas?.map(sub => (
                              <div key={sub.id} className="flex items-center justify-between group">
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    className="sr-only"
                                    checked={sub.concluida}
                                    onChange={() => onToggleSubtarefa && onToggleSubtarefa(order.id, task.id, sub.id)}
                                  />
                                  <div className="flex-shrink-0">
                                    {sub.concluida ? (
                                      <CheckSquare className="w-4 h-4 text-blue-500" />
                                    ) : (
                                      <Square className="w-4 h-4 text-gray-300" />
                                    )}
                                  </div>
                                  <span className={cn("text-xs transition-colors", sub.concluida ? "text-gray-400 line-through" : "text-gray-700")}>
                                    {sub.descricao}
                                  </span>
                                </label>
                                <button
                                  onClick={() => onDeleteSubtarefa && onDeleteSubtarefa(order.id, task.id, sub.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <form 
                              onSubmit={(e) => {
                                e.preventDefault();
                                const val = newSubtarefaText[task.id]?.trim();
                                if (val && onAddSubtarefa) {
                                  onAddSubtarefa(order.id, task.id, val);
                                  setNewSubtarefaText(prev => ({ ...prev, [task.id]: '' }));
                                }
                              }}
                              className="flex items-center gap-2 mt-2"
                            >
                              <button type="submit" className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gray-100 hover:bg-blue-100 rounded-md transition-colors text-gray-400 hover:text-blue-600">
                                <Plus className="w-3 h-3" />
                              </button>
                              <input 
                                type="text"
                                value={newSubtarefaText[task.id] || ''}
                                onChange={e => setNewSubtarefaText(prev => ({ ...prev, [task.id]: e.target.value }))}
                                placeholder="Nova subtarefa..."
                                className="flex-1 text-xs bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none pb-0.5"
                              />
                            </form>
                          </div>

                          {/* Field Notes */}
                          <div className="space-y-2 pt-3 border-t border-gray-100">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notas de Campo</h4>
                            
                            <div className="space-y-2">
                              {task.comentarios?.map(com => (
                                <div key={com.id} className="bg-yellow-50/50 p-2 rounded-md border border-yellow-100 relative group">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", memberColor(com.usuario).badge)}>{com.usuario}</span>
                                    <span className="text-[10px] text-yellow-600/70">
                                      {format(parseISO(com.criado_em), "dd/MM HH:mm", { locale: ptBR })}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-700">{com.texto}</p>
                                  {currentUser === 'Thomás' && (
                                    <button
                                      onClick={() => onDeleteComentarioTarefa && onDeleteComentarioTarefa(order.id, task.id, com.id)}
                                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-yellow-600 hover:text-red-500 transition-all bg-yellow-50 rounded-md"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const val = newComentarioText[task.id]?.trim();
                                if (val && onAddComentarioTarefa) {
                                  onAddComentarioTarefa(order.id, task.id, val);
                                  setNewComentarioText(prev => ({ ...prev, [task.id]: '' }));
                                }
                              }}
                              className="flex flex-col gap-2 mt-2 relative"
                            >
                              <div className="relative">
                                <textarea
                                  value={newComentarioText[task.id] || ''}
                                  onChange={e => setNewComentarioText(prev => ({ ...prev, [task.id]: e.target.value }))}
                                  placeholder="Anotações, observações..."
                                  rows={2}
                                  className="w-full pl-3 pr-10 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isRecording[task.id]) {
                                      // @ts-ignore
                                      // We can't stop it directly without the recognition instance reference, but it will auto-stop when speech ends.
                                      // Ideally we store the instance, but for now we rely on auto-end or toggle.
                                    } else {
                                      startVoiceInput(task.id);
                                    }
                                  }}
                                  className={cn(
                                    "absolute right-2 top-2 p-1.5 rounded-md transition-colors",
                                    isRecording[task.id] ? "text-red-500 bg-red-50 animate-pulse" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                                  )}
                                  title="Digitação por voz"
                                >
                                  <Mic className="w-4 h-4" />
                                </button>
                              </div>
                              <button
                                type="submit"
                                disabled={!newComentarioText[task.id]?.trim()}
                                className="self-end px-3 py-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 text-xs font-semibold rounded-md transition-colors disabled:opacity-50"
                              >
                                Salvar Nota
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  )})}
                  
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newTaskTitle.trim()) return;
                      onAddTask(order.id, newTaskTitle.trim(), newTaskAssignee, newTaskDueDate || undefined);
                      setNewTaskTitle('');
                      setNewTaskDueDate('');
                    }} 
                    className="flex items-center gap-1.5 mt-3 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-200"
                  >
                    <input 
                      type="text" 
                      placeholder="Nova tarefa..." 
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value as TeamMember)}
                      className="w-24 px-1.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-blue-500 transition-all text-gray-600 flex-shrink-0"
                      title="Responsável"
                    >
                      <option value="Thomás">Thomás</option>
                      <option value="Roberto">Roberto</option>
                      <option value="Katlyn">Katlyn</option>
                      <option value="Equipe de Campo">Equipe de Campo</option>
                    </select>
                    <input 
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-28 px-1.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:border-blue-500 transition-all text-gray-600 flex-shrink-0"
                      title="Prazo (Opcional)"
                    />
                    <button 
                      type="submit"
                      disabled={!newTaskTitle.trim()}
                      className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
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
                      <div key={atividade.id} className="group bg-purple-50/50 border border-purple-100 rounded-lg p-3 relative">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-purple-700">{atividade.usuario}</span>
                          <span className="text-xs text-purple-400">
                            {format(parseISO(atividade.criado_em), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 pr-6">{atividade.descricao}</p>
                        {currentUser === 'Thomás' && (
                          <button 
                            onClick={() => {
                              if (window.confirm('Deseja excluir este registro permanentemente?')) {
                                onDeleteAtividade(order.id, atividade.id);
                              }
                            }}
                            className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                            title="Deletar registro"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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

              {/* Documentos e Fotos */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-blue-600" />
                  Documentos e Fotos
                </h3>

                <div className="flex gap-2 mb-4">
                  <label className="flex-1 flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer group">
                    <input 
                      type="file" 
                      className="sr-only" 
                      multiple 
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const newFiles = Array.from(e.target.files).map(file => ({ file, legenda: '' }));
                          setStagedFiles(prev => [...prev, ...newFiles]);
                          e.target.value = ''; // reset input
                        }
                      }}
                    />
                    <UploadCloud className="w-6 h-6 text-gray-400 group-hover:text-blue-500 mb-1" />
                    <span className="text-xs font-semibold text-gray-600">Anexar Arquivos</span>
                  </label>
                  
                  <label className="flex-1 flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer group">
                    <input 
                      type="file" 
                      className="sr-only" 
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          const newFiles = Array.from(e.target.files).map(file => ({ file, legenda: '' }));
                          setStagedFiles(prev => [...prev, ...newFiles]);
                          e.target.value = '';
                        }
                      }}
                    />
                    <Camera className="w-6 h-6 text-gray-400 group-hover:text-blue-500 mb-1" />
                    <span className="text-xs font-semibold text-gray-600">Tirar Foto</span>
                  </label>
                </div>

                {/* Staging Area for new files */}
                {stagedFiles.length > 0 && (
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-3 mb-4">
                    <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider">Arquivos para Envio</h4>
                    {stagedFiles.map((staged, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                        <div className="flex items-center gap-2 flex-1 overflow-hidden">
                          {staged.file.type.includes('pdf') ? <FileText className="w-4 h-4 text-red-500 flex-shrink-0" /> : <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                          <span className="text-xs font-medium text-gray-600 truncate">{staged.file.name}</span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input 
                            type="text"
                            placeholder="Legenda (ex: Fundação...)"
                            value={staged.legenda}
                            onChange={(e) => {
                              const newArr = [...stagedFiles];
                              newArr[idx].legenda = e.target.value;
                              setStagedFiles(newArr);
                            }}
                            className="flex-1 sm:w-48 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                          />
                          <button 
                            onClick={() => setStagedFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end pt-2">
                      <button 
                        onClick={() => {
                          if (onUploadFiles) {
                            onUploadFiles(order.id, stagedFiles);
                            setStagedFiles([]);
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        Enviar {stagedFiles.length} arquivo(s)
                      </button>
                    </div>
                  </div>
                )}

                {order.anexos && order.anexos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {order.anexos.map(anexo => {
                      const isPdf = anexo.tipo.includes('pdf');
                      return (
                        <div key={anexo.id} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex flex-col">
                          <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="block w-full aspect-square relative">
                            {isPdf ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-white">
                                <FileText className="w-10 h-10 text-red-500 mb-2" />
                                <span className="text-[10px] font-medium text-gray-600 text-center truncate w-full px-2">{anexo.nome_arquivo}</span>
                              </div>
                            ) : (
                              <img src={anexo.url} alt={anexo.nome_arquivo} className="absolute inset-0 w-full h-full object-cover" />
                            )}
                          </a>
                          {anexo.legenda && (
                            <div className="p-2 bg-white border-t border-gray-100 flex-1 flex items-center">
                              <p className="text-xs font-medium text-gray-700 line-clamp-2">{anexo.legenda}</p>
                            </div>
                          )}
                          
                          {currentUser === 'Thomás' && onDeleteAnexo && (
                            <button 
                              onClick={(e) => {
                                e.preventDefault();
                                if (window.confirm('Deseja excluir este anexo permanentemente?')) {
                                  onDeleteAnexo(order.id, anexo.id, anexo.url);
                                }
                              }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black/50 hover:bg-red-600 text-white rounded-full transition-colors shadow-sm z-10 backdrop-blur-sm"
                              title="Excluir anexo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Nenhum anexo salvo.</p>
                )}
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
