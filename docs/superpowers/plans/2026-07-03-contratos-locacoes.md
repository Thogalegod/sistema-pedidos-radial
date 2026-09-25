# Contratos e Locações — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um módulo móvel de contratos e locações com cadastro central, cobranças recorrentes, itens, vistorias offline, fotos, assinaturas, PDFs e importação das planilhas atuais.

**Architecture:** Um núcleo relacional Supabase concentra organização, clientes, obras, contatos, contratos, ciclos de cobrança e auditoria; tabelas adicionais habilitam itens e vistorias somente em locações. A interface Next.js App Router é dividida por responsabilidade, usa regras puras testadas para datas e estados, RLS para isolamento, IndexedDB para a fila offline e Storage privado para arquivos. Cada fase termina com software testável e um commit pequeno.

**Tech Stack:** Next.js 16.2.4 App Router, React 19.2, TypeScript 5, Tailwind CSS 4, Supabase Database/Auth/Storage, `date-fns`, `zod`, `dexie`, `browser-image-compression`, `@react-pdf/renderer`, `xlsx`, `jszip`, Vitest e Testing Library.

**Design aprovado:** `docs/superpowers/specs/2026-07-03-contratos-locacoes-design.md`

---

## Instruções obrigatórias ao agente executor

1. Ler `AGENTS.md`, a especificação acima e este plano por completo.
2. Antes de editar Next.js, ler em `node_modules/next/dist/docs/` os guias correspondentes. Para este plano, começar por:
   - `01-app/01-getting-started/04-linking-and-navigating.md`
   - `01-app/01-getting-started/15-route-handlers.md`
   - `01-app/02-guides/forms.md`
3. Criar uma branch `codex/contratos-locacoes` ou um worktree isolado. Não trabalhar diretamente em `main`.
4. Atualizar a branch com `origin/main` antes de instalar dependências, pois a termografia pode alterar `package.json`, `src/lib/storage.ts` e a infraestrutura de testes.
5. Seguir TDD: teste falho, implementação mínima, teste verde, commit.
6. Não alterar os outros módulos, exceto o cartão de acesso em `src/app/hub/page.tsx` e utilitários compartilhados explicitamente citados.
7. Não aplicar migrações em produção sem backup e aprovação do responsável pelo Supabase.

## Estrutura de arquivos planejada

```text
supabase/migrations/
  202607030001_contracts_rentals_core.sql
  202607030002_contracts_rentals_storage.sql
src/app/contratos-locacoes/
  layout.tsx
  page.tsx
  loading.tsx
  clientes/page.tsx
  clientes/novo/page.tsx
  clientes/[id]/page.tsx
  contratos/page.tsx
  contratos/novo/page.tsx
  contratos/[id]/page.tsx
  contratos/[id]/vistoria/page.tsx
  cobrancas/page.tsx
  importar/page.tsx
src/components/contratos-locacoes/
  ModuleHeader.tsx
  DashboardCards.tsx
  AlertList.tsx
  CustomerForm.tsx
  CustomerList.tsx
  ContractForm.tsx
  ContractSummary.tsx
  BillingForm.tsx
  BillingTable.tsx
  RentalItemsEditor.tsx
  InspectionEditor.tsx
  PhotoCapture.tsx
  SignaturePad.tsx
  SyncStatus.tsx
  ImportPreview.tsx
src/lib/contratos-locacoes/
  types.ts
  schemas.ts
  dates.ts
  money.ts
  numbering.ts
  transitions.ts
  queries.ts
  mutations.ts
  dashboard.ts
  storage.ts
  image.ts
  offline-db.ts
  sync.ts
  pdf/
    DeliveryDocument.tsx
    ReturnDocument.tsx
  import/
    workbook.ts
    normalize.ts
    validate.ts
    apply.ts
  *.test.ts
src/test/
  setup.ts
vitest.config.ts
```

Evitar arquivos de página gigantes. Páginas coordenam carregamento e navegação; regras ficam em `src/lib/contratos-locacoes`; formulários e visualizações ficam em componentes.

## Fase 0 — Preparar uma base isolada

### Task 1: Branch, dependências e testes

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create if absent: `vitest.config.ts`
- Create if absent: `src/test/setup.ts`
- Create: `src/lib/contratos-locacoes/smoke.test.ts`

- [ ] **Step 1: Sincronizar e isolar o trabalho**

```powershell
git fetch origin
git switch -c codex/contratos-locacoes origin/main
git status --short
```

Expected: branch `codex/contratos-locacoes`; nenhuma alteração não relacionada. Se a branch já existir, criar um worktree com a skill `superpowers:using-git-worktrees`.

- [ ] **Step 2: Conferir o que a termografia já instalou**

```powershell
npm ls vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event zod dexie @react-pdf/renderer xlsx jszip --depth=0
```

Expected: o comando pode indicar pacotes ausentes; isso é apenas diagnóstico. Não remover versões trazidas por outro trabalho.

- [ ] **Step 3: Instalar somente as dependências ausentes**

```powershell
npm install zod dexie @react-pdf/renderer xlsx jszip
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Garantir em `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Configurar testes somente se ainda não existirem**

`vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Criar e executar o teste de fumaça**

```ts
import { describe, expect, it } from 'vitest';

describe('contratos e locações', () => {
  it('inicializa a infraestrutura de testes', () => {
    expect(true).toBe(true);
  });
});
```

Run: `npm test -- src/lib/contratos-locacoes/smoke.test.ts`

Expected: 1 teste PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/lib/contratos-locacoes/smoke.test.ts
git commit -m "test: prepara modulo de contratos e locacoes"
```

## Fase 1 — Banco, segurança e regras puras

### Task 2: Criar o esquema relacional e RLS

**Files:**
- Create: `supabase/migrations/202607030001_contracts_rentals_core.sql`
- Create: `src/lib/contratos-locacoes/types.ts`

- [ ] **Step 1: Criar a migração com enums e tabelas**

A migração deve usar `CREATE TABLE IF NOT EXISTS`, chaves UUID com `gen_random_uuid()`, `created_at`, `updated_at` e as tabelas abaixo:

```sql
CREATE TYPE contract_kind AS ENUM ('rental', 'energy_management', 'recurring_service', 'other');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'paused', 'closing_requested', 'awaiting_return', 'inspection', 'closed', 'cancelled');
CREATE TYPE rental_item_status AS ENUM ('rented', 'returned', 'replaced', 'lost_damaged', 'suspended_exempt');
CREATE TYPE billing_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'exempt', 'cancelled');
CREATE TYPE inspection_kind AS ENUM ('departure', 'return');
CREATE TYPE sync_state AS ENUM ('local', 'uploading', 'synced', 'failed');

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
```

Adicionar as tabelas funcionais, com `organization_id` obrigatório em todas:

```text
customers, customer_sites, customer_contacts,
contracts, rental_items,
billing_cycles, billing_lines, payments,
inspections, inspection_photos, signatures,
contract_documents, audit_events, import_batches, import_rows
```

Campos obrigatórios por tabela:

- `customers`: legal_name, trade_name, tax_id, state_registration, municipal_registration, notes, active.
- `customer_sites`: customer_id, name, address_line, number, complement, district, city, state, postal_code, notes, active.
- `customer_contacts`: customer_id, site_id nullable, name, job_title, department, phone, whatsapp, email, is_primary, receives_billing, receives_technical, notes.
- `contracts`: internal_number bigint gerado por sequence da organização, kind, customer_id, site_id, legacy_order_number, start_date, end_date, recurrence_days default 30, pricing_model, base_amount, percentage_rate, status, pause_started_at, pause_reason, notes.
- `rental_items`: contract_id, description, equipment_type, capacity, serial_number, internal_code, quantity, unit_amount, status, future_inventory_item_id nullable.
- `billing_cycles`: contract_id, sequence_number, period_start, period_end, issue_date, due_date, base_amount, discount_amount, surcharge_amount, exemption_amount, total_amount, document_type, document_number, status, notes.
- `billing_lines`: billing_cycle_id, rental_item_id nullable, description, quantity, unit_amount, total_amount, kind com `recurring`, `damage`, `discount`, `surcharge`.
- `payments`: billing_cycle_id, paid_at, amount, notes.
- `inspections`: contract_id, rental_item_id, kind, inspected_at, responsible_user_id, condition_notes, accessories, existing_damage, return_damage, missing_accessories, estimated_cost, resolution.
- `inspection_photos`: inspection_id, client_idempotency_key unique por organização, storage_path, thumbnail_path, sync_state, caption, taken_at.
- `signatures`: inspection_id, client_idempotency_key unique por organização, storage_path, signer_name, signer_document, signed_at, sync_state.
- `contract_documents`: contract_id, billing_cycle_id nullable, inspection_id nullable, kind, storage_path, file_name, content_type, created_by.
- `audit_events`: actor_user_id, entity_type, entity_id, action, old_values jsonb, new_values jsonb.
- `import_batches`: file_name, checksum unique por organização, status, summary jsonb, created_by.
- `import_rows`: batch_id, source_file, source_sheet, source_row, entity_type, source_key, status, errors jsonb, imported_entity_id.

- [ ] **Step 2: Adicionar restrições e índices**

Incluir no SQL:

```sql
CREATE UNIQUE INDEX customers_org_tax_id_uidx
  ON customers (organization_id, regexp_replace(coalesce(tax_id, ''), '\D', '', 'g'))
  WHERE tax_id IS NOT NULL AND tax_id <> '';
CREATE UNIQUE INDEX billing_document_org_uidx
  ON billing_cycles (organization_id, document_number)
  WHERE document_number IS NOT NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX billing_contract_sequence_uidx
  ON billing_cycles (contract_id, sequence_number);
CREATE INDEX billing_due_status_idx
  ON billing_cycles (organization_id, status, due_date);
CREATE INDEX contracts_customer_status_idx
  ON contracts (organization_id, customer_id, status);
```

Adicionar `CHECK` para valores monetários não negativos, `recurrence_days > 0`, `period_end >= period_start`, `quantity > 0` e sequência entre 1 e 999.

- [ ] **Step 3: Criar isolamento por organização**

Criar função `is_organization_member(target_org uuid)` com `SECURITY DEFINER`, `SET search_path = public` e consulta a `organization_members`. Habilitar RLS em todas as tabelas do módulo. Criar policies de `SELECT`, `INSERT`, `UPDATE` e, somente onde permitido, `DELETE`, usando associação do usuário autenticado.

Não permitir `DELETE` em `contracts`, `billing_cycles`, `payments`, `inspections`, `contract_documents` e `audit_events`. Cancelamento ou inativação substituem exclusão.

- [ ] **Step 4: Criar organização inicial e associar usuários atuais**

```sql
INSERT INTO organizations (name, slug)
VALUES ('Radial Energia', 'radial')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO organization_members (organization_id, user_id, role)
SELECT o.id, u.id, 'admin'
FROM organizations o CROSS JOIN auth.users u
WHERE o.slug = 'radial'
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

Novos usuários não entram automaticamente. Um administrador deve associá-los conscientemente.

- [ ] **Step 5: Criar tipos TypeScript equivalentes**

Em `types.ts`, declarar uniões com os mesmos valores dos enums e interfaces `Customer`, `CustomerSite`, `CustomerContact`, `Contract`, `RentalItem`, `BillingCycle`, `BillingLine`, `Payment`, `Inspection`, `InspectionPhoto`, `Signature`, `ContractDocument`, `AuditEvent`.

Teste de compilação: `npx tsc --noEmit`.

- [ ] **Step 6: Aplicar em ambiente de desenvolvimento e verificar**

Antes: exportar backup pelo painel Supabase. Aplicar a migração apenas no projeto de desenvolvimento. Executar:

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('customers', 'contracts', 'billing_cycles', 'inspections');
```

Expected: quatro linhas com `rowsecurity = true`.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/202607030001_contracts_rentals_core.sql src/lib/contratos-locacoes/types.ts
git commit -m "feat: cria modelo seguro de contratos e locacoes"
```

### Task 3: Regras de datas, dinheiro, numeração e estados

**Files:**
- Create: `src/lib/contratos-locacoes/dates.ts`
- Create: `src/lib/contratos-locacoes/dates.test.ts`
- Create: `src/lib/contratos-locacoes/money.ts`
- Create: `src/lib/contratos-locacoes/money.test.ts`
- Create: `src/lib/contratos-locacoes/numbering.ts`
- Create: `src/lib/contratos-locacoes/numbering.test.ts`
- Create: `src/lib/contratos-locacoes/transitions.ts`
- Create: `src/lib/contratos-locacoes/transitions.test.ts`

- [ ] **Step 1: Escrever testes falhos**

Cobrir os contratos abaixo:

```ts
expect(nextPeriod('2026-01-21', 30)).toEqual({ start: '2026-01-21', end: '2026-02-19', due: '2026-02-20' });
expect(alertLevel('2026-02-13', '2026-02-20')).toBe('due_soon');
expect(alertLevel('2026-02-20', '2026-02-20')).toBe('due_today');
expect(alertLevel('2026-02-21', '2026-02-20')).toBe('overdue');

expect(calculateBilling({ base: 2000, discount: 100, surcharge: 50, exemption: 0 })).toBe(1950);
expect(receiptNumber('260121', 1)).toBe('R260121001');
expect(receiptNumber('260121', 999)).toBe('R260121999');
expect(() => receiptNumber('260121', 1000)).toThrow(/999/);

expect(canTransitionContract('active', 'closing_requested')).toBe(true);
expect(canTransitionContract('closed', 'active')).toBe(false);
expect(canCloseRental([{ status: 'returned' }, { status: 'lost_damaged' }])).toBe(true);
expect(canCloseRental([{ status: 'rented' }])).toBe(false);
```

- [ ] **Step 2: Confirmar falhas**

Run: `npm test -- src/lib/contratos-locacoes`

Expected: FAIL porque as funções ainda não existem.

- [ ] **Step 3: Implementar regras puras**

- `nextPeriod(start, days)`: fim inclusivo em `days - 1`; vencimento no dia seguinte ao fim.
- `alertLevel(today, due)`: `ok`, `due_soon`, `due_today`, `overdue`; `due_soon` começa sete dias antes.
- `calculateBilling`: base menos desconto e isenção, mais acréscimo, nunca abaixo de zero.
- `receiptNumber`: regex de seis dígitos, sequência de 1 a 999, exatamente dez caracteres.
- `canTransitionContract`: mapa explícito da máquina de estados aprovada.
- `canCloseRental`: somente `returned`, `replaced`, `lost_damaged` ou `suspended_exempt` são resolvidos.

- [ ] **Step 4: Rodar testes e commit**

```powershell
npm test -- src/lib/contratos-locacoes
npx tsc --noEmit
git add src/lib/contratos-locacoes
git commit -m "feat: define regras de cobranca e ciclo contratual"
```

Expected: testes PASS e TypeScript sem erros.

## Fase 2 — Cadastro central e navegação

### Task 4: Validação, consultas e mutações

**Files:**
- Create: `src/lib/contratos-locacoes/schemas.ts`
- Create: `src/lib/contratos-locacoes/schemas.test.ts`
- Create: `src/lib/contratos-locacoes/queries.ts`
- Create: `src/lib/contratos-locacoes/mutations.ts`
- Create: `src/lib/contratos-locacoes/mutations.test.ts`

- [ ] **Step 1: Definir esquemas Zod e testes**

Criar `customerSchema`, `siteSchema`, `contactSchema`, `contractSchema`, `billingSchema`, `rentalItemSchema` e `inspectionSchema`. Normalizar CNPJ/CPF para dígitos, e-mail vazio para `null`, UF para duas letras maiúsculas e dinheiro para centavos inteiros antes de persistir.

Testar rejeição de cliente sem razão social, período invertido, quantidade zero, sequência 1000 e documento emitido vazio.

- [ ] **Step 2: Criar consultas focadas**

`queries.ts` deve exportar:

```ts
listCustomers(filters)
getCustomer(id)
listContracts(filters)
getContract(id)
listBillings(filters)
getDashboardSnapshot(today)
```

Cada consulta obtém a organização pela associação do usuário e nunca recebe `organization_id` livre da interface.

- [ ] **Step 3: Criar mutações atômicas**

`mutations.ts` deve exportar criação/edição de cliente, obra, contato, contrato, item, cobrança, pagamento, pausa, reativação e mudança de estado. Cada mutação valida com Zod, executa a operação e insere `audit_events`.

Operações compostas críticas — emissão de cobrança, pagamento e transição de contrato — devem usar funções SQL/RPC transacionais, não várias chamadas independentes do navegador.

- [ ] **Step 4: Testar erros do repositório**

Com um cliente Supabase falso, verificar que erro de banco vira mensagem clara e que nenhuma auditoria é registrada quando a operação principal falha.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/lib/contratos-locacoes
npm run lint -- src/lib/contratos-locacoes
git add src/lib/contratos-locacoes supabase/migrations/202607030001_contracts_rentals_core.sql
git commit -m "feat: adiciona validacao e repositorio de contratos"
```

### Task 5: Layout do módulo e cadastro de clientes

**Files:**
- Create: `src/app/contratos-locacoes/layout.tsx`
- Create: `src/app/contratos-locacoes/loading.tsx`
- Create: `src/app/contratos-locacoes/clientes/page.tsx`
- Create: `src/app/contratos-locacoes/clientes/novo/page.tsx`
- Create: `src/app/contratos-locacoes/clientes/[id]/page.tsx`
- Create: `src/components/contratos-locacoes/ModuleHeader.tsx`
- Create: `src/components/contratos-locacoes/CustomerForm.tsx`
- Create: `src/components/contratos-locacoes/CustomerForm.test.tsx`
- Create: `src/components/contratos-locacoes/CustomerList.tsx`

- [ ] **Step 1: Testar o formulário**

Montar `CustomerForm`, preencher empresa, duas obras e dois contatos; confirmar que o payload mantém contato geral e contato vinculado à obra. Verificar mensagens para razão social vazia, CNPJ duplicado e e-mail inválido.

- [ ] **Step 2: Criar navegação responsiva**

O `layout.tsx` oferece links para `Painel`, `Clientes`, `Contratos`, `Cobranças` e `Importar`. Em celular, usar cabeçalho compacto com menu; em desktop, navegação horizontal. `loading.tsx` mostra skeleton sem bloquear o layout.

- [ ] **Step 3: Criar listagem e busca**

`clientes/page.tsx` busca por razão social, nome fantasia, CNPJ/CPF e cidade. Filtros: ativos/inativos. Cada linha abre `/contratos-locacoes/clientes/[id]`.

- [ ] **Step 4: Criar formulário em etapas**

Etapas: `Empresa`, `Obras/locais`, `Contatos`, `Revisão`. Permitir adicionar/remover linhas antes de salvar; desabilitar o envio enquanto pendente; manter dados após erro.

- [ ] **Step 5: Criar detalhe editável**

O detalhe mostra dados centrais, obras, contatos e contratos ligados. Inativar em vez de excluir cliente com histórico.

- [ ] **Step 6: Verificar e commit**

```powershell
npm test -- src/components/contratos-locacoes/CustomerForm.test.tsx
npm run lint -- src/app/contratos-locacoes src/components/contratos-locacoes
npx tsc --noEmit
git add src/app/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: cria cadastro central de clientes e obras"
```

## Fase 3 — Contratos, cobranças e painel

### Task 6: Criar contratos e locações

**Files:**
- Create: `src/app/contratos-locacoes/contratos/page.tsx`
- Create: `src/app/contratos-locacoes/contratos/novo/page.tsx`
- Create: `src/app/contratos-locacoes/contratos/[id]/page.tsx`
- Create: `src/components/contratos-locacoes/ContractForm.tsx`
- Create: `src/components/…10 tokens truncated…`
- Create: `src/components/contratos-locacoes/ContractSummary.tsx`
- Create: `src/components/contratos-locacoes/RentalItemsEditor.tsx`
- Create: `src/components/contratos-locacoes/RentalItemsEditor.test.tsx`

- [ ] **Step 1: Testar tipos e campos condicionais**

Verificar que `rental` exige ao menos um item e exibe remessa/entrega; `energy_management` oferece fixo, variável, percentual e fixo + variável; contratos sem equipamento não exibem vistoria.

- [ ] **Step 2: Implementar o assistente de criação**

Etapas: `Tipo`, `Cliente e obra`, `Condições`, `Equipamentos` quando locação, `Contatos e documentos`, `Revisão`. O padrão é 30 dias, mas aceitar inteiro positivo personalizado.

- [ ] **Step 3: Implementar itens manuais**

Cada item recebe tipo, descrição, potência/capacidade, série/código, quantidade e valor. Gerar UUID no navegador para preservar identidade durante foto e sincronização futura.

- [ ] **Step 4: Implementar listagem e detalhe**

Busca por cliente, obra, número interno e pedido/OS. Filtros de tipo e status. Detalhe com abas `Resumo`, `Itens`, `Cobranças`, `Vistorias`, `Documentos`, `Histórico`.

- [ ] **Step 5: Implementar pausa e reativação**

Pausa exige data e motivo. Enquanto pausado, esconder ação de emitir período e mostrar faixa explicativa. Reativação exige data; não apagar cobranças anteriores.

- [ ] **Step 6: Verificar e commit**

```powershell
npm test -- src/components/contratos-locacoes
npm run lint -- src/app/contratos-locacoes src/components/contratos-locacoes
git add src/app/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: adiciona contratos e itens de locacao"
```

### Task 7: Cobranças, pagamentos e numeração

**Files:**
- Create: `src/app/contratos-locacoes/cobrancas/page.tsx`
- Create: `src/components/contratos-locacoes/BillingForm.tsx`
- Create: `src/components/contratos-locacoes/BillingForm.test.tsx`
- Create: `src/components/contratos-locacoes/BillingTable.tsx`
- Modify: `supabase/migrations/202607030001_contracts_rentals_core.sql`

- [ ] **Step 1: Criar RPCs transacionais e testes SQL**

Criar:

```text
issue_billing(contract_id, period_start, period_end, issue_date, due_date,
  document_type, document_number, lines_json, adjustments_json)
record_payment(billing_cycle_id, paid_at, amount, notes)
transition_contract(contract_id, target_status, reason, occurred_at)
```

Cada RPC valida organização, estado e unicidade; calcula o total no banco; grava auditoria; retorna o registro final. `record_payment` marca `paid` apenas quando a soma recebida cobre o total; pagamento parcial permanece `issued` ou `overdue`.

- [ ] **Step 2: Testar o formulário de emissão**

Cobrir valor-base, linhas por equipamento, desconto, acréscimo, isenção e justificativa. Para recibo novo, sugerir `R######001`; permitir documento legado e NFe sem converter.

- [ ] **Step 3: Criar tela de cobranças**

Filtros: a emitir, vencendo em sete dias, vencidas, emitidas, pagas, isentas e canceladas. Busca por cliente, pedido/OS e documento. Mostrar saldo quando houver pagamento parcial.

- [ ] **Step 4: Implementar cobrança de dano**

No dano, oferecer `Cobrança separada` ou `Adicionar ao próximo período`. A primeira cria ciclo/linha de dano; a segunda cria linha pendente vinculada ao contrato e a consome na próxima emissão.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/components/contratos-locacoes/BillingForm.test.tsx src/lib/contratos-locacoes
npm run lint -- src/app/contratos-locacoes/cobrancas src/components/contratos-locacoes
git add supabase/migrations/202607030001_contracts_rentals_core.sql src/app/contratos-locacoes src/components/contratos-locacoes src/lib/contratos-locacoes
git commit -m "feat: controla cobrancas e pagamentos recorrentes"
```

### Task 8: Painel e alertas

**Files:**
- Create: `src/app/contratos-locacoes/page.tsx`
- Create: `src/components/contratos-locacoes/DashboardCards.tsx`
- Create: `src/components/contratos-locacoes/DashboardCards.test.tsx`
- Create: `src/components/contratos-locacoes/AlertList.tsx`
- Create: `src/lib/contratos-locacoes/dashboard.ts`
- Create: `src/lib/contratos-locacoes/dashboard.test.ts`

- [ ] **Step 1: Testar o snapshot do painel**

Com dados fixos, verificar contagens e somas de vencidas, sete dias, a emitir, ativas, pausadas, aguardando retorno, previsto, emitido, pago e em atraso. Isentas e canceladas não entram no previsto ou atraso.

- [ ] **Step 2: Implementar uma consulta agregada**

Evitar uma consulta por cartão. Usar view ou RPC `contracts_dashboard_snapshot(today date)` que retorna todos os totais e listas prioritárias em uma chamada.

- [ ] **Step 3: Implementar interface móvel**

Ordem: alertas urgentes, atalhos, valores e atividade. Cada cartão abre a listagem com filtro correspondente. Alertas vencidos usam texto e ícone, não somente cor.

- [ ] **Step 4: Verificar e commit**

```powershell
npm test -- src/lib/contratos-locacoes/dashboard.test.ts src/components/contratos-locacoes/DashboardCards.test.tsx
npm run lint -- src/app/contratos-locacoes/page.tsx src/components/contratos-locacoes src/lib/contratos-locacoes/dashboard.ts
git add src/app/contratos-locacoes src/components/contratos-locacoes src/lib/contratos-locacoes supabase/migrations/202607030001_contracts_rentals_core.sql
git commit -m "feat: adiciona painel e alertas de vencimento"
```

## Fase 4 — Vistorias, fotos, assinatura e offline

### Task 9: Storage privado, imagem e assinatura

**Files:**
- Create: `supabase/migrations/202607030002_contracts_rentals_storage.sql`
- Create: `src/lib/contratos-locacoes/storage.ts`
- Create: `src/lib/contratos-locacoes/image.ts`
- Create: `src/lib/contratos-locacoes/image.test.ts`
- Create: `src/components/contratos-locacoes/PhotoCapture.tsx`
- Create: `src/components/contratos-locacoes/PhotoCapture.test.tsx`
- Create: `src/components/contratos-locacoes/SignaturePad.tsx`
- Create: `src/components/contratos-locacoes/SignaturePad.test.tsx`

- [ ] **Step 1: Criar bucket e policies**

Bucket privado `contratos-locacoes`. Caminho obrigatório:

```text
{organization_id}/{contract_id}/{inspection_id}/{photo_or_signature_id}.jpg
```

Policies consultam associação do usuário e validam o primeiro segmento do caminho. Proibir acesso público; leitura usa URL assinada curta.

- [ ] **Step 2: Testar compactação e nomes**

`compressEvidencePhoto(file)` deve limitar o lado maior a 1920 px, usar JPEG com qualidade inicial 0,82 e alvo de até 900 KB, sem falhar quando a foto já for pequena. `evidencePath` deve usar IDs, nunca índice de tela.

- [ ] **Step 3: Implementar captura de foto**

Aceitar câmera ou galeria, mostrar preview, legenda, remover antes de sincronizar e status individual. Compactar no navegador antes de colocar na fila.

- [ ] **Step 4: Implementar assinatura em canvas**

Capturar traço, limpar, nome, documento e consentimento simples. Exportar PNG/JPEG somente quando houver traço e nome. Não representar assinatura certificada.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/lib/contratos-locacoes/image.test.ts src/components/contratos-locacoes/PhotoCapture.test.tsx src/components/contratos-locacoes/SignaturePad.test.tsx
npm run lint -- src/lib/contratos-locacoes src/components/contratos-locacoes
git add supabase/migrations/202607030002_contracts_rentals_storage.sql src/lib/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: prepara evidencias fotograficas e assinatura"
```

### Task 10: Fila offline idempotente

**Files:**
- Create: `src/lib/contratos-locacoes/offline-db.ts`
- Create: `src/lib/contratos-locacoes/offline-db.test.ts`
- Create: `src/lib/contratos-locacoes/sync.ts`
- Create: `src/lib/contratos-locacoes/sync.test.ts`
- Create: `src/components/contratos-locacoes/SyncStatus.tsx`
- Create: `src/components/contratos-locacoes/SyncStatus.test.tsx`

- [ ] **Step 1: Definir banco IndexedDB**

Usar Dexie com tabelas `inspectionDrafts` e `uploadQueue`. Cada item da fila tem `idempotencyKey`, organizationId, userId, contractId, inspectionId, kind, blob, metadata, attempts, nextAttemptAt, status e lastError.

- [ ] **Step 2: Testar persistência e isolamento**

Cobrir fechamento/reabertura do banco, dois usuários no mesmo aparelho, remoção somente após confirmação e reprocessamento sem duplicidade.

- [ ] **Step 3: Implementar sincronizador**

Processar uma fila por vez; upload para caminho determinístico; `upsert: false`; inserir metadados com chave idempotente; considerar conflito de chave como sucesso quando o caminho remoto for o mesmo. Repetir com espera progressiva de 2 s, 10 s, 30 s, 2 min e 5 min. Parar ao ficar offline.

- [ ] **Step 4: Implementar indicador permanente**

Estados e textos exatos:

```text
Salvando neste celular
Salva neste celular — aguardando sincronização
Sincronizando
Sincronizada
Falha ao sincronizar — tentar novamente
```

Mostrar contagem pendente. Oferecer `Tentar novamente`; nunca afirmar que está sincronizado antes da confirmação do banco.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/lib/contratos-locacoes/offline-db.test.ts src/lib/contratos-locacoes/sync.test.ts src/components/contratos-locacoes/SyncStatus.test.tsx
git add src/lib/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: adiciona fila offline para vistorias"
```

### Task 11: Fluxo de entrega e devolução parcial

**Files:**
- Create: `src/app/contratos-locacoes/contratos/[id]/vistoria/page.tsx`
- Create: `src/components/contratos-locacoes/InspectionEditor.tsx`
- Create: `src/components/contratos-locacoes/InspectionEditor.test.tsx`
- Modify: `src/app/contratos-locacoes/contratos/[id]/page.tsx`

- [ ] **Step 1: Testar vistoria de saída**

Exigir item, condição, acessórios, ao menos uma foto e assinatura. Permitir registrar dano preexistente. Ativação ocorre somente quando o equipamento sai fisicamente.

- [ ] **Step 2: Testar devolução parcial**

Selecionar parte dos itens, registrar fotos de retorno e manter os demais como `rented`. O contrato permanece `awaiting_return` ou `inspection` até todos os itens estarem resolvidos.

- [ ] **Step 3: Implementar comparação**

Na volta, mostrar fotos de saída e retorno lado a lado, condições, acessórios faltantes, dano, custo estimado e resolução. Oferecer a escolha de cobrança aprovada.

- [ ] **Step 4: Bloquear encerramento inseguro**

Impedir encerramento quando houver item `rented`, vistoria obrigatória incompleta, upload local/falho ou assinatura não sincronizada. Mostrar lista de pendências com links diretos.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/components/contratos-locacoes/InspectionEditor.test.tsx src/lib/contratos-locacoes
npm run lint -- "src/app/contratos-locacoes/contratos/[id]" src/components/contratos-locacoes
git add src/app/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: controla entrega e devolucao parcial"
```

## Fase 5 — Documentos e importação

### Task 12: Termos em PDF e anexos

**Files:**
- Create: `src/lib/contratos-locacoes/pdf/DeliveryDocument.tsx`
- Create: `src/lib/contratos-locacoes/pdf/ReturnDocument.tsx`
- Create: `src/lib/contratos-locacoes/pdf/documents.test.tsx`
- Modify: `src/app/contratos-locacoes/contratos/[id]/page.tsx`

- [ ] **Step 1: Testar conteúdo dos documentos**

Saída: Radial, cliente, obra, contrato/pedido, itens, condição, acessórios, fotos, responsável e assinatura. Retorno: mesmos identificadores, itens devolvidos, comparação, danos, faltas, valores e assinatura.

- [ ] **Step 2: Implementar PDFs reproduzíveis**

Usar `@react-pdf/renderer`. Buscar URLs assinadas na geração e montar o documento a partir de dados persistidos. Nomear `entrega-{numero}.pdf` e `devolucao-{numero}.pdf`.

- [ ] **Step 3: Impedir geração incompleta**

Se alguma foto/assinatura obrigatória não estiver sincronizada, desabilitar `Gerar PDF` e listar pendências. Após gerar, permitir baixar e opcionalmente guardar no bucket como `contract_documents`.

- [ ] **Step 4: Testar visualmente**

Gerar documentos com 1, 10 e 30 fotos. Verificar que nenhuma imagem estoura a página, textos não se sobrepõem e assinaturas permanecem legíveis.

- [ ] **Step 5: Commit**

```powershell
npm test -- src/lib/contratos-locacoes/pdf/documents.test.tsx
git add src/lib/contratos-locacoes/pdf "src/app/contratos-locacoes/contratos/[id]/page.tsx"
git commit -m "feat: gera termos de entrega e devolucao"
```

### Task 13: Importar as planilhas atuais com prévia

**Files:**
- Create: `src/app/contratos-locacoes/importar/page.tsx`
- Create: `src/components/contratos-locacoes/ImportPreview.tsx`
- Create: `src/components/contratos-locacoes/ImportPreview.test.tsx`
- Create: `src/lib/contratos-locacoes/import/workbook.ts`
- Create: `src/lib/contratos-locacoes/import/workbook.test.ts`
- Create: `src/lib/contratos-locacoes/import/normalize.ts`
- Create: `src/lib/contratos-locacoes/import/normalize.test.ts`
- Create: `src/lib/contratos-locacoes/import/validate.ts`
- Create: `src/lib/contratos-locacoes/import/apply.ts`
- Test fixture: `src/test/fixtures/locacoes/controle-geral-minimo.xlsx`
- Test fixture: `src/test/fixtures/locacoes/cliente-individual-minimo.xlsx`

- [ ] **Step 1: Criar fixtures anônimas**

Copiar apenas a estrutura das planilhas fornecidas, substituir nomes/CNPJ/e-mails por dados fictícios e manter abas `Planilha1`, `OS`, `Resumo locação`, `Recibo`. Não versionar dados reais de clientes.

- [ ] **Step 2: Testar leitura de ZIP e XLSX**

Identificar controle geral e arquivos individuais; extrair links/referências; ler valores calculados, não executar `IMPORTRANGE`; associar pedido `20260121` ao arquivo individual.

- [ ] **Step 3: Testar normalização**

Normalizar datas do Excel, reais brasileiros, CNPJ/CPF, espaços, e-mails e números legados. Preservar observações especiais em texto.

- [ ] **Step 4: Implementar detecção de duplicidade**

Prioridade: CNPJ/CPF; depois nome legal normalizado + cidade/endereço. A prévia deve classificar `novo`, `atualização`, `duplicidade para decisão`, `inválido` e `ignorado`.

- [ ] **Step 5: Implementar importação idempotente**

Calcular SHA-256 de cada arquivo/lote. `import_batches.checksum` impede lote repetido; `import_rows` registra arquivo, aba e linha. Aplicar registros válidos dentro de RPC transacional por cliente/contrato. Gerar resumo de importados, atualizados, rejeitados e ignorados.

- [ ] **Step 6: Criar interface de prévia**

Etapas: `Selecionar ZIP`, `Analisar`, `Resolver pendências`, `Confirmar`, `Relatório`. Nunca importar imediatamente ao selecionar arquivo.

- [ ] **Step 7: Validar com cópias dos arquivos reais**

Usar uma cópia local de `Controle locações.xlsx` e dos arquivos individuais. Conferir manualmente contagens, valores, períodos e recibos. Não adicionar arquivos reais ao Git.

- [ ] **Step 8: Commit**

```powershell
npm test -- src/lib/contratos-locacoes/import src/components/contratos-locacoes/ImportPreview.test.tsx
git add src/app/contratos-locacoes/importar src/components/contratos-locacoes/ImportPreview.tsx src/components/contratos-locacoes/ImportPreview.test.tsx src/lib/contratos-locacoes/import src/test/fixtures/locacoes
git commit -m "feat: importa historico de locacoes com previa"
```

## Fase 6 — Integração, acessibilidade e liberação

### Task 14: Hub, auditoria e proteções finais

**Files:**
- Modify: `src/app/hub/page.tsx`
- Create: `src/components/contratos-locacoes/AuditTimeline.tsx`
- Create: `src/components/contratos-locacoes/AuditTimeline.test.tsx`
- Modify: `src/app/contratos-locacoes/contratos/[id]/page.tsx`
- Modify: `src/app/contratos-locacoes/clientes/[id]/page.tsx`

- [ ] **Step 1: Adicionar cartão ao Hub**

Criar cartão `Contratos e Locações` apontando para `/contratos-locacoes`, seguindo o estilo existente e usando ícone de `lucide-react`.

- [ ] **Step 2: Exibir histórico conciso**

Mostrar usuário, data/hora, evento e mudanças relevantes. Não renderizar blobs, caminhos assinados ou JSON bruto. Cobrir criação, status, pausa, cobrança, pagamento, entrega, retorno, dano e encerramento.

- [ ] **Step 3: Revisar confirmações e acessibilidade**

Confirmação para cancelar, inativar e encerrar; foco no primeiro erro; labels reais; botões com nome acessível; estados sem depender só de cor; alvos de toque mínimos de 44 px.

- [ ] **Step 4: Confirmar isolamento**

Com dois usuários de organizações diferentes, provar que consultas, URLs assinadas, RPCs e IndexedDB não expõem dados cruzados.

- [ ] **Step 5: Commit**

```powershell
npm test -- src/components/contratos-locacoes/AuditTimeline.test.tsx
git add src/app/hub/page.tsx src/app/contratos-locacoes src/components/contratos-locacoes
git commit -m "feat: integra contratos ao hub e exibe auditoria"
```

### Task 15: Verificação completa e implantação controlada

**Files:**
- Create: `docs/contratos-locacoes-operacao.md`
- Modify only if failures require: files introduced by Tasks 1–14

- [ ] **Step 1: Rodar verificações automáticas juntas**

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: todos os testes PASS, lint sem erros, TypeScript sem erros e build Next.js concluído.

- [ ] **Step 2: Executar roteiro móvel online**

1. Cadastrar cliente com duas obras e três contatos.
2. Criar locação mensal com três itens.
3. Registrar entrega com fotos e assinatura.
4. Emitir `R260121001`, registrar pagamento parcial e completar depois.
5. Pausar e reativar.
6. Devolver um item, depois os demais.
7. Registrar dano, cobrar separadamente e gerar PDFs.

Expected: estados, painel, histórico e valores permanecem coerentes.

- [ ] **Step 3: Executar roteiro móvel offline**

1. Abrir a vistoria com internet.
2. Desligar a conexão.
3. Tirar 30 fotos, assinar, fechar e reabrir o navegador.
4. Confirmar `Salva neste celular — aguardando sincronização`.
5. Religar a conexão e aguardar.
6. Confirmar 30 fotos, uma assinatura e nenhuma duplicidade no servidor.

- [ ] **Step 4: Validar migração**

Importar as cópias das planilhas; comparar amostra de cinco clientes e todas as cobranças de um contrato longo. Reimportar o mesmo ZIP e confirmar zero duplicidades.

- [ ] **Step 5: Escrever manual operacional**

Documentar backup, aplicação/reversão segura das migrações, associação de novo usuário, importação, leitura dos estados offline e resposta a falha de sincronização.

- [ ] **Step 6: Criar PR, não publicar diretamente**

```powershell
git add docs/contratos-locacoes-operacao.md
git commit -m "docs: adiciona operacao de contratos e locacoes"
git push -u origin codex/contratos-locacoes
```

Abrir pull request para `main` com resultados dos quatro comandos, evidências dos roteiros móveis e relatório da importação. Aplicar migrações de produção e promover no Vercel somente depois da aprovação.

## Critério final de encerramento

Não declarar o módulo concluído apenas porque as telas abriram. A entrega exige, no mesmo commit:

- testes, lint, TypeScript e build verdes;
- RLS e Storage privado verificados com dois usuários;
- ciclo completo de locação e contrato recorrente;
- alertas e totais conferidos;
- devolução parcial e dano testados;
- 30 fotos offline recuperadas e sincronizadas sem duplicidade;
- PDFs legíveis;
- importação real revisada e idempotente;
- manual operacional e plano de reversão disponíveis.

## Fora deste plano

Controle completo de estoque, pedidos integrados, financeiro geral, conciliação bancária, boleto Itaú, emissão fiscal oficial, envio automático por WhatsApp/e-mail, permissões detalhadas por função e assinatura certificada exigem especificações próprias. A implementação deve preservar os IDs e interfaces de integração previstos, sem construir essas funções agora.
