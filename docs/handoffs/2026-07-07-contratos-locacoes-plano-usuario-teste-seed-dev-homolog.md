# Handoff — Contratos e Locações — plano para usuário de teste e seed mínimo no Supabase dev/homolog

**Data:** 2026-07-07  
**Etapa:** preparação do plano técnico exato para criar usuário de teste, vínculo em `organization_members` e seed mínimo para QA manual fim a fim no ambiente Supabase dev/homolog novo  
**Branch atual:** `codex/contratos-locacoes-fundacao`  
**Escopo desta etapa:** confirmar o schema real necessário, validar a existência da organização seed `radial`, definir o caminho mais seguro para criação do usuário de teste e montar os comandos/SQL exatos sem executar nenhuma escrita no banco

## 1. Objetivo da etapa

Preparar, sem executar escrita remota:

- criação segura de um usuário de teste para login em `http://127.0.0.1:3001/login`;
- vínculo desse usuário à organização `Radial Energia` no projeto `misfyiznwnuvldoccciw`;
- seed mínimo do módulo `Contratos e Locações` para QA manual:
  - 1 cliente
  - 1 obra/local
  - 1 contrato
  - 1 item de locação
  - 1 ciclo de cobrança
  - 1 linha de cobrança
  - 1 pagamento

Regra operacional confirmada para a próxima etapa:

- o seed via SQL será usado apenas para destravar login e dados iniciais;
- depois do login, o QA manual deve criar ou editar pelo menos um item do fluxo diretamente pelo app para validar telas, sessão autenticada e RLS de verdade.

## 2. O que foi confirmado nesta etapa

### 2.1 Ambiente alvo correto

Confirmado novamente:

- `project ref` ativo: `misfyiznwnuvldoccciw`
- `project URL`: `https://misfyiznwnuvldoccciw.supabase.co`
- backend antigo proibido nesta etapa: `iurqgskfuupslrghgtej`
- `supabase/.temp/project-ref` contém `misfyiznwnuvldoccciw`

### 2.2 Organização seed já existe no banco novo

Foi feito `SELECT` remoto somente-leitura com:

```powershell
npx supabase@latest db query --linked -o json "select id, name, slug, created_at from public.organizations where slug = 'radial';"
```

Resultado confirmado:

- `id = 1e7deb83-0e50-4d1a-8707-dccbd68e50fb`
- `name = Radial Energia`
- `slug = radial`
- `created_at = 2026-07-07 13:41:23.314302+00`

Conclusão:

- a organização seed prevista pela migration já existe no projeto novo;
- não será necessário criar nova organização para esta próxima etapa;
- o seed deve reutilizar essa organização.

### 2.3 Schema remoto real confirmado

Foi confirmado por `information_schema.columns` remoto que as tabelas centrais exigem:

#### `organization_members`

- obrigatórios:
  - `organization_id`
  - `user_id`
- com default:
  - `role default 'member'`
  - `created_at default now()`

#### `customers`

- obrigatórios:
  - `organization_id`
  - `legal_name`
  - `trade_name`
- opcionais:
  - `tax_id`
  - `state_registration`
  - `municipal_registration`
  - `notes`
- com default:
  - `active default true`
  - `created_at default now()`
  - `updated_at default now()`

#### `customer_sites`

- obrigatórios:
  - `organization_id`
  - `customer_id`
  - `name`
  - `address_line`
  - `number`
  - `district`
  - `city`
  - `state`
  - `postal_code`
- opcionais:
  - `complement`
  - `notes`
- com default:
  - `active default true`
  - `created_at default now()`
  - `updated_at default now()`

#### `contracts`

- obrigatórios:
  - `organization_id`
  - `internal_number`
  - `kind`
  - `customer_id`
  - `site_id`
  - `start_date`
  - `pricing_model`
- opcionais:
  - `legacy_order_number`
  - `end_date`
  - `percentage_rate`
  - `pause_started_at`
  - `pause_reason`
  - `notes`
- com default:
  - `recurrence_days default 30`
  - `base_amount default 0`
  - `status default 'draft'`
  - `created_at default now()`
  - `updated_at default now()`

Observação importante:

- o código do módulo usa `internal_number = 0` para disparar o trigger `set_contract_internal_number()`;
- portanto, o seed seguro deve inserir `0` nesse campo e deixar o banco gerar o número interno real.

#### `rental_items`

- obrigatórios:
  - `organization_id`
  - `contract_id`
  - `description`
  - `equipment_type`
  - `capacity`
  - `serial_number`
  - `internal_code`
- opcionais:
  - `future_inventory_item_id`
- com default:
  - `quantity default 1`
  - `unit_amount default 0`
  - `status default 'rented'`
  - `created_at default now()`
  - `updated_at default now()`

Observação importante:

- apesar de o formulário do app permitir serial/código em branco e normalizar para string vazia, no banco essas colunas são `NOT NULL`;
- o seed deve enviar valores explícitos não nulos.

#### `billing_cycles`

- obrigatórios:
  - `organization_id`
  - `contract_id`
  - `sequence_number`
  - `period_start`
  - `period_end`
  - `issue_date`
  - `due_date`
  - `document_type`
- opcionais:
  - `document_number`
  - `notes`
- com default:
  - `base_amount default 0`
  - `discount_amount default 0`
  - `surcharge_amount default 0`
  - `exemption_amount default 0`
  - `total_amount default 0`
  - `status default 'draft'`
  - `created_at default now()`
  - `updated_at default now()`

Observações importantes:

- os valores monetários são `bigint` em centavos;
- para `document_type = 'receipt'`, o app valida o formato `R######NNN`;
- o seed deve gerar `document_number` com base no `internal_number` real do contrato;
- por isso, o número final do recibo é dinâmico e deve ser confirmado no `RETURNING`/`SELECT` após a execução.

#### `billing_lines`

- obrigatórios:
  - `organization_id`
  - `billing_cycle_id`
  - `description`
  - `quantity`
  - `unit_amount`
  - `total_amount`
  - `kind`
- opcionais:
  - `rental_item_id`
- com default:
  - `created_at default now()`
  - `updated_at default now()`

#### `payments`

- obrigatórios:
  - `organization_id`
  - `billing_cycle_id`
  - `paid_at`
  - `amount`
- opcionais:
  - `notes`
- com default:
  - `created_at default now()`
  - `updated_at default now()`

## 3. Decisão recomendada para criar o usuário de teste

### 3.1 Caminho recomendado

Criar o usuário **via Supabase Dashboard > Authentication > Users**.

Motivo:

- evita expor `service_role`, `secret key` ou qualquer segredo em terminal, script ou arquivo local;
- evita inserir diretamente em `auth.users`, o que não é o caminho seguro/recomendado;
- combina bem com a regra desta etapa de não registrar senha ou segredo em arquivo versionado.

### 3.2 Como criar o usuário de teste

Recomendação operacional:

1. abrir o projeto `misfyiznwnuvldoccciw` no Supabase Dashboard;
2. ir em `Authentication > Users`;
3. clicar em `Create user`;
4. preencher:
   - e-mail: `qa.contratos.locacoes+dev@example.com`
   - senha: definida manualmente no Dashboard no momento da execução
   - marcar confirmação de e-mail já validada, se a tela oferecer essa opção
5. copiar o `user_id` gerado no Dashboard;
6. não registrar a senha em arquivo versionado nem em handoff futuro.

Observação:

- o e-mail acima é uma sugestão de conta técnica dedicada;
- pode ser trocado por outro e-mail de QA, mas deve ser confirmado antes da execução.

### 3.3 Comando somente-leitura para confirmar o usuário após criação

Depois da criação manual no Dashboard, a conferência sugerida é:

```powershell
npx supabase@latest db query --linked -o json "select id, email, email_confirmed_at, created_at from auth.users where email = 'qa.contratos.locacoes+dev@example.com';"
```

## 4. Plano exato para vincular o usuário à organização

### 4.1 Papel recomendado

Recomendo `role = 'admin'` para o primeiro usuário de QA.

Motivo:

- evita bloqueio futuro caso a etapa seguinte precise validar telas/ações administrativas;
- não atrapalha o fluxo central do módulo;
- reduz retrabalho se depois for preciso gerenciar membros.

### 4.2 SQL proposto para membership

Arquivo temporário sugerido:

- `C:\tmp\qa-membership-radial.sql`

Conteúdo proposto:

```sql
do $$
begin
  if not exists (
    select 1
    from public.organizations
    where slug = 'radial'
  ) then
    raise exception 'Organization radial not found in public.organizations';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = '<TEST_USER_ID>'::uuid
  ) then
    raise exception 'Auth user not found for <TEST_USER_ID>';
  end if;
end
$$;

insert into public.organization_members (organization_id, user_id, role)
select
  organizations.id,
  '<TEST_USER_ID>'::uuid,
  'admin'
from public.organizations
where organizations.slug = 'radial'
on conflict (organization_id, user_id)
do update set role = excluded.role
returning organization_id, user_id, role, created_at;
```

### 4.3 Comandos propostos para o membership

```powershell
@'
do $$
begin
  if not exists (
    select 1
    from public.organizations
    where slug = 'radial'
  ) then
    raise exception 'Organization radial not found in public.organizations';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = '<TEST_USER_ID>'::uuid
  ) then
    raise exception 'Auth user not found for <TEST_USER_ID>';
  end if;
end
$$;

insert into public.organization_members (organization_id, user_id, role)
select
  organizations.id,
  '<TEST_USER_ID>'::uuid,
  'admin'
from public.organizations
where organizations.slug = 'radial'
on conflict (organization_id, user_id)
do update set role = excluded.role
returning organization_id, user_id, role, created_at;
'@ | Set-Content -Encoding UTF8 'C:\tmp\qa-membership-radial.sql'

npx supabase@latest db query --linked -f 'C:\tmp\qa-membership-radial.sql'
```

### 4.4 Verificação proposta após o membership

```powershell
npx supabase@latest db query --linked -o json "select om.organization_id, o.name, o.slug, om.user_id, om.role, om.created_at from public.organization_members om join public.organizations o on o.id = om.organization_id where o.slug = 'radial' and om.user_id = '<TEST_USER_ID>'::uuid;"
```

## 5. Plano exato para criar o seed mínimo

### 5.1 Estratégia recomendada

Executar **um único SQL idempotente** via `supabase db query --linked -f ...`, usando:

- `BEGIN/COMMIT`;
- `slug = 'radial'` para localizar a organização certa;
- UUIDs fixos para o seed de QA;
- `ON CONFLICT (id) DO UPDATE` nas tabelas seeded;
- `internal_number = 0` no contrato para deixar o trigger gerar a numeração real;
- `document_number` calculado a partir do `internal_number` retornado.

### 5.2 IDs fixos propostos para idempotência

- cliente: `00000000-0000-4000-8000-000000000101`
- obra/local: `00000000-0000-4000-8000-000000000102`
- contrato: `00000000-0000-4000-8000-000000000103`
- item de locação: `00000000-0000-4000-8000-000000000104`
- ciclo de cobrança: `00000000-0000-4000-8000-000000000105`
- linha de cobrança: `00000000-0000-4000-8000-000000000106`
- pagamento: `00000000-0000-4000-8000-000000000107`

### 5.3 Dados mínimos propostos

- cliente:
  - `legal_name = 'Cliente QA Contratos Locacoes Ltda'`
  - `trade_name = 'Cliente QA Contratos Locacoes'`
  - `tax_id = '12345678000195'`
- obra/local:
  - `name = 'Obra QA Contratos Locacoes'`
  - `address_line = 'Rua QA Contratos Locacoes'`
  - `number = '100'`
  - `district = 'Centro'`
  - `city = 'Sao Paulo'`
  - `state = 'SP'`
  - `postal_code = '01000-000'`
- contrato:
  - `kind = 'rental'`
  - `legacy_order_number = 'CONTRATO-QA-001'`
  - `start_date = DATE '2026-07-01'`
  - `recurrence_days = 30`
  - `pricing_model = 'fixed'`
  - `base_amount = 150000`
  - `status = 'active'`
- item:
  - `description = 'Gerador QA 150 kVA'`
  - `equipment_type = 'Gerador'`
  - `capacity = '150 kVA'`
  - `serial_number = 'SERIE-QA-001'`
  - `internal_code = 'INT-QA-001'`
  - `quantity = 1`
  - `unit_amount = 150000`
  - `status = 'rented'`
- cobrança:
  - `sequence_number = 1`
  - `period_start = DATE '2026-07-01'`
  - `period_end = DATE '2026-07-31'`
  - `issue_date = DATE '2026-07-31'`
  - `due_date = DATE '2026-08-05'`
  - `document_type = 'receipt'`
  - `status = 'paid'`
  - `total_amount = 150000`
- linha:
  - `description = 'Locacao mensal do gerador QA 150 kVA'`
  - `quantity = 1`
  - `unit_amount = 150000`
  - `total_amount = 150000`
  - `kind = 'recurring'`
- pagamento:
  - `paid_at = TIMESTAMPTZ '2026-08-05 12:00:00+00'`
  - `amount = 150000`

Observação:

- este plano não inclui `customer_contacts`, de propósito, porque o escopo solicitado nesta etapa foi limitado às tabelas listadas acima;
- se o QA seguinte precisar de contato visível já pré-semeado, adicionar 1 linha em `customer_contacts` será um complemento separado e simples.

### 5.4 SQL proposto para o seed mínimo

Arquivo temporário sugerido:

- `C:\tmp\qa-seed-minimo-contratos-locacoes.sql`

Conteúdo proposto:

```sql
begin;

do $$
begin
  if not exists (
    select 1
    from public.organizations
    where slug = 'radial'
  ) then
    raise exception 'Organization radial not found in public.organizations';
  end if;
end
$$;

with org as (
  select id
  from public.organizations
  where slug = 'radial'
),
upsert_customer as (
  insert into public.customers (
    id,
    organization_id,
    legal_name,
    trade_name,
    tax_id,
    state_registration,
    municipal_registration,
    notes,
    active
  )
  select
    '00000000-0000-4000-8000-000000000101'::uuid,
    org.id,
    'Cliente QA Contratos Locacoes Ltda',
    'Cliente QA Contratos Locacoes',
    '12345678000195',
    null,
    null,
    'Seed QA/dev minimo para QA manual de contratos/locacoes',
    true
  from org
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    legal_name = excluded.legal_name,
    trade_name = excluded.trade_name,
    tax_id = excluded.tax_id,
    state_registration = excluded.state_registration,
    municipal_registration = excluded.municipal_registration,
    notes = excluded.notes,
    active = excluded.active
  returning id, organization_id
),
upsert_site as (
  insert into public.customer_sites (
    id,
    organization_id,
    customer_id,
    name,
    address_line,
    number,
    complement,
    district,
    city,
    state,
    postal_code,
    notes,
    active
  )
  select
    '00000000-0000-4000-8000-000000000102'::uuid,
    customer.organization_id,
    customer.id,
    'Obra QA Contratos Locacoes',
    'Rua QA Contratos Locacoes',
    '100',
    null,
    'Centro',
    'Sao Paulo',
    'SP',
    '01000-000',
    'Seed QA/dev minimo para QA manual de contratos/locacoes',
    true
  from upsert_customer customer
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    customer_id = excluded.customer_id,
    name = excluded.name,
    address_line = excluded.address_line,
    number = excluded.number,
    complement = excluded.complement,
    district = excluded.district,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    notes = excluded.notes,
    active = excluded.active
  returning id, organization_id, customer_id
),
upsert_contract as (
  insert into public.contracts (
    id,
    organization_id,
    internal_number,
    kind,
    customer_id,
    site_id,
    legacy_order_number,
    start_date,
    end_date,
    recurrence_days,
    pricing_model,
    base_amount,
    percentage_rate,
    status,
    pause_started_at,
    pause_reason,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000103'::uuid,
    site.organization_id,
    0,
    'rental'::contract_kind,
    site.customer_id,
    site.id,
    'CONTRATO-QA-001',
    date '2026-07-01',
    null,
    30,
    'fixed',
    150000,
    null,
    'active'::contract_status,
    null,
    null,
    'Contrato QA/dev para QA manual de contratos/locacoes'
  from upsert_site site
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    kind = excluded.kind,
    customer_id = excluded.customer_id,
    site_id = excluded.site_id,
    legacy_order_number = excluded.legacy_order_number,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    recurrence_days = excluded.recurrence_days,
    pricing_model = excluded.pricing_model,
    base_amount = excluded.base_amount,
    percentage_rate = excluded.percentage_rate,
    status = excluded.status,
    pause_started_at = excluded.pause_started_at,
    pause_reason = excluded.pause_reason,
    notes = excluded.notes
  returning id, organization_id, customer_id, site_id, internal_number
),
upsert_item as (
  insert into public.rental_items (
    id,
    organization_id,
    contract_id,
    description,
    equipment_type,
    capacity,
    serial_number,
    internal_code,
    quantity,
    unit_amount,
    status,
    future_inventory_item_id
  )
  select
    '00000000-0000-4000-8000-000000000104'::uuid,
    contract.organization_id,
    contract.id,
    'Item QA Contratos Locacoes - Gerador 150 kVA',
    'Gerador',
    '150 kVA',
    'SERIE-QA-001',
    'INT-QA-001',
    1,
    150000,
    'rented'::rental_item_status,
    null
  from upsert_contract contract
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    contract_id = excluded.contract_id,
    description = excluded.description,
    equipment_type = excluded.equipment_type,
    capacity = excluded.capacity,
    serial_number = excluded.serial_number,
    internal_code = excluded.internal_code,
    quantity = excluded.quantity,
    unit_amount = excluded.unit_amount,
    status = excluded.status,
    future_inventory_item_id = excluded.future_inventory_item_id
  returning id, organization_id, contract_id
),
upsert_billing as (
  insert into public.billing_cycles (
    id,
    organization_id,
    contract_id,
    sequence_number,
    period_start,
    period_end,
    issue_date,
    due_date,
    base_amount,
    discount_amount,
    surcharge_amount,
    exemption_amount,
    total_amount,
    document_type,
    document_number,
    status,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000105'::uuid,
    contract.organization_id,
    contract.id,
    1,
    date '2026-07-01',
    date '2026-07-31',
    date '2026-07-31',
    date '2026-08-05',
    150000,
    0,
    0,
    0,
    150000,
    'receipt',
    'R' || lpad(contract.internal_number::text, 6, '0') || '001',
    'paid'::billing_status,
    'Cobranca QA/dev minima para QA manual de contratos/locacoes'
  from upsert_contract contract
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    contract_id = excluded.contract_id,
    sequence_number = excluded.sequence_number,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    issue_date = excluded.issue_date,
    due_date = excluded.due_date,
    base_amount = excluded.base_amount,
    discount_amount = excluded.discount_amount,
    surcharge_amount = excluded.surcharge_amount,
    exemption_amount = excluded.exemption_amount,
    total_amount = excluded.total_amount,
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    status = excluded.status,
    notes = excluded.notes
  returning id, organization_id, contract_id, document_number
),
upsert_line as (
  insert into public.billing_lines (
    id,
    organization_id,
    billing_cycle_id,
    rental_item_id,
    description,
    quantity,
    unit_amount,
    total_amount,
    kind
  )
  select
    '00000000-0000-4000-8000-000000000106'::uuid,
    billing.organization_id,
    billing.id,
    item.id,
    'Linha QA Contratos Locacoes - locacao mensal do gerador 150 kVA',
    1,
    150000,
    150000,
    'recurring'
  from upsert_billing billing
  join upsert_item item
    on item.organization_id = billing.organization_id
   and item.contract_id = billing.contract_id
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    billing_cycle_id = excluded.billing_cycle_id,
    rental_item_id = excluded.rental_item_id,
    description = excluded.description,
    quantity = excluded.quantity,
    unit_amount = excluded.unit_amount,
    total_amount = excluded.total_amount,
    kind = excluded.kind
  returning id, organization_id, billing_cycle_id
),
upsert_payment as (
  insert into public.payments (
    id,
    organization_id,
    billing_cycle_id,
    paid_at,
    amount,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000107'::uuid,
    billing.organization_id,
    billing.id,
    timestamptz '2026-08-05 12:00:00+00',
    150000,
    'Pagamento integral QA/dev seed manual'
  from upsert_billing billing
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    billing_cycle_id = excluded.billing_cycle_id,
    paid_at = excluded.paid_at,
    amount = excluded.amount,
    notes = excluded.notes
  returning id, organization_id, billing_cycle_id, amount
)
select
  customer.id as customer_id,
  site.id as site_id,
  contract.id as contract_id,
  contract.internal_number,
  item.id as rental_item_id,
  billing.id as billing_cycle_id,
  billing.document_number,
  line.id as billing_line_id,
  payment.id as payment_id,
  payment.amount as payment_amount
from upsert_customer customer
join upsert_site site
  on site.organization_id = customer.organization_id
 and site.customer_id = customer.id
join upsert_contract contract
  on contract.organization_id = site.organization_id
 and contract.site_id = site.id
join upsert_item item
  on item.organization_id = contract.organization_id
 and item.contract_id = contract.id
join upsert_billing billing
  on billing.organization_id = contract.organization_id
 and billing.contract_id = contract.id
join upsert_line line
  on line.organization_id = billing.organization_id
 and line.billing_cycle_id = billing.id
join upsert_payment payment
  on payment.organization_id = billing.organization_id
 and payment.billing_cycle_id = billing.id;

commit;
```

### 5.5 Comandos propostos para o seed

```powershell
@'
begin;

do $$
begin
  if not exists (
    select 1
    from public.organizations
    where slug = 'radial'
  ) then
    raise exception 'Organization radial not found in public.organizations';
  end if;
end
$$;

with org as (
  select id
  from public.organizations
  where slug = 'radial'
),
upsert_customer as (
  insert into public.customers (
    id,
    organization_id,
    legal_name,
    trade_name,
    tax_id,
    state_registration,
    municipal_registration,
    notes,
    active
  )
  select
    '00000000-0000-4000-8000-000000000101'::uuid,
    org.id,
    'Cliente QA Contratos Locacoes Ltda',
    'Cliente QA Contratos Locacoes',
    '12345678000195',
    null,
    null,
    'Seed QA/dev minimo para QA manual de contratos/locacoes',
    true
  from org
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    legal_name = excluded.legal_name,
    trade_name = excluded.trade_name,
    tax_id = excluded.tax_id,
    state_registration = excluded.state_registration,
    municipal_registration = excluded.municipal_registration,
    notes = excluded.notes,
    active = excluded.active
  returning id, organization_id
),
upsert_site as (
  insert into public.customer_sites (
    id,
    organization_id,
    customer_id,
    name,
    address_line,
    number,
    complement,
    district,
    city,
    state,
    postal_code,
    notes,
    active
  )
  select
    '00000000-0000-4000-8000-000000000102'::uuid,
    customer.organization_id,
    customer.id,
    'Obra QA Contratos Locacoes',
    'Rua QA Contratos Locacoes',
    '100',
    null,
    'Centro',
    'Sao Paulo',
    'SP',
    '01000-000',
    'Seed QA/dev minimo para QA manual de contratos/locacoes',
    true
  from upsert_customer customer
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    customer_id = excluded.customer_id,
    name = excluded.name,
    address_line = excluded.address_line,
    number = excluded.number,
    complement = excluded.complement,
    district = excluded.district,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    notes = excluded.notes,
    active = excluded.active
  returning id, organization_id, customer_id
),
upsert_contract as (
  insert into public.contracts (
    id,
    organization_id,
    internal_number,
    kind,
    customer_id,
    site_id,
    legacy_order_number,
    start_date,
    end_date,
    recurrence_days,
    pricing_model,
    base_amount,
    percentage_rate,
    status,
    pause_started_at,
    pause_reason,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000103'::uuid,
    site.organization_id,
    0,
    'rental'::contract_kind,
    site.customer_id,
    site.id,
    'CONTRATO-QA-001',
    date '2026-07-01',
    null,
    30,
    'fixed',
    150000,
    null,
    'active'::contract_status,
    null,
    null,
    'Contrato QA/dev para QA manual de contratos/locacoes'
  from upsert_site site
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    kind = excluded.kind,
    customer_id = excluded.customer_id,
    site_id = excluded.site_id,
    legacy_order_number = excluded.legacy_order_number,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    recurrence_days = excluded.recurrence_days,
    pricing_model = excluded.pricing_model,
    base_amount = excluded.base_amount,
    percentage_rate = excluded.percentage_rate,
    status = excluded.status,
    pause_started_at = excluded.pause_started_at,
    pause_reason = excluded.pause_reason,
    notes = excluded.notes
  returning id, organization_id, customer_id, site_id, internal_number
),
upsert_item as (
  insert into public.rental_items (
    id,
    organization_id,
    contract_id,
    description,
    equipment_type,
    capacity,
    serial_number,
    internal_code,
    quantity,
    unit_amount,
    status,
    future_inventory_item_id
  )
  select
    '00000000-0000-4000-8000-000000000104'::uuid,
    contract.organization_id,
    contract.id,
    'Item QA Contratos Locacoes - Gerador 150 kVA',
    'Gerador',
    '150 kVA',
    'SERIE-QA-001',
    'INT-QA-001',
    1,
    150000,
    'rented'::rental_item_status,
    null
  from upsert_contract contract
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    contract_id = excluded.contract_id,
    description = excluded.description,
    equipment_type = excluded.equipment_type,
    capacity = excluded.capacity,
    serial_number = excluded.serial_number,
    internal_code = excluded.internal_code,
    quantity = excluded.quantity,
    unit_amount = excluded.unit_amount,
    status = excluded.status,
    future_inventory_item_id = excluded.future_inventory_item_id
  returning id, organization_id, contract_id
),
upsert_billing as (
  insert into public.billing_cycles (
    id,
    organization_id,
    contract_id,
    sequence_number,
    period_start,
    period_end,
    issue_date,
    due_date,
    base_amount,
    discount_amount,
    surcharge_amount,
    exemption_amount,
    total_amount,
    document_type,
    document_number,
    status,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000105'::uuid,
    contract.organization_id,
    contract.id,
    1,
    date '2026-07-01',
    date '2026-07-31',
    date '2026-07-31',
    date '2026-08-05',
    150000,
    0,
    0,
    0,
    150000,
    'receipt',
    'R' || lpad(contract.internal_number::text, 6, '0') || '001',
    'paid'::billing_status,
    'Cobranca QA/dev minima para QA manual de contratos/locacoes'
  from upsert_contract contract
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    contract_id = excluded.contract_id,
    sequence_number = excluded.sequence_number,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    issue_date = excluded.issue_date,
    due_date = excluded.due_date,
    base_amount = excluded.base_amount,
    discount_amount = excluded.discount_amount,
    surcharge_amount = excluded.surcharge_amount,
    exemption_amount = excluded.exemption_amount,
    total_amount = excluded.total_amount,
    document_type = excluded.document_type,
    document_number = excluded.document_number,
    status = excluded.status,
    notes = excluded.notes
  returning id, organization_id, contract_id, document_number
),
upsert_line as (
  insert into public.billing_lines (
    id,
    organization_id,
    billing_cycle_id,
    rental_item_id,
    description,
    quantity,
    unit_amount,
    total_amount,
    kind
  )
  select
    '00000000-0000-4000-8000-000000000106'::uuid,
    billing.organization_id,
    billing.id,
    item.id,
    'Linha QA Contratos Locacoes - locacao mensal do gerador 150 kVA',
    1,
    150000,
    150000,
    'recurring'
  from upsert_billing billing
  join upsert_item item
    on item.organization_id = billing.organization_id
   and item.contract_id = billing.contract_id
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    billing_cycle_id = excluded.billing_cycle_id,
    rental_item_id = excluded.rental_item_id,
    description = excluded.description,
    quantity = excluded.quantity,
    unit_amount = excluded.unit_amount,
    total_amount = excluded.total_amount,
    kind = excluded.kind
  returning id, organization_id, billing_cycle_id
),
upsert_payment as (
  insert into public.payments (
    id,
    organization_id,
    billing_cycle_id,
    paid_at,
    amount,
    notes
  )
  select
    '00000000-0000-4000-8000-000000000107'::uuid,
    billing.organization_id,
    billing.id,
    timestamptz '2026-08-05 12:00:00+00',
    150000,
    'Pagamento integral QA/dev seed manual'
  from upsert_billing billing
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    billing_cycle_id = excluded.billing_cycle_id,
    paid_at = excluded.paid_at,
    amount = excluded.amount,
    notes = excluded.notes
  returning id, organization_id, billing_cycle_id, amount
)
select
  customer.id as customer_id,
  site.id as site_id,
  contract.id as contract_id,
  contract.internal_number,
  item.id as rental_item_id,
  billing.id as billing_cycle_id,
  billing.document_number,
  line.id as billing_line_id,
  payment.id as payment_id,
  payment.amount as payment_amount
from upsert_customer customer
join upsert_site site
  on site.organization_id = customer.organization_id
 and site.customer_id = customer.id
join upsert_contract contract
  on contract.organization_id = site.organization_id
 and contract.site_id = site.id
join upsert_item item
  on item.organization_id = contract.organization_id
 and item.contract_id = contract.id
join upsert_billing billing
  on billing.organization_id = contract.organization_id
 and billing.contract_id = contract.id
join upsert_line line
  on line.organization_id = billing.organization_id
 and line.billing_cycle_id = billing.id
join upsert_payment payment
  on payment.organization_id = billing.organization_id
 and payment.billing_cycle_id = billing.id;

commit;
'@ | Set-Content -Encoding UTF8 'C:\tmp\qa-seed-minimo-contratos-locacoes.sql'

npx supabase@latest db query --linked -f 'C:\tmp\qa-seed-minimo-contratos-locacoes.sql'
```

### 5.6 Verificação proposta após o seed

```powershell
npx supabase@latest db query --linked -o json "select c.id as customer_id, s.id as site_id, ct.id as contract_id, ct.internal_number, ri.id as rental_item_id, bc.id as billing_cycle_id, bc.document_number, bl.id as billing_line_id, p.id as payment_id, p.amount from public.customers c join public.customer_sites s on s.organization_id = c.organization_id and s.customer_id = c.id join public.contracts ct on ct.organization_id = s.organization_id and ct.site_id = s.id join public.rental_items ri on ri.organization_id = ct.organization_id and ri.contract_id = ct.id join public.billing_cycles bc on bc.organization_id = ct.organization_id and bc.contract_id = ct.id join public.billing_lines bl on bl.organization_id = bc.organization_id and bl.billing_cycle_id = bc.id join public.payments p on p.organization_id = bc.organization_id and p.billing_cycle_id = bc.id where c.id = '00000000-0000-4000-8000-000000000101'::uuid;"
```

## 6. Riscos e cuidados

### 6.1 Riscos principais

- se o usuário de teste for associado a mais de uma organização, `getCurrentOrganizationId()` hoje pega apenas a primeira membership disponível; para QA limpo, o usuário deve pertencer só à `radial`;
- `document_number` de recibo precisa continuar único por organização entre cobranças não canceladas;
- os valores monetários são em centavos, então `150000 = R$ 1.500,00`;
- `serial_number` e `internal_code` não podem ser `NULL`;
- seed direto no banco não valida as regras de formulário do front, então o SQL precisa respeitar o formato esperado pelo app;
- se depois o objetivo for testar criação manual pelo front, esse seed não substitui o teste de cadastro completo via UI; ele só prepara um cenário mínimo e consistente.

### 6.2 Cuidados mantidos

- não usar o backend antigo;
- não tocar produção;
- não aplicar migration;
- não fazer deploy;
- não registrar senha, token, `service_role` ou `secret key` em arquivo versionado;
- não apagar dados;
- não executar seed sem aprovação explícita.

## 7. Confirmações necessárias antes de executar

Antes de qualquer escrita remota, ainda precisam ser confirmados pelo usuário:

1. e-mail final do usuário de teste;
2. se o papel deve ser `admin` mesmo ou `member`;
3. se o seed mínimo pode ficar com cobrança já `paid`;
4. se o nome/valores do seed proposto estão bons:
   - cliente QA
   - obra QA
   - contrato base de R$ 1.500,00
   - pagamento integral
5. se quer seguir pelo caminho recomendado:
   - usuário via Dashboard/Auth
   - membership + seed via `npx supabase@latest db query --linked`

## 8. O que foi feito e o que nao foi feito

### Feito

- leitura do contexto obrigatório:
  - `docs/AGENTE-INSTRUCOES.md`
  - `docs/ESTADO-ATUAL-PROJETO.md`
  - handoffs relevantes desta trilha
- confirmação do `project ref` linkado;
- introspecção remota somente-leitura do schema;
- confirmação remota da existência da organização `radial`;
- montagem do plano exato de usuário de teste, membership e seed;
- registro deste handoff.

### Nao feito

- nenhum `INSERT`;
- nenhum `UPDATE` remoto;
- nenhuma criação de usuário;
- nenhum seed executado;
- nenhum commit;
- nenhum push;
- nenhum deploy;
- nenhuma migration.

## 9. Testes e verificacoes executados

Somente verificações de leitura/contexto:

- `Get-Content supabase/.temp/project-ref`
- `npx supabase@latest projects list`
- `npx supabase@latest gen types --linked --schema public`
- `npx supabase@latest db query --linked -o json "select ... from information_schema.columns ..."`
- `npx supabase@latest db query --linked -o json "select id, name, slug, created_at from public.organizations where slug = 'radial';"`

Nenhum teste de app, lint ou escrita remota foi rodado nesta etapa.

## 10. Arquivos alterados nesta etapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

## 11. Proximo passo exato recomendado

Se o usuário aprovar:

1. criar o usuário no Supabase Dashboard/Auth;
2. confirmar o `user_id` por `SELECT` somente-leitura;
3. executar o SQL de membership;
4. executar o SQL idempotente do seed mínimo;
5. validar login em `http://127.0.0.1:3001/login`;
6. confirmar que o usuário enxerga somente a organização `radial`;
7. confirmar que o seed mínimo aparece no app;
8. criar ou editar pelo menos um item do fluxo diretamente pelo app para validar telas e RLS em operação real;
9. rodar o restante do QA manual fim a fim do módulo no ambiente `misfyiznwnuvldoccciw`.

## 12. Git / entrega

- commit: **nao**
- push: **nao**
- deploy: **nao**
- migration: **nao**
- escrita no banco: **nao**
- usuário criado: **nao**
- seed executado: **nao**

---

## Atualização posterior — QA manual autenticado em `localhost` e bloqueio do módulo novo

**Data:** 2026-07-07  
**Subetapa:** continuar QA manual autenticado usando `http://localhost:3001`, sem tocar em login/auth nem no `next.config.ts`

### Situação validada no browser interno

- login em `http://localhost:3001/login` funciona com o usuário QA `thogalego+qa-contratos@gmail.com`;
- após login, a aplicação abre;
- a rota antiga `/` continua exibindo o shell legado `Radial - Controle de Pedidos`;
- o módulo novo `http://localhost:3001/contratos-locacoes` abre, mas fica preso em `Carregando painel...`.

### Evidências coletadas

No console/logs do browser interno, a navegação para `/contratos-locacoes` registrou:

- `[contratos-locacoes] effect start`
- `[contratos-locacoes] fetching dashboard snapshot`
- `[contratos-locacoes] load failed {}`

O erro real reportado pelo servidor/browser foi:

```text
Error: Não foi possível identificar a organização atual: infinite recursion detected in policy for relation "organization_members"
```

### Causa raiz do bloqueio atual

O painel de contratos falha logo na leitura de `organization_members` para descobrir a organização corrente.

Arquivo envolvido:

- `src/lib/contratos-locacoes/queries.ts`

Trecho relevante:

- `getCurrentOrganizationId()` faz `select('organization_id')` em `public.organization_members`

A policy RLS correspondente no banco novo está recursiva.

Arquivo de migration de referência:

- `supabase/migrations/202607030001_contracts_rentals_core.sql`

Trecho de policy relevante:

- `CREATE POLICY "Admins can manage organization members" ON organization_members`
- a subconsulta dentro da policy consulta `organization_members` de novo, o que explica a recursão infinita.

### Impacto no QA manual

- não foi possível avançar para listar clientes, obras, contratos, cobranças ou criar/editar item pelo app;
- o bloqueio acontece antes do painel carregar;
- o problema não está mais no login, e sim na leitura de `organization_members` do módulo novo.

### Estado das alterações desta subetapa

- a instrumentação temporária em `src/app/contratos-locacoes/page.tsx` foi removida após a coleta das evidências;
- não houve commit, push, deploy, migration ou escrita no banco.

### Próxima ação recomendada

Corrigir a policy RLS recursiva de `organization_members` no projeto novo e então retomar o QA manual autenticado no `localhost`.

---

## Atualização posterior — migration de correção da recursão aplicada no Supabase dev/homolog

**Data:** 2026-07-07  
**Subetapa:** aplicar a migration `202607071405_fix_organization_members_rls_recursion.sql` no projeto autorizado `misfyiznwnuvldoccciw` e validar o efeito real no app

### O que foi confirmado antes do `db push`

- `supabase/.temp/project-ref = misfyiznwnuvldoccciw`
- `.env.local` segue apontando para `https://misfyiznwnuvldoccciw.supabase.co`
- `.env.local` não aponta para `https://iurqgskfuupslrghgtej.supabase.co`
- `npx supabase@latest migration list --linked` mostrava:
  - `202607030001` local/remoto
  - `202607071405` apenas local

### Migration aplicada

Comando executado:

```powershell
npx supabase@latest db push --linked
```

Resultado confirmado:

- foi aplicada apenas a migration pendente:
  - `202607071405_fix_organization_members_rls_recursion.sql`

### Validação remota pós-aplicação

`npx supabase@latest migration list --linked` passou a mostrar:

- `202607030001` local/remoto
- `202607071405` local/remoto

`pg_get_functiondef` confirmou:

- `public.is_organization_member(uuid)` com:
  - `SECURITY DEFINER`
  - `SET search_path TO 'public'`
  - leitura de `public.organization_members`
- `public.is_organization_admin(uuid)` com:
  - `SECURITY DEFINER`
  - `SET search_path TO 'public'`
  - leitura de `public.organization_members`
  - filtro `role = 'admin'`

`pg_policies` em `public.organization_members` confirmou estas policies:

- `Users can select own organization memberships` (`SELECT`)
- `Admins can select organization memberships` (`SELECT`)
- `Admins can insert organization memberships` (`INSERT`)
- `Admins can update organization memberships` (`UPDATE`)

Importante:

- a policy recursiva antiga `Admins can manage organization members` (`FOR ALL`) não aparece mais;
- a recursão infinita em RLS foi eliminada.

### Resultado do QA manual no app

Após recarregar `http://localhost:3001/contratos-locacoes`, o erro mudou.

O app deixou de mostrar a falha anterior:

```text
infinite recursion detected in policy for relation "organization_members"
```

e passou a mostrar:

```text
Não foi possível identificar a organização atual: permission denied for table organization_members
```

Ou seja:

- a correção da recursão funcionou;
- surgiu um novo bloqueio de privilégios/grants na tabela `public.organization_members`;
- o painel continua sem carregar o seed QA por causa desse novo bloqueio;
- a etapa atual não corrigiu isso porque o escopo aprovado era apenas a migration de recursão.

### Evidência remota adicional do novo bloqueio

Consulta somente-leitura em `information_schema.role_table_grants` mostrou que `authenticated` **não** possui `SELECT` em `public.organization_members`.

Resultado relevante:

- `authenticated`: apenas `REFERENCES`, `TRIGGER`, `TRUNCATE`
- `authenticated`: **sem `SELECT`**

Conclusão:

- mesmo com a RLS corrigida, a leitura direta de `organization_members` feita por `getCurrentOrganizationId()` ainda falha por privilégio de tabela;
- o próximo ajuste deverá tratar grants/privileges do módulo, começando por `organization_members`.

### Testes locais rodados nesta subetapa

```powershell
npm test -- src/lib/contratos-locacoes/migration-consistency.test.ts
npm test -- src/lib/contratos-locacoes/migration-consistency.test.ts src/lib/contratos-locacoes/billing.test.ts
```

Resultados:

- ambos passaram

### Arquivos alterados nesta subetapa

- `supabase/migrations/202607071405_fix_organization_members_rls_recursion.sql`
- `src/lib/contratos-locacoes/migration-consistency.test.ts`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### Git / entrega desta subetapa

- commit: **nao**
- push: **nao**
- deploy: **nao**
- migration remota: **sim**
- escrita no banco: **sim**, apenas via `db push` da migration `202607071405`
- seed alterado: **nao**
- backend antigo usado: **nao**

---

## Atualização posterior — grants aplicados e QA manual do módulo novo funcionando

**Data:** 2026-07-07  
**Subetapa:** aplicar a migration `202607071440_grant_authenticated_contratos_locacoes_tables.sql` no projeto `misfyiznwnuvldoccciw` e validar o módulo `Contratos e Locações` autenticado em `http://localhost:3001`

### Validação remota pós-aplicação

`npx supabase@latest migration list --linked` confirmou:

- `202607030001` local/remoto
- `202607071405` local/remoto
- `202607071440` local/remoto

Auditoria remota confirmou:

- `authenticated` recebeu os grants esperados em:
  - `organizations`
  - `organization_members`
  - `customers`
  - `customer_sites`
  - `customer_contacts`
  - `contracts`
  - `rental_items`
  - `billing_cycles`
  - `billing_lines`
  - `payments`
- `anon` continuou sem grants nessas tabelas;
- `audit_events`, `organization_contract_counters`, `import_batches`, `import_rows`, `inspections`, `inspection_photos`, `signatures` e `contract_documents` continuaram sem grants para `authenticated`;
- `public.set_contract_internal_number()` ficou com:
  - `SECURITY DEFINER`
  - `SET search_path TO 'public'`

### Resultado real do QA manual em `localhost`

Após login manual do usuário QA no app local:

- a home antiga `/` entrou, mas o console continuou registrando:
  - `Error fetching orders: Object`
- esse erro **não bloqueou** o módulo novo;
- o acesso direto a `http://localhost:3001/contratos-locacoes` funcionou.

### Estado do módulo `Contratos e Locações`

Confirmações visuais no browser:

- o painel carregou;
- **não** ocorreu mais:
  - `infinite recursion detected in policy for relation "organization_members"`
  - `permission denied for table organization_members`
- o seed QA apareceu no módulo.

#### Clientes

Em `/contratos-locacoes/clientes` apareceu:

- `Cliente QA Contratos Locacoes Ltda`
- status `Ativo`
- `1 obra(s)`
- cidade `Sao Paulo`

#### Contratos

Em `/contratos-locacoes/contratos` apareceu:

- contrato `#1`
- cliente `Cliente QA Contratos Locacoes Ltda`
- obra `Obra QA Contratos Locacoes`
- início `2026-07-01`
- recorrência `30 dias`
- `Itens: 1`
- `Pedido/OS: CONTRATO-QA-001`

#### Cobranças

Em `/contratos-locacoes/cobrancas` apareceu:

- recibo `R000001001 • #1`
- cliente `Cliente QA Contratos Locacoes Ltda`
- obra `Obra QA Contratos Locacoes`
- valor `R$ 1.500,00`
- saldo `R$ 0,00`
- status `PAID`

#### Pagamento / recibo

Em `/contratos-locacoes/recibos/00000000-0000-4000-8000-000000000105` apareceu:

- recibo `R000001001`
- total `R$ 1.500,00`
- pago `R$ 1.500,00`
- saldo `R$ 0,00`

Conclusão:

- clientes, contratos, cobranças e o pagamento seed estão visíveis no fluxo;
- o fluxo mínimo do módulo está navegável.

### Leitura do erro `orders`

O erro:

```text
Error fetching orders: Object
```

continua vindo da home/módulo antigo `Controle de Pedidos`.

Para esta etapa, ele se comportou como:

- **ruído da home antiga**, não como bloqueio do módulo novo;
- ao navegar diretamente para `/contratos-locacoes`, o módulo novo carregou normalmente.

### Bugs encontrados nesta subetapa

1. a home antiga `/` ainda tenta carregar `orders/pedidos` contra o Supabase novo e continua gerando erro de console;
2. o título do navegador continua `Radial - Controle de Pedidos` mesmo dentro de `Contratos e Locações`, o que pode confundir a leitura do contexto atual.

### Testes locais rodados nesta subetapa

```powershell
npm test -- src/lib/contratos-locacoes/migration-consistency.test.ts src/lib/contratos-locacoes/contracts-mutations.test.ts src/lib/contratos-locacoes/billing.test.ts
```

Resultado:

- **15 testes aprovados**

### Arquivos alterados nesta subetapa

- `supabase/migrations/202607071440_grant_authenticated_contratos_locacoes_tables.sql`
- `src/lib/contratos-locacoes/migration-consistency.test.ts`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### Git / entrega desta subetapa

- commit: **nao**
- push Git: **nao**
- deploy: **nao**
- migration remota: **sim**
- escrita no banco: **sim**, apenas via `db push` da migration `202607071440`

---

## Atualização posterior — investigação do login manual que não avança

**Data:** 2026-07-07  
**Subetapa:** investigação sem correção do fluxo de login manual com o usuário `thogalego+qa-contratos@gmail.com`

### Objetivo desta subetapa

Investigar por que, ao tentar login manual, a tela permanece em `/login`, os campos limpam e não aparece erro visível, sem alterar código e sem novo write no banco.

### Evidências confirmadas

1. O usuário de teste existe no projeto dev/homolog correto e está confirmado:

```powershell
npx supabase@latest db query --linked -o json "select id, email, email_confirmed_at from auth.users where email = 'thogalego+qa-contratos@gmail.com';"
```

Resultado confirmado:

- `id = 538afb33-f748-4547-baba-52ccd6e20092`
- `email = thogalego+qa-contratos@gmail.com`
- `email_confirmed_at = 2026-07-07 14:54:38.882334+00`

2. O membership do usuário continua correto em `organization_members`:

```powershell
npx supabase@latest db query --linked -o json "select organization_id, user_id, role from public.organization_members where user_id = '538afb33-f748-4547-baba-52ccd6e20092'::uuid;"
```

Resultado confirmado:

- `organization_id = 1e7deb83-0e50-4d1a-8707-dccbd68e50fb`
- `role = admin`

3. `.env.local` no workspace aponta para o projeto novo:

- `NEXT_PUBLIC_SUPABASE_URL=https://misfyiznwnuvldoccciw.supabase.co`

4. O bundle realmente servido para a tela de login também aponta para o projeto novo.

Foi lido o chunk carregado pela página:

- `http://127.0.0.1:3001/_next/static/chunks/src_00oj-qt._.js`

Trecho confirmado no bundle:

```js
const supabaseUrl = ("TURBOPACK compile-time value", "https://misfyiznwnuvldoccciw.supabase.co");
```

Conclusão:

- a tela de login em execução **não** está apontando para o backend antigo;
- a hipótese de login falhando por uso da URL antiga **caiu** para esta rota.

5. O console do browser interno não mostrou erro relevante durante a observação.

Foram vistos apenas logs informativos padrão do React DevTools.

6. O código da tela de login só exibe mensagem quando `signInWithPassword` retorna `error`.

Arquivo:

- `src/app/login/page.tsx`

Linhas relevantes:

- linha 20: chama `supabase.auth.signInWithPassword({ email, password })`
- linhas 25-27: só mostra erro quando `error` existe
- linha 29: se não houver erro, faz `router.push('/')`

7. O redirect pós-login depende da home (`/`) conseguir ler a sessão imediatamente.

Arquivo:

- `src/app/page.tsx`

Linhas relevantes:

- linhas 112-120: na montagem, chama `supabase.auth.getSession()`
- linhas 114-115: se `session` vier vazia, faz `router.replace('/login')`
- linhas 122-127: no `onAuthStateChange`, se houver sessão, apenas faz `setSession(session)`
- linha 118: `fetchOrders()` é chamado apenas no ramo do `getSession()` inicial com sessão já disponível

### Causa raiz provável

A causa raiz **mais provável** é um problema de fluxo/race condition no redirect pós-login:

1. a tela de login recebe sucesso de `signInWithPassword` e faz `router.push('/')`;
2. a home monta e consulta `supabase.auth.getSession()` imediatamente;
3. se nessa leitura inicial a sessão ainda não estiver disponível para a home, ela executa `router.replace('/login')`;
4. como a tela de login remonta, os campos limpam;
5. como o branch de erro do login não foi usado, nenhuma mensagem visível aparece.

Esse comportamento explica melhor o sintoma observado do que “credenciais inválidas”, porque:

- o componente de login mostraria mensagem caso `signInWithPassword` devolvesse `error`;
- os campos limparem sem mensagem combinam com remount/navegação;
- o usuário e o membership estão corretos no Supabase dev/homolog;
- a tela de login está usando o projeto novo correto.

### Observação importante sobre rede/runtime

Durante as janelas de observação no browser interno, não houve captura de uma nova navegação efetiva para `/` nem de request autenticado concluído com evidência suficiente para afirmar “confirmado” em vez de “provável”.

Portanto:

- a causa raiz acima está **fortemente indicada** pelo conjunto de evidências de código + runtime;
- ela ainda não foi “100% confirmada” por uma captura completa de request/auth + transição de URL no exato clique manual observado.

### Correção mínima proposta (ainda não executada)

Se for autorizado corrigir depois, a correção mínima proposta é revisar o gate de `/` para não devolver o usuário a `/login` antes de resolver a sessão de forma estável.

Direção mínima provável:

1. introduzir um estado explícito de “auth loading” na home;
2. só decidir entre `/login` e conteúdo depois que a leitura de sessão inicial terminar de forma confiável;
3. garantir que o caminho pós-login não dependa de uma corrida entre `router.push('/')` e `getSession()`;
4. opcionalmente registrar/logar o resultado de `signInWithPassword` e o primeiro `getSession()` para fechar a prova.

### Arquivos envolvidos nesta investigação

- `src/app/login/page.tsx`
- `src/app/page.tsx`
- `src/lib/supabase.ts`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhuma alteração de código do app;
- nenhuma alteração de senha;
- nenhum uso de `service_role` ou `secret key`;
- nenhuma migration;
- nenhum deploy;
- nenhum commit;
- nenhum push;
- nenhuma nova escrita no banco para depuração.

---

## Atualização posterior — diagnóstico do submit da tela de login

**Data:** 2026-07-07  
**Subetapa:** investigar se o problema está no `submit`/`preventDefault` de `src/app/login/page.tsx`, sem mexer em banco, Supabase ou produção

### Objetivo desta subetapa

Confirmar, com teste e evidência de runtime, se a tela de login falha por:

- ausência de `<form>`;
- botão não-submit;
- falta de `preventDefault()`;
- `handleLogin` não chamado;
- erro não renderizado;
- recarga nativa da página antes de qualquer chamada de auth.

### O que foi confirmado no código

Arquivo:

- `src/app/login/page.tsx`

Confirmações objetivas:

1. existe `<form onSubmit={handleLogin}>` envolvendo os campos;
2. o botão de login usa `type="submit"` explicitamente;
3. `handleLogin` recebe `e: React.FormEvent`;
4. a primeira linha do handler é `e.preventDefault()`;
5. se `signInWithPassword` retorna `error`, o código salva a mensagem em estado com `setError(...)`;
6. a mensagem é renderizada condicionalmente no próprio formulário;
7. portanto, pela leitura do arquivo, o fluxo de credencial inválida está implementado corretamente no componente.

### Teste automatizado adicionado/reforçado

Arquivo:

- `src/app/login/page.test.tsx`

O teste de credencial inválida agora confirma explicitamente:

- o `submit` nativo é cancelado;
- `signInWithPassword` é chamado com o e-mail e a senha digitados;
- não há navegação;
- a mensagem `Credenciais inválidas. Verifique seu e-mail e senha.` aparece na tela.

Comando rodado:

```powershell
npm test -- src/app/login/page.test.tsx
```

Resultado:

- **passou**

Também foi rodado:

```powershell
npx eslint src/app/login/page.tsx src/app/login/page.test.tsx
```

Resultado:

- **passou**

### Evidência de runtime no browser real

Foi reproduzido no browser interno com credenciais obviamente inválidas via automação Playwright:

- e-mail: `naoexiste+qa@example.com`
- senha: `senha-invalida-123`

Resultado observado no browser real:

- a URL permaneceu em `http://127.0.0.1:3001/login?`;
- os campos voltaram vazios após o clique;
- a mensagem de erro **não** apareceu;
- o contador de logs informativos de bootstrap do React aumentou após o clique, o que é consistente com reload/remount da página;
- o comportamento se repetiu mesmo após esperar 10 segundos antes do clique.

### Evidência importante sobre bundle/hidratação

Foi confirmado que o HTML servido para `/login` referencia os chunks client corretos:

- `/_next/static/chunks/src_00oj-qt._.js`
- `/_next/static/chunks/src_app_login_page_tsx_002ye8~._.js`

Também foi confirmado no chunk client compilado:

- `src/app/login/page.tsx` está presente com `handleLogin`, `preventDefault()`, `setError(...)`, `router.replace('/')` e `router.refresh()`;
- `src/lib/supabase.ts` compilado aponta para `https://misfyiznwnuvldoccciw.supabase.co`;
- a publishable key compilada também está presente.

Mesmo assim, uma instrumentação temporária com `console.log('[login] hydrated')` em `useEffect` e `console.log('[login] submit')` no handler **não apareceu no browser real**, enquanto os logs globais do React/Next continuaram aparecendo.

Conclusão prática:

- o problema **não** está na ausência de `preventDefault()` ou na estrutura do formulário em `src/app/login/page.tsx`;
- o problema está **antes** da lógica do componente ser executada no browser real;
- na prática, o browser está tratando a tela como HTML puro e executando o submit nativo/reload antes de qualquer chamada observável de `signInWithPassword` ou renderização de erro.

### Causa raiz confirmada nesta subetapa

**Causa raiz confirmada:** a falha atual não é um bug da lógica de `handleLogin` em `src/app/login/page.tsx`; a tela de login client-side não está executando/hidratando de forma efetiva no browser real, então o `submit` cai no comportamento nativo da página e recarrega `/login`.

O que esta subetapa **não** confirma ainda:

- por que exatamente a hidratação/client execution do `login/page.tsx` não está acontecendo nesse runtime específico;
- se a causa final está em cache de chunk, runtime do dev server, layout global, ou outro problema de bootstrap client fora do arquivo `login/page.tsx`.

### Decisão tomada

- **não** aplicar correção funcional no `login/page.tsx` nesta rodada, porque a hipótese “faltou `preventDefault` / botão errado / erro não renderizado” foi refutada por código + teste;
- manter apenas o reforço de teste para impedir regressão dessa lógica;
- seguir a próxima investigação no bootstrap/hidratação client do runtime local, e não insistir em mudanças cegas no pós-login.

### Arquivos alterados nesta subetapa

- `src/app/login/page.test.tsx`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhuma alteração permanente de comportamento em `src/app/login/page.tsx`;
- nenhum commit;
- nenhum push;
- nenhum deploy;
- nenhuma migration;
- nenhuma escrita no banco;
- nenhum uso de `service_role` ou `secret key`;
- nenhum teste com senha real do usuário.

---

## Atualização posterior — causa raiz do runtime local sem hidratação no `/login`

**Data:** 2026-07-07  
**Subetapa:** investigar por que o client bundle do login não hidratava/executava no runtime local, sem corrigir fluxo de auth

### Resumo do resultado

A investigação isolou o problema para a **origem usada no ambiente de desenvolvimento local**, e não para:

- SQL;
- usuário/senha;
- Supabase Auth;
- `form onSubmit`;
- `preventDefault()`;
- lógica do componente `src/app/login/page.tsx`.

### Evidências confirmadas

#### 1. O componente de login continua correto no código

Em `src/app/login/page.tsx`:

- há `'use client'` exatamente no topo;
- existe `<form onSubmit={handleLogin}>`;
- o botão é `type="submit"`;
- o handler chama `e.preventDefault()`;
- em caso de erro do Supabase, o estado `error` é salvo e renderizado.

#### 2. O teste automatizado prova que o componente funciona quando React está rodando

Arquivo:

- `src/app/login/page.test.tsx`

Teste reforçado:

- simula submit inválido;
- confirma que `signInWithPassword` é chamado;
- confirma que o submit nativo é cancelado;
- confirma que a mensagem de erro fica visível;
- confirma que não há navegação.

Comandos:

```powershell
npm test -- src/app/login/page.test.tsx
npx eslint src/app/login/page.tsx src/app/login/page.test.tsx
```

Resultado:

- ambos passaram.

#### 3. Todos os chunks JS anunciados pela página retornam 200 com MIME correto

Foi verificado por `Invoke-WebRequest` contra cada `src` de `<script>` presente em `http://127.0.0.1:3001/login?`.

Resultado:

- todos os arquivos `/_next/...js` retornaram `200`;
- `Content-Type` veio como `application/javascript; charset=UTF-8`;
- não houve `404` nem `500` nos chunks listados do login.

#### 4. O JavaScript do browser interno está habilitado

Confirmado por execuções de `tab.playwright.evaluate(...)` na própria página.

Conclusão:

- o problema não é “JavaScript desativado” no browser interno.

#### 5. O bundle do login chega a ser carregado

Com instrumentação temporária removível em `src/app/login/page.tsx`, foi observado no console do browser interno em `http://127.0.0.1:3001/login?`:

- `[login] module evaluated`

Mas **não** apareceram:

- `[login] component invoked`
- `[login] hydrated`
- `[login] submit`

E, após clique com credencial inválida em `127.0.0.1`:

- os campos voltaram vazios;
- a URL permaneceu em `/login`;
- o módulo foi avaliado novamente, consistente com reload/remount;
- `handleLogin` não executou.

#### 6. O log oficial do Next dev server apontou a pista crítica

Arquivo de log encontrado:

- `.next/dev/logs/next-development.log`

Trecho relevante:

```text
⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1".
To allow this host in development, add it to "allowedDevOrigins" in next.config.js
```

Também foi confirmado em `next.config.ts`:

```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.18.245'],
};
```

Ou seja:

- `127.0.0.1` não está permitido em `allowedDevOrigins`;
- a origem usada pelo browser interno estava fora da allowlist do dev server.

#### 7. O mesmo browser interno funciona ao trocar apenas a origem para `localhost`

Foi aberto no **mesmo** browser interno:

- `http://localhost:3001/login`

Com a mesma instrumentação temporária, o console mostrou:

- `[login] module evaluated`
- `[login] component invoked`
- `[login] hydrated`

Depois de login inválido em `localhost`, o console mostrou:

- `[login] submit`
- `[login] signInWithPassword result {"hasError":true,"errorMessage":"Invalid login credentials"}`

E a UI mostrou a mensagem:

- `Credenciais inválidas. Verifique seu e-mail e senha.`

Conclusão:

- o login **hidrata e executa normalmente** em `localhost`;
- o problema aparece em `127.0.0.1`;
- portanto, a falha é de **origem/configuração de dev runtime**, não da lógica do componente.

### Causa raiz confirmada / hipótese mais forte

**Hipótese mais forte, sustentada por evidência prática e pelo log do Next:**

o acesso local via `http://127.0.0.1:3001/login` entra em conflito com a política de origens do Next dev server (`allowedDevOrigins`), bloqueando parte do bootstrap/recursos de desenvolvimento necessários para a hidratação completa do App Router naquele runtime. Por isso:

- o módulo client do login chega a carregar;
- mas a árvore React do login não hidrata de forma estável nessa origem;
- o formulário cai no comportamento nativo da página e recarrega `/login`.

### O que não foi confirmado diretamente

- não foi possível testar um navegador externo normal com automação completa nesta sessão;
- o ambiente de ferramentas expôs apenas o browser interno;
- portanto, a conclusão sobre navegador externo continua **não confirmada diretamente**.

Mesmo assim, como `localhost` e `127.0.0.1` foram testados no **mesmo browser interno** com comportamentos opostos, a evidência aponta mais para **origem/config do dev server** do que para bug intrínseco do browser interno.

### Correção mínima sugerida para a próxima etapa

Sem executar ainda nesta subetapa:

1. usar `http://localhost:3001/login` como URL local recomendada de QA/manual no dev atual; ou
2. adicionar `127.0.0.1` a `allowedDevOrigins` em `next.config.ts` e reiniciar o `next dev`.

### Arquivos alterados nesta subetapa

- `src/app/login/page.test.tsx` — permaneceu com o teste reforçado do submit inválido;
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md` — atualizado com o diagnóstico;
- `src/app/login/page.tsx` recebeu apenas instrumentação temporária **já removida** ao final da investigação.

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push;
- nenhum deploy;
- nenhuma migration;
- nenhuma escrita no banco;
- nenhuma alteração de senha;
- nenhuma correção funcional definitiva ainda.

---

## Atualização posterior — QA manual do módulo em `http://localhost:3001/contratos-locacoes`

**Data:** 2026-07-07  
**Subetapa:** validar o módulo autenticado em `localhost` após login manual do usuário QA, sem nova escrita no banco e sem corrigir o módulo antigo de pedidos

### Objetivo desta subetapa

Confirmar se:

- `/contratos-locacoes` carrega no app local autenticado;
- os erros de RLS em `organization_members` realmente sumiram;
- o seed QA/dev criado anteriormente aparece nas telas principais;
- o fluxo mínimo está navegável;
- o erro `Error fetching orders: Object` é bloqueante ou apenas ruído da home antiga.

### Evidências confirmadas

1. O painel principal carregou em `http://localhost:3001/contratos-locacoes`.

Texto visível confirmado:

- `Cobranças a emitir 0`
- `Vencendo em 7 dias 0`
- `Saldo em aberto R$ 0,00`
- `Nenhum alerta de cobrança no momento.`

2. Não apareceu mais nenhum erro de:

- `infinite recursion detected in policy for relation "organization_members"`
- `permission denied for table organization_members`

3. O seed QA/dev apareceu nas telas principais do módulo.

#### Clientes

Em `/contratos-locacoes/clientes` apareceram:

- `Cliente QA Contratos Locacoes Ltda`
- `Cliente QA Contratos Locacoes`
- `1 obra(s)`
- `Sao Paulo`

#### Contratos

Em `/contratos-locacoes/contratos` apareceram:

- `#1`
- `Cliente QA Contratos Locacoes Ltda`
- `Obra QA Contratos Locacoes`
- `Início: 2026-07-01`
- `Itens: 1`
- `Pedido/OS: CONTRATO-QA-001`

#### Cobranças

Em `/contratos-locacoes/cobrancas` apareceram:

- `R000001001 • #1`
- `Cliente QA Contratos Locacoes Ltda`
- `Obra QA Contratos Locacoes`
- `R$ 1.500,00`
- `Saldo: R$ 0,00`
- `PAID`

#### Recibo / pagamento

Em `/contratos-locacoes/recibos/00000000-0000-4000-8000-000000000105` apareceram:

- `Recibo R000001001`
- `Total R$ 1.500,00`
- `Pago R$ 1.500,00`
- `Saldo R$ 0,00`

4. O fluxo mínimo está navegável sem salvar novos dados.

Foi possível abrir com sucesso:

- `/contratos-locacoes/clientes/novo`
- `/contratos-locacoes/contratos/00000000-0000-4000-8000-000000000103`
- `/contratos-locacoes/recibos/00000000-0000-4000-8000-000000000105`

5. O erro antigo de pedidos continuou no console:

```text
Error fetching orders: Object
```

Mas, nesta subetapa, ele se comportou como:

- ruído da home/módulo legado `Controle de Pedidos`;
- **não bloqueou** o acesso nem a navegação do módulo `Contratos e Locações`.

### Bug adicional encontrado

Ao abrir `/contratos-locacoes/clientes/novo`, o console registrou erro de hidratação React indicando mismatch entre HTML do servidor e props/client render.

Evidência principal:

- diferença de `id` e `htmlFor` em campos de obra e contato, com UUIDs diferentes entre SSR e client;
- o formulário abriu, mas o runtime registrou `A tree hydrated but some attributes of the server rendered HTML didn't match the client properties`.

Leitura atual:

- não bloqueou a abertura da tela nesta rodada;
- é um bug real do módulo novo e merece correção futura antes de confiar plenamente no fluxo de criação/edição pelo app.

### Arquivos alterados nesta subetapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhuma alteração de código de app;
- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhuma nova escrita no banco;
- nenhuma correção do módulo antigo de pedidos.

---

## Atualização posterior — correção do hydration mismatch em `/contratos-locacoes/clientes/novo`

**Data:** 2026-07-07  
**Subetapa:** corrigir apenas o mismatch de hidratação no formulário de novo cliente do módulo `Contratos e Locações`, sem mexer em Supabase, migrations ou módulo antigo

### Objetivo desta subetapa

Eliminar o erro de hidratação do client observado em:

- `http://localhost:3001/contratos-locacoes/clientes/novo`

mantendo o escopo somente no formulário `CustomerForm`.

### Causa raiz confirmada

O `CustomerForm` gerava IDs dinâmicos de obras e contatos durante a renderização inicial usando:

- `crypto.randomUUID()`
- fallback com `Math.random()`

Arquivo envolvido:

- `src/components/contratos-locacoes/CustomerForm.tsx`

Efeito prático:

- o HTML SSR era gerado com um conjunto de `id`/`htmlFor`;
- na hidratação client, o componente renderizava novos valores aleatórios;
- React detectava mismatch entre SSR e client para campos como:
  - `site-name-*`
  - `site-address-*`
  - `contact-name-*`
  - `contact-email-*`

### Correção aplicada

Foi feita uma correção mínima:

1. remover a geração aleatória de IDs no render inicial do `CustomerForm`;
2. usar seeds estáveis com `useId()` para os primeiros IDs renderizados no SSR e no client;
3. manter geração incremental apenas para itens adicionados pelo usuário após a hidratação;
4. preservar o vínculo correto entre `label htmlFor` e `input/select id`.

Em resumo:

- IDs iniciais agora nascem estáveis como `site-<seed>-initial` e `contact-<seed>-initial`;
- novos itens adicionados no client usam contadores locais estáveis por instância do formulário.

### Teste de regressão adicionado

Arquivo:

- `src/components/contratos-locacoes/CustomerForm.test.tsx`

Foi adicionado um teste de SSR + hidratação que:

- renderiza o `CustomerForm` em HTML;
- hidrata o mesmo markup no client;
- falha se aparecer `A tree hydrated but some attributes...`.

Esse teste ficou vermelho antes da correção e verde depois dela.

### Validações executadas

#### Teste automatizado

```powershell
npm test -- src/components/contratos-locacoes/CustomerForm.test.tsx
```

Resultado:

- **3 testes aprovados**

#### Lint

```powershell
npx eslint src/components/contratos-locacoes/CustomerForm.tsx src/components/contratos-locacoes/CustomerForm.test.tsx
```

Resultado:

- **sem erros**

#### Validação manual no browser

Em `http://localhost:3001/contratos-locacoes/clientes/novo`:

- a página abriu sem `hydration mismatch` no console;
- foi possível adicionar obra;
- foi possível remover obra;
- foi possível adicionar contato;
- foi possível remover contato;
- foi possível preencher campos sem salvar;
- após essas interações, o console permaneceu sem erros/warnings nessa aba de validação.

### Arquivos alterados nesta subetapa

- `src/components/contratos-locacoes/CustomerForm.tsx`
- `src/components/contratos-locacoes/CustomerForm.test.tsx`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhuma escrita no banco;
- nenhuma alteração em Supabase;
- nenhuma correção do erro `Error fetching orders: Object`;
- nenhuma alteração no módulo antigo de pedidos.

---

## Atualização posterior — QA manual mínimo do módulo em `localhost`

**Data:** 2026-07-07  
**Subetapa:** executar QA manual mínimo do módulo `Contratos e Locações` no ambiente dev/homolog `misfyiznwnuvldoccciw`, priorizando leitura e navegação antes de qualquer nova escrita

### Objetivo desta subetapa

Validar no browser:

- sessão autenticada;
- carregamento do painel;
- presença do seed QA;
- abertura dos detalhes seed de cliente, contrato e recibo;
- viabilidade dos fluxos de criar cliente e criar contrato pelo app;
- presença de erros no console;
- bloqueios reais de UX/fluxo.

### Evidências confirmadas

#### Sessão e painel

- a sessão autenticada continuou válida em `http://localhost:3001`;
- `/contratos-locacoes` abriu com sucesso;
- após alguns segundos, o painel saiu de `Carregando painel...` e exibiu os cards esperados;
- não apareceu novo erro de RLS nem de grants.

#### Seed QA visível

Em `/contratos-locacoes/clientes`:

- `Cliente QA Contratos Locacoes Ltda`
- `Cliente QA Contratos Locacoes`
- `1 obra(s)`
- `Sao Paulo`

Em `/contratos-locacoes/clientes/00000000-0000-4000-8000-000000000101`:

- a tela de detalhe do cliente abriu com formulário de edição;
- nenhum erro de console foi capturado nessa navegação.

Em `/contratos-locacoes/contratos`:

- contrato `#1`
- cliente `Cliente QA Contratos Locacoes Ltda`
- obra `Obra QA Contratos Locacoes`
- `Pedido/OS: CONTRATO-QA-001`

Em `/contratos-locacoes/contratos/00000000-0000-4000-8000-000000000103`:

- a tela de detalhe do contrato abriu corretamente;
- itens de locação seed ficaram visíveis;
- nenhum erro de console foi capturado nessa navegação.

Em `/contratos-locacoes/cobrancas`:

- `R000001001 • #1`
- `R$ 1.500,00`
- `PAID`

Em `/contratos-locacoes/recibos/00000000-0000-4000-8000-000000000105`:

- recibo abriu corretamente;
- total, pago e saldo ficaram visíveis.

### Fluxo de novo cliente

Em `/contratos-locacoes/clientes/novo`:

- o formulário abriu;
- foi possível descartar o rascunho local existente;
- foi possível preencher campos sem salvar, incluindo:
  - razão social;
  - nome fantasia;
  - CNPJ/CPF;
  - obra/local;
  - contato.

Dados usados apenas em rascunho local, sem submit:

- `Cliente QA Browser Sem Salvar Ltda`
- `Cliente QA Browser`
- `Obra QA Browser`
- `Contato QA Browser`

Conclusão:

- o fluxo de novo cliente está preenchível;
- ainda **não** foi submetido, para evitar escrita no banco sem nova confirmação do usuário.

### Fluxo de novo contrato

Em `/contratos-locacoes/contratos/novo`:

- o formulário abriu;
- foi possível descartar o rascunho local existente;
- foi possível selecionar:
  - cliente seed;
  - obra/local seed;
- foi possível preencher campos textuais do item manual sem salvar.

Dados usados apenas em rascunho local, sem submit:

- `CONTRATO-QA-BROWSER-NAO-SALVAR`
- `Item QA Browser sem salvar`
- `Gerador`
- `250 kVA`

### Bug encontrado nesta subetapa

#### Hydration mismatch em `contratos/novo`

Ao abrir `http://localhost:3001/contratos-locacoes/contratos/novo`, o console registrou novo `hydration mismatch` em `RentalItemsEditor`.

Evidência principal:

- mismatch em `id`/`htmlFor` de campos como:
  - `item-description-*`
  - `item-type-*`
  - `item-capacity-*`
  - `item-serial-*`
  - `item-code-*`
  - `item-quantity-*`
  - `item-amount-*`

Leitura atual:

- o padrão é análogo ao bug já corrigido no `CustomerForm`;
- o fluxo de contrato ainda parece parcialmente utilizável, mas esse bug deve ser tratado antes de confiar no create flow.

### Decisão operacional desta subetapa

- não submeter `Salvar cliente`;
- não submeter `Salvar contrato`;
- parar antes de qualquer nova escrita remota e pedir confirmação explícita do usuário, já que o QA mínimo encontrou um bug real no fluxo de contrato e qualquer submit criaria dados novos no ambiente dev/homolog.

### Arquivos alterados nesta subetapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhuma escrita no banco;
- nenhum submit de novo cliente;
- nenhum submit de novo contrato.

---

## Atualização posterior — correção do hydration mismatch em `contratos/novo`

**Data:** 2026-07-07  
**Subetapa:** corrigir o `hydration mismatch` do fluxo `http://localhost:3001/contratos-locacoes/contratos/novo`, mantendo o escopo em `ContractForm` e `RentalItemsEditor`

### Objetivo desta subetapa

Eliminar o erro de hidratação do create flow de contratos, sem:

- salvar dados;
- mexer em Supabase;
- aplicar migration;
- corrigir o módulo antigo.

### Causa raiz confirmada

O bug tinha duas origens relacionadas:

1. `src/components/contratos-locacoes/ContractForm.tsx`
   - criava o item inicial do contrato com `crypto.randomUUID()` / `Math.random()` durante a renderização inicial;
2. `src/components/contratos-locacoes/RentalItemsEditor.tsx`
   - criava novos itens/fallback com IDs aleatórios.

Efeito:

- o SSR emitia um `id/htmlFor` para os campos do item manual;
- a hidratação client criava outro;
- React registrava mismatch em campos como:
  - `item-description-*`
  - `item-type-*`
  - `item-capacity-*`
  - `item-serial-*`
  - `item-code-*`
  - `item-quantity-*`
  - `item-amount-*`

### Correção aplicada

Foi feita uma correção mínima:

1. extrair a criação do item vazio para aceitar um `id` explícito;
2. no `ContractForm`, gerar o item inicial com ID estável baseado em `useId()`:
   - `item-<seed>-initial`
3. no `RentalItemsEditor`, usar `useId()` + contador local para gerar IDs estáveis da instância:
   - apenas para itens adicionados/removidos após hidratação;
4. manter `label htmlFor` e `input id` alinhados.

### Teste de regressão adicionado

Arquivo:

- `src/components/contratos-locacoes/ContractForm.test.tsx`

Foi adicionado teste de SSR + hydrate que:

- renderiza o `ContractForm` sem `initialValue`;
- hidrata o mesmo markup;
- falha se o console registrar `A tree hydrated but some attributes...`.

Esse teste ficou vermelho antes da correção e verde depois.

### Validações executadas

#### Testes automatizados

```powershell
npm test -- src/components/contratos-locacoes/ContractForm.test.tsx src/components/contratos-locacoes/RentalItemsEditor.test.tsx
```

Resultado:

- **2 arquivos de teste aprovados**
- **4 testes aprovados**

#### Lint

```powershell
npx eslint src/components/contratos-locacoes/ContractForm.tsx src/components/contratos-locacoes/ContractForm.test.tsx src/components/contratos-locacoes/RentalItemsEditor.tsx src/components/contratos-locacoes/RentalItemsEditor.test.tsx
```

Resultado:

- **sem erros e sem warnings**

#### Validação manual no browser

Em `http://localhost:3001/contratos-locacoes/contratos/novo`:

- a página abriu sem `hydration mismatch` no console;
- foi possível descartar rascunho local;
- foi possível adicionar item;
- foi possível remover item;
- foi possível preencher campos sem salvar;
- foi possível selecionar cliente seed e obra/local seed;
- o console permaneceu sem erros/warnings nessa aba de validação.

### Arquivos alterados nesta subetapa

- `src/components/contratos-locacoes/ContractForm.tsx`
- `src/components/contratos-locacoes/ContractForm.test.tsx`
- `src/components/contratos-locacoes/RentalItemsEditor.tsx`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhuma escrita no banco;
- nenhum submit de contrato;
- nenhuma correção do erro `Error fetching orders: Object`.

---

## Atualização posterior — teste controlado de escrita pelo app

**Data:** 2026-07-07  
**Subetapa:** executar uma escrita real e mínima pelo app, priorizando um único cliente QA/dev no ambiente `misfyiznwnuvldoccciw`

### Objetivo desta subetapa

Validar:

- sessão autenticada;
- abertura de `/contratos-locacoes/clientes/novo`;
- criação de um único cliente QA/dev pelo app;
- confirmação por leitura no Supabase;
- decisão sobre seguir ou não para contrato, conforme clareza e segurança do fluxo.

### Escrita tentada no app

Foi feito submit do formulário de novo cliente com dados QA/dev:

- razão social: `Cliente QA Manual App Ltda`
- nome fantasia: `Cliente QA Manual App`
- obra/local: `Obra QA Manual App`
- contato: `Contato QA Manual App`

### Comportamento observado no browser

Após clicar em `Salvar cliente`:

- o app **não** redirecionou;
- permaneceu em `/contratos-locacoes/clientes/novo`;
- apareceu erro visível no formulário:

```text
Não foi possível salvar os contatos: invalid input syntax for type uuid: "contact-35cfcce1-353e-4d7d-afdd-99d24feaf15d"
```

O console do módulo não registrou erro novo separado nesta subetapa; o erro ficou exposto pela própria UI.

### Confirmação por leitura no Supabase

Foi confirmado por `SELECT` somente leitura no projeto correto `misfyiznwnuvldoccciw` que o cliente foi criado mesmo com erro no app:

- `customers.id = 369f991b-049e-44db-bdaa-c4e01f607c2c`
- `legal_name = Cliente QA Manual App Ltda`
- `trade_name = Cliente QA Manual App`
- `created_at = 2026-07-07 18:33:02.756956+00`

Também foi confirmado por leitura:

- **não** foi criada `customer_site` para esse cliente;
- **não** foi criado `customer_contact` para esse cliente.

### Causa/bug funcional encontrado

O fluxo atual de criação de cliente tem um bug grave de consistência:

1. o frontend envia `contact.id` com formato local não-UUID (ex.: `contact-...`);
2. o backend tenta persistir isso como UUID em contatos;
3. a etapa de contatos falha;
4. mesmo assim, o cliente já fica gravado.

Resultado prático:

- houve **escrita parcial**;
- o app comunica falha;
- mas o banco fica com cliente órfão, sem obra e sem contato.

Isso sugere ausência de transação efetiva ou ausência de rollback completo no fluxo `createCustomer`.

### Decisão operacional nesta subetapa

- **não** seguir para criação de contrato;
- parar aqui, porque o pré-requisito de escrita básica pelo app revelou bug de consistência de dados e o usuário pediu para perguntar antes de seguir se houvesse dúvida no fluxo.

### Dados QA criados nesta subetapa

- cliente criado parcialmente:
  - `id = 369f991b-049e-44db-bdaa-c4e01f607c2c`
  - `legal_name = Cliente QA Manual App Ltda`
  - `trade_name = Cliente QA Manual App`

Não criados:

- obra/local `Obra QA Manual App`
- contato `Contato QA Manual App`
- contrato QA/dev

### Arquivos alterados nesta subetapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### Testes rodados nesta subetapa

- nenhum teste automatizado;
- somente validação manual no browser e leitura confirmatória no Supabase.

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma criação de contrato.

---

## Atualização posterior — correção do bug de ids temporários em contatos/obras

**Data:** 2026-07-07  
**Subetapa:** corrigir a falha de consistência na criação de cliente pelo app, sem tocar no banco

### Causa raiz confirmada

O bug estava em `src/lib/contratos-locacoes/mutations.ts`:

- `CustomerForm` usa ids locais de UI para controlar listas dinâmicas, como `site-...` e `contact-...`;
- `createCustomer` e `persistRelations` reaproveitavam esses ids diretamente ao montar os registros de `customer_sites` e `customer_contacts`;
- o insert em `customer_contacts` então tentava gravar `contact.id = "contact-..."` em coluna UUID e falhava;
- como `customers` era inserido antes das relações e não existe transação de múltiplas tabelas no fluxo atual do browser, o cliente base já ficava criado quando a etapa de contatos quebrava.

### Correção implementada

Foi aplicada correção mínima em `src/lib/contratos-locacoes/mutations.ts`:

- ids temporários não-UUID agora são convertidos para UUIDs reais antes da persistência;
- `contact.site_id` é remapeado para o UUID real da obra/local correspondente;
- a persistência das relações deixou de usar `Promise.all` entre obras e contatos:
  - primeiro grava `customer_sites`;
  - depois grava `customer_contacts`;
  - isso evita corrida com FK quando o contato referencia uma obra nova;
- em falha após a criação do cliente base, o fluxo agora executa limpeza compensatória de:
  - contatos daquele cliente;
  - obras/locais daquele cliente;
- depois lança erro explícito informando que o cadastro completo não foi concluído e que o cliente base pode precisar de revisão manual.

### Limitação conhecida mantida

O fluxo agora trata melhor a falha parcial, mas **não** tenta apagar o `customer` base criado, porque o ambiente atual não concede `DELETE` em `customers` para `authenticated`.

Isso significa:

- a causa determinística do erro real (`contact-...` enviado como UUID) foi corrigida;
- se houver outra falha futura entre criação do cliente e gravação das relações, haverá compensação de obras/contatos e erro explícito;
- o cliente base ainda pode exigir revisão manual em cenários excepcionais.

O cliente parcial já existente abaixo **não foi apagado** nesta subetapa:

- `369f991b-049e-44db-bdaa-c4e01f607c2c`

Qualquer limpeza/deleção dele continua dependendo de aprovação explícita do usuário.

### Testes automatizados adicionados/atualizados

Arquivo: `src/lib/contratos-locacoes/mutations.test.ts`

Coberturas validadas:

- criação com ids temporários de obra e contato convertidos para UUIDs reais;
- remapeamento correto de `contact.site_id` para o UUID persistido da obra;
- ordem de persistência `sites -> contacts`;
- tratamento explícito de falha com limpeza compensatória;
- caminho feliz de criação com payload persistido correto.

### Testes rodados

Comandos executados:

```bash
npm test -- src/lib/contratos-locacoes/mutations.test.ts
npm test -- src/lib/contratos-locacoes/mutations.test.ts src/components/contratos-locacoes/CustomerForm.test.tsx
npx eslint src/lib/contratos-locacoes/mutations.ts src/lib/contratos-locacoes/mutations.test.ts
```

Resultados:

- `mutations.test.ts`: **3 testes passando**
- suíte combinada com `CustomerForm.test.tsx`: **6 testes passando**
- `eslint`: **sem erros e sem warnings**

### Arquivos alterados nesta subetapa

- `src/lib/contratos-locacoes/mutations.ts`
- `src/lib/contratos-locacoes/mutations.test.ts`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma nova escrita no banco;
- nenhuma limpeza do cliente parcial já existente;
- nenhuma criação de contrato.

---

## Atualização posterior — validação real no app da correção de cliente + obra + contato

**Data:** 2026-07-07  
**Subetapa:** validar no app real a correção do bug `contact-...` com uma única nova criação QA/dev

### Ambiente validado

- app local: `http://localhost:3001`
- projeto Supabase confirmado em `supabase/.temp/project-ref`:
  - `misfyiznwnuvldoccciw`
- backend antigo `iurqgskfuupslrghgtej` não foi usado

### Fluxo executado no browser

Sessão autenticada confirmada no módulo `Contratos e Locações`.

Foi aberto:

- `/contratos-locacoes/clientes/novo`

Antes do novo teste:

- havia resíduos visuais da tentativa anterior na tela;
- o rascunho local foi descartado;
- a rota foi recarregada;
- o formulário voltou limpo.

Depois foi feito **um único submit novo** com os dados QA/dev:

- `legal_name`: `Cliente QA Manual App 2 Ltda`
- `trade_name`: `Cliente QA Manual App 2`
- obra/local: `Obra QA Manual App 2`
- contato: `Contato QA Manual App 2`
- e-mail do contato: `qa.manual.app2@example.com`
- o contato foi vinculado explicitamente à obra criada no select `Vincular à obra`

### Resultado da UI

Após clicar em `Salvar cliente`:

- a UI **não** mostrou novamente o erro `contact-...`;
- a rota avançou para a página do cliente criado:
  - `/contratos-locacoes/clientes/1dacd0d5-35e2-4e4d-b8b4-607a5156782f`
- não apareceu erro visível no módulo;
- a aba não registrou novos erros/warnings de console relacionados a essa criação.

Observação:

- o toast de sucesso não foi capturado no instante da leitura posterior, mas o redirecionamento para a rota do cliente criado ocorreu de forma consistente e sem erro visível.

### Confirmação por SELECT somente leitura no Supabase

Foi confirmada por leitura no projeto **correto** `misfyiznwnuvldoccciw` a criação completa e vinculada:

- customer:
  - `customer_id = 1dacd0d5-35e2-4e4d-b8b4-607a5156782f`
  - `legal_name = Cliente QA Manual App 2 Ltda`
  - `trade_name = Cliente QA Manual App 2`
- customer_site:
  - `site_id = e0ab787f-d691-44ee-a281-2a74a3f3846f`
  - `site_name = Obra QA Manual App 2`
- customer_contact:
  - `contact_id = 4751c553-1c07-4c00-a934-1d601838ac78`
  - `contact_name = Contato QA Manual App 2`
  - `contact_email = qa.manual.app2@example.com`
  - `contact_site_id = e0ab787f-d691-44ee-a281-2a74a3f3846f`

Conclusão da leitura:

- o contato foi salvo com UUID real;
- a obra foi salva com UUID real;
- `contact_site_id` bate com `site_id`;
- o bug de `invalid input syntax for type uuid: "contact-..."` **não reapareceu** nessa criação real.

### Bug antigo parcial

O cliente parcial antigo abaixo **não foi apagado** nesta subetapa, conforme instrução do usuário:

- `369f991b-049e-44db-bdaa-c4e01f607c2c`

### Bugs/bloqueios encontrados nesta validação

- nenhum bloqueio novo no fluxo de criação dessa rodada;
- sem reocorrência do bug `contact-...`;
- o módulo antigo de `orders` continua fora de escopo e não foi tratado aqui.

### Testes automatizados nesta subetapa

- nenhum teste novo rodado nesta subetapa;
- a validação foi manual no browser + confirmação por `SELECT` somente leitura no Supabase.

### Arquivos alterados nesta subetapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma criação de contrato;
- nenhuma limpeza do cliente parcial antigo.

---

## Atualização posterior — validação real da criação de contrato pelo app

**Data:** 2026-07-07  
**Subetapa:** validar no app real a criação de um contrato QA/dev mínimo para o cliente `Cliente QA Manual App 2`

### Contexto do teste

Cliente usado:

- `customer_id = 1dacd0d5-35e2-4e4d-b8b4-607a5156782f`
- `site_id = e0ab787f-d691-44ee-a281-2a74a3f3846f`
- `contact_id = 4751c553-1c07-4c00-a934-1d601838ac78`

Ambiente confirmado:

- app local: `http://localhost:3001`
- Supabase dev/homolog: `misfyiznwnuvldoccciw`

### Fluxo executado no browser

Foi aberto:

- `/contratos-locacoes/contratos/novo`

Observação inicial:

- havia rascunho local anterior no formulário de contrato;
- o rascunho foi descartado;
- a página foi recarregada;
- o formulário voltou limpo.

Depois disso foi preparado um contrato mínimo de locação:

- tipo: `Locação`
- status inicial: `Rascunho`
- cliente: `Cliente QA Manual App 2 Ltda`
- obra/local: `Obra QA Manual App 2`
- recorrência: `30`
- valor base: `150000`
- observações: `Contrato QA Manual App 2 - criado pelo app`

Item locado único:

- descrição: `Item QA Manual App 2`
- tipo: `Gerador QA`
- capacidade: `180 kVA`
- quantidade: `1`
- valor unitário: `150000`

### Comportamento observado na UI

Primeiro submit:

- a tela bloqueou com validação:
  - `Data de início é obrigatória`

Após preencher a data novamente via interação mais próxima do usuário, houve novo submit.

Resultado final da UI:

- a rota **não** redirecionou para página de detalhe nem lista;
- permaneceu em `/contratos-locacoes/contratos/novo`;
- não houve erro de console novo na aba;
- mas a leitura do texto da página mostrou erro funcional no formulário:

```text
Não foi possível salvar os itens da locação: invalid input syntax for type uuid: "item-_R_aatpesnel5rlb_-initial"
```

### Confirmação por SELECT somente leitura no Supabase

Foi confirmado por leitura no projeto correto `misfyiznwnuvldoccciw` que houve **escrita parcial**:

Contrato criado:

- `contract_id = 787f45a4-e319-404f-b127-fac62ba863a6`
- `customer_id = 1dacd0d5-35e2-4e4d-b8b4-607a5156782f`
- `site_id = e0ab787f-d691-44ee-a281-2a74a3f3846f`
- `kind = rental`
- `status = draft`
- `start_date = 2026-07-07`
- `base_amount = 150000`
- `internal_number = 2`

Item locado:

- **não foi criado**
- `rental_item_count = 0`

Ciclos automáticos de cobrança:

- **não foram criados**
- `billing_cycle_count = 0`

### Conclusão funcional desta subetapa

O fluxo de criação de contrato ainda tem um bug de consistência semelhante ao já corrigido em clientes:

- o contrato base é criado;
- mas o item locado usa id local temporário `item-...`;
- o insert em `rental_items` falha por UUID inválido;
- a UI não conclui o redirecionamento;
- e o banco fica com contrato parcial, sem item.

### Número interno / documento

- `internal_number` foi gerado corretamente pelo banco:
  - `2`
- nenhum documento de cobrança foi gerado nesta etapa;
- nenhuma cobrança automática foi criada.

### Bugs encontrados nesta validação

- bug confirmado de escrita parcial em contrato:
  - `contract` criado
  - `rental_item` não criado
- erro real exibido pelo formulário:
  - `Não foi possível salvar os itens da locação: invalid input syntax for type uuid: "item-_R_aatpesnel5rlb_-initial"`

### Testes automatizados nesta subetapa

- nenhum teste automatizado rodado nesta subetapa;
- validação foi manual no browser + confirmação por `SELECT` somente leitura no Supabase.

### Arquivos alterados nesta subetapa

- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma cobrança manual;
- nenhum pagamento manual;
- nenhuma nova tentativa adicional de contrato além desta rodada controlada.

---

## Atualização posterior — correção do bug de ids temporários em `rental_items` na criação de contrato

**Data:** 2026-07-07  
**Subetapa:** corrigir o fluxo de criação de contrato + item locado para impedir envio de ids temporários `item-...` ao Supabase, sem criar novo contrato real

### Objetivo desta subetapa

Corrigir somente:

- criação de contrato com item locado manual;
- vazamento de ids temporários `item-...` para `rental_items`;
- tratamento explícito da falha parcial;
- teste de regressão;
- validação manual do formulário sem submit.

Fora de escopo mantido:

- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma criação real nova de contrato no banco;
- nenhuma correção de `Error fetching orders`;
- nenhuma limpeza do contrato parcial `787f45a4-e319-404f-b127-fac62ba863a6`.

### Causa raiz confirmada

O bug estava em `src/lib/contratos-locacoes/mutations.ts`, no fluxo:

- `ContractForm` e `RentalItemsEditor` geram ids locais de UI como `item-_R_aatpesnel5rlb_-initial`;
- `createContract` fazia `contractDraftSchema.parse(...)` corretamente;
- mas `persistRentalItems` chamava `buildRentalItemRecords(...)` usando `payload.items` diretamente;
- `buildRentalItemRecords(...)` então copiava `item.id` cru para o payload de `rental_items`;
- o Supabase tentava gravar esse valor em coluna UUID e retornava:
  - `invalid input syntax for type uuid: "item-_R_aatpesnel5rlb_-initial"`

Conclusão:

- a hipótese do usuário foi confirmada;
- o padrão era o mesmo do bug anterior de `site-...` / `contact-...`;
- a correção precisava acontecer na mutation, antes do `upsertRentalItems`.

### Correção implementada

Foi aplicada correção mínima e alinhada ao padrão já usado em clientes:

1. `resolvePersistedId(...)` já existente passou a ser reutilizado também para itens de locação;
2. foi criado `resolveRentalItemIds(...)` para:
   - manter UUIDs reais já existentes;
   - converter ids locais `item-...` em UUIDs reais antes da persistência;
3. `persistRentalItems(...)` agora monta `itemRecords` a partir dos ids resolvidos;
4. `createContract(...)` agora trata falha após criação do contrato base com mensagem explícita:
   - informa que o contrato completo não foi concluído;
   - informa que os itens foram revertidos quando possível;
   - informa que o contrato base pode precisar de revisão manual.

Importante:

- não foi adicionada migration;
- não foi alterado SQL, RLS ou GRANT;
- não houve escrita no banco nesta subetapa.

### Testes de regressão adicionados/ajustados

Arquivo:

- `src/lib/contratos-locacoes/contracts-mutations.test.ts`

Coberturas confirmadas:

1. ids temporários `item-...` não são enviados ao client de persistência;
2. caminho feliz cria `rental_items` com:
   - UUID real;
   - `contract_id` correto;
   - `organization_id` correto;
3. UUID já persistido continua sendo preservado;
4. falha em `upsertRentalItems` gera erro explícito de cadastro incompleto;
5. falha em `upsertRentalItems` dispara limpeza compensatória de itens quando possível;
6. não há “sucesso falso” no fluxo com falha parcial.

### Testes rodados

#### RED antes da correção

```bash
npm test -- src/lib/contratos-locacoes/contracts-mutations.test.ts
```

Falhas confirmadas antes do ajuste:

- teste de id temporário recebia `item-_R_aatpesnel5rlb_-initial` em vez de UUID real;
- teste de falha parcial ainda recebia só `Não foi possível salvar os itens da locação...`.

#### GREEN após a correção

```bash
npm test -- src/lib/contratos-locacoes/contracts-mutations.test.ts
```

Resultado:

- **1 arquivo de teste aprovado**
- **4 testes aprovados**

#### Suíte relevante de contratos/mutations

```bash
npm test -- src/lib/contratos-locacoes/contracts-mutations.test.ts src/lib/contratos-locacoes/mutations.test.ts src/lib/contratos-locacoes/contracts.test.ts src/lib/contratos-locacoes/schemas.test.ts src/components/contratos-locacoes/ContractForm.test.tsx src/components/contratos-locacoes/RentalItemsEditor.test.tsx
```

Resultado:

- **6 arquivos de teste aprovados**
- **18 testes aprovados**

#### Lint

```bash
npx eslint src/lib/contratos-locacoes/mutations.ts src/lib/contratos-locacoes/contracts-mutations.test.ts
```

Resultado final:

- **sem erros e sem warnings**

### Validação manual sem salvar

Rota aberta:

- `http://localhost:3001/contratos-locacoes/contratos/novo`

Validações concluídas sem submit:

- a tela abriu corretamente em `localhost`;
- não apareceu novo erro/warning de console do app;
- foi possível descartar o rascunho local;
- foi possível adicionar item;
- foi possível preencher item manual sem salvar;
- foi possível remover o item adicionado;
- a rota permaneceu em `/contratos-locacoes/contratos/novo`;
- nenhum contrato novo foi criado nesta subetapa.

Observação operacional:

- a inspeção visual foi feita no browser interno;
- a leitura de logs do app ficou sem warnings/errors;
- não foi feito clique em `Salvar contrato`.

### Arquivos alterados nesta subetapa

- `src/lib/contratos-locacoes/mutations.ts`
- `src/lib/contratos-locacoes/contracts-mutations.test.ts`
- `docs/handoffs/2026-07-07-contratos-locacoes-plano-usuario-teste-seed-dev-homolog.md`

### O que não foi feito nesta subetapa

- nenhum commit;
- nenhum push Git;
- nenhum deploy;
- nenhuma migration;
- nenhum `db push`;
- nenhuma escrita no banco;
- nenhuma nova criação real de contrato;
- nenhuma exclusão do contrato parcial `787f45a4-e319-404f-b127-fac62ba863a6`.

### Próximo passo exato recomendado

Somente após aprovação explícita do usuário:

1. reabrir `http://localhost:3001/contratos-locacoes/contratos/novo`;
2. descartar rascunho local, se existir;
3. criar **um único** contrato QA controlado para o cliente:
   - `customer_id = 1dacd0d5-35e2-4e4d-b8b4-607a5156782f`
   - `site_id = e0ab787f-d691-44ee-a281-2a74a3f3846f`
4. confirmar redirecionamento/sucesso na UI;
5. validar por `SELECT` somente leitura no Supabase `misfyiznwnuvldoccciw` que:
   - o contrato novo existe;
   - existe pelo menos `1` `rental_item` vinculado ao `contract_id` novo;
   - não houve novo erro `invalid input syntax for type uuid: "item-..."`.

---

## Atualização posterior — criação real de contrato pelo app e validação somente leitura

**Data:** 2026-07-08  
**Subetapa:** criação real de contrato QA pelo app local e validação final somente por `SELECT` no Supabase dev/homolog correto  
**Ambiente confirmado:** `http://localhost:3001` + Supabase `misfyiznwnuvldoccciw`

### Resultado

- criação real pelo app passou;
- URL após salvar: `/contratos-locacoes/contratos/608e8697-2a58-44d9-8c4b-0cb0ece49d43`;
- `contract_id` novo: `608e8697-2a58-44d9-8c4b-0cb0ece49d43`;
- `internal_number`: `3`;
- `customer_id`: `1dacd0d5-35e2-4e4d-b8b4-607a5156782f`;
- `site_id`: `e0ab787f-d691-44ee-a281-2a74a3f3846f`;
- `contact_id`: não se aplica neste fluxo; o formulário de contrato não persiste `contact_id` no registro de contrato;
- `rental_item_count`: `1`;
- `rental_item id`: `aedaf7ff-8fd3-4a94-983b-a914ae322848`;
- `description`: `Item QA Manual App 2 - pós-correção item-id`;
- `quantity`: `1`;
- `unit_amount`: `150000`;
- `status`: `rented`;
- nenhum item temporário `item-...` foi persistido;
- `has_temp_item_ids`: `false`;
- `billing_cycle_count`: `0`;
- `billing_line_count`: `0`;
- `payment_count`: `0`;
- nenhuma cobrança/pagamento/fatura/financeiro foi criado;
- `contracts.base_amount = 150000`;
- `rental_items.unit_amount = 150000`;
- não houve conversão monetária no banco;
- `SELECT` somente leitura usado para validação;
- não houve migration, `db push`, deploy, commit ou push;
- não houve alteração em Auth, RLS ou `service_role`;
- o contrato antigo `787f45a4-e319-404f-b127-fac62ba863a6` não foi alterado nem apagado.

### Ponto de atenção

- O formulário de contrato não persiste `contact_id` diretamente no contrato. Decidir depois se isso está correto por regra de negócio ou se deve virar melhoria/bug futuro.

---

## Atualização posterior — validação visual da página de detalhe do contrato

**Data:** 2026-07-08  
**Subetapa:** validação visual e funcional da página de detalhe do contrato recém-criado, sem salvar nada e sem alterar dados

### Resultado

- página de detalhe passou;
- URL validada: [http://localhost:3001/contratos-locacoes/contratos/608e8697-2a58-44d9-8c4b-0cb0ece49d43](http://localhost:3001/contratos-locacoes/contratos/608e8697-2a58-44d9-8c4b-0cb0ece49d43);
- `contract_id`: `608e8697-2a58-44d9-8c4b-0cb0ece49d43`;
- dados exibidos corretamente:
  - `internal_number`: `#3`;
  - tipo: `Locação/rental`;
  - status: `Rascunho/draft`;
  - cliente: `Cliente QA Manual App 2 Ltda`;
  - obra/local: `Obra QA Manual App 2`;
  - início: `2026-07-08`;
  - recorrência: `30 dias`;
  - valor base: `150000`;
  - observações: `QA criação contrato real pós-correção item-id - 2026-07-08`;
  - item: `Item QA Manual App 2 - pós-correção item-id`;
  - quantidade: `1`;
  - valor unitário: `150000`;
  - status do item: `rented`;
- reload manteve os mesmos dados visíveis;
- console sem erro ou warning relevante;
- não apareceu seção financeira na página do contrato;
- só ficou visível o link global `Cobranças` na navegação e o botão `Pausar`;
- nenhuma escrita no banco foi feita;
- nenhuma alteração de código, commit, push, deploy, migration ou `db push` nesta etapa.

---

## Atualização posterior — tentativa de QA de edição simples

**Data:** 2026-07-08  
**Subetapa:** tentativa de preparar uma edição simples de observação no contrato, sem salvar e sem alterar dados

### Resultado

- tentativa de QA de edição simples foi bloqueada porque a UI de detalhe do contrato não expõe botão/rota de edição;
- página validada: [http://localhost:3001/contratos-locacoes/contratos/608e8697-2a58-44d9-8c4b-0cb0ece49d43](http://localhost:3001/contratos-locacoes/contratos/608e8697-2a58-44d9-8c4b-0cb0ece49d43);
- ações disponíveis na página:
  - `Voltar para contratos`;
  - `Pausar`;
- não existe botão `Salvar/Atualizar` nesta rota;
- não foi possível alterar apenas a observação pelo app;
- nenhuma escrita no banco foi feita;
- nenhum campo financeiro foi alterado;
- nenhum código funcional foi alterado.

### Dados exibidos na tela

- `internal_number`: `#3`;
- tipo: `Locação/rental`;
- status: `Rascunho/draft`;
- cliente: `Cliente QA Manual App 2 Ltda`;
- obra/local: `Obra QA Manual App 2`;
- início: `2026-07-08`;
- recorrência: `30 dias`;
- valor base: `150000`;
- observações: `QA criação contrato real pós-correção item-id - 2026-07-08`;
- item: `Item QA Manual App 2 - pós-correção item-id`;
- quantidade: `1`;
- valor unitário: `150000`;
- status do item: `rented`.

### Pendências / próximos passos

- Avaliar e planejar fluxo de edição de contrato na UI.
- Decidir quais campos podem ser editados em contrato `Rascunho`.
- Decidir se contrato com item `rented` deve permitir edição de item, valor, datas e status.
- Decidir se botão `Pausar` deve aparecer em contrato `Rascunho` ou apenas em contrato ativo.
- Revisar visual/UX da página de detalhe antes de implementar.
