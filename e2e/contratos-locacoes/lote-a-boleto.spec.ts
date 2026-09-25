import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const projectRef = 'iurqgskfuupslrghgtej';
const organizationId = '552c1ecb-c3aa-40b6-836a-b8f368c7c8f4';
const customerId = '6037b2b1-a65c-417e-8de8-a6ccf7a2936a';
const siteId = '551a5031-bffa-4980-8cad-398cc1beedd4';
const qaEmail = process.env.E2E_QA_EMAIL;
const qaPassword = process.env.E2E_QA_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const documentBucket = 'contratos-locacoes-docs';
const pdfFixturePath = path.resolve('e2e/fixtures/payment-proof.pdf');
const screenshotDirectory = path.resolve('test-results/lote-a-e2e');
const nonce = randomUUID();
const marker = `QA-LOTE-A-${nonce.slice(0, 12)}`;
const contractId = randomUUID();
const billingCycleId = randomUUID();
const paymentId = randomUUID();
const fixturePassword = `Qa-Lote-A-${randomUUID()}!`;
const adminEmail = `boleto-e2e-admin-${nonce}@local.test`;
const financeEmail = `boleto-e2e-finance-${nonce}@local.test`;
const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();
const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
const firstDay = `${monthKey}-01`;
const lastDay = `${monthKey}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
const protectedBillingFields = [
  'sent_at',
  'needs_resend',
  'content_revision',
  'boleto_change_pending',
  'boleto_change_operation_id',
  'boleto_change_started_at',
] as const;
const cliEnvironment = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: '1',
  DO_NOT_TRACK: '1',
};

let setupClient: SupabaseClient | undefined;
let adminUserId: string | undefined;
let financeUserId: string | undefined;
let fixtureWasInserted = false;
const createdUserIds: string[] = [];

type BillingObservation = {
  pathname: string;
  selectedColumns: string;
  rows: Array<Record<string, unknown>>;
};

type BrowserObservation = {
  failures: string[];
  billingResponses: BillingObservation[];
  boletoRequests: string[];
  settle: () => Promise<void>;
};

function dbExec(sql: string): Array<Record<string, unknown>> {
  const stdout = execFileSync('rtk', [
    'npx',
    'supabase',
    'db',
    'query',
    '--linked',
    '--project-ref',
    projectRef,
    sql.trim().replace(/\s+/g, ' '),
  ], {
    encoding: 'utf8',
    env: cliEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });

  const first = stdout.indexOf('{');
  const last = stdout.lastIndexOf('}');
  if (first === -1 || last === -1) {
    throw new Error('A consulta IURQ não retornou JSON reconhecível.');
  }

  const result = JSON.parse(stdout.slice(first, last + 1)) as {
    rows?: Array<Record<string, unknown>>;
  };
  return result.rows ?? [];
}

function createSetupClient() {
  const stdout = execFileSync('rtk', [
    'npx',
    'supabase',
    'projects',
    'api-keys',
    '--project-ref',
    projectRef,
    '--reveal',
    '--output',
    'json',
  ], {
    encoding: 'utf8',
    env: cliEnvironment,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 120_000,
  });

  const first = stdout.indexOf('[');
  const last = stdout.lastIndexOf(']');
  if (first === -1 || last === -1) {
    throw new Error('A consulta das chaves IURQ não retornou JSON reconhecível.');
  }

  const apiKeys = JSON.parse(stdout.slice(first, last + 1)) as Array<{
    api_key: string;
    disabled?: boolean;
    type: string;
  }>;
  const secretKey = apiKeys.find((key) => key.type === 'secret' && !key.disabled)?.api_key;
  if (!secretKey) {
    throw new Error('Não foi encontrada chave administrativa IURQ para fixtures temporários.');
  }

  return createClient(`https://${projectRef}.supabase.co`, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function authenticatedClient(email: string, password: string) {
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Configuração pública Supabase E2E incompleta.');
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Autenticação do perfil E2E falhou: ${error.message}`);
  }
  return client;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.waitForFunction(() => {
    const emailInput = document.querySelector('input[type="email"]');
    return emailInput !== null && Object.keys(emailInput).some((key) => key.startsWith('__reactProps$'));
  });
  await page.getByPlaceholder('Seu e-mail de acesso').fill(email);
  await page.getByPlaceholder('Sua senha').fill(password);
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

function observeBrowser(page: Page): BrowserObservation {
  const failures: string[] = [];
  const billingResponses: BillingObservation[] = [];
  const boletoRequests: string[] = [];
  const pending = new Set<Promise<void>>();

  page.on('pageerror', (error) => failures.push(`runtime: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== '/favicon.ico') {
      failures.push(`network: ${response.status()} ${response.request().method()} ${url.pathname}`);
    }

    if (url.pathname.endsWith('/rest/v1/contract_documents') && url.searchParams.get('kind') === 'eq.boleto') {
      boletoRequests.push(url.pathname);
    }

    if (!url.pathname.endsWith('/rest/v1/billing_cycles') || response.request().method() !== 'GET') {
      return;
    }

    const capture = response.json()
      .then((data: unknown) => {
        billingResponses.push({
          pathname: url.pathname,
          rows: Array.isArray(data) ? data as Array<Record<string, unknown>> : [],
          selectedColumns: url.searchParams.get('select') ?? '',
        });
      })
      .catch((error: unknown) => {
        failures.push(`network: leitura da resposta de cobrança falhou: ${String(error)}`);
      })
      .finally(() => pending.delete(capture));
    pending.add(capture);
  });

  return {
    failures,
    billingResponses,
    boletoRequests,
    settle: async () => {
      while (pending.size > 0) {
        await Promise.all([...pending]);
      }
    },
  };
}

async function assertHealthy(observation: BrowserObservation) {
  await observation.settle();
  expect(observation.failures, 'Falhas materiais de console/runtime/network').toEqual([]);
}

function assertNoProtectedBillingData(observation: BrowserObservation) {
  expect(observation.billingResponses.length, 'A página deve consultar ciclos de cobrança.').toBeGreaterThan(0);

  for (const response of observation.billingResponses) {
    for (const field of protectedBillingFields) {
      expect(response.selectedColumns, `Campo protegido solicitado: ${field}`).not.toContain(field);
      for (const row of response.rows) {
        expect(row, `Campo protegido recebido: ${field}`).not.toHaveProperty(field);
      }
    }
  }

  expect(observation.boletoRequests, 'Member comum não deve requisitar documentos boleto.').toEqual([]);
}

async function openDocumentAndAssertIurq(page: Page, button: Locator) {
  const documentResponsePromise = page.context().waitForEvent('response', {
    predicate: (response) => {
      const url = new URL(response.url());
      return url.hostname === `${projectRef}.supabase.co`
        && url.pathname.includes('/storage/v1/object/sign/')
        && response.request().method() === 'GET';
    },
    timeout: 30_000,
  });
  const popupPromise = page.waitForEvent('popup', { timeout: 30_000 });
  await button.click();
  const popup = await popupPromise;
  const documentResponse = await documentResponsePromise;
  const destination = new URL(documentResponse.url());
  expect(destination.hostname).toBe(`${projectRef}.supabase.co`);
  expect(destination.pathname).toContain('/storage/v1/object/sign/');
  expect(documentResponse.status()).toBe(200);
  expect(documentResponse.headers()['content-type']).toContain('application/pdf');
  if (!popup.isClosed()) {
    await popup.close();
  }
}

function contractUrl() {
  return `/contratos-locacoes/contratos/${contractId}`;
}

test.describe.configure({ mode: 'serial' });

test.describe('Lote A: boleto e permissões financeiras no IURQ', () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    expect(process.env.E2E_BASE_URL).toBe('http://localhost:3001');
    expect(supabaseUrl).toBe(`https://${projectRef}.supabase.co`);
    expect(qaEmail, 'Defina E2E_QA_EMAIL.').toBeTruthy();
    expect(qaPassword, 'Defina E2E_QA_PASSWORD.').toBeTruthy();
    expect(publishableKey, 'Defina NEXT_PUBLIC_SUPABASE_ANON_KEY.').toBeTruthy();

    mkdirSync(screenshotDirectory, { recursive: true });
    setupClient = createSetupClient();

    for (const [profile, email] of [['admin', adminEmail], ['finance', financeEmail]] as const) {
      const { data, error } = await setupClient.auth.admin.createUser({
        email,
        password: fixturePassword,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Falha ao criar usuário temporário ${profile}: ${error?.message ?? 'sem usuário'}`);
      }
      createdUserIds.push(data.user.id);
      if (profile === 'admin') adminUserId = data.user.id;
      if (profile === 'finance') financeUserId = data.user.id;
    }

    fixtureWasInserted = true;
    dbExec(`
      INSERT INTO public.organization_members (organization_id, user_id, role, can_manage_billing)
      VALUES
        ('${organizationId}', '${adminUserId}', 'admin', false),
        ('${organizationId}', '${financeUserId}', 'member', true);
      INSERT INTO public.contracts
        (id, organization_id, internal_number, kind, contract_company, customer_id, site_id,
         legacy_order_number, has_remittance_invoice, remittance_invoice_number,
         remittance_invoice_issuer, remittance_invoice_amount, remittance_invoice_issue_date,
         start_date, recurrence_days, pricing_model, base_amount, status)
      VALUES
        ('${contractId}', '${organizationId}',
         (SELECT COALESCE(MAX(internal_number), 0) + 1 FROM public.contracts WHERE organization_id = '${organizationId}'),
         'rental', 'fontes', '${customerId}', '${siteId}', '${marker}', true,
         'NF-${nonce.slice(0, 8)}', 'Fontes', 10000, '${firstDay}',
         '${firstDay}', 30, 'fixed', 10000, 'active');
      INSERT INTO public.rental_items
        (id, organization_id, contract_id, description, equipment_type, capacity,
         serial_number, internal_code, quantity, unit_amount, status)
      VALUES
        ('${randomUUID()}', '${organizationId}', '${contractId}',
         'Transformador temporário ${marker}', 'Transformador', '75 kVA',
         '${nonce.slice(0, 8)}', '${nonce.slice(0, 8)}', 1, 10000, 'rented');
      INSERT INTO public.billing_cycles
        (id, organization_id, contract_id, sequence_number, period_start, period_end,
         issue_date, due_date, base_amount, discount_amount, surcharge_amount,
         exemption_amount, total_amount, document_type, status, sent_at)
      VALUES
        ('${billingCycleId}', '${organizationId}', '${contractId}', 1,
         '${firstDay}', '${lastDay}', '${firstDay}', '${lastDay}',
         10000, 0, 0, 0, 10000, 'receipt', 'issued', '${firstDay}T12:00:00Z');
      INSERT INTO public.payments (id, organization_id, billing_cycle_id, paid_at, amount, notes)
      VALUES ('${paymentId}', '${organizationId}', '${billingCycleId}',
        '${firstDay}T13:00:00Z', 2500, 'Recebimento temporário ${marker}');
      SELECT id FROM public.contracts WHERE id = '${contractId}';
    `);
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    if (!setupClient) return;

    const failures: string[] = [];
    try {
      if (fixtureWasInserted) {
        const documents = dbExec(`
          SELECT storage_path FROM public.contract_documents
          WHERE contract_id = '${contractId}' AND organization_id = '${organizationId}';
        `);
        const paths = documents.map((document) => String(document.storage_path));
        if (paths.length > 0) {
          const { error } = await setupClient.storage.from(documentBucket).remove(paths);
          if (error) failures.push(`Storage temporário: ${error.message}`);
        }

        dbExec(`
          DELETE FROM public.billing_delivery_events WHERE billing_cycle_id = '${billingCycleId}';
          DELETE FROM public.contract_documents WHERE contract_id = '${contractId}';
          DELETE FROM public.payments WHERE billing_cycle_id = '${billingCycleId}';
          DELETE FROM public.billing_lines WHERE billing_cycle_id = '${billingCycleId}';
          DELETE FROM public.billing_cycles WHERE id = '${billingCycleId}';
          DELETE FROM public.rental_items WHERE contract_id = '${contractId}';
          DELETE FROM public.contracts WHERE id = '${contractId}' AND legacy_order_number = '${marker}';
          DELETE FROM public.organization_members
          WHERE organization_id = '${organizationId}'
            AND user_id IN ('${adminUserId}', '${financeUserId}');
          SELECT COUNT(*) AS remaining_fixture_contracts FROM public.contracts WHERE id = '${contractId}';
        `);
      } else if (createdUserIds.length > 0) {
        dbExec(`
          DELETE FROM public.organization_members
          WHERE organization_id = '${organizationId}'
            AND user_id IN (${createdUserIds.map((id) => `'${id}'`).join(', ')});
          SELECT 0 AS remaining_fixture_contracts;
        `);
      }
    } catch (error) {
      failures.push(`Dados temporários IURQ: ${error instanceof Error ? error.message : String(error)}`);
    }

    for (const userId of createdUserIds) {
      const { error } = await setupClient.auth.admin.deleteUser(userId);
      if (error) failures.push(`Usuário temporário ${userId}: ${error.message}`);
    }

    expect(failures, 'Todo fixture temporário do Lote A deve ser removido.').toEqual([]);
  });

  test('admin abre locação, enxerga cobrança protegida, anexa e lê boleto', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, adminEmail, fixturePassword);
    const adminClient = await authenticatedClient(adminEmail, fixturePassword);
    const { data: membership, error } = await adminClient
      .from('organization_members')
      .select('role, can_manage_billing')
      .eq('organization_id', organizationId)
      .eq('user_id', adminUserId!)
      .single();
    expect(error).toBeNull();
    expect(membership).toMatchObject({ role: 'admin', can_manage_billing: false });

    const observation = observeBrowser(page);
    await page.goto(contractUrl());
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('QA E2E Cliente 1786110500705')).toBeVisible();
    await expect(page.getByText('QA E2E Obra 1786110500705')).toBeVisible();

    const finance = page.getByRole('region', { name: 'Financeiro da locação' });
    const billing = finance.getByRole('article').first();
    await expect(billing).toBeVisible();
    await expect(billing.getByText(/Enviado em/)).toBeVisible();
    await expect(billing.getByText('Recebido: R$ 25,00')).toBeVisible();
    await billing.getByLabel('Anexar boleto').setInputFiles(pdfFixturePath);
    await expect(billing.getByRole('button', { name: 'Abrir boleto' })).toBeVisible({ timeout: 45_000 });
    await expect(billing.getByText(/Alterada após o último envio/)).toBeVisible();
    await openDocumentAndAssertIurq(page, billing.getByRole('button', { name: 'Abrir boleto' }));
    await observation.settle();
    expect(observation.billingResponses.some((response) => response.selectedColumns.includes('content_revision'))).toBe(true);
    await page.screenshot({ path: path.join(screenshotDirectory, '01-admin-detalhe-boleto.png'), fullPage: true });
    await assertHealthy(observation);
  });

  test('member financeiro substitui boleto único sem adquirir privilégios administrativos', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, financeEmail, fixturePassword);
    const financeClient = await authenticatedClient(financeEmail, fixturePassword);
    const { data: before, error: beforeError } = await financeClient
      .from('organization_members')
      .select('role, can_manage_billing')
      .eq('organization_id', organizationId)
      .eq('user_id', financeUserId!)
      .single();
    expect(beforeError).toBeNull();
    expect(before).toMatchObject({ role: 'member', can_manage_billing: true });

    const observation = observeBrowser(page);
    await page.goto(contractUrl());
    const billing = page.getByRole('region', { name: 'Financeiro da locação' }).getByRole('article').first();
    await expect(billing.getByRole('button', { name: 'Abrir boleto' })).toBeVisible({ timeout: 30_000 });
    await expect(billing.getByText(/Enviado em/)).toBeVisible();
    await billing.getByLabel('Substituir boleto').setInputFiles(pdfFixturePath);
    await expect(billing.getByRole('button', { name: 'Abrir boleto' })).toBeVisible({ timeout: 45_000 });
    await expect(billing.getByText(/Alterada após o último envio/)).toBeVisible();
    await openDocumentAndAssertIurq(page, billing.getByRole('button', { name: 'Abrir boleto' }));

    const { data: documents, error: documentsError } = await financeClient
      .from('contract_documents')
      .select('id, billing_cycle_id, kind, storage_path')
      .eq('contract_id', contractId)
      .eq('billing_cycle_id', billingCycleId)
      .eq('kind', 'boleto');
    expect(documentsError).toBeNull();
    expect(documents).toHaveLength(1);
    expect(documents![0].storage_path).toBe(`${organizationId}/${contractId}/boleto/${billingCycleId}.pdf`);

    const { error: privilegeEscalationError } = await financeClient
      .from('organization_members')
      .update({ role: 'admin' })
      .eq('organization_id', organizationId)
      .eq('user_id', financeUserId!);
    expect(privilegeEscalationError, 'Member financeiro não pode tornar-se administrador.').not.toBeNull();
    const { data: after } = await financeClient
      .from('organization_members')
      .select('role, can_manage_billing')
      .eq('organization_id', organizationId)
      .eq('user_id', financeUserId!)
      .single();
    expect(after).toMatchObject({ role: 'member', can_manage_billing: true });

    await page.screenshot({ path: path.join(screenshotDirectory, '02-financeiro-substituicao.png'), fullPage: true });
    await assertHealthy(observation);
  });

  test('cobranças exibem boleto e indicadores somente ao member financeiro', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, financeEmail, fixturePassword);
    const observation = observeBrowser(page);
    await page.goto('/contratos-locacoes/cobrancas');
    await page.getByPlaceholder('Buscar por cliente, pedido ou documento').fill(marker);
    const billing = page.locator('article').filter({ hasText: marker });
    await expect(billing).toBeVisible({ timeout: 30_000 });
    await expect(billing.getByText('Boleto anexado')).toBeVisible();
    await expect(billing.getByText(/Enviada em/)).toBeVisible();
    await expect(billing.getByText('Alterada após envio')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDirectory, '03-financeiro-lista-cobrancas.png'), fullPage: true });
    await assertHealthy(observation);
  });

  test('member comum abre detalhe sem UI, requests ou respostas financeiras protegidas', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, qaEmail!, qaPassword!);
    const memberClient = await authenticatedClient(qaEmail!, qaPassword!);
    const { data: membership, error: membershipError } = await memberClient
      .from('organization_members')
      .select('role, can_manage_billing')
      .eq('organization_id', organizationId)
      .single();
    expect(membershipError).toBeNull();
    expect(membership).toMatchObject({ role: 'member', can_manage_billing: false });
    const observation = observeBrowser(page);
    await page.goto(contractUrl());
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 30_000 });
    const billing = page.getByRole('region', { name: 'Financeiro da locação' }).getByRole('article').first();
    await expect(billing).toBeVisible();
    await expect(billing.getByText('Recebido: R$ 25,00')).toBeVisible();
    await expect(billing.getByText(/Enviado em|Alterada após o último envio|Concluir alteração pendente/)).toHaveCount(0);
    await expect(billing.getByRole('button', { name: 'Abrir boleto' })).toHaveCount(0);
    await expect(billing.getByLabel('Anexar boleto')).toHaveCount(0);
    await expect(billing.getByLabel('Substituir boleto')).toHaveCount(0);
    await observation.settle();
    assertNoProtectedBillingData(observation);
    await page.screenshot({ path: path.join(screenshotDirectory, '04-member-detalhe-restrito.png'), fullPage: true });
    await assertHealthy(observation);
  });

  test('member comum consulta cobranças sem indicadores ou payload financeiro interno', async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, qaEmail!, qaPassword!);
    const observation = observeBrowser(page);
    await page.goto('/contratos-locacoes/cobrancas');
    await page.getByPlaceholder('Buscar por cliente, pedido ou documento').fill(marker);
    const billing = page.locator('article').filter({ hasText: marker });
    await expect(billing).toBeVisible({ timeout: 30_000 });
    await expect(billing.getByText(/Boleto anexado|Boleto não anexado|Enviada em|Não enviada|Alterada após envio/)).toHaveCount(0);
    await expect(billing.getByText('Recebido: R$ 25,00')).toBeVisible();
    await observation.settle();
    assertNoProtectedBillingData(observation);
    await page.screenshot({ path: path.join(screenshotDirectory, '05-member-lista-restrita.png'), fullPage: true });
    await assertHealthy(observation);
  });

  test('NF de remessa e comprovante continuam funcionando para member comum', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, qaEmail!, qaPassword!);
    const observation = observeBrowser(page);
    await page.goto(contractUrl());

    const remittance = page.getByRole('region', { name: 'NF de remessa' });
    await expect(remittance.getByText(`NF-${nonce.slice(0, 8)}`)).toBeVisible({ timeout: 30_000 });
    await remittance.getByLabel('Arquivo da NF de remessa').setInputFiles(pdfFixturePath);
    const openRemittance = remittance.getByRole('button', { name: 'Abrir/Baixar' });
    await expect(openRemittance).toBeVisible({ timeout: 45_000 });
    await openDocumentAndAssertIurq(page, openRemittance);

    const billing = page.getByRole('region', { name: 'Financeiro da locação' }).getByRole('article').first();
    await billing.getByLabel('Anexar comprovante').setInputFiles(pdfFixturePath);
    const openProof = billing.getByRole('button', { name: 'Abrir comprovante' });
    await expect(openProof).toBeVisible({ timeout: 45_000 });
    await openDocumentAndAssertIurq(page, openProof);

    const memberClient = await authenticatedClient(qaEmail!, qaPassword!);
    const { data: documents, error } = await memberClient
      .from('contract_documents')
      .select('kind, billing_cycle_id, payment_id')
      .eq('contract_id', contractId);
    expect(error).toBeNull();
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'remittance_nf' }),
      expect.objectContaining({ kind: 'payment_proof', billing_cycle_id: billingCycleId, payment_id: paymentId }),
    ]));
    expect(documents?.some((document) => document.kind === 'boleto')).toBe(false);

    await observation.settle();
    assertNoProtectedBillingData(observation);
    await page.screenshot({ path: path.join(screenshotDirectory, '06-member-nf-comprovante.png'), fullPage: true });
    await assertHealthy(observation);
  });
});
