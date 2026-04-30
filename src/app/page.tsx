'use client';

import { useState, useMemo, useEffect } from 'react';
import { Order, Priority, Task, Atividade, TeamMember } from '../types';
import { sortOrders } from '../lib/sorting';
import { OrderCard } from '../components/OrderCard';
import { OrderDrawer } from '../components/OrderDrawer';
import { NewOrderDrawer } from '../components/NewOrderDrawer';
import { memberColor } from '../components/StatusBadge';
import { LayoutDashboard, CheckSquare, Search, Plus, LogOut, AlertCircle, Clock, CheckCircle2, Flame } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'react-hot-toast';
import imageCompression from 'browser-image-compression';

export default function Home() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'todos' | 'meus'>('todos');
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  // User logic
  const [currentUser, setCurrentUser] = useState<TeamMember>('Thomás');
  const [userInitials, setUserInitials] = useState('TH');

  const today = useMemo(() => new Date('2026-04-29'), []);
  const todayISO = today.toISOString().split('T')[0];

  useEffect(() => {
    if (session?.user?.email) {
      const email = session.user.email.toLowerCase();
      let name: TeamMember = 'Thomás';
      if (email.includes('roberto')) name = 'Roberto';
      if (email.includes('katlyn')) name = 'Katlyn';
      
      setCurrentUser(name);
      setUserInitials(name.substring(0, 2).toUpperCase());
    }
  }, [session]);

  const fetchOrders = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, tarefas(*, subtarefas(*), comentarios_tarefa(*)), atividades(*), anexos(*)');

    if (error) {
      console.error('Error fetching orders:', error);
      toast.error('Erro ao carregar dados');
      setIsLoading(false);
      return;
    }

    const mappedOrders: Order[] = data.map(d => ({
      id: d.id,
      orderNumber: d.numero_pedido,
      title: d.projeto,
      client: d.cliente,
      address: d.endereco,
      priority: d.prioridade as Priority,
      status: d.status as any,
      createdAt: d.data_criacao,
      dueDate: d.prazo_concessionaria,
      tasks: d.tarefas?.map((t: any) => ({
        id: t.id,
        title: t.descricao,
        completed: t.concluido,
        assignee: t.responsavel,
        dueDate: t.vencimento,
        completedAt: t.concluida_em,
        subtarefas: t.subtarefas?.map((s: any) => ({
          id: s.id,
          tarefa_id: s.tarefa_id,
          descricao: s.descricao,
          concluida: s.concluida,
          criado_em: s.criado_em
        })).sort((a: any, b: any) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()) || [],
        comentarios: t.comentarios_tarefa?.map((c: any) => ({
          id: c.id,
          tarefa_id: c.tarefa_id,
          texto: c.texto,
          usuario: c.usuario,
          criado_em: c.criado_em
        })).sort((a: any, b: any) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()) || []
      })) || [],
      atividades: d.atividades?.map((a: any) => ({
        id: a.id,
        descricao: a.descricao,
        usuario: a.usuario,
        criado_em: a.criado_em
      })) || [],
      anexos: d.anexos?.map((a: any) => ({
        id: a.id,
        pedido_id: a.pedido_id,
        nome_arquivo: a.nome_arquivo,
        legenda: a.legenda,
        url: a.url,
        tipo: a.tipo,
        criado_em: a.criado_em
      })) || []
    }));

    setOrders(mappedOrders);
    setIsLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
      } else {
        setSession(session);
        fetchOrders();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/login');
      } else {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const processedOrders = useMemo(() => {
    let filtered = orders;
    
    if (filterMode === 'meus') {
      filtered = filtered.filter(order => 
        order.tasks.some(t => t.assignee === currentUser && !t.completed)
      );
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
  }, [orders, today, searchQuery, filterMode, currentUser]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Indicadores (Cards de Resumo)
  const todasTarefas = useMemo(() => orders.flatMap(o => o.tasks.map(t => ({...t, orderId: o.id, orderTitle: o.title, orderNumber: o.orderNumber}))), [orders]);
  
  const tarefasVencidas = useMemo(() => {
    return todasTarefas.filter(t => !t.completed && t.dueDate && t.dueDate < todayISO);
  }, [todasTarefas, todayISO]);

  const tarefasVencemHoje = useMemo(() => {
    return todasTarefas.filter(t => !t.completed && t.dueDate === todayISO);
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


  // Handlers
  const handleToggleTask = async (orderId: string, taskId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const task = order.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newCompleted = !task.completed;
    const completedAtValue = newCompleted ? new Date().toISOString() : null;

    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? { ...t, completed: newCompleted, completedAt: completedAtValue } : t)
    } : o));

    await supabase.from('tarefas').update({ 
      concluido: newCompleted,
      concluida_em: completedAtValue
    }).eq('id', taskId);

    const updatedOrder = orders.find(o => o.id === orderId);
    if (updatedOrder) {
      const allCompleted = updatedOrder.tasks.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t).length > 0 
        && updatedOrder.tasks.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t).every(t => t.completed);
        
      const newStatus = allCompleted ? 'Concluído' : (updatedOrder.status === 'Concluído' ? 'Ação Pendente' : updatedOrder.status);
      
      if (newStatus !== updatedOrder.status) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));
        await supabase.from('pedidos').update({ status: newStatus }).eq('id', orderId);
        if (newStatus === 'Concluído') toast.success('Pedido marcado como Concluído!');
      }
    }
  };

  const handleSaveNewOrder = async (newOrderData: any) => {
    const toastId = toast.loading('Criando pedido...');
    const { data, error } = await supabase.from('pedidos').insert({
      numero_pedido: newOrderData.orderNumber,
      projeto: newOrderData.title,
      cliente: newOrderData.client,
      endereco: newOrderData.address,
      prioridade: newOrderData.priority,
      status: newOrderData.status,
    }).select().single();

    if (!error && data) {
      toast.success('Pedido criado com sucesso!', { id: toastId });
      fetchOrders();
    } else {
      toast.error('Erro ao criar pedido', { id: toastId });
    }
  };

  const handleChangePriority = async (orderId: string, newPriority: Priority) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, priority: newPriority } : o));
    await supabase.from('pedidos').update({ prioridade: newPriority }).eq('id', orderId);
    toast.success(`Prioridade alterada para ${newPriority}`);
  };

  const handleAddTask = async (orderId: string, taskTitle: string, assignee: TeamMember, dueDate?: string) => {
    const toastId = toast.loading('Adicionando tarefa...');
    const { data, error } = await supabase.from('tarefas').insert({
      pedido_id: orderId,
      descricao: taskTitle,
      responsavel: assignee,
      vencimento: dueDate || null
    }).select().single();

    if (!error && data) {
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const newStatus = o.status === 'Concluído' ? 'Ação Pendente' : o.status;
        return {
          ...o,
          status: newStatus as any,
          tasks: [...o.tasks, { id: data.id, title: data.descricao, completed: false, assignee: data.responsavel, dueDate: data.vencimento }]
        };
      }));
      const order = orders.find(o => o.id === orderId);
      if (order && order.status === 'Concluído') {
        await supabase.from('pedidos').update({ status: 'Ação Pendente' }).eq('id', orderId);
      }
      toast.success('Tarefa adicionada!', { id: toastId });
    } else {
      toast.error('Erro ao adicionar', { id: toastId });
    }
  };

  const handleEditTaskTitle = async (orderId: string, taskId: string, newTitle: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t)
    } : o));
    await supabase.from('tarefas').update({ descricao: newTitle }).eq('id', taskId);
    toast.success('Tarefa atualizada');
  };

  const handleEditTaskDueDate = async (orderId: string, taskId: string, newDueDate: string | undefined) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? { ...t, dueDate: newDueDate } : t)
    } : o));
    await supabase.from('tarefas').update({ vencimento: newDueDate || null }).eq('id', taskId);
    toast.success('Prazo da tarefa atualizado');
  };

  const handleEditOrderField = async (orderId: string, field: 'orderNumber' | 'title' | 'client' | 'address', newValue: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: newValue } : o));
    
    const dbColumnMap: Record<string, string> = {
      orderNumber: 'numero_pedido',
      title: 'projeto',
      client: 'cliente',
      address: 'endereco'
    };

    await supabase.from('pedidos').update({ [dbColumnMap[field]]: newValue }).eq('id', orderId);
    toast.success('Informação atualizada');
  };

  const handleDeleteTask = async (orderId: string, taskId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tasks: o.tasks.filter(t => t.id !== taskId) } : o));
    await supabase.from('tarefas').delete().eq('id', taskId);
    toast.success('Tarefa removida');
  };

  const handleDeleteOrder = async (orderId: string) => {
    setSelectedOrderId(null);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('pedidos').delete().eq('id', orderId);
    toast.success('Pedido deletado');
  };

  const handleAddSubtarefa = async (orderId: string, taskId: string, descricao: string) => {
    const { data, error } = await supabase.from('subtarefas').insert({
      tarefa_id: taskId,
      descricao,
      concluida: false
    }).select().single();

    if (!error && data) {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        tasks: o.tasks.map(t => t.id === taskId ? {
          ...t,
          subtarefas: [...(t.subtarefas || []), {
            id: data.id,
            tarefa_id: data.tarefa_id,
            descricao: data.descricao,
            concluida: data.concluida,
            criado_em: data.criado_em
          }]
        } : t)
      } : o));
    } else {
      toast.error('Erro ao adicionar subtarefa');
    }
  };

  const handleToggleSubtarefa = async (orderId: string, taskId: string, subtaskId: string) => {
    let newConcluida = false;
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtarefas: t.subtarefas?.map(s => {
            if (s.id !== subtaskId) return s;
            newConcluida = !s.concluida;
            return { ...s, concluida: newConcluida };
          })
        };
      })
    } : o));

    await supabase.from('subtarefas').update({ concluida: newConcluida }).eq('id', subtaskId);
  };

  const handleDeleteSubtarefa = async (orderId: string, taskId: string, subtaskId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? {
        ...t,
        subtarefas: t.subtarefas?.filter(s => s.id !== subtaskId)
      } : t)
    } : o));
    await supabase.from('subtarefas').delete().eq('id', subtaskId);
  };

  const handleAddComentarioTarefa = async (orderId: string, taskId: string, texto: string) => {
    const { data, error } = await supabase.from('comentarios_tarefa').insert({
      tarefa_id: taskId,
      texto,
      usuario: currentUser
    }).select().single();

    if (!error && data) {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        tasks: o.tasks.map(t => t.id === taskId ? {
          ...t,
          comentarios: [{
            id: data.id,
            tarefa_id: data.tarefa_id,
            texto: data.texto,
            usuario: data.usuario,
            criado_em: data.criado_em
          }, ...(t.comentarios || [])]
        } : t)
      } : o));
    } else {
      toast.error('Erro ao salvar nota');
    }
  };

  const handleDeleteComentarioTarefa = async (orderId: string, taskId: string, comentarioId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? {
        ...t,
        comentarios: t.comentarios?.filter(c => c.id !== comentarioId)
      } : t)
    } : o));
    await supabase.from('comentarios_tarefa').delete().eq('id', comentarioId);
  };


  const handleAddAtividade = async (orderId: string, descricao: string) => {
    const toastId = toast.loading('Salvando registro...');
    const { data, error } = await supabase.from('atividades').insert({
      pedido_id: orderId,
      descricao,
      usuario: currentUser
    }).select().single();

    if (!error && data) {
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          atividades: [...(o.atividades || []), {
            id: data.id,
            descricao: data.descricao,
            usuario: data.usuario,
            criado_em: data.criado_em
          }]
        };
      }));
      toast.success('Registro salvo!', { id: toastId });
    } else {
      toast.error('Erro ao salvar', { id: toastId });
    }
  };

  const handleDeleteAtividade = async (orderId: string, atividadeId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, atividades: o.atividades?.filter(a => a.id !== atividadeId) } : o));
    await supabase.from('atividades').delete().eq('id', atividadeId);
    toast.success('Registro removido');
  };

  const handleUploadFiles = async (orderId: string, stagedFiles: { file: File, legenda: string }[]) => {
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
      const filePath = `${orderId}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('anexos-pedidos')
        .upload(filePath, fileToUpload);

      if (uploadError) {
        console.error('Storage Error:', uploadError);
        toast.error(`Erro Storage: ${uploadError.message}`, { id: toastId });
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('anexos-pedidos')
        .getPublicUrl(filePath);

      const { data: anexoData, error: dbError } = await supabase.from('anexos').insert({
        pedido_id: orderId,
        nome_arquivo: originalFile.name,
        legenda: legenda || null,
        tipo: fileToUpload.type || 'unknown',
        url: publicUrlData.publicUrl
      }).select().single();

      if (dbError) {
        console.error('Database Error:', dbError);
        toast.error(`Erro Banco de Dados: ${dbError.message}`, { id: toastId });
      }

      if (!dbError && anexoData) {
        uploadsSuccess++;
        
        setOrders(prev => prev.map(o => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            anexos: [...(o.anexos || []), anexoData]
          };
        }));
      }
    }

    if (uploadsSuccess > 0) {
      toast.success(`${uploadsSuccess} arquivo(s) enviado(s) com sucesso!`, { id: toastId });
    } else if (stagedFiles.length > 0 && uploadsSuccess === 0) {
      // toast is already showing the error messages
    }
  };

  const handleDeleteAnexo = async (orderId: string, anexoId: string, url: string) => {
    const urlParts = url.split('/anexos-pedidos/');
    if (urlParts.length > 1) {
      const filePath = urlParts[1];
      await supabase.storage.from('anexos-pedidos').remove([filePath]);
    }
    
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, anexos: o.anexos?.filter(a => a.id !== anexoId) } : o));
    await supabase.from('anexos').delete().eq('id', anexoId);
    toast.success('Arquivo removido');
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <Toaster position="bottom-center" />
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-inner">
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 leading-tight">Radial</h1>
                <p className="text-xs text-gray-500 font-medium">Controle de Pedidos</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="relative hidden sm:block">
                 <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                 <input 
                   type="text" 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   placeholder="Buscar pedido..." 
                   className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64"
                 />
               </div>
               <button 
                 onClick={() => setIsNewOrderOpen(true)}
                 className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
               >
                 <Plus className="w-4 h-4" />
                 Novo Pedido
               </button>
               <div className="flex items-center gap-3 border-l border-gray-200 pl-4 ml-2">
                 <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shadow-sm ${memberColor(currentUser).avatar}`} title={currentUser}>
                   {userInitials}
                 </div>
                 <button 
                   onClick={handleLogout}
                   className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                   title="Sair"
                 >
                   <LogOut className="w-5 h-5" />
                 </button>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
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
                const isOverdue = tarefa.dueDate && tarefa.dueDate < todayISO;
                return (
                  <div 
                    key={tarefa.id} 
                    className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer" 
                    onClick={() => setSelectedOrderId(tarefa.orderId)}
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

        {/* Mobile Search */}
        <div className="relative sm:hidden mb-6">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por ID, Cliente ou Projeto..." 
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>

        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Lista Inteligente</h2>
              <button 
                 onClick={() => setIsNewOrderOpen(true)}
                 className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
               >
                 <Plus className="w-4 h-4" />
                 Novo
               </button>
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
          ) : processedOrders.length > 0 ? (
            processedOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                onClick={() => setSelectedOrderId(order.id)} 
                today={today}
              />
            ))
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">Nenhum pedido encontrado.</p>
            </div>
          )}
        </div>
      </main>

      {/* Drawers */}
      <OrderDrawer 
        order={selectedOrder} 
        isOpen={selectedOrderId !== null} 
        onClose={() => setSelectedOrderId(null)}
        onToggleTask={handleToggleTask}
        onChangePriority={handleChangePriority}
        onAddTask={handleAddTask}
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
        currentUser={currentUser}
      />

      <NewOrderDrawer
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onSave={handleSaveNewOrder}
      />
    </div>
  );
}
