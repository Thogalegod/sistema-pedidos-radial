export type OrderTab = 'summary' | 'tasks' | 'updates' | 'files' | 'calendar';

const tabs: { id: OrderTab; label: string }[] = [
  { id: 'summary', label: 'Resumo' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'updates', label: 'Atualizações' },
  { id: 'files', label: 'Arquivos' },
  { id: 'calendar', label: 'Calendário' },
];

export function OrderTabs({ active, onChange, calendarEnabled }: {
  active: OrderTab; onChange: (tab: OrderTab) => void; calendarEnabled: boolean;
}) {
  return <div role="tablist" aria-label="Seções do Pedido" className="flex gap-1 overflow-x-auto border-b border-gray-100 px-4 py-2">
    {tabs.map(tab => <button key={tab.id} type="button" role="tab"
      aria-selected={active === tab.id} disabled={tab.id === 'calendar' && !calendarEnabled}
      onClick={() => onChange(tab.id)}
      className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40 ${active === tab.id ? 'bg-blue-50 text-blue-800' : 'text-gray-600 hover:bg-gray-50'}`}>
      {tab.label}
    </button>)}
  </div>;
}
