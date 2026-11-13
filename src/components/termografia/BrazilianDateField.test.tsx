import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrazilianDateField } from './BrazilianDateField';

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close'); });
describe('Brazilian inspection date', () => {
  it('always displays day/month/year while preserving the ISO value', () => {
    render(<BrazilianDateField value="2026-11-13" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Data da inspeção *')).toHaveValue('13/11/2026');
    expect(screen.getByLabelText('Data da inspeção *')).toHaveAttribute('inputmode', 'numeric');
  });
  it('accepts Brazilian typing and rejects impossible dates instead of swapping day and month', () => {
    const change = vi.fn();
    render(<BrazilianDateField value="2026-11-13" onChange={change} />);
    const input = screen.getByLabelText('Data da inspeção *');
    fireEvent.change(input, { target: { value: '25012027' } });
    expect(input).toHaveValue('25/01/2027'); expect(change).toHaveBeenLastCalledWith('2027-01-25');
    fireEvent.change(input, { target: { value: '31022027' } });
    expect(input).toBeInvalid(); expect(change).toHaveBeenLastCalledWith('');
  });
  it('shows a Portuguese calendar and saves the chosen date without time-zone conversion', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    function Form() { const [value, setValue] = useState('2026-11-13'); return <BrazilianDateField value={value} onChange={setValue} />; }
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir calendário' }));
    expect(screen.getByRole('heading', { name: 'novembro de 2026' })).toBeInTheDocument();
    expect(screen.getByText('Sáb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByRole('heading', { name: 'dezembro de 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '05/12/2026' }));
    expect(screen.getByLabelText('Data da inspeção *')).toHaveValue('05/12/2026');
  });
});
