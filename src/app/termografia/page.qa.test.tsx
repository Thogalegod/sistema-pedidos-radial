import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveLocalIdentity, clearLocalIdentity } from '@/lib/termografia/local-identity';
import TermografiaListPage from './page';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/termografia/report-actions', () => ({ listTermografiaReports: async () => [{ id: 'report', numero_relatorio: 'T001', cliente_nome: 'Cliente visível', data_execucao: '2026-11-12', pontos_count: 2, ocorrencias_count: 3 }] }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllEnvs(); });
describe('termografia list entry', () => {
  it('offers document navigation to offline drafts and hides account data on revocation', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    saveLocalIdentity({ projectId: 'project', origin: window.location.origin, userId: 'user', organizationId: 'org' });
    render(<TermografiaListPage />);
    expect(screen.getByRole('link', { name: 'Iniciar coleta' })).toHaveAttribute('href', '/termografia/nova');
    await waitFor(() => expect(screen.getByText('Cliente visível')).toBeInTheDocument());
    act(() => clearLocalIdentity());
    expect(screen.queryByText('Cliente visível')).not.toBeInTheDocument();
  });
  it('also hides remote account data on logout before offline preparation exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    render(<TermografiaListPage />);
    await waitFor(() => expect(screen.getByText('Cliente visível')).toBeInTheDocument());
    act(() => clearLocalIdentity());
    expect(screen.queryByText('Cliente visível')).not.toBeInTheDocument();
  });
});
