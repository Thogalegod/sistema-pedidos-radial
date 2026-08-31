import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

const qaEmail = process.env.E2E_QA_EMAIL;
const qaPassword = process.env.E2E_QA_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const proofFixturePath = path.resolve('e2e/fixtures/payment-proof.pdf');

async function loginAsQaUser(page: Page) {
  if (!qaEmail || !qaPassword) {
    throw new Error('Defina E2E_QA_EMAIL e E2E_QA_PASSWORD para executar os fluxos autenticados.');
  }

  await page.goto('/login');
  await page.getByPlaceholder('Seu e-mail de acesso').fill(qaEmail);
  await page.getByPlaceholder('Sua senha').fill(qaPassword);
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function withQaSupabase<T>(callback: (client: any) => Promise<T>) {
  if (!supabaseUrl || !supabaseAnonKey || !qaEmail || !qaPassword) {
    throw new Error('Credenciais e configuração Supabase E2E incompletas.');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email: qaEmail,
    password: qaPassword,
  });

  if (error) {
    throw new Error(`Login QA falhou ao consultar persistência: ${error.message}`);
  }

  return callback(supabase);
}

async function readBillingPersistence(contractId: string) {
  return withQaSupabase(async (supabase) => {
    const { data: billingCycles, error: billingError } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('contract_id', contractId)
      .order('sequence_number', { ascending: true });

    if (billingError) {
      throw new Error(`Falha ao ler billing_cycles: ${billingError.message}`);
    }

    const persistedBillingCycles = (billingCycles ?? []) as any[];
    const billingIds = persistedBillingCycles.map((billing) => billing.id);
    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .in('billing_cycle_id', billingIds);

    if (paymentError) {
      throw new Error(`Falha ao ler payments: ${paymentError.message}`);
    }

    const { data: documents, error: documentError } = await supabase
      .from('contract_documents')
      .select('*')
      .eq('contract_id', contractId)
      .eq('kind', 'payment_proof');

    if (documentError) {
      throw new Error(`Falha ao ler contract_documents: ${documentError.message}`);
    }

    return {
      billingCycles: persistedBillingCycles,
      documents: (documents ?? []) as any[],
      payments: (payments ?? []) as any[],
    };
  });
}

test.beforeAll(() => {
  expect(qaEmail, 'Defina E2E_QA_EMAIL em .env.e2e.local.').toBeTruthy();
  expect(qaPassword, 'Defina E2E_QA_PASSWORD em .env.e2e.local.').toBeTruthy();
  expect(supabaseUrl, 'Defina NEXT_PUBLIC_SUPABASE_URL em .env.local.').toContain('iurqgskfuupslrghgtej');
  expect(supabaseAnonKey, 'Defina NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local.').toBeTruthy();
});

test.describe('Lote 2 financeiro da locacao', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQaUser(page);
  });

  test('gera periodos, registra envio, recebimentos parciais e comprovante no IURQ', async ({ page }) => {
    test.setTimeout(180_000);

    const stamp = Date.now().toString();
    const customerName = `QA Lote2 Cliente ${stamp}`;
    const siteName = `QA Lote2 Obra ${stamp}`;
    const itemName = `QA Lote2 Transformador ${stamp}`;
    const orderNumber = `QA-L2-${stamp}`;

    await page.goto('/contratos-locacoes/clientes/novo?returnTo=/contratos-locacoes/contratos/novo');
    await page.getByLabel('Razão social').fill(customerName);
    await page.getByLabel('Nome fantasia').fill(customerName);
    await page.getByLabel('CNPJ ou CPF').fill(`88${stamp}`.slice(0, 14).padEnd(14, '0'));
    await page.getByLabel('Nome da obra').fill(siteName);
    await page.getByLabel('Endereço').fill('Rua QA Lote 2');
    await page.getByLabel('Número').fill('200');
    await page.getByLabel('Bairro').fill('Centro');
    await page.getByLabel('Cidade').fill('Sao Paulo');
    await page.getByLabel('UF').fill('SP');
    await page.getByLabel('CEP').fill('01000-000');
    await page.getByLabel('Nome do contato').fill(`Contato ${stamp}`);
    await page.getByRole('button', { name: 'Salvar cliente' }).click();

    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/novo$/, { timeout: 30_000 });
    await page.locator('#contract-customer').selectOption({ label: customerName });
    await page.locator('#contract-site').selectOption({ label: siteName });
    await page.locator('#contract-start').fill('2026-08-08');
    await page.locator('#contract-legacy').fill(orderNumber);
    await page.getByLabel('Descrição do item').first().fill(itemName);
    await page.getByLabel('Tipo do item').first().fill('Transformador');
    await page.getByLabel('Quantidade').first().fill('2');
    await page.getByLabel('Valor unitário').first().fill('1500');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.000,00');
    await page.getByRole('button', { name: 'Criar locação' }).click();

    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/[0-9a-f-]+$/, { timeout: 30_000 });
    const contractUrl = page.url();
    const contractId = contractUrl.split('/').pop() ?? '';
    const finance = page.getByRole('region', { name: 'Financeiro da locação' });

    await expect(finance.getByText('Nenhum período de cobrança gerado ainda.')).toBeVisible();
    await finance.getByRole('button', { name: 'Gerar primeiro período' }).click();
    await expect(page.getByLabel('Início')).toHaveValue('2026-08-08');
    await expect(page.getByLabel('Fim')).toHaveValue('2026-09-07');
    await expect(page.getByLabel('Valor')).toHaveValue('R$ 3.000,00');
    await page.getByLabel('Vencimento').fill('2026-09-08');
    await page.getByLabel('Valor').fill('3100');
    await page.getByLabel('Observação').fill('Primeiro período QA Lote 2');
    await page.getByRole('button', { name: 'Salvar período' }).click();

    const firstPeriod = page.getByRole('article', { name: /Cobrança 08\/08\/2026 a 07\/09\/2026/ });
    await expect(firstPeriod.getByText(/^R\$ 3\.100,00$/)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(firstPeriod.getByText(/^R\$ 3\.100,00$/)).toBeVisible();
    await expect(firstPeriod.getByText('Primeiro período QA Lote 2')).toBeVisible();

    await finance.getByRole('button', { name: 'Gerar próximo período' }).click();
    await expect(page.getByLabel('Início')).toHaveValue('2026-09-08');
    await expect(page.getByLabel('Fim')).toHaveValue('2026-10-07');
    await expect(page.getByLabel('Valor')).toHaveValue('R$ 3.000,00');
    await page.getByRole('button', { name: 'Salvar período' }).click();
    await expect(page.getByRole('article', { name: /Cobrança 08\/09\/2026 a 07\/10\/2026/ })).toBeVisible({ timeout: 30_000 });

    await firstPeriod.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Observação').fill('Primeiro período editado QA Lote 2');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(firstPeriod.getByText('Primeiro período editado QA Lote 2')).toBeVisible({ timeout: 30_000 });

    await firstPeriod.getByRole('button', { name: 'Marcar como enviado' }).click();
    await expect(firstPeriod.getByText(/Enviado em/i)).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(firstPeriod.getByText(/Enviado em/i)).toBeVisible();

    await firstPeriod.getByRole('link', { name: 'Abrir recibo' }).click();
    await expect(page).toHaveURL(/\/contratos-locacoes\/recibos\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Dados do recibo' })).toBeVisible({ timeout: 30_000 });
    await page.goto(contractUrl);
    await expect(firstPeriod).toBeVisible();

    await firstPeriod.getByRole('button', { name: 'Registrar recebimento' }).click();
    const firstPaymentPanel = page.getByRole('heading', { name: 'Registrar recebimento' }).locator('..');
    await firstPaymentPanel.getByLabel('Valor recebido').fill('1000');
    await firstPaymentPanel.getByLabel('Observação').fill('Entrada parcial QA');
    await firstPaymentPanel.getByLabel('Comprovante opcional').setInputFiles(proofFixturePath);
    await firstPaymentPanel.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect.poll(async () => (await readBillingPersistence(contractId)).payments.length, {
      timeout: 45_000,
    }).toBe(1);
    await page.reload();
    await expect(firstPeriod.getByText('Recebido parcialmente')).toBeVisible({ timeout: 45_000 });
    await expect(firstPeriod.getByText('Recebido: R$ 1.000,00')).toBeVisible();
    await expect(firstPeriod.getByText('Saldo: R$ 2.100,00')).toBeVisible();

    await page.reload();
    await expect(firstPeriod.getByText('Recebido parcialmente')).toBeVisible();
    await expect(firstPeriod.getByText('Saldo: R$ 2.100,00')).toBeVisible();

    const partialPersistence = await readBillingPersistence(contractId);
    expect(partialPersistence.billingCycles).toHaveLength(2);
    expect(partialPersistence.billingCycles[0].sent_at).toBeTruthy();
    expect(partialPersistence.payments).toHaveLength(1);

    if (partialPersistence.documents.length === 0) {
      await firstPeriod
        .locator('label')
        .filter({ hasText: 'Anexar comprovante' })
        .locator('input[type="file"]')
        .setInputFiles(proofFixturePath);
      await expect(firstPeriod.getByRole('button', { name: 'Abrir comprovante' })).toBeVisible({ timeout: 30_000 });
    }

    const proofPersistence = await readBillingPersistence(contractId);
    expect(proofPersistence.documents).toHaveLength(1);
    expect(proofPersistence.documents[0].payment_id).toBe(proofPersistence.payments[0].id);

    const popupPromise = page.waitForEvent('popup', { timeout: 15_000 });
    await firstPeriod.getByRole('button', { name: 'Abrir comprovante' }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {});
    expect(popup.isClosed()).toBe(false);
    await popup.close();

    await firstPeriod.getByRole('button', { name: 'Registrar recebimento' }).click();
    const secondPaymentPanel = page.getByRole('heading', { name: 'Registrar recebimento' }).locator('..');
    await secondPaymentPanel.getByLabel('Valor recebido').fill('2100');
    await secondPaymentPanel.getByLabel('Observação').fill('Quitação QA');
    await secondPaymentPanel.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(firstPeriod.getByText('Paga')).toBeVisible({ timeout: 30_000 });
    await expect(firstPeriod.getByText('Saldo: R$ 0,00')).toBeVisible();
    await expect(firstPeriod.getByText(/Enviado em/i)).toBeVisible();

    await page.reload();
    await expect(firstPeriod.getByText('Paga')).toBeVisible();
    await expect(firstPeriod.getByText('Saldo: R$ 0,00')).toBeVisible();

    const finalPersistence = await readBillingPersistence(contractId);
    expect(finalPersistence.payments).toHaveLength(2);
    expect(finalPersistence.billingCycles[0].status).toBe('paid');
    expect(finalPersistence.documents).toHaveLength(1);

    await page.goto('/contratos-locacoes/cobrancas');
    await page.getByPlaceholder('Buscar por cliente, obra, OS ou documento').fill(customerName);
    const paidBillingRow = page
      .locator('article')
      .filter({ hasText: customerName })
      .filter({ hasText: '08/08/2026 a 07/09/2026' });
    await expect(paidBillingRow).toBeVisible({ timeout: 30_000 });
    await expect(paidBillingRow.getByText('Paga')).toBeVisible();
    await expect(paidBillingRow.getByText('Recebido: R$ 3.100,00')).toBeVisible();
    await expect(paidBillingRow.getByText('Saldo: R$ 0,00')).toBeVisible();
    await expect(paidBillingRow.getByText(/Enviado em/i)).toBeVisible();

    await page.goto('/contratos-locacoes');
    await expect(page.getByRole('link', { name: /Cobranças a emitir/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Vencendo em 7 dias/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Vencidas/ })).toBeVisible();
    await expect(page.getByText('Saldo em aberto', { exact: true })).toBeVisible();
    await expect(page.getByText('Em atraso', { exact: true })).toBeVisible();
  });
});
