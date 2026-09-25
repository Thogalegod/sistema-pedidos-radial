'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ContentContainer, PageHeader } from '@/components/app-shell/PageHeader';
import { useShellUser } from '@/components/app-shell/AppShell';
import { CalendarView } from '@/components/pedidos-tarefas/CalendarView';
import { EventEditor } from '@/components/pedidos-tarefas/EventEditor';
import { resolveCalendarPageIntent } from '@/lib/pedidos-tarefas/navigation';

function currentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` };
}

function CalendarPageContent() {
  const { user, loading } = useShellUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = resolveCalendarPageIntent(searchParams);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <p role="status" className="p-8 text-sm text-slate-500">Carregando calendário…</p>;

  const closeEditor = () => {
    setCreating(false);
    if (intent.eventId) router.replace('/calendario');
  };

  return <main>
    <ContentContainer>
      <PageHeader title="Calendário" breadcrumbs={[]} compact
        description="Prazos, follow-ups e eventos da organização em uma única visão."
        actions={<button type="button" onClick={() => setCreating(true)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus size={17} aria-hidden="true" /> Novo evento
        </button>} />
      <CalendarView scope={currentMonth()} onOpenEntry={entry => router.push(entry.href)} />
    </ContentContainer>
    {(creating || intent.eventId) && <EventEditor key={intent.eventId ?? 'new'} eventId={intent.eventId} onClose={closeEditor}
      onSaved={closeEditor} />}
  </main>;
}

export default function CalendarPage() {
  return <Suspense fallback={<p role="status" className="p-8 text-sm text-slate-500">Carregando calendário…</p>}>
    <CalendarPageContent />
  </Suspense>;
}
