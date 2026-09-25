'use client';

import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CurrencyInput } from './CurrencyInput';

function CurrencyInputHarness({ initialValue = '100' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);

  return (
    <>
      <CurrencyInput aria-label="Valor" value={value} onValueChange={setValue} />
      <output aria-label="Centavos persistidos">{value}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('CurrencyInput', () => {
  it('keeps freely typed text while focused instead of formatting every keystroke', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness />);

    const input = screen.getByLabelText('Valor');
    await user.clear(input);
    await user.type(input, '900');

    expect(input).toHaveValue('900');
    expect(screen.getByLabelText('Centavos persistidos')).toHaveTextContent('90000');
  });

  it('allows the user to erase the full value while editing', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue="90000" />);

    const input = screen.getByLabelText('Valor');
    expect(input).toHaveValue('R$ 900,00');

    await user.clear(input);

    expect(input).toHaveValue('');
    expect(screen.getByLabelText('Centavos persistidos')).toBeEmptyDOMElement();
  });

  it.each([
    ['900,50', '90050'],
    ['900.50', '90050'],
    ['0', '0'],
  ])('converts the friendly value %s to %s cents', async (typedValue, expectedCents) => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue="125050" />);

    const input = screen.getByLabelText('Valor');
    await user.clear(input);
    await user.type(input, typedValue);

    expect(input).toHaveValue(typedValue);
    expect(screen.getByLabelText('Centavos persistidos')).toHaveTextContent(expectedCents);
  });

  it('normalizes an edited prefilled value when focus leaves the input', async () => {
    const user = userEvent.setup();
    render(<CurrencyInputHarness initialValue="125050" />);

    const input = screen.getByLabelText('Valor');
    expect(input).toHaveValue('R$ 1.250,50');

    await user.clear(input);
    await user.type(input, '900,50');
    await user.tab();

    expect(input).toHaveValue('R$ 900,50');
    expect(screen.getByLabelText('Centavos persistidos')).toHaveTextContent('90050');
  });
});
