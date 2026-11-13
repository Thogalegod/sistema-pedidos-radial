'use client';

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TermografiaRelatorio } from '@/lib/termografia/types';
import { loadTermografiaReport } from '@/lib/termografia/report-actions';
import { FieldPrintReport } from '@/components/termografia/FieldPrintReport';

export default function TermografiaPrintViewer(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const [result, setResult] = useState<{ id: string; report?: TermografiaRelatorio; error?: string }>();
  useEffect(() => {
    let active = true;
    loadTermografiaReport(supabase, id).then(report => {
      if (active) setResult({ id, report: report || undefined, error: report ? undefined : 'Relatório não encontrado.' });
    }).catch(error => { if (active) setResult({ id, error: error instanceof Error ? error.message : 'Não foi possível abrir o relatório.' }); });
    return () => { active = false; };
  }, [id]);
  if (result?.id !== id) return <div role="status" className="p-8 text-center">Carregando relatório para impressão…</div>;
  if (result.error || !result.report) return <div role="alert" className="p-8 text-center text-red-600">{result.error || 'Relatório não encontrado.'}</div>;
  return <FieldPrintReport key={id} report={result.report} />;
}
