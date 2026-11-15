'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalDraftStatus } from './LocalDraftStatus';

describe('LocalDraftStatus', () => {
  it('shows a conflict message and exposes explicit recovery actions', () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();

    render(
      <LocalDraftStatus
        status="conflict"
        onDiscard={onDiscard}
        onRestore={onRestore}
        savedAt="2026-07-06T12:00:00.000Z"
      />
    );

    expect(screen.getByText(/existe um rascunho local desta tela/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restaurar rascunho local/i }));
    fireEvent.click(screen.getByRole('button', { name: /descartar rascunho local/i }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
