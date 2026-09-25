import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fichaComplementarDefinitions } from '@/lib/manutencao-preventiva/fichas-complementares';
import { FichaComplementarVisualizarPage } from './FichaComplementarVisualizarPage';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}));

vi.mock('@/lib/manutencao-preventiva/queries-mutations', () => ({
  createSupabaseManutencaoPreventivaClient: vi.fn(),
  getFichaComplementar: vi.fn(),
  getFichaComplementarById: vi.fn(),
  validateFichaComplementarIds: vi.fn(),
}));

describe('FichaComplementarVisualizarPage', () => {
  it('does not render a printable blank sheet when the URL ids are invalid', async () => {
    window.history.pushState({}, '', '?manutencaoId=manutencao-1&equipamentoId=equipamento-1');

    render(<FichaComplementarVisualizarPage definition={fichaComplementarDefinitions[0]} />);

    await waitFor(() => expect(screen.getByText('Identificador inválido: manutencaoId.')).toBeInTheDocument());
    expect(screen.queryByText('FICHA DE MANUTENÇÃO')).not.toBeInTheDocument();
  });
});
