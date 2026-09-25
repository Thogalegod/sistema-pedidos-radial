import { expect, test, type Page } from '@playwright/test';

const qaEmail = process.env.E2E_QA_EMAIL;
const qaPassword = process.env.E2E_QA_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

test.beforeAll(() => {
  expect(qaEmail, 'Defina E2E_QA_EMAIL em .env.e2e.local.').toBeTruthy();
  expect(qaPassword, 'Defina E2E_QA_PASSWORD em .env.e2e.local.').toBeTruthy();
  expect(supabaseUrl, 'Defina NEXT_PUBLIC_SUPABASE_URL em .env.local.').toContain('iurqgskfuupslrghgtej');
  expect(supabaseAnonKey, 'Defina NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local.').toBeTruthy();
});

test.describe('Detalhe da locacao', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQaUser(page);
  });

  test('shows the Lote 1 operational detail structure for a persisted rental', async ({ page }) => {
    const stamp = Date.now().toString();
    const customerName = 'QA E2E Cliente 1786110500705';
    const siteName = 'QA E2E Obra 1786110500705';
    const itemName = `Detalhe QA Transformador ${stamp}`;
    const orderNumber = `QA-DET-${stamp}`;

    await page.goto('/contratos-locacoes/contratos');
    await expect(page.getByRole('link', { name: 'Locações' })).toBeVisible();

    await page.goto('/contratos-locacoes/contratos/novo');
    await page.locator('#contract-customer').selectOption({ label: customerName });
    await page.locator('#contract-site').selectOption({ label: siteName });
    await page.locator('#contract-start').fill('2026-08-07');
    await page.locator('#contract-legacy').fill(orderNumber);
    await page.getByLabel('Descrição do item').first().fill(itemName);
    await page.getByLabel('Tipo do item').first().fill('Transformador');
    await page.getByLabel('Quantidade').first().fill('2');
    await page.getByLabel('Valor unitário').first().fill('1500');
    await expect(page.getByText('Valor mensal total:')).toContainText('R$ 3.000,00');
    await page.getByRole('button', { name: 'Criar locação' }).click();

    await expect(page).toHaveURL(/\/contratos-locacoes\/contratos\/[0-9a-f-]+$/, { timeout: 30_000 });

    const rentalData = page.getByRole('region', { name: 'Dados da locação' });
    await expect(rentalData).toBeVisible();
    await expect(rentalData.getByText(customerName)).toBeVisible();
    await expect(rentalData.getByText(siteName)).toBeVisible();
    await expect(rentalData.getByText('2026-08-07')).toBeVisible();
    await expect(rentalData.getByText(orderNumber)).toBeVisible();
    await expect(rentalData.getByText('R$ 3.000,00')).toBeVisible();

    await expect(page.getByText(/^Recorrência$/i)).toHaveCount(0);
    await expect(page.getByText(/modelo de preço/i)).toHaveCount(0);
    await expect(page.getByText(/capacidade/i)).toHaveCount(0);
    await expect(page.getByText(/código interno/i)).toHaveCount(0);

    const equipment = page.getByRole('region', { name: 'Equipamentos locados' });
    await expect(equipment).toBeVisible();
    await expect(equipment.getByText(itemName)).toBeVisible();
    await expect(equipment.getByText('2', { exact: true })).toBeVisible();
    await expect(equipment.getByText('R$ 1.500,00')).toBeVisible();
    await expect(equipment.getByText('R$ 3.000,00').first()).toBeVisible();

    const finance = page.getByRole('region', { name: 'Financeiro da locação' });
    await expect(finance).toBeVisible();
    await expect(finance.getByText('R$ 3.000,00')).toBeVisible();
    await expect(finance.getByText('Nenhum período de cobrança gerado ainda.')).toBeVisible();

    const documents = page.getByRole('region', { name: 'Documentos' });
    await expect(documents).toBeVisible();
    await expect(documents.getByText('Sem NF de remessa informada.')).toBeVisible();
  });
});
