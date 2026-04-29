import { useState, useEffect } from 'react';
import { Priority, OrderStatus } from '../types';
import { X, Save } from 'lucide-react';
import { cn } from './StatusBadge';

interface NewOrderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: {
    orderNumber: string;
    title: string;
    client: string;
    address: string;
    priority: Priority;
    status: OrderStatus;
  }) => void;
}

export function NewOrderDrawer({ isOpen, onClose, onSave }: NewOrderDrawerProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [address, setAddress] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [status, setStatus] = useState<OrderStatus>('Ação Pendente');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setOrderNumber('');
      setTitle('');
      setClient('');
      setAddress('');
      setPriority('Normal');
      setStatus('Ação Pendente');
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber || !title || !client || !address) return;

    onSave({
      orderNumber,
      title,
      client,
      address,
      priority,
      status,
    });
    onClose();
  };

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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900">Novo Pedido</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
          
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Número do Pedido *</label>
            <input 
              required
              type="text" 
              placeholder="Ex: PED-2050"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nome do Projeto/Pedido *</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Instalação de Painel Solar"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Nome do Cliente *</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Empresa Silva"
              value={client}
              onChange={e => setClient(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Endereço da Obra *</label>
            <input 
              required
              type="text" 
              placeholder="Ex: Rua das Flores, 123"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Prioridade</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPriority('Normal')}
                className={cn(
                  "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                  priority === 'Normal' ? "bg-blue-50 border-blue-500 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPriority('Alta')}
                className={cn(
                  "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                  priority === 'Alta' ? "bg-red-50 border-red-500 text-red-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                )}
              >
                Alta
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Status Inicial</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            >
              <option value="Ação Pendente">Ação Pendente</option>
              <option value="Aguardando Cliente">Aguardando Cliente</option>
              <option value="Prazo Concessionária">Prazo Concessionária</option>
            </select>
          </div>

          <div className="mt-auto pt-8">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salvar Pedido
            </button>
          </div>

        </form>
      </div>
    </>
  );
}
