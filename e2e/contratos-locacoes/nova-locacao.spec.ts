import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const qaEmail = process.env.E2E_QA_EMAIL;
const qaPassword = process.env.E2E_QA_PASSWORD;
const expectedOrganizationId = '552c1ecb-c3aa-40b6-836a-b8f368c7c8f4';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function loginAsQaUser(page: Page) {
  if (!qaEmail || !qaPassword) {
    throw new Error('Defina E2E_QA_EMAIL e E2E_QA_PASSWORD para executar os fluxos autenticados.');
  }

  await page.goto('/login');
  await page.waitForFunction(() => {
    const emailInput = document.querySelector('input[type="email"]');
    return emailInput !== null && Object.keys(emailInput).some((key) => key.startsWith('__reactProps$'));
  });
  await page.getByPlaceholder('Seu e-mail de acesso').fill(qaEmail);
  await page.getByPlaceholder('Sua senha').fill(qaPassword);
  await page.getByRole('button', { name: 'Entrar no Sistema' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function readQaMemberships() {
  if (!supabaseUrl || !supabaseAnonKey || !qaEmail || !qaPassword) {
    throw new Error('Credenciais e configuração Supabase E2E incompletas.');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: qaEmail,
    password: qaPassword,
  });

  if (authError) {
    throw new Error(`Login QA falhou ao verificar membership: ${authError.message}`);
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .limit(10);

  if (error) {
    throw new Error(`Não foi possível ler memberships do usuário QA: ${error.message}`);
  }

  return data;
}

test.beforeAll(() => {
  expect(qaEmail, 'Defina E2E_QA_EMAIL em .env.e2e.local.').toBeTruthy();
  expect(qaPassword, 'Defina E2E_QA_PASSWORD em .env.e2e.local.').toBeTruthy();
  expect(supabaseUrl, 'Defina NEXT_PUBLIC_SUPABASE_URL em .env.local.').toContain('iurqgskfuupslrghgtej');
  expect(supabaseAnonKey, 'Defina NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local.').toBeTruthy();
});

test('login page is reachable by the E2E runner', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Radial' })).toBeVisible();
  await expect(page.getByPlaceholder('Seu e-mail de acesso')).toBeVisible();
  await expect(page.getByPlaceholder('Sua senha')).toBeVisible();
});

test.describe('Nova locacao', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQaUser(page);
  });

  test('uses the expected Radial Energia organization membership', async ({ page }) => {
    const membership = await readQaMemberships();

    expect(membership).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: expectedOrganizationId,
        }),
      ]),
    );
  });

  test('shows locacoes in the module header and opens the list page', async ({ page }) => {
    await page.goto('/contratos-locacoes');

    await expect(page.getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/contratos-locacoes');
    await expect(page.getByRole('link', { name: 'Locações' })).toHaveAttribute('href', '/contratos-locacoes/contratos');
    await expect(page.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/contratos-locacoes/clientes');
    await expect(page.getByRole('link', { name: 'Cobranças' })).toHaveAttribute('href', '/contratos-locacoes/cobrancas');
    await expect(page.getByRole('link', { name: 'Nova locação' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Locações' }).click();
    await expect(page).toHaveURL('/contratos-locacoes/contratos');
    await expect(page.getByText('Veja os contratos de locação já criados e abra um registro para continuar o trabalho.')).toHaveCount(0);
    await expect(page.getByPlaceholder('Buscar por cliente, obra, número ou pedido/OS')).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Nova locação' })).toHaveAttribute(
      'href',
      '/contratos-locacoes/contratos/novo',
    );
    await expect(page.getByRole('link', { name: 'Nova locação' })).toHaveClass(/bg-blue-600/);
  });

  test('shows the QA rental in the list and opens its detail page', async ({ page }) => {
    await page.goto('/contratos-locacoes/contratos');

    const qaRentalLink = page
      .locator('article')
      .filter({ hasText: 'QA-1786110500705' })
      .getByRole('link', { name: 'Abrir locação de QA E2E Cliente 1786110500705' });
    await expect(qaRentalLink).toBeVisible();
    await expect(qaRentalLink).toContainText('QA E2E Cliente 1786110500705');
    await expect(qaRentalLink).toContainText('QA E2E Obra 1786110500705');

    await qaRentalLink.click();
    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/af48a3da-8734-4d38-8ccc-0307d7f6091f$/);
    await expect(page.getByText('QA E2E Cliente 1786110500705')).toBeVisible();
    await expect(page.getByText('QA E2E Obra 1786110500705')).toBeVisible();
    await expect(page.getByText('QA-1786110500705')).toBeVisible();
  });

  test('creates a customer from Nova locacao and persists a rental with item totals', async ({ page }) => {
    const stamp = Date.now().toString();
    const customerName = `QA E2E Cliente ${stamp}`;
    const siteName = `QA E2E Obra ${stamp}`;
    const firstItem = `Transformador QA ${stamp}`;
    const secondItem = `Cabo QA ${stamp}`;

    await page.goto('/contratos-locacoes/contratos/novo');
    await expect(page.getByRole('heading', { name: 'Nova locação' })).toBeVisible();

    await expect(page.getByRole('link', { name: 'Novo cliente' })).toHaveAttribute(
      'href',
      '/contratos-locacoes/clientes/novo?returnTo=/contratos-locacoes/contratos/novo',
    );
    await expect(page.getByLabel('Valor mensal padrão')).toHaveCount(0);
    await expect(page.getByLabel('Capacidade')).toHaveCount(0);
    await expect(page.getByLabel('Código interno')).toHaveCount(0);

    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 0,00');
    await page.getByLabel('Descrição do item').first().fill(firstItem);
    await page.getByLabel('Tipo do item').first().fill('Transformador');
    await page.getByLabel('Quantidade').first().fill('2');
    await page.getByLabel('Valor unitário').first().fill('1500');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.000,00');

    await page.getByRole('button', { name: 'Adicionar item' }).click();
    await page.getByLabel('Descrição do item').nth(1).fill(secondItem);
    await page.getByLabel('Tipo do item').nth(1).fill('Acessório');
    await page.getByLabel('Quantidade').nth(1).fill('1');
    await page.getByLabel('Valor unitário').nth(1).fill('250');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.250,00');

    await page.getByLabel('Quantidade').first().fill('3');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 4.750,00');
    await page.getByLabel('Quantidade').first().fill('2');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.250,00');

    await page.getByRole('button', { name: 'Remover' }).nth(1).click();
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.000,00');
    await expect(page.getByRole('heading', { name: 'Item 2' })).toHaveCount(0);
    await page.waitForTimeout(500);

    await page.getByRole('link', { name: 'Novo cliente' }).click();
    await expect(page).toHaveURL(/\/contratos-locacoes\/clientes\/novo\?returnTo=/);
    await expect(page.getByRole('heading', { name: 'Novo cliente' })).toBeVisible();

    await page.getByLabel('Razão social').fill(customerName);
    await page.getByLabel('Nome fantasia').fill(customerName);
    await page.getByLabel('CNPJ ou CPF').fill(`99${stamp}`.slice(0, 14).padEnd(14, '0'));
    await page.getByLabel('Nome da obra').fill(siteName);
    await page.getByLabel('Endereço').fill('Rua QA Automatizado');
    await page.getByLabel('Número').fill('100');
    await page.getByLabel('Bairro').fill('Centro');
    await page.getByLabel('Cidade').fill('Sao Paulo');
    await page.getByLabel('UF').fill('SP');
    await page.getByLabel('CEP').fill('01000-000');
    await page.getByLabel('Nome do contato').fill(`Contato ${stamp}`);
    await page.getByRole('button', { name: 'Salvar cliente' }).click();

    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/novo$/, { timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Novo cliente' })).toBeVisible();
    const customerSelect = page.locator('#contract-customer');
    const siteSelect = page.locator('#contract-site');
    const customerFieldGroup = page.getByLabel('Cliente').locator('..');

    await expect(customerSelect).toContainText(customerName, { timeout: 30_000 });
    await expect(customerFieldGroup.getByRole('link', { name: 'Novo cliente' })).toHaveCount(1);
    await expect(customerFieldGroup.getByRole('link', { name: 'Novo cliente' })).toHaveClass(/bg-blue-600/);
    await customerSelect.selectOption({ label: customerName });
    await expect(siteSelect).toContainText(siteName, { timeout: 30_000 });
    await siteSelect.selectOption({ label: siteName });
    await page.locator('#contract-start').fill('2026-08-07');
    await page.locator('#contract-legacy').fill(`QA-${stamp}`);

    await page.getByRole('button', { name: 'Criar locação' }).click();

    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/[0-9a-f-]+$/, { timeout: 30_000 });
    const contractUrl = page.url();
    const contractData = page.getByLabel('Dados da locação');
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(siteName)).toBeVisible();
    await expect(page.getByText(firstItem)).toBeVisible();
    await expect(contractData.getByText('R$ 3.000,00')).toBeVisible();

    await page.goto('/contratos-locacoes/contratos');
    await expect(page.getByText(customerName)).toBeVisible();
    await page.goto(contractUrl);
    const reloadedContractData = page.getByLabel('Dados da locação');
    await expect(page.getByText(customerName)).toBeVisible();
    await expect(page.getByText(siteName)).toBeVisible();
    await expect(page.getByText(firstItem)).toBeVisible();
    await expect(reloadedContractData.getByText('R$ 3.000,00')).toBeVisible();
  });
});
