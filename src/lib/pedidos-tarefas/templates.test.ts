import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { TemplateDefinition } from './template-schema';
import {
  duplicateTemplate,
  instantiateTemplate,
  listTemplates,
  saveTemplate,
} from './templates';

let clientNumber = 0;

function templateClient(responses: Record<string, { data?: unknown; status?: number }>) {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const client = createClient('https://example.test', 'test-public-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `templates-test-${++clientNumber}`,
    },
    global: {
      fetch: async (url, init) => {
        const parsed = new URL(String(url));
        const rpc = parsed.pathname.split('/rpc/')[1];
        const key = rpc ?? 'pedido_templates';
        requests.push({
          method: init?.method ?? 'GET',
          path: `${parsed.pathname}${parsed.search}`,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        const response = responses[key] ?? { data: { message: `Unexpected request ${key}` }, status: 500 };
        return Response.json(response.data ?? null, { status: response.status ?? 200 });
      },
    },
  });
  return { client, requests };
}

function definition(): TemplateDefinition {
  return {
    schemaVersion: 1,
    fronts: [{ key: 'geral', name: 'Geral', position: 0 }],
    tasks: [{
      key: 'visita', frontKey: 'geral', title: 'Agendar visita', description: null,
      priority: 'Normal', dueRule: { kind: 'creation', offsetDays: 2 }, followUpRule: null,
    }],
    subtasks: [],
    dependencies: [],
  };
}

describe('pedido template RPC wrappers', () => {
  it('lists and validates versioned templates for the organization', async () => {
    const record = { id: 'template-a', nome: 'Instalação', version: 2, definition: definition() };
    const { client, requests } = templateClient({ pedido_templates: { data: [record] } });

    await expect(listTemplates(client, 'org-a')).resolves.toEqual([{
      id: 'template-a', name: 'Instalação', version: 2, definition: definition(),
    }]);
    expect(requests[0]).toMatchObject({ method: 'GET' });
    expect(requests[0].path).toContain('/rest/v1/pedido_templates?');
    expect(requests[0].path).toContain('organization_id=eq.org-a');
  });

  it('saves and duplicates templates only through scoped RPCs', async () => {
    const saved = { id: 'template-a', name: 'Instalação', version: 1, definition: definition() };
    const save = templateClient({ save_pedido_template: { data: saved } });
    await expect(saveTemplate(save.client, 'org-a', {
      id: null, name: 'Instalação', expectedVersion: null, definition: definition(),
    })).resolves.toEqual({ ok: true, value: saved });
    expect(save.requests[0]).toEqual({
      method: 'POST', path: '/rest/v1/rpc/save_pedido_template',
      body: { p_org: 'org-a', p_input: {
        id: null, name: 'Instalação', expectedVersion: null, definition: definition(),
      } },
    });

    const duplicate = templateClient({ duplicate_pedido_template: { data: { ...saved, id: 'template-b', name: 'Cópia' } } });
    await expect(duplicateTemplate(duplicate.client, 'org-a', 'template-a', 'Cópia'))
      .resolves.toMatchObject({ ok: true, value: { id: 'template-b', name: 'Cópia' } });
    expect(duplicate.requests[0]).toEqual({
      method: 'POST', path: '/rest/v1/rpc/duplicate_pedido_template',
      body: { p_org: 'org-a', p_id: 'template-a', p_name: 'Cópia' },
    });
  });

  it('instantiates with an idempotency key, expected version and IANA timezone', async () => {
    const { client, requests } = templateClient({ instantiate_pedido_template: { data: 'order-a' } });
    const input = {
      templateId: 'template-a', expectedVersion: 3, requestId: 'request-a',
      timeZone: 'America/Sao_Paulo',
      order: {
        number: 'PED-1', title: 'Projeto', client: 'Cliente', address: 'Rua A',
        legacyPriority: 'Normal' as const, utilityDueDate: null,
      },
    };

    await expect(instantiateTemplate(client, 'org-a', input))
      .resolves.toEqual({ ok: true, value: 'order-a' });
    expect(requests[0]).toEqual({
      method: 'POST', path: '/rest/v1/rpc/instantiate_pedido_template',
      body: { p_org: 'org-a', p_input: input },
    });
  });

  it('blocks completion-relative rules until 4C without issuing a write', async () => {
    const withCompletion = definition();
    withCompletion.tasks.push({
      key: 'preparo', frontKey: 'geral', title: 'Preparar', description: null,
      priority: 'Normal', dueRule: null, followUpRule: null,
    });
    withCompletion.tasks[0].dueRule = {
      kind: 'completion', sourceTaskKey: 'preparo', offsetDays: 1,
    };
    const save = templateClient({});

    await expect(saveTemplate(save.client, 'org-a', {
      id: null, name: 'Inválido neste gate', expectedVersion: null, definition: withCompletion,
    })).resolves.toMatchObject({ ok: false, code: 'invalid' });
    expect(save.requests).toEqual([]);
  });

  it('maps stale-version conflicts without pretending the write succeeded', async () => {
    const stale = templateClient({
      save_pedido_template: { data: { code: '40001', message: 'Template version conflict' }, status: 409 },
    });
    await expect(saveTemplate(stale.client, 'org-a', {
      id: 'template-a', name: 'Rascunho', expectedVersion: 1, definition: definition(),
    })).resolves.toEqual({ ok: false, code: 'reload', message: 'Template version conflict' });
  });
});
