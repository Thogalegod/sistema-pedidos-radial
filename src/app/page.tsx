'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Order, Priority, TeamMember } from '../types';
import { sortOrders } from '../lib/sorting';
import { OrderCard } from '../components/OrderCard';
import { OrderDrawer } from '../components/OrderDrawer';
import { NewOrderDrawer, type NewOrderDrawerProps } from '../components/NewOrderDrawer';
import { mapOrder } from '../lib/pedidos-tarefas/mappers';
import {
  createOrder,
  createTask,
  removeTask,
  saveSubtask,
  setOrderStatus,
  updateOrder,
  updateTask,
} from '../lib/pedidos-tarefas/commands';
import type { TaskInput, TaskPatch, SubtaskInput } from '../lib/pedidos-tarefas/commands';
import { removeFront, saveFront } from '../lib/pedidos-tarefas/fronts';
import {
  formatMemberLabel,
  listMembers,
  readCapabilities,
  readCurrentMembershipRole,
  type MembershipRole,
} from '../lib/pedidos-tarefas/members';
import type { Capabilities, Member } from '../lib/pedidos-tarefas/types';
import { Search, Plus, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { ContentContainer, PageHeader } from '../components/app-shell/PageHeader';
import { getCurrentOrganizationId } from '../lib/pedidos-tarefas/organization';
import {
  ATTACHMENT_ORPHAN_WARNING,
  deleteOrderWithAttachments,
} from '../lib/pedidos-tarefas/attachment-deletion';
import { resolveOrdersPageIntent } from '../lib/pedidos-tarefas/navigation';
import { getCurrentTaskDateKey, getTaskDueStatus } from '../lib/pedidos-tarefas/task-due';
import { deleteOrderDetail } from '../lib/pedidos-tarefas/detail-deletion';
import { isMyTask } from '../lib/pedidos-tarefas/mine';
import { MemberNameEditor } from '../components/pedidos-tarefas/MemberNameEditor';
import { StandaloneTaskDetail } from '../components/pedidos-tarefas/StandaloneTaskDetail';
import { TemplateEditor } from '../components/pedidos-tarefas/TemplateEditor';
import type { OrderTab } from '../components/pedidos-tarefas/OrderTabs';
import { blockedCount, chooseNextAction, summarizeTasks } from '../lib/pedidos-tarefas/indicators';
import { buildOrderHref, buildTaskHref } from '../lib/pedidos-tarefas/navigation';
import { loadLegacyOrderDetail, loadOrder, loadOrderAttachments, loadOrderRecentActivity,
  loadOrderTasks, loadOrderUpdates } from '../lib/pedidos-tarefas/order-queries';
import { addTaskNote, deleteTaskNote } from '../lib/pedidos-tarefas/task-notes';
import { addUpdate, deleteUpdate } from '../lib/pedidos-tarefas/timeline';
import { saveAttachmentMetadata } from '../lib/pedidos-tarefas/attachments';
import type { Dependency, Front, OrderV1, Subtask, TaskV1 } from '../lib/pedidos-tarefas/types';
import {
  duplicateTemplate,
  instantiateTemplate,
  listTemplates,
  saveTemplate,
  type SaveTemplateInput,
  type TemplateRecord,
} from '../lib/pedidos-tarefas/templates';

type SelectedDetail = { id: string; organizationId: string; revision: number; order: Order; canonicalOrder: OrderV1;
  fronts: Front[]; tasks: TaskV1[]; subtasks: Subtask[]; dependencies: Dependency[];
  recent: { text: string; at: string; author: string } | null };

export default function Home() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderTab>('summary');
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'todos' | 'meus'>('todos');
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membershipRole, setMembershipRole] = useState<MembershipRole | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ordersRequestRef = useRef(0);
  const handledIntentRef = useRef<string | null>(null);

  const todayISO = getCurrentTaskDateKey();
  const today = useMemo(() => new Date(`${todayISO}T12:00:00`), [todayISO]);
  const viewerId = session?.user.id ?? null;
  const currentMember = members.find(member => member.userId === viewerId) ?? null;
  const currentUser: TeamMember = currentMember
    ? formatMemberLabel(currentMember)
    : 'Membro sem nome';

  const fetchTemplates = async (currentOrganizationId: string) => {
    setTemplatesError(null);
    try {
      const records = await listTemplates(supabase, currentOrganizationId);
      setTemplates(records);
      return records;
    } catch (error) {
      console.error('Error fetching Pedido templates:', error);
      setTemplates([]);
      setTemplatesError('Não foi possível carregar os templates. O Pedido em branco continua disponível.');
      return [];
    }
  };

  const fetchOrders = async (currentOrganizationId: string) => {
    const request = ++ordersRequestRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [mode, directory, { data, error }] = await Promise.all([
        readCapabilities(supabase, currentOrganizationId),
        listMembers(supabase, currentOrganizationId),
        supabase.from('pedidos')
          .select('id,organization_id,numero_pedido,projeto,cliente,endereco,status,prioridade,data_criacao,prazo_concessionaria,tarefas(id,organization_id,pedido_id,descricao,concluido,responsavel,responsavel_user_id,vencimento,concluida_em,status,prioridade,frente_id,descricao_detalhada,follow_up_date,waiting_type,waiting_user_id,waiting_note,updated_at)')
          .eq('organization_id', currentOrganizationId),
      ]);
      if (error) throw error;
      if (!data) throw new Error('Resposta de Pedidos ausente');
      const directoryById = new Map(directory.map(member => [member.userId, member]));
      const mappedOrders = data.map(row => {
        const order = mapOrder(row, mode.statusMode);
        const tasks = order.tasks.map(task => {
          if (!task.assigneeUserId) return task;
          const member = directoryById.get(task.assigneeUserId);
          return {
            ...task,
            assignee: member
              ? formatMemberLabel(member)
              : task.assignee ?? `Membro sem nome · ${task.assigneeUserId.slice(0, 8)}`,
          };
        });
        return { ...order, tasks };
      });
      if (request !== ordersRequestRef.current) return;
      setCapabilities(mode);
      setMembers(directory);
      setOrders(mappedOrders);
      setDetailRevision(previous => previous + 1);
    } catch (error) {
      if (request !== ordersRequestRef.current) return;
      console.error('Error fetching orders:', error);
      setLoadError('Não foi possível carregar os Pedidos. Recarregue a página para tentar novamente.');
      toast.error('Erro ao carregar dados');
    } finally {
      if (request === ordersRequestRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    const pendingReads = ordersRequestRef;
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        router.replace('/login');
      } else {
        setSession(session);
        try {
          const currentOrganizationId = await getCurrentOrganizationId(supabase);
          if (!active) return;
          setOrganizationId(currentOrganizationId);
          const [role] = await Promise.all([
            readCurrentMembershipRole(supabase, currentOrganizationId, session.user.id),
            fetchOrders(currentOrganizationId),
            fetchTemplates(currentOrganizationId),
          ]);
          if (active) setMembershipRole(role);
        } catch (error) {
          console.error('Error identifying current organization:', error);
          toast.error('Não foi possível identificar a organização atual');
          setIsLoading(false);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        ordersRequestRef.current++;
        setOrganizationId(null);
        setSelectedOrderId(null);
        setSelectedDetail(null);
        setCapabilities(null);
        setMembers([]);
        setMembershipRole(null);
        setTemplates([]);
        setTemplatesError(null);
        setIsTemplateEditorOpen(false);
        setEditingTemplateId(null);
        setOrders([]);
        router.replace('/login');
      } else {
        setSession(session);
      }
    });

    return () => { active = false; pendingReads.current++; subscription.unsubscribe(); };
  }, [router]);

  useEffect(() => {
    if (!selectedOrderId || !organizationId || !capabilities) return;
    let active = true;
    const orderId = selectedOrderId;
    const org = organizationId;
    queueMicrotask(() => {
      if (active) { setSelectedDetail(null); setDetailError(null); setSectionError(null); }
    });
    Promise.all([
      loadOrder(supabase, org, orderId),
      loadOrderTasks(supabase, org, orderId),
      loadOrderRecentActivity(supabase, org, orderId),
      loadLegacyOrderDetail(supabase, org, orderId, capabilities.statusMode, capabilities.timelineMode),
    ]).then(([canonicalOrder, taskData, recent, order]) => {
      if (!active) return;
      if (!canonicalOrder || !order) {
        setDetailError('Pedido não encontrado nesta organização.');
        return;
      }
      const directoryById = new Map(members.map(member => [member.userId, member]));
      const resolvedOrder = { ...order, tasks: order.tasks.map(task => {
        if (!task.assigneeUserId) return task;
        const member = directoryById.get(task.assigneeUserId);
        return { ...task, assignee: member ? formatMemberLabel(member)
          : task.assignee ?? `Membro sem nome · ${task.assigneeUserId.slice(0, 8)}` };
      }) };
      setSelectedDetail({ id: orderId, organizationId: org, revision: detailRevision, order: resolvedOrder, canonicalOrder,
        fronts: taskData.fronts, tasks: taskData.tasks, subtasks: taskData.subtasks,
        dependencies: taskData.dependencies, recent });
    }).catch(error => {
      if (!active) return;
      console.error('Error loading Pedido detail:', error);
      setDetailError('Não foi possível carregar este Pedido. Tente novamente.');
    });
    return () => { active = false; };
  }, [selectedOrderId, organizationId, capabilities, detailRevision, members]);

  const loadedDetailId = selectedDetail?.id;
  const loadedDetailOrg = selectedDetail?.organizationId;
  const loadedDetailRevision = selectedDetail?.revision;
  useEffect(() => {
    if (!selectedOrderId || !organizationId || !loadedDetailId ||
      loadedDetailId !== selectedOrderId || loadedDetailOrg !== organizationId ||
      loadedDetailRevision !== detailRevision ||
      (activeTab !== 'updates' && activeTab !== 'files')) return;
    let active = true;
    const orderId = selectedOrderId;
    const org = organizationId;
    queueMicrotask(() => { if (active) { setSectionError(null); setSectionLoading(true); } });
    const read = async () => {
      if (activeTab === 'updates') {
        const atividades = await loadOrderUpdates(supabase, org, orderId, capabilities?.timelineMode ?? 'legacy');
        if (active) setSelectedDetail(previous => previous?.id === orderId && previous.organizationId === org
          ? { ...previous, order: { ...previous.order, atividades } } : previous);
      } else {
        const attachments = await loadOrderAttachments(supabase, org, orderId,
          capabilities?.timelineMode ?? 'legacy');
        const anexos = await Promise.all(attachments.map(async attachment => {
          const { data, error } = await supabase.storage.from('anexos-pedidos')
            .createSignedUrl(attachment.storage_path, 3600);
          if (error) throw error;
          return { ...attachment, signed_url: data.signedUrl };
        }));
        if (active) setSelectedDetail(previous => previous?.id === orderId && previous.organizationId === org
          ? { ...previous, order: { ...previous.order, anexos } } : previous);
      }
    };
    void read().catch(error => {
      if (!active) return;
      console.error('Error loading Pedido section:', error);
      setSectionError('Não foi possível carregar esta seção.');
    }).finally(() => {
      if (active) setSectionLoading(false);
    });
    return () => { active = false; };
  }, [activeTab, selectedOrderId, organizationId, loadedDetailId, loadedDetailOrg,
    loadedDetailRevision, detailRevision, capabilities?.timelineMode]);

  useEffect(() => {
    if (isLoading || typeof window === 'undefined') return;
    const search = window.location.search;
    if (!search || handledIntentRef.current === search) return;

    const intent = resolveOrdersPageIntent(new URLSearchParams(search));
    handledIntentRef.current = search;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (intent.orderId && orders.some((order) => order.id === intent.orderId)) {
        setSelectedOrderId(intent.orderId);
        setFocusedTaskId(intent.taskId);
        setActiveTab(intent.taskId ? 'tasks' : 'summary');
      } else if (intent.taskId && !intent.orderId) {
        setSelectedOrderId(null);
        setFocusedTaskId(intent.taskId);
      }
      if (intent.openNewOrder) {
        setIsNewOrderOpen(true);
      }
    });
    return () => { active = false; };
  }, [isLoading, orders]);

  useEffect(() => {
    const handleHistory = () => {
      const intent = resolveOrdersPageIntent(new URLSearchParams(window.location.search));
      setSelectedOrderId(intent.orderId);
      setFocusedTaskId(intent.taskId);
      setActiveTab(intent.taskId ? 'tasks' : 'summary');
    };
    window.addEventListener('popstate', handleHistory);
    return () => window.removeEventListener('popstate', handleHistory);
  }, []);

  const openOrder = (orderId: string, taskId: string | null = null) => {
    setSelectedOrderId(orderId);
    setFocusedTaskId(taskId);
    setActiveTab(taskId ? 'tasks' : 'summary');
    setSectionError(null);
    setSectionLoading(false);
    const href = taskId ? buildTaskHref(taskId, orderId) : buildOrderHref(orderId);
    window.history.pushState(null, '', href);
    handledIntentRef.current = window.location.search;
  };

  const closeOrder = () => {
    setSelectedOrderId(null);
    setSelectedDetail(null);
    setFocusedTaskId(null);
    setActiveTab('summary');
    setSectionError(null);
    setSectionLoading(false);
    window.history.pushState(null, '', '/');
    handledIntentRef.current = window.location.search;
  };

  const closeTask = () => {
    setFocusedTaskId(null);
    if (selectedOrderId) window.history.replaceState(null, '', buildOrderHref(selectedOrderId));
    handledIntentRef.current = window.location.search;
  };

  const changeOrderTab = (tab: OrderTab) => {
    setActiveTab(tab);
    setSectionError(null);
    setSectionLoading(false);
    if (tab !== 'tasks' && focusedTaskId && selectedOrderId) {
      setFocusedTaskId(null);
      window.history.replaceState(null, '', buildOrderHref(selectedOrderId));
      handledIntentRef.current = window.location.search;
    }
  };

  const processedOrders = useMemo(() => {
    let filtered = orders;
    
    if (filterMode === 'meus') {
      filtered = viewerId
        ? filtered.filter(order => order.tasks.some(task =>
            isMyTask({ assigneeUserId: task.assigneeUserId ?? null }, viewerId) && !task.completed
          ))
        : [];
    }

    if (searchQuery.trim() !== '') {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(order => 
        order.title.toLowerCase().includes(lowerQuery) || 
        order.client.toLowerCase().includes(lowerQuery) ||
        (order.orderNumber && order.orderNumber.toLowerCase().includes(lowerQuery)) ||
        order.id.toLowerCase().includes(lowerQuery)
      );
    }
    return sortOrders(filtered, today);
  }, [orders, today, searchQuery, filterMode, viewerId]);

  const selectedOrder = useMemo(() => {
    return !loadError && selectedDetail?.id === selectedOrderId &&
      selectedDetail?.organizationId === organizationId &&
      selectedDetail?.revision === detailRevision &&
      orders.some(order => order.id === selectedOrderId) ? selectedDetail.order : null;
  }, [orders, selectedOrderId, selectedDetail, organizationId, detailRevision, loadError]);

  const overview = useMemo(() => {
    if (!selectedOrder || !selectedDetail) return null;
    const { canonicalOrder, tasks, dependencies, fronts, recent } = selectedDetail;
    return { order: canonicalOrder, summary: summarizeTasks(tasks, dependencies, todayISO),
      frontSummaries: fronts.map(front => {
        const frontTasks = tasks.filter(task => task.frontId === front.id);
        return { front, summary: { ...summarizeTasks(frontTasks, [], todayISO),
          blocked: frontTasks.filter(task => blockedCount(task.id, tasks, dependencies) > 0).length } };
      }),
      nextAction: chooseNextAction(tasks, todayISO), recent };
  }, [selectedOrder, selectedDetail, todayISO]);

  // Indicadores (Cards de Resumo)
  const todasTarefas = useMemo(() => orders.flatMap(o => o.tasks.map(t => ({...t, orderId: o.id, orderTitle: o.title, orderNumber: o.orderNumber}))), [orders]);
  
  const tarefasVencidas = useMemo(() => {
    return todasTarefas.filter(t => getTaskDueStatus(t, todayISO) === 'overdue');
  }, [todasTarefas, todayISO]);

  const tarefasVencemHoje = useMemo(() => {
    return todasTarefas.filter(t => getTaskDueStatus(t, todayISO) === 'today');
  }, [todasTarefas, todayISO]);

  const tarefasConcluidasTotal = useMemo(() => todasTarefas.filter(t => t.completed).length, [todasTarefas]);
  const tarefasPendentesTotal = useMemo(() => todasTarefas.filter(t => !t.completed).length, [todasTarefas]);

  // Atenção Imediata (Vencidas + Vencem Hoje)
  const atencaoImediata = useMemo(() => {
    return [...tarefasVencidas, ...tarefasVencemHoje].sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [tarefasVencidas, tarefasVencemHoje]);

  const requireOrganizationId = () => {
    if (!organizationId || !capabilities || loadError) {
      toast.error('Organização atual indisponível');
      return null;
    }

    return organizationId;
  };

  const reportMutationError = (
    error: { message: string } | null,
    userMessage: string
  ) => {
    if (!error) return false;

    console.error(userMessage, error);
    toast.error(userMessage);
    return true;
  };

  const reportCommandFailure = (
    result: { ok: false; message: string },
    userMessage: string,
    toastId?: string,
  ) => {
    console.error(userMessage, result.message);
    toast.error(userMessage, toastId ? { id: toastId } : undefined);
  };

  // Handlers
  const handleToggleTask = async (orderId: string, taskId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const order = orders.find(o => o.id === orderId);
    if (!order) return false;
    
    const task = order.tasks.find(t => t.id === taskId);
    if (!task) return false;

    const newCompleted = !task.completed;
    const result = await updateTask(supabase, currentOrganizationId, taskId, {
      status: newCompleted ? 'Concluída' : 'Aberta',
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar tarefa');
      return false;
    }

    await fetchOrders(currentOrganizationId);
    return true;
  };

  const handleSaveNewOrder: NewOrderDrawerProps['onSave'] = async (newOrderData) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const toastId = toast.loading('Criando pedido...');
    const orderInput = {
      number: newOrderData.orderNumber,
      title: newOrderData.title,
      client: newOrderData.client,
      address: newOrderData.address,
      cep: newOrderData.cep || null,
      legacyPriority: newOrderData.priority,
      utilityDueDate: null,
    };
    const result = newOrderData.template
      ? await instantiateTemplate(supabase, currentOrganizationId, {
        ...newOrderData.template,
        order: orderInput,
      })
      : await createOrder(supabase, currentOrganizationId, orderInput);
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao criar pedido', toastId);
      return false;
    }

    toast.success('Pedido criado com sucesso!', { id: toastId });
    await fetchOrders(currentOrganizationId);
    return true;
  };

  const handleSaveTemplate = async (input: SaveTemplateInput) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) {
      return { ok: false, code: 'reload', message: 'Organização atual indisponível' } as const;
    }
    const result = await saveTemplate(supabase, currentOrganizationId, input);
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao salvar template');
      return result;
    }
    await fetchTemplates(currentOrganizationId);
    setEditingTemplateId(result.value.id);
    toast.success('Template salvo com sucesso!');
    return result;
  };

  const handleDuplicateTemplate = async (id: string, name: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) {
      return { ok: false, code: 'reload', message: 'Organização atual indisponível' } as const;
    }
    const result = await duplicateTemplate(supabase, currentOrganizationId, id, name);
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao duplicar template');
      return result;
    }
    await fetchTemplates(currentOrganizationId);
    setEditingTemplateId(result.value.id);
    toast.success('Template duplicado com sucesso!');
    return result;
  };

  const handleChangePriority = async (orderId: string, newPriority: Priority) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const result = await updateOrder(supabase, currentOrganizationId, orderId, {
      legacyPriority: newPriority,
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao alterar prioridade');
      return;
    }

    await fetchOrders(currentOrganizationId);
    toast.success(`Prioridade alterada para ${newPriority}`);
  };

  const handleAddTask = async (orderId: string, taskTitle: string, assigneeId: string | null, dueDate?: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const toastId = toast.loading('Adicionando tarefa...');
    const result = await createTask(supabase, currentOrganizationId, {
      title: taskTitle,
      orderId,
      frontId: null,
      assigneeId,
      dueDate: dueDate ?? null,
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao adicionar tarefa', toastId);
      return false;
    }

    toast.success('Tarefa adicionada!', { id: toastId });
    await fetchOrders(currentOrganizationId);
    return true;
  };

  const handleCreateTaskV1 = async (input: TaskInput): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const toastId = toast.loading('Adicionando tarefa...');
    const result = await createTask(supabase, org, input);
    if (!result.ok) { reportCommandFailure(result, 'Erro ao adicionar tarefa', toastId); return false; }
    await fetchOrders(org);
    toast.success('Tarefa adicionada!', { id: toastId });
    return true;
  };

  const handleSaveTaskV1 = async (id: string, patch: TaskPatch): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const result = await updateTask(supabase, org, id, patch);
    if (!result.ok) { reportCommandFailure(result, 'Erro ao salvar tarefa'); return false; }
    await fetchOrders(org);
    toast.success('Tarefa atualizada');
    return true;
  };

  const handleSaveFrontV1 = async (front: Front): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const result = await saveFront(supabase, org, front);
    if (!result.ok) { reportCommandFailure(result, 'Erro ao salvar Frente'); return false; }
    setDetailRevision(previous => previous + 1);
    toast.success('Frente salva');
    return true;
  };

  const handleRemoveFrontV1 = async (id: string, destinationId: string | null): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const result = await removeFront(supabase, org, id, destinationId);
    if (!result.ok) { reportCommandFailure(result, 'Erro ao remover Frente'); return false; }
    setDetailRevision(previous => previous + 1);
    toast.success('Frente removida');
    return true;
  };

  const handleReorderFrontV1 = async (id: string, direction: 'up' | 'down'): Promise<boolean> => {
    const org = requireOrganizationId();
    const detail = selectedDetail;
    if (!org || !detail || detail.organizationId !== org) return false;
    const ordered = [...detail.fronts].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const index = ordered.findIndex(front => front.id === id);
    const other = ordered[index + (direction === 'up' ? -1 : 1)];
    const front = ordered[index];
    if (!front || !other) return false;
    const first = await saveFront(supabase, org, { ...front, position: other.position });
    if (!first.ok) { reportCommandFailure(first, 'Erro ao reordenar Frente'); return false; }
    const second = await saveFront(supabase, org, { ...other, position: front.position });
    if (!second.ok) {
      await saveFront(supabase, org, front);
      reportCommandFailure(second, 'Erro ao reordenar Frente');
      setDetailRevision(previous => previous + 1);
      return false;
    }
    setDetailRevision(previous => previous + 1);
    return true;
  };

  const handleSaveSubtaskV1 = async (input: SubtaskInput): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const result = await saveSubtask(supabase, org, input);
    if (!result.ok) { reportCommandFailure(result, 'Erro ao salvar subtarefa'); return false; }
    setDetailRevision(previous => previous + 1);
    return true;
  };

  const handleDependencyV1 = async (action: 'add' | 'remove', taskId: string,
    predecessorId: string): Promise<boolean> => {
    const org = requireOrganizationId();
    if (!org) return false;
    const { error } = await supabase.rpc(action === 'add' ? 'add_pedido_dependency' : 'remove_pedido_dependency', {
      p_org: org, p_task: taskId, p_predecessor: predecessorId,
    });
    if (error) { reportMutationError(error, 'Erro ao alterar dependência'); return false; }
    setDetailRevision(previous => previous + 1);
    return true;
  };

  const handleEditTaskTitle = async (orderId: string, taskId: string, newTitle: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const result = await updateTask(supabase, currentOrganizationId, taskId, { title: newTitle });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar tarefa');
      return;
    }

    await fetchOrders(currentOrganizationId);
    toast.success('Tarefa atualizada');
  };

  const handleEditTaskDueDate = async (orderId: string, taskId: string, newDueDate: string | undefined) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const result = await updateTask(supabase, currentOrganizationId, taskId, {
      dueDate: newDueDate ?? null,
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar prazo da tarefa');
      return;
    }

    await fetchOrders(currentOrganizationId);
    toast.success('Prazo da tarefa atualizado');
  };

  const handleEditOrderField = async (orderId: string, field: 'orderNumber' | 'title' | 'client' | 'address', newValue: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const commandFieldMap = {
      orderNumber: 'number',
      title: 'title',
      client: 'client',
      address: 'address',
    } as const;
    const result = await updateOrder(supabase, currentOrganizationId, orderId, {
      [commandFieldMap[field]]: newValue,
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar pedido');
      return;
    };

    await fetchOrders(currentOrganizationId);
    toast.success('Informação atualizada');
  };

  const handleDeleteTask = async (orderId: string, taskId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const result = await removeTask(supabase, currentOrganizationId, taskId);
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao remover tarefa');
      return false;
    }

    await fetchOrders(currentOrganizationId);
    toast.success('Tarefa removida');
    return true;
  };

  const handleDeleteOrder = async (orderId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    try {
      await deleteOrderWithAttachments({
        listStoragePaths: async () => {
          const { data, error } = await supabase
            .from('anexos')
            .select('storage_path')
            .eq('organization_id', currentOrganizationId)
            .eq('pedido_id', orderId);

          if (error) throw error;
          return (data || []).map(attachment => attachment.storage_path);
        },
        deleteAttachmentMetadata: async storagePaths => {
          const { error } = await supabase
            .from('anexos')
            .delete()
            .eq('organization_id', currentOrganizationId)
            .eq('pedido_id', orderId)
            .in('storage_path', storagePaths);

          if (error) throw error;
        },
        deleteStorageObjects: async storagePaths => {
          const { error } = await supabase.storage
            .from('anexos-pedidos')
            .remove(storagePaths);

          if (error) throw error;
        },
        deleteOrder: async () => {
          const { error } = await supabase
            .from('pedidos')
            .delete()
            .eq('organization_id', currentOrganizationId)
            .eq('id', orderId);

          if (error) throw error;
        },
      });
    } catch (error) {
      console.error('Erro ao remover pedido e anexos:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao remover pedido e anexos');
      await fetchOrders(currentOrganizationId);
      return;
    }

    closeOrder();
    setOrders(prev => prev.filter(o => o.id !== orderId));
    toast.success('Pedido deletado');
  };

  const handleAddSubtarefa = async (orderId: string, taskId: string, descricao: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const result = await saveSubtask(supabase, currentOrganizationId, {
      id: null,
      taskId,
      patch: { title: descricao, completed: false },
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao adicionar subtarefa');
      return;
    }

    await fetchOrders(currentOrganizationId);
  };

  const handleToggleSubtarefa = async (orderId: string, taskId: string, subtaskId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const subtask = selectedOrder?.id === orderId
      ? selectedOrder.tasks.find(task => task.id === taskId)
        ?.subtarefas?.find(candidate => candidate.id === subtaskId)
      : null;

    if (!subtask) return;

    const newConcluida = !subtask.concluida;
    const result = await saveSubtask(supabase, currentOrganizationId, {
      id: subtaskId,
      taskId,
      patch: { completed: newConcluida },
    });
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar subtarefa');
      return;
    }

    await fetchOrders(currentOrganizationId);
  };

  const handleSetOrderStatus = async (orderId: string, status: Order['status']) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const result = await setOrderStatus(supabase, currentOrganizationId, orderId, status);
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao atualizar status do pedido');
      return false;
    }

    await fetchOrders(currentOrganizationId);
    toast.success(`Pedido marcado como ${status}`);
    return true;
  };

  const handleDeleteSubtarefa = async (orderId: string, taskId: string, subtaskId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    try {
      await deleteOrderDetail(supabase, 'subtarefas', currentOrganizationId, subtaskId);
    } catch (error) {
      reportMutationError(
        error instanceof Error ? error : { message: 'Falha desconhecida' },
        'Erro ao remover subtarefa'
      );
      return false;
    }

    setDetailRevision(previous => previous + 1);
    return true;
  };

  const handleAddComentarioTarefa = async (taskId: string, texto: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const result = await addTaskNote(supabase, currentOrganizationId, taskId, texto,
      capabilities?.timelineMode ?? 'legacy');
    if (result.ok) {
      setDetailRevision(previous => previous + 1);
      return true;
    } else {
      toast.error('Erro ao salvar nota');
      return false;
    }
  };

  const handleDeleteComentarioTarefa = async (comentarioId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return false;

    const result = await deleteTaskNote(supabase, currentOrganizationId, comentarioId,
      capabilities?.timelineMode ?? 'legacy');
    if (!result.ok) {
      reportCommandFailure(result, 'Erro ao remover nota');
      return false;
    }

    setDetailRevision(previous => previous + 1);
    return true;
  };


  const handleAddAtividade = async (orderId: string, descricao: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const toastId = toast.loading('Salvando registro...');
    if (capabilities?.timelineMode === 'v1') {
      const result = await addUpdate(supabase, currentOrganizationId, {
        orderId, frontId: null, taskId: null, text: descricao,
      });
      if (result.ok) {
        setDetailRevision(previous => previous + 1);
        toast.success('Registro salvo!', { id: toastId });
      } else toast.error(result.message, { id: toastId });
      return;
    }
    const { data, error } = await supabase.from('atividades').insert({
      organization_id: currentOrganizationId, pedido_id: orderId, descricao, usuario: currentUser,
    }).select().single();

    if (!error && data) {
      setDetailRevision(previous => previous + 1);
      toast.success('Registro salvo!', { id: toastId });
    } else {
      toast.error('Erro ao salvar', { id: toastId });
    }
  };

  const handleDeleteAtividade = async (orderId: string, atividadeId: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    if (capabilities?.timelineMode === 'v1') {
      const result = await deleteUpdate(supabase, currentOrganizationId, atividadeId);
      if (!result.ok) { reportCommandFailure(result, 'Erro ao remover registro'); return; }
      setDetailRevision(previous => previous + 1);
      toast.success('Registro removido');
      return;
    }
    const { error } = await supabase.from('atividades').delete()
      .eq('organization_id', currentOrganizationId).eq('id', atividadeId);
    if (reportMutationError(error, 'Erro ao remover registro')) return;

    setDetailRevision(previous => previous + 1);
    toast.success('Registro removido');
  };

  const handleUploadFiles = async (orderId: string, stagedFiles: { file: File, legenda: string }[]) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const toastId = toast.loading(`Enviando ${stagedFiles.length} arquivo(s)...`);
    let uploadsSuccess = 0;

    for (let i = 0; i < stagedFiles.length; i++) {
      const { file: originalFile, legenda } = stagedFiles[i];
      
      let fileToUpload = originalFile;
      
      // Compress if it is an image
      if (originalFile.type.startsWith('image/')) {
        try {
          const options = {
            maxSizeMB: 5,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
            initialQuality: 0.8
          };
          fileToUpload = await imageCompression(originalFile, options);
        } catch (error) {
          console.error("Erro ao comprimir imagem:", error);
          // continua com o arquivo original se falhar
        }
      }

      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${currentOrganizationId}/${orderId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('anexos-pedidos')
        .upload(filePath, fileToUpload);

      if (uploadError) {
        console.error('Storage Error:', uploadError);
        toast.error(`Erro Storage: ${uploadError.message}`, { id: toastId });
        continue;
      }

      const canonicalMetadata = capabilities?.timelineMode === 'v1'
        ? await saveAttachmentMetadata(supabase, currentOrganizationId,
          { orderId, frontId: null, taskId: null, updateId: null },
          { name: originalFile.name, caption: legenda || null, path: filePath,
            type: fileToUpload.type || 'unknown' })
        : null;
      const legacyMetadata = canonicalMetadata === null ? await supabase.from('anexos').insert({
        organization_id: currentOrganizationId, pedido_id: orderId, nome_arquivo: originalFile.name,
        legenda: legenda || null, tipo: fileToUpload.type || 'unknown', storage_path: filePath,
      }).select().single() : null;
      const anexoData = canonicalMetadata?.ok ? { id: canonicalMetadata.value } : legacyMetadata?.data;
      const dbError = canonicalMetadata && !canonicalMetadata.ok
        ? { message: canonicalMetadata.message } : legacyMetadata?.error;

      if (dbError) {
        console.error('Database Error:', dbError);
        const { error: cleanupError } = await supabase.storage
          .from('anexos-pedidos')
          .remove([filePath]);

        if (cleanupError) {
          console.error('Error cleaning orphan upload:', cleanupError);
        }
        toast.error(`Erro Banco de Dados: ${dbError.message}`, { id: toastId });
      }

      if (!dbError && anexoData) {
        uploadsSuccess++;
      }
    }

    if (uploadsSuccess > 0) {
      setDetailRevision(previous => previous + 1);
      toast.success(`${uploadsSuccess} arquivo(s) enviado(s) com sucesso!`, { id: toastId });
    } else if (stagedFiles.length > 0 && uploadsSuccess === 0) {
      // toast is already showing the error messages
    }
  };

  const handleDeleteAnexo = async (orderId: string, anexoId: string, storagePath: string) => {
    const currentOrganizationId = requireOrganizationId();
    if (!currentOrganizationId) return;

    const { error: dbError } = await supabase
      .from('anexos')
      .delete()
      .eq('organization_id', currentOrganizationId)
      .eq('id', anexoId);

    if (dbError) {
      toast.error('Erro ao remover metadados do arquivo');
      return;
    }

    const { error: storageError } = await supabase.storage
      .from('anexos-pedidos')
      .remove([storagePath]);

    if (storageError) {
      console.error('Storage delete error:', storageError);
      toast.error(ATTACHMENT_ORPHAN_WARNING);
      setDetailRevision(previous => previous + 1);
      return;
    }

    setDetailRevision(previous => previous + 1);
    toast.success('Arquivo removido');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <Toaster position="bottom-center" />
      <main>
      <ContentContainer>
        <PageHeader
          breadcrumbs={[{ label: 'Central', href: '/hub' }, { label: 'Controle de Pedidos' }]}
          title="Controle de Pedidos"
          description="Acompanhe tarefas, prazos e andamento dos pedidos."
          actions={<button
            type="button"
            onClick={() => setIsNewOrderOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-radial-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-radial-primary-hover"
          >
            <Plus className="size-4" />
            Novo Pedido
          </button>}
          secondary={<div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por ID, cliente ou projeto..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>}
        />

        {organizationId && membershipRole === 'admin' && (
          <MemberNameEditor
            organizationId={organizationId}
            onChanged={() => fetchOrders(organizationId)}
          />
        )}
        
        {/* Indicators Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50/80 border border-red-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <AlertCircle className="w-32 h-32 text-red-900" />
            </div>
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shadow-inner relative z-10">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="relative z-10">
              <p className="text-sm font-bold text-red-900 uppercase tracking-wide mb-1">Vencidas</p>
              <h3 className="text-3xl font-black text-red-700 leading-none">{tarefasVencidas.length}</h3>
            </div>
          </div>
          
          <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-5">
              <Clock className="w-32 h-32 text-orange-900" />
            </div>
            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center shadow-inner relative z-10">
              <Clock className="w-6 h-6" />
            </div>
            <div className="relative z-10">
              <p className="text-sm font-bold text-orange-900 uppercase tracking-wide mb-1">Vencem Hoje</p>
              <h3 className="text-3xl font-black text-orange-700 leading-none">{tarefasVencemHoje.length}</h3>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden">
            <div className="w-12 h-12 bg-gray-100 text-blue-600 rounded-xl flex items-center justify-center shadow-inner relative z-10">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="relative z-10 flex-1">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">Progresso Total</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-2xl font-black text-gray-900 leading-none">{tarefasConcluidasTotal}</h3>
                <span className="text-sm font-medium text-gray-400">/ {tarefasPendentesTotal} pendentes</span>
              </div>
            </div>
          </div>
        </div>

        {/* Atenção Imediata */}
        {atencaoImediata.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2 mb-3 px-1">
              <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
              Atenção Imediata
            </h3>
            <div className="bg-white border-2 border-red-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
              {atencaoImediata.map((tarefa) => {
                const isOverdue = getTaskDueStatus(tarefa, todayISO) === 'overdue';
                return (
                  <div 
                    key={tarefa.id} 
                    className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer" 
                    onClick={() => openOrder(tarefa.orderId, tarefa.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{tarefa.title}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">Pedido #{tarefa.orderNumber} • {tarefa.orderTitle}</p>
                    </div>
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md border ${
                        isOverdue ? "text-red-600 bg-red-50 border-red-100" : "text-orange-600 bg-orange-50 border-orange-100"
                      }`}>
                        {isOverdue ? 'Vencido: ' : 'Hoje: '} {tarefa.dueDate?.split('-').reverse().join('/')}
                      </span>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">{tarefa.assignee}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Lista Inteligente</h2>
            </div>
            <p className="text-gray-500 mt-1">
              Foco no que importa. Pedidos ordenados por urgência e prioridade.
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-gray-100/80 p-1 rounded-lg">
             <button
               onClick={() => setFilterMode('todos')}
               className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${filterMode === 'todos' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
               Todos
             </button>
             <button
               onClick={() => setFilterMode('meus')}
               className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${filterMode === 'meus' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
               Minhas Tarefas
             </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {isLoading ? (
            // Skeleton Loader
            [1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-10 bg-gray-200 rounded w-full md:w-32"></div>
              </div>
            ))
          ) : loadError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{loadError}</p>
          ) : processedOrders.length > 0 ? (
            processedOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                onClick={() => openOrder(order.id)}
                today={today}
              />
            ))
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">Nenhum pedido encontrado.</p>
            </div>
          )}
        </div>
      </ContentContainer>
      </main>

      {/* Drawers */}
      {focusedTaskId && !selectedOrderId && organizationId && <StandaloneTaskDetail
        key={focusedTaskId}
        organizationId={organizationId} taskId={focusedTaskId} members={members} today={todayISO}
        timelineMode={capabilities?.timelineMode ?? 'legacy'}
        onClose={() => router.push('/hub')} />}
      <OrderDrawer 
        key={selectedOrderId ?? 'closed'}
        order={selectedOrder} 
        isOpen={selectedOrderId !== null} 
        onClose={closeOrder}
        activeTab={activeTab}
        onTabChange={changeOrderTab}
        overview={overview}
        detailError={detailError ?? loadError}
        sectionError={activeTab === 'tasks' && focusedTaskId && selectedDetail &&
          !selectedDetail.tasks.some(task => task.id === focusedTaskId)
          ? 'Tarefa não encontrada neste Pedido.' : sectionError}
        sectionLoading={sectionLoading}
        taskSection={selectedOrder && selectedDetail && selectedDetail.id === selectedOrder.id ? {
          orderId: selectedOrder.id,
          tasks: selectedDetail.tasks,
          subtasks: selectedDetail.subtasks,
          dependencies: selectedDetail.dependencies,
          fronts: selectedDetail.fronts,
          commentsByTask: Object.fromEntries(selectedOrder.tasks.map(task => [task.id, task.comentarios ?? []])),
          members,
          today: todayISO,
          focusedTaskId,
          canManageOrder: membershipRole === 'admin',
          defaultAssigneeId: currentMember?.userId ?? null,
          onFocusTask: id => openOrder(selectedOrder.id, id),
          onCloseTask: closeTask,
          onCreateTask: handleCreateTaskV1,
          onSaveTask: handleSaveTaskV1,
          onToggleTask: id => handleToggleTask(selectedOrder.id, id),
          onDeleteTask: id => handleDeleteTask(selectedOrder.id, id),
          onSaveSubtask: handleSaveSubtaskV1,
          onDeleteSubtask: (taskId, id) => handleDeleteSubtarefa(selectedOrder.id, taskId, id),
          onAddNote: (taskId, text) => handleAddComentarioTarefa(taskId, text),
          onDeleteNote: (_taskId, id) => handleDeleteComentarioTarefa(id),
          onAddDependency: (taskId, predecessorId) => handleDependencyV1('add', taskId, predecessorId),
          onRemoveDependency: (taskId, predecessorId) => handleDependencyV1('remove', taskId, predecessorId),
          onSaveFront: handleSaveFrontV1,
          onRemoveFront: handleRemoveFrontV1,
          onReorderFront: handleReorderFrontV1,
        } : null}
        focusedTaskId={focusedTaskId}
        onFocusTask={taskId => {
          if (selectedOrderId) openOrder(selectedOrderId, taskId);
        }}
        onToggleTask={handleToggleTask}
        onChangePriority={handleChangePriority}
        onAddTask={handleAddTask}
        onSetOrderStatus={handleSetOrderStatus}
        members={members}
        onEditTaskTitle={handleEditTaskTitle}
        onEditTaskDueDate={handleEditTaskDueDate}
        onEditOrderField={handleEditOrderField}
        onDeleteTask={handleDeleteTask}
        onDeleteOrder={handleDeleteOrder}
        onAddAtividade={handleAddAtividade}
        onDeleteAtividade={handleDeleteAtividade}
        onUploadFiles={handleUploadFiles}
        onDeleteAnexo={handleDeleteAnexo}
        onAddSubtarefa={handleAddSubtarefa}
        onToggleSubtarefa={handleToggleSubtarefa}
        onDeleteSubtarefa={handleDeleteSubtarefa}
        onAddComentarioTarefa={handleAddComentarioTarefa}
        onDeleteComentarioTarefa={handleDeleteComentarioTarefa}
        today={today}
        canManageOrder={membershipRole === 'admin'}
      />

      <NewOrderDrawer
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onSave={handleSaveNewOrder}
        templates={templates}
        templatesError={templatesError}
        onManageTemplates={() => {
          setEditingTemplateId(templates[0]?.id ?? null);
          setIsTemplateEditorOpen(true);
        }}
      />
      {isTemplateEditorOpen && (
        <TemplateEditor
          key={editingTemplateId
            ? `${editingTemplateId}:${templates.find(item => item.id === editingTemplateId)?.version ?? 0}`
            : 'new-template'}
          template={templates.find(item => item.id === editingTemplateId) ?? null}
          templates={templates}
          onSelectTemplate={setEditingTemplateId}
          onNew={() => setEditingTemplateId(null)}
          onSave={handleSaveTemplate}
          onDuplicate={handleDuplicateTemplate}
          onClose={() => setIsTemplateEditorOpen(false)}
        />
      )}
    </div>
  );
}
