'use client';

import { useState, useMemo, useEffect } from 'react';
import { Order, Priority, Task, Atividade } from '../types';
import { sortOrders } from '../lib/sorting';
import { OrderCard } from '../components/OrderCard';
import { OrderDrawer } from '../components/OrderDrawer';
import { NewOrderDrawer } from '../components/NewOrderDrawer';
import { LayoutDashboard, CheckSquare, Search, Plus, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'todos' | 'meus'>('todos');
  const [isLoading, setIsLoading] = useState(true);

  // We fix the "today" date to 2026-04-29 for consistent testing with our mock data
  const today = useMemo(() => new Date('2026-04-29'), []);

  const fetchOrders = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, tarefas(*), atividades(*)');

    if (error) {
      console.error('Error fetching orders:', error);
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
        assignee: t.responsavel
      })) || [],
      atividades: d.atividades?.map((a: any) => ({
        id: a.id,
        descricao: a.descricao,
        usuario: a.usuario,
        criado_em: a.criado_em
      })) || []
    }));

    setOrders(mappedOrders);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Sort and filter orders based on the business rules
  const processedOrders = useMemo(() => {
    let filtered = orders;
    
    if (filterMode === 'meus') {
      // Para o MVP, "Meus Pedidos" = Ação Pendente
      filtered = filtered.filter(order => order.status === 'Ação Pendente');
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
  }, [orders, today, searchQuery, filterMode]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Handlers
  const handleToggleTask = async (orderId: string, taskId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    
    const task = order.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newCompleted = !task.completed;

    // Optimistic update
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t)
    } : o));

    await supabase.from('tarefas').update({ concluido: newCompleted }).eq('id', taskId);

    // Re-check status based on all tasks
    const updatedOrder = orders.find(o => o.id === orderId); // using old state + logic
    if (updatedOrder) {
      const allCompleted = updatedOrder.tasks.map(t => t.id === taskId ? { ...t, completed: newCompleted } : t).every(t => t.completed);
      const newStatus = allCompleted ? 'Concluído' : (updatedOrder.status === 'Concluído' ? 'Ação Pendente' : updatedOrder.status);
      
      if (newStatus !== updatedOrder.status) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o));
        await supabase.from('pedidos').update({ status: newStatus }).eq('id', orderId);
      }
    }
  };

  const handleSaveNewOrder = async (newOrderData: any) => {
    const { data, error } = await supabase.from('pedidos').insert({
      numero_pedido: newOrderData.orderNumber,
      projeto: newOrderData.title,
      cliente: newOrderData.client,
      endereco: newOrderData.address,
      prioridade: newOrderData.priority,
      status: newOrderData.status,
    }).select().single();

    if (!error && data) {
      fetchOrders();
    }
  };

  const handleChangePriority = async (orderId: string, newPriority: Priority) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, priority: newPriority } : o));
    await supabase.from('pedidos').update({ prioridade: newPriority }).eq('id', orderId);
  };

  const handleAddTask = async (orderId: string, taskTitle: string) => {
    const { data, error } = await supabase.from('tarefas').insert({
      pedido_id: orderId,
      descricao: taskTitle,
      responsavel: 'Thomás', // mock
    }).select().single();

    if (!error && data) {
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        const newStatus = o.status === 'Concluído' ? 'Ação Pendente' : o.status;
        return {
          ...o,
          status: newStatus as any,
          tasks: [...o.tasks, { id: data.id, title: data.descricao, completed: false }]
        };
      }));
      // update status in db if changed
      const order = orders.find(o => o.id === orderId);
      if (order && order.status === 'Concluído') {
        await supabase.from('pedidos').update({ status: 'Ação Pendente' }).eq('id', orderId);
      }
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setSelectedOrderId(null);
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('pedidos').delete().eq('id', orderId);
  };

  const handleAddAtividade = async (orderId: string, descricao: string) => {
    const { data, error } = await supabase.from('atividades').insert({
      pedido_id: orderId,
      descricao,
      usuario: 'Thomás'
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
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
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
               <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center text-white font-semibold shadow-sm border border-blue-700">
                 TH
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
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
               Meus Pedidos
             </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500 font-medium">Sincronizando com Supabase...</p>
            </div>
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
        onDeleteOrder={handleDeleteOrder}
        onAddAtividade={handleAddAtividade}
        today={today}
      />

      <NewOrderDrawer
        isOpen={isNewOrderOpen}
        onClose={() => setIsNewOrderOpen(false)}
        onSave={handleSaveNewOrder}
      />
    </div>
  );
}
