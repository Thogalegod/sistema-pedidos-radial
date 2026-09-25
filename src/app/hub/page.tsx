'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  FileChartColumn,
  FilePlus2,
  Plus,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import { useShellUser } from '@/components/app-shell/AppShell';
import { ContentContainer, PageHeader } from '@/components/app-shell/PageHeader';
import { OperationalDashboard } from '@/components/pedidos-tarefas/OperationalDashboard';
import type { QuickTaskDraft } from '@/components/pedidos-tarefas/QuickTaskForm';
import { formatBRL } from '@/lib/contratos-locacoes/money';
import { formatDateLabel } from '@/lib/contratos-locacoes/dates';
import { supabase } from '@/lib/supabase';
import { createTask } from '@/lib/pedidos-tarefas/commands';
import { buildTaskQueues, type DashboardTask, type TaskFilter } from '@/lib/pedidos-tarefas/dashboard';
import {
  createSupabaseDashboardReadClient,
  loadDashboardTasks,
} from '@/lib/pedidos-tarefas/dashboard-queries';
import { listMembers, readCapabilities } from '@/lib/pedidos-tarefas/members';
import { buildNewOrderHref, buildTaskHref } from '@/lib/pedidos-tarefas/navigation';
import { getCurrentOrganizationId } from '@/lib/pedidos-tarefas/organization';
import { getCurrentTaskDateKey } from '@/lib/pedidos-tarefas/task-due';
import type { Member } from '@/lib/pedidos-tarefas/types';
import type { CentralOperationalSnapshot, CentralPriority } from '@/lib/central/operational';
import {
  createSupabaseCentralOperationalReadClient,
  loadCentralOperationalSnapshot,
} from '@/lib/central/queries';
import {
  buildCentralViewHref,
  getCentralPendingSections,
  parseCentralView,
} from '@/lib/central/view';

const SUMMARY_ITEMS = [
  { key: 'overdueTasks', view: 'overdue-tasks', label: 'Tarefas atrasadas', icon: AlertCircle, tone: 'text-rose-600 bg-rose-50' },
  { key: 'tasksToday', view: 'today-tasks', label: 'Tarefas para hoje', icon: ClipboardCheck, tone: 'text-amber-600 bg-amber-50' },
  { key: 'periodsToBill', view: 'periods-to-bill', label: 'Períodos a faturar', icon: CalendarClock, tone: 'text-blue-600 bg-blue-50' },
  { key: 'overdueBillings', view: 'overdue-billings', label: 'Cobranças vencidas', icon: ReceiptText, tone: 'text-violet-600 bg-violet-50' },
] as const;

const QUICK_LINKS = [
  { label: 'Novo Pedido', href: buildNewOrderHref(), icon: Plus },
  { label: 'Novo Contrato', href: '/contratos-locacoes/contratos/novo', icon: FilePlus2 },
  { label: 'Relatórios', href: '/relatorios-tecnicos', icon: FileChartColumn },
  { label: 'Cobranças', href: '/contratos-locacoes/cobrancas', icon: ReceiptText },
] as const;

export default function HubPage() {
  return <Suspense fallback={<p role="status" className="p-8 text-sm text-slate-500">Carregando Central…</p>}>
    <HubContent />
  </Suspense>;
}

function HubContent() {
  const { user, loading } = useShellUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = parseCentralView(searchParams.get('view'));
  const readClient = useMemo(() => createSupabaseCentralOperationalReadClient(supabase), []);
  const [snapshot, setSnapshot] = useState<CentralOperationalSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [dashboardTasks, setDashboardTasks] = useState<DashboardTask[] | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>({});
  const [taskReloadToken, setTaskReloadToken] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    loadCentralOperationalSnapshot(readClient, getCurrentTaskDateKey())
      .then((nextSnapshot) => {
        if (active) setSnapshot(nextSnapshot);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar a Central.');
      });
    return () => { active = false; };
  }, [readClient, reloadToken, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getCurrentOrganizationId(supabase)
      .then(async org => {
        const [nextMembers, nextCapabilities] = await Promise.all([
          listMembers(supabase, org),
          readCapabilities(supabase, org),
        ]);
        const nextTasks = await loadDashboardTasks(
          createSupabaseDashboardReadClient(supabase, nextCapabilities.timelineMode),
          org, getCurrentTaskDateKey(), taskFilter);
        if (!active) return;
        setOrganizationId(org);
        setMembers(nextMembers);
        setDashboardTasks(nextTasks);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDashboardError(error instanceof Error
          ? error.message : 'Não foi possível carregar as tarefas operacionais.');
      });
    return () => { active = false; };
  }, [taskFilter, taskReloadToken, user]);

  if (loading || !user) {
    return <p role="status" className="p-8 text-sm text-slate-500">Carregando Central…</p>;
  }

  const today = getCurrentTaskDateKey();
  const queues = dashboardTasks ? buildTaskQueues(dashboardTasks, today) : null;
  const pendingSections = snapshot ? getCentralPendingSections(snapshot, currentView, 4)
    .filter(section => section.id === 'periods-to-bill' || section.id === 'overdue-billings') : [];
  const selectedLabel = currentView === 'all'
    ? 'Períodos e cobranças que já pedem ação.'
    : `Exibindo ${pendingSections[0]?.title.toLocaleLowerCase('pt-BR') ?? 'a categoria selecionada'}.`;

  async function createQuickTask(input: QuickTaskDraft) {
    if (!organizationId) return false;
    const result = await createTask(supabase, organizationId, {
      title: input.title,
      orderId: null,
      frontId: null,
      assigneeId: input.assigneeId,
      priority: 'Normal',
    });
    if (!result.ok) {
      setDashboardError(result.message);
      return false;
    }
    setDashboardTasks(null);
    setDashboardError(null);
    setTaskReloadToken(value => value + 1);
    router.push(buildTaskHref(result.value, null));
    return true;
  }

  function changeTaskFilter(nextFilter: TaskFilter) {
    setDashboardTasks(null);
    setDashboardError(null);
    setTaskFilter(nextFilter);
  }

  return <main>
    <ContentContainer>
      <PageHeader
        breadcrumbs={[]}
        title="Central"
        compact
      />

      <section aria-label="Atalhos rápidos" className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {QUICK_LINKS.map(({ label, href, icon: Icon }) => <Link key={href} href={href}
          className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-radial-border bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radial-primary">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ArrowRight size={14} aria-hidden="true" className="hidden shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 sm:block" />
        </Link>)}
      </section>

      {loadError && <div role="alert" className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
        <span>{loadError}</span>
        <button type="button" onClick={() => {
          setLoadError(null);
          setReloadToken((value) => value + 1);
        }} className="inline-flex items-center gap-2 font-semibold text-rose-700 hover:text-rose-900">
          <RotateCcw size={15} aria-hidden="true" /> Tentar novamente
        </button>
      </div>}

      <section aria-label="Resumo operacional" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_ITEMS.map(({ key, view, label, icon: Icon, tone }) => {
          const active = currentView === view;
          return <Link
            key={key}
            href={buildCentralViewHref(view)}
            aria-current={active ? 'page' : undefined}
            className={`group min-w-0 rounded-xl border bg-white p-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radial-primary ${active ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-radial-border hover:border-slate-300 hover:bg-slate-50'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-medium leading-5 sm:text-sm ${active ? 'text-emerald-800' : 'text-slate-500'}`}>{label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">
                  {key === 'overdueTasks' ? queues?.overdue.length ?? '—'
                    : key === 'tasksToday' ? queues?.today.length ?? '—'
                      : snapshot?.summary[key] ?? '—'}
                </p>
              </div>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon size={17} aria-hidden="true" /></span>
            </div>
          </Link>;
        })}
      </section>

      <div className="mt-6">
        <OperationalDashboard queues={queues} members={members} today={today}
          error={dashboardError} filter={taskFilter} currentUserId={user.id}
          onFilterChange={changeTaskFilter}
          onOpenTask={(taskId, orderId) => router.push(buildTaskHref(taskId, orderId))}
          onCreateQuick={createQuickTask} />
      </div>

      <section aria-labelledby="pending-title" className="mt-6 min-w-0">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="pending-title" className="text-lg font-semibold tracking-tight text-slate-950">Pendências financeiras</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedLabel}</p>
            </div>
            <Link
              href={buildCentralViewHref('all')}
              aria-current={currentView === 'all' ? 'page' : undefined}
              className={`inline-flex w-fit rounded-lg px-3 py-1.5 text-xs font-semibold transition ${currentView === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Todas
            </Link>
          </div>

          {!snapshot && !loadError && <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-8 text-center text-sm text-slate-500" role="status">Carregando pendências…</div>}
          {snapshot && <div className={`grid gap-4 ${currentView === 'all' ? 'lg:grid-cols-2' : ''}`}>
            {pendingSections.map((section) => <article key={section.id} className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">{section.count}</span>
              </header>
              {section.items.length === 0
                ? <p className="px-4 py-7 text-center text-sm text-slate-500">Nenhum item nesta categoria.</p>
                : section.items.map((priority) => <PendingRow key={priorityKey(priority)} priority={priority} />)}
              {section.showAllHref && <Link href={section.showAllHref} className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-slate-50 hover:text-blue-800">
                Ver todas as {section.count}<ArrowRight size={14} aria-hidden="true" />
              </Link>}
            </article>)}
          </div>}
      </section>
    </ContentContainer>
  </main>;
}

function PendingRow({ priority }: { priority: CentralPriority }) {
  const presentation = priorityPresentation(priority);
  return <Link href={priority.href} className="group flex min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 hover:bg-slate-50">
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-slate-900">{presentation.title}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{presentation.customer}</p>
      <p className="mt-1 text-xs text-slate-500">{presentation.detail}</p>
    </div>
    <span className="sr-only">{presentation.action}</span>
    <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
  </Link>;
}

function priorityPresentation(priority: CentralPriority) {
  if (priority.kind === 'task_overdue' || priority.kind === 'task_today') {
    return {
      title: `${priority.title} · Pedido #${priority.orderNumber}`,
      customer: `${priority.customerName} · ${priority.orderTitle}`,
      detail: priority.kind === 'task_overdue' ? overdueLabel(priority.dueDate) : 'Vence hoje',
      action: 'Ver pedido',
    };
  }
  if (priority.kind === 'period_to_bill') {
    return {
      title: `Contrato #${priority.internalNumber}`,
      customer: priority.customerName,
      detail: priority.previousPeriodEnd
        ? `Período anterior encerrado em ${formatDateLabel(priority.previousPeriodEnd)}`
        : `Primeiro período iniciado em ${formatDateLabel(priority.nextPeriodStart)}`,
      action: 'Ver contrato',
    };
  }
  if (priority.kind === 'overdue_billing') {
    return {
      title: `Contrato #${priority.internalNumber}`,
      customer: priority.customerName,
      detail: `Vencimento ${formatDateLabel(priority.dueDate)} · Saldo ${formatBRL(priority.balanceAmount)}`,
      action: 'Ver cobrança',
    };
  }

  throw new Error('Pendência operacional desconhecida.');
}

function priorityKey(priority: CentralPriority) {
  if (priority.kind === 'period_to_bill') return `${priority.kind}-${priority.contractId}`;
  return `${priority.kind}-${priority.id}`;
}

function overdueLabel(dueDate: string) {
  const [year, month, day] = dueDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = getCurrentTaskDateKey().split('-').map(Number);
  const days = Math.max(1, Math.round((Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(year, month - 1, day)) / 86_400_000));
  return `Vencida há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
