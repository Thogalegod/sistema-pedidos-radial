import { Order } from '../types';
import { StatusBadge, cn } from './StatusBadge';
import { MapPin, ChevronRight } from 'lucide-react';
import { parseISO, isBefore, isSameDay } from 'date-fns';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
  today?: Date;
}

export function OrderCard({ order, onClick, today = new Date('2026-04-29') }: OrderCardProps) {
  let isOverdue = false;
  if (order.dueDate) {
    const dueDate = parseISO(order.dueDate);
    isOverdue = isBefore(dueDate, today) && !isSameDay(dueDate, today);
  }

  const tasksTotal = order.tasks.length;
  const tasksCompleted = order.tasks.filter(t => t.completed).length;
  const progress = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;

  return (
    <div 
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-radial-border bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-radial-primary md:p-5",
        isOverdue && order.status === 'Em andamento' ? "border-red-300 bg-red-50/30" : ""
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left side: Info */}
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between md:justify-start md:items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-blue-600 tracking-wider">
                #{order.orderNumber}
              </span>
              <h3 className="text-lg font-semibold leading-tight text-radial-ink transition-colors group-hover:text-radial-primary">
                {order.title}
              </h3>
            </div>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium border",
              order.priority === 'Alta' ? "bg-red-50 text-red-700 border-red-200" :
              order.priority === 'Normal' ? "bg-gray-50 text-gray-600 border-gray-200" :
              "bg-green-50 text-green-700 border-green-200"
            )}>
              {order.priority}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 font-medium">
            {order.client}
          </p>

          <div className="flex items-center text-xs text-gray-500 gap-1.5 mt-1">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate max-w-[200px] md:max-w-md">{order.address}</span>
          </div>
        </div>

        {/* Right side: Status and Progress */}
        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3">
          <StatusBadge order={order} today={today} />
          
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-gray-500 font-medium">
                {tasksCompleted}/{tasksTotal} tarefas
              </span>
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    progress === 100 ? "bg-emerald-500" : "bg-blue-500"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            
            <div className="hidden size-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-emerald-50 group-hover:text-radial-primary md:flex">
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
