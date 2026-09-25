'use client';

import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatBRL, parseBRL } from '@/lib/contratos-locacoes/money';

type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  onValueChange: (valueInCents: string) => void;
  value: number | string | null | undefined;
};

export function CurrencyInput({ onBlur, onFocus, onValueChange, value, ...inputProps }: CurrencyInputProps) {
  const [editing, setEditing] = useState(false);
  const [editingText, setEditingText] = useState(() => formatBRL(value));

  useEffect(() => {
    if (!editing) {
      setEditingText(formatBRL(value));
    }
  }, [editing, value]);

  return (
    <input
      {...inputProps}
      inputMode="decimal"
      value={editing ? editingText : formatBRL(value)}
      onBlur={(event) => {
        const normalizedValue = editingText.trim() === '' ? '' : String(parseBRL(editingText));
        onValueChange(normalizedValue);
        setEditingText(formatBRL(normalizedValue));
        setEditing(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextText = event.target.value;
        setEditingText(nextText);
        onValueChange(nextText.trim() === '' ? '' : String(parseBRL(nextText)));
      }}
      onFocus={(event) => {
        setEditingText(event.currentTarget.value);
        setEditing(true);
        onFocus?.(event);
      }}
    />
  );
}
