'use client';

import { act } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerForm } from './CustomerForm';
import { createLocalDraftKey, saveLocalDraft } from '@/lib/contratos-locacoes/local-draft';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CustomerForm', () => {
  it('hydrates the create form without mismatched dynamic ids', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(<CustomerForm submitLabel="Salvar cliente" onSubmit={vi.fn()} />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot> | null = null;

    await act(async () => {
      root = hydrateRoot(container, <CustomerForm submitLabel="Salvar cliente" onSubmit={vi.fn()} />);
      await Promise.resolve();
    });

    const hydrationMismatchFound = consoleErrorSpy.mock.calls.some((call) =>
      call.some((value) => String(value).includes('A tree hydrated but some attributes'))
    );

    root?.unmount();
    consoleErrorSpy.mockRestore();

    expect(hydrationMismatchFound).toBe(false);
  });

  it('submits multiple sites and keeps both general and site-specific contacts', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(<CustomerForm submitLabel="Salvar cliente" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByLabelText(/razão social/i), {
      target: { value: 'Radial Energia LTDA' },
    });
    fireEvent.change(screen.getByLabelText(/nome fantasia/i), {
      target: { value: 'Radial' },
    });

    const siteNames = screen.getAllByLabelText(/nome da obra/i);
    fireEvent.change(siteNames[0], { target: { value: 'Matriz' } });
    fireEvent.change(screen.getAllByLabelText(/endereço/i)[0], {
      target: { value: 'Rua A' },
    });
    fireEvent.change(screen.getAllByLabelText(/^número$/i)[0], {
      target: { value: '100' },
    });
    fireEvent.change(screen.getAllByLabelText(/bairro/i)[0], {
      target: { value: 'Centro' },
    });
    fireEvent.change(screen.getAllByLabelText(/cidade/i)[0], {
      target: { value: 'Campinas' },
    });
    fireEvent.change(screen.getAllByLabelText(/^uf$/i)[0], {
      target: { value: 'SP' },
    });
    fireEvent.change(screen.getAllByLabelText(/cep/i)[0], {
      target: { value: '13000-000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /adicionar obra/i }));

    const updatedSiteNames = screen.getAllByLabelText(/nome da obra/i);
    fireEvent.change(updatedSiteNames[1], { target: { value: 'Filial' } });
    fireEvent.change(screen.getAllByLabelText(/endereço/i)[1], {
      target: { value: 'Rua B' },
    });
    fireEvent.change(screen.getAllByLabelText(/^número$/i)[1], {
      target: { value: '200' },
    });
    fireEvent.change(screen.getAllByLabelText(/bairro/i)[1], {
      target: { value: 'Bairro' },
    });
    fireEvent.change(screen.getAllByLabelText(/cidade/i)[1], {
      target: { value: 'Sorocaba' },
    });
    fireEvent.change(screen.getAllByLabelText(/^uf$/i)[1], {
      target: { value: 'SP' },
    });
    fireEvent.change(screen.getAllByLabelText(/cep/i)[1], {
      target: { value: '18000-000' },
    });

    fireEvent.change(screen.getAllByLabelText(/nome do contato/i)[0], {
      target: { value: 'Ana Financeiro' },
    });
    fireEvent.click(screen.getByRole('button', { name: /adicionar contato/i }));
    fireEvent.change(screen.getAllByLabelText(/nome do contato/i)[1], {
      target: { value: 'Carlos Obra' },
    });

    const scopeSelects = screen.getAllByLabelText(/vincular à obra/i);
    fireEvent.change(scopeSelects[1], { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar cliente/i }));

    await waitFor(() => expect(handleSubmit).toHaveBeenCalledTimes(1));

    const payload = handleSubmit.mock.calls[0][0];

    expect(payload.sites).toHaveLength(2);
    expect(payload.contacts).toHaveLength(2);
    expect(payload.contacts[0].site_id).toBeNull();
    expect(payload.contacts[1].site_id).toBe(payload.sites[1].id);
  });

  it('restores a saved local draft for the create flow', async () => {
    const storageKey = createLocalDraftKey('clientes/novo');

    saveLocalDraft(storageKey, {
      data: {
        legal_name: 'Cliente recuperado',
        trade_name: 'Recuperado',
        tax_id: null,
        state_registration: null,
        municipal_registration: null,
        notes: null,
        active: true,
        sites: [
          {
            id: 'site-1',
            name: 'Obra restaurada',
            address_line: 'Rua A',
            number: '10',
            complement: null,
            district: 'Centro',
            city: 'Campinas',
            state: 'SP',
            postal_code: '13000-000',
            notes: null,
            active: true,
          },
        ],
        contacts: [
          {
            id: 'contact-1',
            name: 'Contato restaurado',
            job_title: null,
            department: null,
            phone: null,
            whatsapp: null,
            email: null,
            site_id: null,
            is_primary: false,
            receives_billing: false,
            receives_technical: false,
            notes: null,
          },
        ],
      },
      baseFingerprint: null,
    });

    render(<CustomerForm draftStorageKey={storageKey} submitLabel="Salvar cliente" onSubmit={vi.fn()} />);

    expect(await screen.findByDisplayValue('Cliente recuperado')).toBeInTheDocument();
    expect(screen.getByText(/rascunho local salvo neste navegador/i)).toBeInTheDocument();
  });
});
