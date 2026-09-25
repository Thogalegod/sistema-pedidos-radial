import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskFixture } from '@/lib/pedidos-tarefas/test-fixtures';
import { FrontEditor } from './FrontEditor';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const fronts = [
  { id: 'front-a', orderId: 'order-a', name: 'Obra', position: 0 },
  { id: 'front-b', orderId: 'order-a', name: 'Documentos', position: 1 },
];

describe('FrontEditor', () => {
  it('requires a same-order destination before removing a Front with tasks', async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FrontEditor orderId="order-a" fronts={fronts}
      tasks={[taskFixture({ frontId: 'front-a' })]} onSave={vi.fn()} onRemove={onRemove}
      onReorder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover Frente Obra' }));
    expect(onRemove).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Mover tarefas de Obra para'), 'front-b');
    await userEvent.click(screen.getByRole('button', { name: 'Remover Frente Obra' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith('front-a', 'front-b');
  });

  it('does not remove anything when confirmation is cancelled', async () => {
    const onRemove = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<FrontEditor orderId="order-a" fronts={fronts} tasks={[]}
      onSave={vi.fn()} onRemove={onRemove} onReorder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remover Frente Obra' }));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('uses explicit up/down controls for persistent ordering', async () => {
    const onReorder = vi.fn().mockResolvedValue(true);
    render(<FrontEditor orderId="order-a" fronts={fronts} tasks={[]}
      onSave={vi.fn()} onRemove={vi.fn()} onReorder={onReorder} />);
    await userEvent.click(screen.getByRole('button', { name: 'Subir Frente Documentos' }));
    expect(onReorder).toHaveBeenCalledWith('front-b', 'up');
  });
});
