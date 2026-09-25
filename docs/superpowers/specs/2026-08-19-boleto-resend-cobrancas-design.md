# Especificação técnica — Boleto e envio de cobranças por Resend

**Data:** 19/08/2026

**Status:** desenho final emendado para revisão independente; implementação não iniciada

**Escopo desta entrega:** especificação somente

**Branch/HEAD de referência:** `codex/controle-locacoes` em `765c8a152a5f5f405d0de0650795f94012a1a318`

## 1. Objetivo

Adicionar ao Controle de Locações um fluxo seguro e auditável no qual um usuário financeiro autorizado:

1. gera ou abre a Fatura de Locação já existente;
2. anexa ao período de cobrança o boleto PDF gerado manualmente no Itaú;
3. envia, em um único e-mail pelo Resend, a Fatura PDF e o boleto PDF;
4. registra data/hora, destinatários exatos, mensagem adicional, identificador do Resend e identificador idempotente da solicitação;
5. consulta o histórico e pode fazer um reenvio intencional.

`billing_cycles.sent_at` continuará sendo o resumo operacional da cobrança e passará a significar sempre **o último envio concluído com sucesso**. Cada sucesso permanece registrado separadamente em `billing_delivery_events`.

Esta especificação não autoriza implementação, migration, instalação de pacote, alteração de ambiente Supabase, configuração Resend/DNS, envio real, commit, push, merge ou deploy.

## 2. Fora de escopo

Não fazem parte desta versão:

- API do Itaú, geração automática de boleto, CNAB ou webhook bancário;
- baixa, conciliação ou confirmação bancária automática;
- fila ou agendamento recorrente de cobrança;
- webhook de entrega, bounce, abertura ou clique do Resend;
- open tracking, inbound e-mail ou resposta dentro do sistema;
- individualização por BCC; todos os destinatários aprovados seguem juntos em `To`;
- editor completo de template de e-mail;
- snapshot físico ou cópia histórica da Fatura no Storage;
- histórico de versões do boleto;
- exclusão de boleto no fluxo normal;
- tabela exclusiva de boletos;
- novo papel `billing` ou sistema genérico de RBAC;
- tela para administrar `can_manage_billing`;
- página separada de histórico ou novo dashboard de cobranças;
- `service_role` no fluxo de envio;
- qualquer execução no MISFY nesta etapa.

## 3. Arquitetura atual relevante

O repositório usa Next.js 16.2.4 com App Router, React 19, TypeScript, `@supabase/supabase-js` 2.105.1 e `@react-pdf/renderer` 4.5.1. Não existe hoje Route Handler em `src/app`; o módulo de locações executa consultas e mutações no navegador por meio do cliente exportado por `src/lib/supabase.ts`.

O fluxo atual relevante é:

- `src/app/contratos-locacoes/contratos/[id]/page.tsx` carrega o detalhe, executa mutações financeiras no navegador e contém a ação `markBillingCycleSent`;
- `src/components/contratos-locacoes/ContractBillingSection.tsx` organiza os períodos de cobrança;
- `src/components/contratos-locacoes/BillingPeriodCard.tsx` mostra datas, valores, recebimentos, comprovantes, `sent_at`, `Abrir fatura` e `Marcar como enviado`;
- `src/app/contratos-locacoes/cobrancas/page.tsx` e `src/components/contratos-locacoes/BillingTable.tsx` formam a navegação mensal geral;
- `src/lib/contratos-locacoes/queries.ts#getBillingRentalInvoice` carrega cobrança, contrato, cliente, local, linhas e pagamentos e produz o snapshot da fatura;
- `src/lib/contratos-locacoes/rental-invoice.ts` define e monta `RentalInvoiceSnapshot`;
- `src/lib/contratos-locacoes/pdf/RentalInvoiceDocument.tsx` implementa o único layout aprovado da Fatura de Locação;
- `src/app/contratos-locacoes/recibos/[id]/page.tsx` renderiza essa mesma dupla `RentalInvoiceSnapshot` + `RentalInvoiceDocument` no navegador;
- `src/lib/contratos-locacoes/remittance-documents.ts` e `payment-proofs.ts` fornecem padrões atuais para upload privado, registro em `contract_documents` e URL assinada;
- `src/lib/contratos-locacoes/types.ts` contém os tipos do módulo;
- `src/lib/contratos-locacoes/migration-consistency.test.ts` verifica migrations e privilégios críticos.

No banco, as tabelas já existentes a reutilizar são `organization_members`, `customer_contacts`, `contracts`, `billing_cycles`, `billing_lines`, `payments` e `contract_documents`. O bucket privado existente é `contratos-locacoes-docs`.

A migration mais recente, `supabase/migrations/20260819190815_harden_contracts_rentals_privileges.sql`, revogou privilégios amplos e deixou, entre outros pontos:

- `organization_members`: `SELECT` para `authenticated`;
- `billing_cycles`: `SELECT, INSERT, UPDATE` para `authenticated`;
- `billing_lines`: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`;
- `contract_documents`: apenas `SELECT, INSERT` para `authenticated`;
- helpers de membership executáveis somente por `authenticated`.

Esse hardening deve ser preservado. Em particular, a solução de boleto não deve reabrir `UPDATE` ou `DELETE` genérico em `contract_documents`, nem ampliar policies de NF de remessa ou comprovante.

## 4. Modelo de autorização

### 4.1 Permissão financeira específica

Adicionar a `public.organization_members`:

```text
can_manage_billing boolean NOT NULL DEFAULT false
```

O predicado de autorização financeira é:

```text
membership.user_id = auth.uid()
AND membership.organization_id = recurso.organization_id
AND (membership.role = 'admin' OR membership.can_manage_billing = true)
```

Essa autorização libera somente:

- visualizar, anexar e substituir boleto;
- enviar e reenviar cobrança;
- consultar o histórico de envios.

Ela não concede automaticamente edição de contrato ou cobrança, alteração de valores/datas, registro ou exclusão de pagamento, administração de usuários ou qualquer outro privilégio administrativo. As autorizações já existentes para essas ações continuam independentes.

Não haverá tela de gerenciamento. A ativação inicial no IURQ será uma operação administrativa deliberada para um usuário de QA. A migration não deve conceder `UPDATE` de `organization_members` a `authenticated`; assim, member comum não consegue alterar a flag nem se autoautorizar. O `SELECT` endurecido atual deve permanecer.

### 4.2 Policies e transições internas de menor privilégio

As policies novas devem preferir um `EXISTS` direto sobre a própria linha de membership de `(select auth.uid())`. As policies atuais de `organization_members` permitem que o usuário leia a própria membership; portanto, a checagem financeira pode ser resolvida sem novo helper `SECURITY DEFINER`.

As transições internas de `content_revision`, coordenação de boleto, `sent_at` e limpeza segura de `needs_resend` não podem receber grants genéricos de coluna no Data API. Para esses casos estritos, funções focais `SECURITY DEFINER` são aprovadas porque `SECURITY INVOKER` exigiria devolver ao caller exatamente os privilégios diretos que a ACL precisa retirar. Isso não autoriza helper genérico nem bypass silencioso de RLS.

Cada função privilegiada aprovada por esta emenda deve:

- ficar com `search_path` fixo e referências qualificadas;
- verificar `auth.uid() IS NOT NULL` internamente;
- aplicar o predicado exato de membership do fluxo que disparou a mudança; RPCs de boleto/finalização exigem `admin OR can_manage_billing` e o tenant informado;
- revogar `EXECUTE` de `PUBLIC`, `anon`, `authenticated` e `service_role` antes de conceder somente a assinatura RPC necessária a `authenticated`; funções de trigger permanecem sem execução direta por roles de API;
- conceder a ACL mínima a `authenticated`;
- ser coberto por testes de member comum, financeiro, admin, anon e cross-tenant.

Não usar `service_role` para contornar RLS.

### 4.3 Controles da interface não são autorização

Usuário não autorizado não recebe controles de boleto, envio ou histórico. Isso é apenas redução de exposição na UI. Route Handler, RLS de `contract_documents`, RLS de `billing_delivery_events` e policies do Storage repetem a autorização no servidor/banco.

## 5. Modelo de dados

### 5.1 `billing_cycles`

Adicionar:

```text
needs_resend boolean NOT NULL DEFAULT false
content_revision bigint NOT NULL DEFAULT 0
boleto_change_pending boolean NOT NULL DEFAULT false
boleto_change_operation_id uuid NULL
boleto_change_started_at timestamptz NULL
```

Semântica:

- `sent_at`: instante do evento de envio bem-sucedido mais recente;
- `needs_resend=false`: o conteúdo atual da cobrança/boleto corresponde ao último envio, ou a cobrança nunca foi enviada;
- `needs_resend=true`: houve mudança relevante depois do último envio;
- uma mudança relevante nunca apaga `sent_at`.
- `content_revision`: geração monotônica do conteúdo corrente que pode afetar Fatura ou boleto; não é histórico, snapshot, fingerprint, hash, versão recuperável ou versão de documento;
- `boleto_change_pending=true`: uma operação externa de primeiro upload/substituição começou e ainda não teve finalização PostgreSQL confirmada;
- `boleto_change_operation_id`: UUID da operação corrente quando pending e da última operação concluída quando estável; conserva somente um token de coordenação, sem histórico;
- `boleto_change_started_at`: instante da operação ainda pending; fica nulo depois da finalização.

Constraints exigem `content_revision >= 0`, operação e início não nulos enquanto pending e `boleto_change_started_at IS NULL` quando não pending. O UUID concluído pode permanecer para tornar retry de `finish` idempotente; um novo `begin` estável o substitui.

ACL de `authenticated`:

- revogar o `INSERT` de tabela e conceder `INSERT` somente em `organization_id`, `contract_id`, `sequence_number`, `period_start`, `period_end`, `issue_date`, `due_date`, `base_amount`, `discount_amount`, `surcharge_amount`, `exemption_amount`, `total_amount`, `document_type`, `document_number`, `status` e `notes`;
- revogar o `UPDATE` de tabela e conceder `UPDATE` somente em `period_start`, `period_end`, `issue_date`, `due_date`, `notes`, `status` e `needs_resend`;
- `id`, `sent_at`, `needs_resend`, `content_revision`, os três campos de coordenação de boleto e timestamps não podem ser fornecidos na criação;
- `sequence_number` é informado na criação e imutável depois; `sent_at`, revisão e coordenação nunca são campos genéricos do frontend;
- a transição comum de `needs_resend` continua monotônica; somente a finalização focal do envio pode limpar a flag.

### 5.2 `contract_documents` para boleto

Ampliar o domínio de `kind` com `boleto`. Para uma linha `kind='boleto'`:

- `organization_id uuid NOT NULL`;
- `contract_id uuid NOT NULL`;
- `billing_cycle_id uuid NOT NULL`;
- `payment_id IS NULL`;
- `inspection_id IS NULL`;
- `content_type = 'application/pdf'`;
- `storage_path` igual ao path determinístico aprovado;
- no máximo uma linha por cobrança.

Invariante obrigatória para qualquer `contract_documents.kind='boleto'`:

- `billing_cycle.organization_id` deve ser a mesma `organization_id` do documento e do contrato;
- `billing_cycle.contract_id` deve ser o mesmo `contract_id` do documento;
- `contract.organization_id` deve ser a mesma `organization_id` do documento.

Essa coerência deve ser garantida no banco ou em operação protegida, e não apenas por valores do frontend, path do Storage ou RLS de membership. O plano do Lote A deve primeiro confirmar o schema efetivo e então escolher, nesta ordem de preferência, a alternativa mais simples e segura que se encaixe nele: constraints/FKs compostas, trigger focal ou operação protegida. Não fixar artificialmente o mecanismo nesta spec.

Criar índice único parcial equivalente a:

```text
UNIQUE (organization_id, billing_cycle_id) WHERE kind = 'boleto'
```

Não criar tabela de boletos nem versionar linhas. O registro é criado no primeiro anexo e permanece apontando para o mesmo path nas substituições. Como o path e o tipo não mudam, a substituição normal não exige `UPDATE` ou `DELETE` em `contract_documents`.

### 5.3 `billing_delivery_events`

Criar `public.billing_delivery_events` como histórico imutável de sucessos, com:

| Campo | Tipo/regras | Finalidade |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | identidade interna |
| `organization_id` | `uuid NOT NULL` | tenant |
| `billing_cycle_id` | `uuid NOT NULL` | cobrança enviada |
| `sent_at` | `timestamptz NOT NULL` | instante confirmado do envio |
| `recipients` | `text[] NOT NULL` | e-mails normalizados e efetivamente usados em `To` |
| `provider_message_id` | `text NOT NULL` | ID devolvido pelo Resend |
| `send_request_id` | `uuid NOT NULL UNIQUE` | idempotência da intenção de envio |
| `additional_message` | `text NULL` | mensagem opcional exata, após trim |
| `created_by` | `uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` | autor autenticado |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | auditoria de persistência |

Não persistir fingerprint, hash de versão ou coluna equivalente em `billing_delivery_events`. Fingerprint é somente uma guarda efêmera de concorrência durante uma tentativa, conforme as seções 7 e 11; não integra o modelo histórico.

Restrições e índices:

- FK composta `(organization_id, billing_cycle_id)` para `billing_cycles (organization_id, id)`;
- `send_request_id` único globalmente;
- `provider_message_id` único, se a forma real retornada pelo SDK for estável e não nula, impedindo representar o mesmo e-mail como dois sucessos;
- `cardinality(recipients) BETWEEN 1 AND 50`;
- índice `(organization_id, billing_cycle_id, sent_at DESC)` para o último evento e histórico.

O evento só é criado depois de o Resend aceitar o e-mail. Não há evento de falha. A tabela não possui `updated_at`, não recebe `UPDATE` nem `DELETE` do aplicativo e não é uma fila.

Privilégios/RLS:

- RLS habilitado;
- `anon` e `PUBLIC` sem privilégios;
- `authenticated` recebe apenas `SELECT, INSERT`, se a tabela estiver exposta ao Data API;
- `SELECT` somente para admin/`can_manage_billing` do mesmo tenant;
- `INSERT` somente para admin/`can_manage_billing` do mesmo tenant, `created_by=(select auth.uid())` e ciclo pertencente à mesma organização;
- nenhuma policy de `UPDATE` ou `DELETE`.

O fluxo suportado para `INSERT` é a finalização server-side após sucesso do provedor. RLS impede usuário sem permissão ou cross-tenant, mas não é prova criptográfica de que o Resend aceitou um ID arbitrário fornecido por um usuário financeiro autorizado. Tratar admin/financeiro como operadores internos confiáveis e manter o Route Handler como único chamador da aplicação. Introduzir segredo de banco ou `service_role` apenas para esconder esse RPC não é aprovado.

## 6. Boleto e Storage

### 6.1 Arquivo e path

- bucket: `contratos-locacoes-docs`;
- bucket continua privado;
- MIME permitido para boleto: somente `application/pdf`;
- tamanho máximo: 10 MB;
- path exato: `<organization_id>/<contract_id>/boleto/<billing_cycle_id>.pdf`;
- um ciclo possui no máximo um boleto atual;
- primeira ação usa upload sem overwrite se o objeto não existe;
- substituição usa upsert no mesmo objeto/path;
- não existe ação Excluir.

O limite global atual do bucket já é 10 MB e precisa continuar compatível com NF de remessa e comprovantes. Não restringir `allowed_mime_types` do bucket inteiro a PDF; a policy e a validação do fluxo de boleto restringem apenas `boleto`.

### 6.2 Policies específicas

As policies atuais de Storage reconhecem apenas `remittance_nf` e `payment_proof`. Elas não devem ser ampliadas de maneira genérica. Criar policies separadas de boleto para:

- `SELECT`: abrir/baixar ou gerar signed URL;
- `INSERT`: primeiro upload;
- `UPDATE`: overwrite/upsert do objeto existente.

Supabase Storage exige `SELECT` e `UPDATE`, além de `INSERT`, para overwrite com `upsert`. Não criar policy `DELETE` para boleto.

Cada policy deve validar simultaneamente:

- `bucket_id = 'contratos-locacoes-docs'`;
- usuário autenticado por `(select auth.uid())`;
- membership no tenant e `role='admin' OR can_manage_billing=true`;
- primeiro segmento igual a `organization_id`;
- segundo segmento igual a `contract_id`;
- terceiro segmento exatamente `boleto`;
- nome do arquivo exatamente `<billing_cycle_id>.pdf`;
- contrato do tenant existente;
- ciclo existente com o mesmo `organization_id` e `contract_id`;
- em `INSERT`, ciclo com `boleto_change_pending=true`, operação corrente não nula e `boleto_change_started_at` não nulo; nenhum write de boleto é permitido sem `begin_boleto_change` confirmado;
- em `SELECT/UPDATE`, **um** dos dois ramos estreitos: (a) linha correspondente em `contract_documents` com `kind='boleto'`, mesmo tenant, contrato, ciclo e `storage_path`; ou (b) recovery do path canônico quando o ciclo correspondente está com `boleto_change_pending=true`, operação corrente/início válidos e o caller financeiro pertence ao mesmo tenant;
- em `UPDATE`, aplicar o mesmo predicado `documento registrado OR recovery pending válido` tanto no `USING` quanto no `WITH CHECK`, sempre preso ao bucket, tenant, contrato, ciclo e path canônico exatos;
- em `INSERT/UPDATE`, metadata MIME `application/pdf` e extensão `.pdf`.

Não transformar o bucket em público, não criar signed URL permanente e não reutilizar a policy de leitura geral dos demais documentos para boleto.

### 6.3 Policies de `contract_documents`

As policies gerais atuais de `contract_documents` permitem member da organização ler/inserir qualquer `kind`. Apenas adicionar `boleto` ao `CHECK` faria member comum herdar acesso indevido. A migration futura deve:

1. substituir/refinar as policies gerais atuais para que elas se apliquem a `kind <> 'boleto'`, preservando exatamente o comportamento vigente dos outros kinds;
2. adicionar policies `SELECT` e `INSERT` exclusivas de boleto com o predicado financeiro;
3. manter a ausência de privilégio efetivo de `UPDATE/DELETE` para documentos;
4. provar por testes que NF de remessa e comprovantes não ganharam nem perderam acesso acidentalmente.

### 6.4 Protocolo durável de anexar/substituir

Um boolean isolado é insuficiente: não distingue retry da mesma operação de uma substituição concorrente nem impede um retry antigo de liberar a operação nova. O protocolo usa o trio de coordenação da seção 5.1 e duas RPCs focais:

```text
begin_boleto_change(organization_id, contract_id, billing_cycle_id, operation_id)
finish_boleto_change(organization_id, contract_id, billing_cycle_id, operation_id)
```

As RPCs são `SECURITY DEFINER` estritas, com `search_path=''`, relações qualificadas, autorização financeira e tenant validados internamente, `PUBLIC`/`anon`/`service_role` sem `EXECUTE` e grant apenas da assinatura necessária a `authenticated`. `SECURITY INVOKER` não serve aqui porque os campos de coordenação/revisão são deliberadamente inacessíveis ao caller.

#### Begin

1. o browser gera um UUID v4 de operação antes de qualquer chamada;
2. a RPC bloqueia o ciclo, valida usuário, capability, tenant, contrato e ciclo;
3. se não há pending, grava `pending=true`, o UUID e `started_at=now()` atomicamente;
4. se já há pending com o mesmo UUID, retorna sucesso idempotente;
5. se há pending com UUID diferente, retorna conflito e não altera o estado;
6. se a mesma operação já foi finalizada (`pending=false` e UUID igual), retorna `already_finished`; o caller não repete o upload.

#### Storage

Somente após `begin` ativo, validar PDF/10 MB e executar upload inicial sem overwrite ou substituição com upsert no path determinístico. O bucket permanece privado, sem staging, path versionado ou delete. A policy de `INSERT/UPDATE` exige o pending do ciclo. Se o primeiro upload criou o objeto e o `finish` falhou antes de reconciliar `contract_documents`, o retry com a mesma operação usa `upsert=true`; nesse estado, `SELECT/UPDATE` são autorizados pelo ramo estreito de recovery pending, sem depender de metadata que justamente ainda pode não existir.

#### Finish

Depois de confirmação inequívoca da Storage API, a RPC bloqueia novamente o ciclo e:

1. exige o mesmo UUID pending; UUID diferente é conflito;
2. valida a linha `storage.objects` no bucket/path exatos, MIME PDF e `updated_at >= boleto_change_started_at`;
3. insere ou reconcilia a única linha `contract_documents kind='boleto'` com organização/contrato/ciclo/path coerentes;
4. incrementa `content_revision` exatamente uma vez;
5. força `needs_resend=true` quando `sent_at IS NOT NULL`, preservando `sent_at`, ou mantém false quando nunca houve envio;
6. grava `pending=false`, mantém o UUID concluído e limpa `started_at`, tudo na mesma transação PostgreSQL.

Retry de `finish` com o mesmo UUID já concluído retorna o resultado atual sem novo incremento. Um `finish` atrasado de UUID anterior nunca limpa o pending de operação posterior.

Uma nova operação confirmada incrementa a revisão uma vez mesmo que o usuário tenha escolhido bytes iguais aos anteriores; sem hash persistido, esse falso positivo conservador é preferível a declarar estabilidade sem prova. Retry da mesma operação não incrementa novamente.

#### Falha e recuperação

Qualquer erro, timeout ambíguo ou morte do processo depois do `begin` mantém pending e bloqueia preparação/finalização de envio. Não existe timeout que libere automaticamente nem ação de abortar que apenas limpe a flag. Após reload, usuário financeiro carrega o UUID pending, seleciona novamente o PDF desejado, repete o upload com `upsert=true` no mesmo path e com o mesmo UUID e chama `finish`. O ramo de recovery das policies permite o `SELECT/UPDATE` exigido pelo upsert mesmo quando o primeiro upload já criou `storage.objects`, mas o `finish` anterior não chegou a criar `contract_documents`. O `finish` então reconcilia uma única linha, incrementa revision uma única vez e limpa pending. UUID diferente, member comum, tenant diferente e qualquer kind/path não boleto continuam bloqueados.

`storage.objects.updated_at >= boleto_change_started_at` é evidência operacional de um write posterior ao `begin`, não prova criptográfica de vínculo entre bytes e `operation_id`. Dentro do modelo de confiança aprovado, a garantia combina pending, UUID corrente validado pela RPC, capability financeira, tenant, contrato, ciclo, path/MIME exatos, metadata temporal e o objeto atual; o UUID não aparece no path.

Ao abrir um boleto estável, gerar URL assinada curta somente depois do `SELECT` autorizado. Durante pending a operação de envio fica bloqueada, embora a leitura operacional autorizada do objeto atual possa continuar.

## 7. `needs_resend`

### 7.1 Mudanças relevantes

Toda mudança PostgreSQL relevante incrementa `content_revision` na mesma transação da fonte e, depois de ao menos um envio, também força `needs_resend=true`:

- em `billing_cycles`: `contract_id`, `sequence_number`, `period_start`, `period_end`, `issue_date`, `due_date`, `base_amount`, `discount_amount`, `surcharge_amount`, `exemption_amount`, `total_amount`, `document_number` e `notes` quando efetivamente mudarem;
- em `billing_lines`: `INSERT`/`DELETE` de linha cujo `kind` é `recurring`/`damage`; `UPDATE` quando o kind entra/sai desse conjunto ou mudam `billing_cycle_id`, `description`, `quantity`, `kind`, `unit_amount` ou `total_amount` de uma linha renderizada;
- em `contracts`: `internal_number`, `contract_company`, `customer_id`, `site_id`, `legacy_order_number`, `notes`, `has_remittance_invoice`, `remittance_invoice_number` e `remittance_invoice_issue_date`;
- em `customers`: `legal_name`, `trade_name`, `tax_id` e `state_registration`;
- em `customer_sites`: `name`, `address_line`, `number`, `complement`, `district`, `city`, `state` e `postal_code`;
- conclusão confirmada de primeiro upload ou substituição de boleto.

As listas foram derivadas de `buildRentalInvoiceSnapshot` e `RentalInvoiceDocument`. `document_type`, `status`, `transport_notes`, contatos, `remittance_invoice_issuer`, `remittance_invoice_amount`, campos de pausa e `rental_items` não alteram os bytes atuais da Fatura e ficam fora enquanto o render não mudar.

Embora `RentalInvoiceSnapshot` hoje carregue `financialStatus` calculado com `payments`, `RentalInvoiceDocument` não renderiza pago, saldo, status de pagamento nem status interno. Portanto, alterações em `payments` **não** marcam `needs_resend` e **não** entram na guarda de concorrência desta versão. A regra é sempre o conteúdo efetivamente renderizado, não a presença de um campo intermediário no snapshot.

Não marcam `needs_resend`:

- atualização de `sent_at`;
- atualização do próprio `needs_resend`;
- mudança de campo que não entra na Fatura nem no boleto;
- simples abertura/download;
- mudança de contatos/destinatários, pois destinatários são recalculados em cada envio e não alteram a Fatura.

### 7.2 Invariantes atômicas de banco

Para `billing_cycles`, um trigger `BEFORE UPDATE` focal compara somente as colunas acima com `IS DISTINCT FROM`, incrementa `NEW.content_revision` e força `NEW.needs_resend=true` quando `OLD.sent_at IS NOT NULL`. O mesmo trigger conserva o latch que rejeita `true → false` quando `current_user` é uma role de API. A única exceção é a atualização executada sob o owner confiável da RPC focal de finalização; não usar GUC, parâmetro ou flag controlável pelo caller para abrir essa exceção.

Para `billing_lines`, `contracts`, `customers` e `customer_sites`, triggers focais reagem somente às colunas/operações renderizadas, localizam exclusivamente os ciclos afetados e executam `source change + revision bump + needs_resend` na mesma transação PostgreSQL. Antes do update, os ciclos afetados são bloqueados em `billing_cycle.id` crescente; múltiplos ciclos e triggers usam a mesma ordem para evitar deadlock. Não existe mais protocolo TypeScript marca-antes/grava-depois para essas fontes.

Todas as trigger functions/helpers internos ficam no schema não exposto `private`, que não entra em `api.schemas`. O repositório de referência não possui outro schema interno equivalente, portanto a migration focal cria/reutiliza `private` e revoga `USAGE`/`EXECUTE` de `PUBLIC`, `anon`, `authenticated` e `service_role`. O trigger do próprio ciclo chama `private.guard_and_bump_billing_cycle_content_revision()` e permanece `SECURITY INVOKER`; os quatro triggers cross-table chamam helpers `private.*` estreitos `SECURITY DEFINER`, pois `content_revision` não pode ser concedida ao frontend. Esses helpers derivam tenant/IDs de `OLD`/`NEW`, conferem membership do caller quando há JWT, qualificam todas as relações, usam `search_path=''` e não possuem execução direta por roles de API. Somente as RPCs chamadas pelo cliente — `public.begin_boleto_change`, `public.finish_boleto_change` e, no Lote B, `public.finalize_billing_delivery` — permanecem em `public` com a assinatura exata concedida a `authenticated` após todos os revokes.

As `billing_lines` renderizadas têm uma única ordem total obrigatória em todo o fluxo: `created_at ASC, id ASC`. `billing_lines.id` é a chave primária UUID e funciona como desempate estável quando linhas do mesmo batch compartilham `created_at`; nenhum campo de negócio adicional participa da ordenação. A consulta da preparação e a reconsulta imediatamente anterior ao Resend devem aplicar explicitamente os dois critérios nessa ordem. `RentalInvoiceSnapshot`, `RentalInvoiceDocumentContent`, `tableRows`, o PDF e a representação canônica apenas preservam essa sequência, sem reordená-la em qualquer camada.

Durante uma tentativa de envio, a Fatura é renderizada **uma única vez**. Antes desse render, construir `RentalInvoiceSnapshot`, derivar `RentalInvoiceDocumentContent` com o mesmo builder do documento e calcular uma guarda semântica canônica efêmera. A canonicalização usa uma tupla de propriedades explicitamente selecionadas e em ordem fixa: `title`, `number`, `issuerName`, `issuerLines`, `recipientLines`, pares ordenados de `invoiceDataRows`, `description`, `tableHeaders`, `tableRows` sem o `id` usado apenas como React key, pares ordenados de `adjustmentRows`, `totalLabel`, `totalInWords`, `notes` e `fiscalNotice`. Arrays conservam exatamente a ordem semântica total já definida para o PDF; datas, quantidades e valores já entram como as strings finais normalizadas pelo builder; ausência é sempre `null`; a serialização é de arrays/primitivos em ordem fixa, nunca `JSON.stringify` ingênuo de objeto de ordem variável. Um SHA-256 dessa representação pode ser mantido somente em memória. Não ordenar apenas a representação canônica: PDF e guarda devem representar a mesma sequência de linhas recebida da consulta determinística.

Imediatamente antes do Resend, recarregar as fontes PostgreSQL usando novamente `billing_lines ORDER BY created_at ASC, id ASC`, exigir a mesma `content_revision` e pending false, reconstruir snapshot/conteúdo canônico preservando essa ordem e comparar a guarda semântica. **Não renderizar um segundo PDF.** Se a guarda coincidir, o buffer produzido pelo único render inicial é exatamente o buffer anexado ao e-mail. A guarda canônica complementa a revision ao detectar snapshot/reconsulta inconsistente ou mudança real de ordenação/transformação dos campos efetivamente renderizados; empates em `created_at` resolvidos pelo mesmo `id` não produzem conflito. `content_revision` continua sendo a guarda durável e atômica de todas as fontes PostgreSQL.

Para o boleto persistido, baixar bytes e calcular SHA-256 efêmero; na revalidação pré-provider, baixar novamente o objeto atual e comparar o hash de bytes. Com hash igual, anexar o buffer da segunda leitura, que é o objeto efetivamente revalidado. Pending/revision e o CAS cobrem a janela posterior à leitura.

Ela não é fonte de verdade, versão da Fatura, snapshot histórico, versão do boleto nem substituto de `needs_resend`. Não persisti-la em evento, documento ou nova tabela.

Após um envio aceito, a finalização recebe `expected_content_revision` e separa dois caminhos dentro do banco:

- **evento novo nesta execução:** insere o evento; se revision ainda é a esperada e não existe pending, atualiza `sent_at` e limpa `needs_resend`; se revision divergiu ou existe pending, preserva o evento confirmado, atualiza `sent_at`, força `needs_resend=true` e retorna revisão obrigatória;
- **evento já existente/replay:** valida tenant, ciclo, destinatários, mensagem e provider ID compatíveis, não insere nem envia novamente, recalcula `sent_at` como o maior evento do ciclo e preserva exatamente o `needs_resend` corrente. Esse caminho nunca executa `true → false`, independentemente da revision fornecida pelo retry.

UI: `Alterada após o último envio — reenviar cobrança.`

### 7.3 Prova das intercalações

| Caso | Intercalação | Condição que impede falso negativo |
|---|---|---|
| A | mutação termina antes da preparação | preparação captura a revisão nova e envia o conteúdo novo |
| B | mutação PostgreSQL durante preparação | trigger incrementa revisão atomicamente; revalidação aborta ou CAS diverge |
| C | mutação após a última revalidação e antes do Resend | CAS lê no banco revisão diferente da esperada e mantém `needs_resend=true` |
| D | mutação enquanto o Resend responde | CAS detecta a revisão incrementada |
| E | mutação entre Resend e RPC | CAS detecta a revisão incrementada |
| F | RPC finaliza primeiro, mutação depois | lock serializa; o trigger posterior incrementa revisão e marca true |
| G | boleto começa overwrite durante preparação/envio | `begin` grava pending antes da Storage API; revalidação ou CAS bloqueia |
| H | upload termina e `finish` falha | pending permanece durável e nenhum envio pode preparar/finalizar |
| I | primeiro envio concorrente com alteração | revisão muda mesmo com `sent_at` nulo; CAS não depende de `needs_resend` prévio |
| J | reenvio concorrente com alteração | revisão/CAS detecta a mudança; latch permanece true até sucesso estável posterior |
| K | resposta se perde após finalização; evento existe e conteúdo não mudou | replay compatível não chama provider, reconcilia `sent_at` monotonicamente e preserva o latch corrente false |
| L | conteúdo muda após finalização e antes do retry antigo | replay do mesmo ID não chama provider e preserva `needs_resend=true`; conteúdo atual não é associado ao evento antigo |
| M | CAS divergente já registrou evento e retry repete o ID | replay não duplica evento nem limpa o latch já true |
| N | reenvio intencional usa novo ID | somente o evento novo pode limpar o latch, e apenas se finalizar estável contra sua própria revision/pending |

## 8. Geração da Fatura

A Fatura continua gerada sob demanda. Não salvar PDF no Storage nem criar segunda implementação visual.

No Route Handler:

1. carregar os mesmos dados atualmente usados por `getBillingRentalInvoice` no contexto RLS do usuário, consultando as `billing_lines` renderizadas em `created_at ASC, id ASC`;
2. montar o mesmo `RentalInvoiceSnapshot` com `buildRentalInvoiceSnapshot`/`getBillingRentalInvoice`, preservando a ordem total recebida;
3. derivar o conteúdo canônico efetivamente renderizado e sua guarda efêmera;
4. renderizar o mesmo `RentalInvoiceDocument` no servidor **uma única vez por tentativa** com a API server-side de `@react-pdf/renderer`, produzindo `Buffer` em memória;
5. na revalidação, repetir a consulta com `created_at ASC, id ASC` e reconstruir somente snapshot/conteúdo canônico na mesma sequência, sem segundo render;
6. anexar exatamente o buffer do render único com `filename = snapshot.fileName`.

O código compartilhado não deve importar módulos browser-only para o Route Handler. Se necessário, extrair um adaptador de leitura reutilizável, sem duplicar regra ou layout.

O histórico não guarda o PDF antigo. Se os dados forem editados depois, a tela continuará gerando a versão atual, e o evento antigo mostrará apenas metadados do envio. A guarda efêmera de concorrência não permite reconstruir nem versionar o documento.

## 9. Envio pelo Resend

### 9.1 Route Handler e runtime

Criar conceitualmente:

```text
POST /api/contratos-locacoes/cobrancas/[billingId]/enviar
```

Arquivo provável:

```text
src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.ts
```

O `POST` não é cacheado. O handler deve executar em runtime Node.js, necessário para o SDK do Resend, buffers e renderização PDF. Não chamar o Resend no browser.

### 9.2 Entrada

Payload mínimo:

- `send_request_id`: UUID v4 aleatório;
- `recipients`: lista escolhida no modal;
- `additional_message`: string opcional.

O navegador gera `send_request_id` com `crypto.randomUUID()` somente quando o usuário confirma uma intenção deliberada. Mantém o mesmo ID durante retries técnicos dessa intenção. Ao clicar `Reenviar cobrança` como nova ação, gera outro ID. O ID não contém cliente, CPF/CNPJ, e-mail ou qualquer outro dado pessoal.

O backend valida formato/versão do UUID, mas nunca usa o ID como autorização.

### 9.3 Destinatários

Ao abrir o modal:

- buscar contatos do cliente atual;
- pré-selecionar somente `receives_billing=true` com e-mail sintaticamente válido;
- permitir marcar/desmarcar contatos elegíveis;
- permitir e-mails extras somente para aquele envio;
- não gravar extras em `customer_contacts`.

No servidor:

- carregar novamente contrato, cliente e contatos atuais;
- normalizar `trim` e comparação case-insensitive;
- validar cada endereço;
- remover duplicidades preservando uma ordem determinística;
- exigir de 1 a 50 destinatários, limite atual do endpoint do Resend;
- aplicar a allowlist do ambiente a todos, inclusive extras;
- salvar em `recipients` exatamente a lista normalizada enviada ao Resend.

No reenvio, o modal recalcula os padrões a partir do cadastro atual. Extras do evento anterior não entram automaticamente. O histórico antigo permanece inalterado.

Todos os endereços seguem em um único array `to`. Consequentemente, os destinatários verão os demais endereços no campo `To`; este comportamento é deliberado e aprovado.

### 9.4 Boleto obrigatório

Sem linha `contract_documents kind='boleto'` válida e sem objeto privado acessível no path esperado, o servidor responde com erro de validação e não chama o Resend:

> Anexe o boleto antes de enviar a cobrança.

A UI pode exibir o botão, mas impede a conclusão com a mesma explicação. A validação server-side é obrigatória.

### 9.5 Remetente

Derivar exclusivamente de `contracts.contract_company`, carregado do banco:

| `contract_company` | `From` |
|---|---|
| `fontes` | `Fontes Energia <radial@radialenergia.com.br>` |
| `radial` | `Radial Equipamentos <radial@radialenergia.com.br>` |

`Reply-To` em ambos: `radial@radialenergia.com.br`.

O usuário não informa nem altera remetente. Valor desconhecido/inválido bloqueia o envio; não usar fallback silencioso.

### 9.6 Assunto e corpo

Assunto automático:

```text
Cobrança de locação – Fatura <invoiceNumber> – venc. <DD/MM/AAAA>
```

Exemplo:

```text
Cobrança de locação – Fatura R000008001 – venc. 31/08/2026
```

Corpo automático em HTML simples e versão texto, contendo:

- nome do cliente;
- período;
- vencimento;
- valor total;
- aviso de Fatura e boleto anexos;
- mensagem adicional, quando presente, escapada como texto e com limite de tamanho definido pelo schema;
- assinatura Fontes Energia ou Radial Equipamentos conforme `contract_company`.

Não há template editável nesta versão.

### 9.7 Anexos e resposta do provedor

Anexar:

- Fatura gerada em memória;
- boleto privado baixado no servidor e convertido para `Buffer`/base64 conforme a interface do SDK.

Validar tamanho combinado antes da chamada. O Resend aceita atualmente até 40 MB por e-mail depois da codificação base64; boleto de 10 MB mais a Fatura deve permanecer abaixo disso, mas o backend não deve presumir.

Chamar `resend.emails.send(payload, { idempotencyKey: send_request_id })`. Sucesso exige `data.id` não vazio e ausência de erro. Esse ID torna-se `provider_message_id`.

Somente depois disso finalizar o evento e o ciclo. Erro, timeout sem confirmação ou resposta inválida não atualiza `sent_at`, não limpa `needs_resend`, não cria evento de sucesso e não mostra confirmação enganosa.

### 9.8 Ordem completa do fluxo

O Route Handler deve executar nesta ordem:

1. autenticar o access token;
2. autorizar `admin OR can_manage_billing` no tenant real do recurso;
3. validar e recarregar cobrança, contrato e cliente;
4. validar e normalizar destinatários, inclusive allowlist;
5. exigir `boleto_change_pending=false` e capturar `content_revision=R`;
6. validar a linha e o objeto privado do boleto;
7. obter o snapshot atual da Fatura;
8. construir a representação canônica do conteúdo renderizado e sua guarda efêmera;
9. gerar o PDF da Fatura em memória uma única vez e conservar esse buffer para o provider;
10. baixar os bytes do boleto privado e calcular seu SHA-256 efêmero;
11. imediatamente antes do provider, recarregar fontes/ciclo, exigir pending false/revisão `R`, reconstruir apenas a representação canônica da Fatura e baixar novamente o boleto; divergência da guarda semântica ou do hash de bytes aborta sem chamar Resend;
12. enviar um único e-mail pelo Resend para todos os destinatários em `To`, anexando o buffer único da Fatura e o buffer de boleto da segunda leitura revalidada;
13. exigir e capturar `provider_message_id`;
14. chamar a finalização com `expected_content_revision=R`; o banco revalida revisão e pending na mesma transação do evento/resumo e distingue evento novo de replay existente;
15. retornar sucesso atual ou aviso de conteúdo alterado que exige revisão/nova tentativa.

Qualquer falha interrompe as etapas seguintes, exceto a reconciliação idempotente descrita na seção 11. Nunca avançar para um estado local que indique sucesso sem confirmação do provedor e finalização consistente.

## 10. Autenticação server-side

O projeto atual armazena a sessão no cliente. Para esta versão, o fluxo aprovado é stateless por request:

1. navegador obtém o access token da sessão Supabase atual;
2. envia `Authorization: Bearer <access_token>` ao Route Handler;
3. handler rejeita header ausente/malformado com `401`;
4. cria cliente Supabase server-side com URL e publishable/anon key, sem persistência/refresh local, usando o access token como callback de autenticação;
5. valida a identidade com `supabase.auth.getUser(accessToken)`; não confiar apenas no objeto retornado por `getSession()` do browser;
6. todas as queries seguintes usam o cliente do usuário, mantendo RLS;
7. servidor recarrega membership, ciclo, contrato, cliente, contatos, boleto e linhas; não aceita `organization_id`, role, flag ou remetente do payload.

O projeto já possui `@supabase/supabase-js`; não é obrigatório adicionar `@supabase/ssr` ou `@supabase/server` para esse fluxo bearer específico. Qualquer mudança futura para sessão por cookie deve ser uma etapa separada.

Respostas esperadas:

- `401`: token ausente/inválido/expirado;
- `403`: autenticado, mas sem `admin OR can_manage_billing`;
- `404`: recurso não visível no tenant, sem vazar existência cross-tenant;
- `409`: conflito idempotente, edição concorrente ou tentativa que exige reconciliação;
- `422`: payload, destinatário ou boleto inválido;
- `502/503`: falha confirmada/indeterminada do provedor ou falha transitória de finalização.

Todas as respostas do endpoint devem usar `Cache-Control: private, no-store` e não registrar token, boleto, corpo completo ou lista de e-mails em logs genéricos.

## 11. Idempotência e recuperação de falhas

### 11.1 Invariantes

- uma intenção deliberada = um `send_request_id`;
- retry técnico da mesma intenção usa o mesmo ID e o mesmo payload efetivo;
- reenvio deliberado = novo ID;
- `billing_delivery_events.send_request_id` é único;
- quando já existe evento, mesmo ID com cobrança, destinatários ou mensagem diferentes é conflito local e não é reenviado;
- anexos/revision não são persistidos no evento: sem evento, o retry conserva a mesma intenção e a Idempotency-Key; se o payload efetivo divergir, o conflito do Resend é falha e nunca autoriza finalização ou novo ID automático;
- `sent_at` é calculado a partir do evento de sucesso mais recente, nunca do clique.
- a guarda efêmera de concorrência existe apenas dentro da tentativa em curso e nunca é usada para comparar ou versionar eventos históricos;
- `expected_content_revision` pertence à tentativa/RPC e não é persistida no evento; `content_revision` do ciclo conserva apenas a geração corrente.
- evento novo e evento existente são caminhos disjuntos; somente o evento inserido pela execução atual pode aplicar a transição CAS que limpa o latch.

Antes de chamar o Resend, o handler procura evento pelo `send_request_id` dentro do contexto autorizado:

- se não existe, continua o envio;
- se existe e pertence ao mesmo ciclo/tenant, não chama o Resend e executa somente reconciliação monotônica do resumo, preservando o `needs_resend` corrente;
- se existe com cobrança/destinatários/mensagem incompatíveis, responde `409`; o evento não permite comparar anexos históricos.

### 11.2 Finalização atômica

Usar uma função SQL focal `SECURITY DEFINER`, transacional e idempotente para:

1. bloquear/carregar o ciclo do tenant;
2. validar explicitamente `auth.uid()`, membership `admin OR can_manage_billing`, tenant e ciclo;
3. tentar inserir com `INSERT ... ON CONFLICT (send_request_id) DO NOTHING RETURNING id`; somente uma linha realmente retornada define `new_event` nesta execução, inclusive sob duas finalizações concorrentes;
4. em `new_event`, comparar `content_revision` com `p_expected_content_revision` e pending sob o mesmo lock;
5. em `new_event` estável, atualizar `sent_at` sem regressão e limpar `needs_resend`; em divergência, atualizar `sent_at`, forçar `needs_resend=true` e retornar `review_required=true`;
6. sem linha retornada, carregar o evento vencedor e entrar em `existing_event`; validar tenant/ciclo/recipients/mensagem/provider ID compatíveis, não inserir evento e não considerar a revision do retry como prova do conteúdo histórico;
7. em `existing_event`, recalcular o evento mais recente, reparar `sent_at` somente de forma monotônica e preservar o valor atual de `needs_resend`, inclusive quando true;
8. retornar o estado reconciliado e se o evento foi inserido nesta execução.

O parâmetro anterior `p_content_stable` deixa de existir e é substituído por `p_expected_content_revision bigint`. A função não confia em boolean de estabilidade calculado antes: a condição durável é reavaliada pelo banco sob lock.

`SECURITY DEFINER` é necessário somente porque `sent_at`, limpeza de `needs_resend`, revisão e pending não têm grant direto. A função usa `SET search_path=''`, nomes qualificados e owner de migrations; revoga `EXECUTE` de `PUBLIC`, `anon`, `authenticated` e `service_role`, depois concede somente a assinatura exata a `authenticated`. O bypass de RLS é compensado por autorização/tenant explícitos e por testes negativos; não existe `service_role` no Route Handler.

`billing_delivery_events` é histórico operacional de envios aceitos, não prova criptográfica fornecida pelo Resend. Sem `service_role` ou segredo server-only no banco, ele não consegue provar que um `provider_message_id` informado por um usuário financeiro autorizado veio realmente do provedor. Esse risco residual não justifica introduzir `service_role`: o Route Handler permanece o único fluxo suportado da aplicação, e grants/RLS continuam obrigatórios.

Esta transação evita que evento e resumo sejam confirmados pela aplicação como duas operações independentes. O caminho de retry continua capaz de reparar dados caso exista estado parcial legado/anômalo.

### 11.3 Resend aceitou, mas persistência falhou

Estado A:

1. Resend devolveu sucesso/ID;
2. finalização no banco falhou;
3. endpoint não responde sucesso ao usuário;
4. retry usa o mesmo `send_request_id` e payload;
5. Resend devolve o mesmo resultado sem novo e-mail dentro da janela idempotente;
6. handler tenta novamente persistir/finalizar.

Não gerar novo ID automaticamente. O browser conserva o ID da intenção enquanto o resultado for indeterminado.

### 11.4 Evento existe, mas ciclo está inconsistente

Estado B:

1. retry encontra `billing_delivery_event` pelo `send_request_id`;
2. não chama o Resend;
3. recalcula o evento mais recente do ciclo;
4. repara `sent_at`;
5. preserva `needs_resend` em modo fail-closed; evento histórico não contém fingerprint/revisão nem autoriza concluir que o conteúdo atual é o enviado;
6. retorna sucesso idempotente quando o resumo estiver consistente, ou solicita revisão se a atualidade do conteúdo não puder ser provada dentro da tentativa original.

Essa lógica também impede que retry de evento antigo faça `sent_at` regredir depois de um reenvio mais recente.

Cenário obrigatório: envio X finaliza, depois o conteúdo muda e arma `needs_resend=true`; um retry técnico antigo com `send_request_id=X` encontra o evento, não chama Resend, não cria evento, não associa o conteúdo corrente ao evento X, repara apenas `sent_at` monotonicamente e mantém o latch true.

### 11.5 Janela de 24 horas do Resend

A documentação atual do Resend informa que Idempotency Keys expiram após 24 horas. Portanto, sem persistir um ledger separado de tentativas pendentes, não existe garantia do provedor contra duplicidade se:

- o Resend aceitou o e-mail;
- nenhum evento foi persistido;
- o resultado se perdeu;
- o retry ocorrer depois de 24 horas.

Decisão fail-closed desta versão:

- retries automáticos/técnicos devem ocorrer dentro de 24 horas e com o mesmo ID/payload;
- depois dessa janela, se não existe evento local e o resultado anterior é indeterminado, o sistema não deve reenviar automaticamente;
- mostrar estado de reconciliação manual e exigir verificação administrativa no Resend antes de uma nova intenção com novo ID.

Uma tabela durável de tentativas pendentes resolveria a janela de modo totalmente automatizado, mas equivaleria a ampliar o modelo para um ledger/fila de envio e não está aprovada nesta versão. Esta é a principal limitação técnica conhecida.

## 12. IURQ fail-closed

O IURQ `iurqgskfuupslrghgtej` é desenvolvimento/homologação. Envio real nele aceita inicialmente somente:

- `thomas@radialenergia.com.br`;
- `radial@radialenergia.com.br`.

Configuração server-only conceitual:

```text
BILLING_EMAIL_MODE=restricted | production
BILLING_EMAIL_ALLOWED_RECIPIENTS=thomas@radialenergia.com.br,radial@radialenergia.com.br
```

Regras:

- configuração ausente, valor desconhecido, allowlist inválida ou vazia em `restricted`: bloquear todos os envios;
- `restricted`: todo destinatário normalizado deve estar na allowlist;
- `production`: somente configuração explícita futura; nunca inferir por `NODE_ENV`;
- se a URL Supabase ativa corresponder ao project ref IURQ, `production` deve ser rejeitado por defesa em profundidade;
- project ref desconhecido ou inconsistência entre ambiente/configuração: bloquear;
- MISFY não recebe configuração nesta etapa e, portanto, permanece sem envio habilitado.

A UI do IURQ mostra:

> Ambiente de homologação — e-mails só podem ser enviados para endereços de teste autorizados.

Contatos reais podem aparecer para conferência, mas ficam indisponíveis para seleção quando fora da allowlist. O servidor repete a validação de todos os e-mails.

## 13. UI/UX

### 13.1 Card do período

Em `BillingPeriodCard`, substituir conceitualmente `Marcar como enviado` por `Enviar cobrança` e incorporar boleto/histórico sem criar nova tela.

Estados:

**A. Sem boleto**

- `Boleto não anexado`;
- ação `Anexar boleto` para autorizado;
- envio indisponível;
- tentativa explica `Anexe o boleto antes de enviar a cobrança.`

**B. Boleto pronto, nunca enviado**

- `Boleto anexado`;
- ações `Abrir`, `Substituir` e `Enviar cobrança`;
- sem ação Excluir.

**C. Enviado e atual**

- `Enviada em DD/MM/AAAA HH:mm · N destinatários`;
- `Reenviar cobrança`;
- `Abrir`, `Substituir` e `Ver histórico de envios`.

**D. Alterado após envio**

- `Alterada após o último envio`;
- `Último envio em DD/MM/AAAA HH:mm`;
- `Reenviar cobrança` como ação principal;
- `sent_at` permanece visível.

Usuário não autorizado vê a cobrança e Fatura conforme permissões atuais, mas não vê boleto, envio, reenvio nem histórico.

### 13.2 Modal de envio

O modal apresenta:

- aviso do ambiente restrito quando aplicável;
- contatos atuais com nome/e-mail e `receives_billing`;
- selecionados padrões;
- contatos fora da allowlist visíveis, mas desabilitados no IURQ;
- campo para adicionar e-mails extras do envio;
- campo `Mensagem adicional (opcional)`;
- resumo dos dois anexos;
- validação de pelo menos um destinatário;
- botão `Enviar cobrança` ou `Reenviar cobrança`;
- estado de processamento que impede duplo clique, sem gerar novo `send_request_id`.

Falha preserva escolhas e ID para retry técnico. Sucesso fecha o modal, atualiza card/histórico e confirma somente depois da persistência/reconciliação.

### 13.3 Página geral

Manter `src/app/contratos-locacoes/cobrancas/page.tsx`. O ramo comum consulta `billing_cycles` com projeção explícita apenas de `id`, `contract_id`, `document_number`, `document_type`, `due_date`, `issue_date`, `period_start`, `period_end`, `total_amount` e `status`; não usa `select('*')` e não recebe `sent_at`, `needs_resend`, `content_revision` nem coordenação de boleto.

Somente depois de carregar a membership própria por `user_id + organization_id`, o ramo admin/financeiro executa consultas separadas dos indicadores `sent_at`, `needs_resend` e `has_boleto`. `BillingListItem` agrupa esses três valores em `delivery_indicators`, que é um objeto para caller autorizado e `null` para member comum. `null` significa “não autorizado/não carregado”, nunca “não enviado” ou “boleto ausente”; a tabela oculta todo o grupo.

Para o ramo autorizado, `BillingTable` pode mostrar discretamente:

- boleto presente/ausente;
- enviado/não enviado;
- alterada após envio.

As operações completas continuam no detalhe da locação.

## 14. Histórico

O card mostra apenas o evento mais recente. `Ver histórico de envios` expande uma área no próprio período, sem navegação separada.

Ordem: `sent_at DESC`, com desempate por `created_at DESC`/`id`.

Mostrar:

- data/hora;
- destinatários exatos;
- mensagem adicional, se houve.

Não mostrar normalmente:

- `provider_message_id`;
- `send_request_id`.

Esses campos ficam disponíveis apenas para diagnóstico técnico autorizado. O histórico é imutável; reenvio cria outro evento.

## 15. Segurança e threat model curto

| Ameaça | Mitigação obrigatória |
|---|---|
| IDOR/cross-tenant por `billingId` | recarregar ciclo/contrato pelo cliente RLS; exigir invariante banco/fluxo de organização, contrato e ciclo; nunca confiar em `organization_id` do browser |
| member comum acessar boleto | policies gerais excluem `kind='boleto'`; policies financeiras específicas em tabela e Storage |
| usuário se autoautorizar | `can_manage_billing=false`; sem grant de `UPDATE` em membership; administração fora da UI |
| chave Resend no cliente | `RESEND_API_KEY` somente server-side, sem `NEXT_PUBLIC_` |
| envio em homologação para cliente real | modo explícito, allowlist server-side, configuração ausente bloqueia |
| boleto malicioso ou grande | PDF apenas, 10 MB, extensão/path determinísticos, validação cliente + Storage/backend |
| destinatários forjados | normalização, validação, allowlist e autorização repetidas no handler |
| remetente forjado | derivado de `contracts.contract_company` carregado do banco |
| e-mail duplicado por retry | `send_request_id`, Idempotency-Key, unicidade local e retry do mesmo payload |
| falso sucesso | evento/`sent_at` somente após `data.id` confirmado e finalização concluída |
| edição concorrente durante envio | revision atômica nas fontes + pending do Storage + CAS no banco; guarda efêmera continua sem persistência |
| processo morre durante boleto | pending durável bloqueia envio; reparo exige reupload conhecido com o mesmo UUID antes de `finish` |
| retry antigo libera operação nova | `finish` exige UUID corrente sob lock; UUID divergente é conflito |
| exposição por URL | bucket privado e signed URL curta, sem URL pública permanente |
| HTML injection na mensagem | escapar conteúdo livre; gerar também versão texto |
| vazamento em logs | não registrar token, anexos, corpo ou destinatários completos; usar IDs técnicos sem PII |
| ampliação acidental de ACL | grants mínimos, policies por kind, testes negativos de NF/comprovante/anon/member |

O envio conjunto em `To` expõe os endereços entre os destinatários. Isso é uma decisão funcional aprovada e deve ser comunicado no modal se necessário; não substituir por BCC silenciosamente.

## 16. Lote A — banco, permissões e boleto

Escopo implementável e aprovável isoladamente:

1. migration com `can_manage_billing`, `needs_resend`, `content_revision` e coordenação pending/token do boleto;
2. `kind='boleto'`, checks, invariante documento/ciclo/contrato/organização pelo mecanismo mais simples confirmado no schema e índice único parcial;
3. `billing_delivery_events` pode ser criada estruturalmente aqui, ainda sem envio;
4. RLS/grants mínimos e refinamento das policies gerais de `contract_documents`;
5. policies Storage exclusivas de boleto para `SELECT/INSERT/UPDATE`;
6. tipos e queries do boleto/permissão;
7. upload, abrir e substituir no detalhe;
8. estados visuais ligados ao boleto;
9. invariantes atômicas de revisão/`needs_resend` para ciclos, linhas, contrato, cliente e obra, mais begin/finish do boleto;
10. testes focais de migration, RLS, Storage e UI.

Critério de separação: Lote A não instala Resend, não cria endpoint de envio, não envia e-mail e pode ser validado integralmente sem DNS/chave.

## 17. Lote B — Resend, envio e histórico

Pré-condição: Lote A aprovado e configuração externa Resend/DNS concluída.

Escopo:

1. instalar e fixar a versão do pacote `resend`, atualizando lockfile;
2. configuração server-only e parser fail-closed;
3. cliente Supabase server-side bearer/RLS;
4. Route Handler `POST`;
5. validação Auth, permissão, cobrança, contatos, boleto e allowlist;
6. render da mesma Fatura no servidor;
7. download privado do boleto e anexos em memória;
8. remetente, assunto e corpo automáticos;
9. modal e destinatários/extras;
10. idempotência, finalização CAS por `expected_content_revision` e reconciliação;
11. `sent_at`/`needs_resend` sob revision/pending;
12. histórico no card;
13. indicadores discretos na página mensal;
14. testes focais e QA real apenas no IURQ/allowlist.

Critério de separação: nenhuma mudança ou configuração no MISFY; nenhum merge/deploy automático.

## 18. Estratégia de testes

### 18.1 Migration, grants e RLS

- `can_manage_billing` é `NOT NULL DEFAULT false`;
- `needs_resend` é `NOT NULL DEFAULT false`;
- `content_revision` é `bigint NOT NULL DEFAULT 0`, monotônica e não histórica;
- pending/operação/início obedecem à constraint de estado e não possuem grant direto;
- member comum não atualiza a própria flag;
- admin permitido em boleto/eventos;
- member com flag permitido;
- member comum bloqueado;
- anon bloqueado;
- acesso cross-tenant bloqueado mesmo com IDs válidos;
- boleto exige ciclo/contrato/organização coerentes;
- no máximo um boleto por ciclo;
- boleto exige PDF e campos nulos corretos;
- evento exige destinatários e `send_request_id` único;
- evento não aceita `UPDATE/DELETE` pelo app;
- histórico só admin/financeiro;
- boleto incompatível com organização, contrato ou ciclo é rejeitado pelo banco/fluxo protegido mesmo que frontend, path ou membership sejam forjados;
- policies existentes de NF de remessa/comprovantes não ganham acesso;
- hardening de `organization_members` não é revertido;
- ACL de `INSERT`/`UPDATE` de `billing_cycles` é exatamente por coluna e bloqueia campos internos;
- o schema `private` não está em `api.schemas`; helpers de trigger estão em `private`, com `search_path=''`, owner confiável, relações qualificadas e sem `USAGE`/`EXECUTE` direto por `PUBLIC`/`anon`/`authenticated`/`service_role`;
- as RPCs `public.begin_boleto_change`, `public.finish_boleto_change` e `public.finalize_billing_delivery` revogam defaults e concedem somente a assinatura exata a `authenticated`, com `auth.uid()`, membership, capability, tenant, contrato/ciclo e argumentos validados internamente;
- o índice para o fan-out de obra é verificado no catálogo; como o schema de referência não possui índice aproveitável com prefixo `(organization_id, site_id)`, a migration planeja `contracts_org_site_idx` nessas duas colunas.

### 18.2 Storage

- path exato autorizado;
- path de outro tenant/contrato/ciclo bloqueado;
- pasta/nome adulterado bloqueado;
- upload PDF até 10 MB permitido;
- MIME não PDF bloqueado mesmo com extensão `.pdf`;
- primeiro upload permitido a admin/financeiro;
- upsert permitido a admin/financeiro;
- insert/update sem pending iniciado é bloqueado;
- begin com mesmo UUID é idempotente, UUID concorrente conflita e finish atrasado não libera operação nova;
- upload confirmado com finish falho mantém pending; reload/reparo reusa UUID e exige reupload antes de liberar;
- recovery real pela Storage API cobre `begin → primeiro upload → falha antes/do finish → reload → upsert com o mesmo UUID/path → finish`; o ramo pending autoriza `SELECT/UPDATE`, cria/reconcilia um único documento, incrementa revision uma vez e não cria versão física;
- no recovery, UUID diferente, member comum, tenant B e outro kind/path permanecem bloqueados;
- member comum não lê, envia ou substitui;
- delete de boleto indisponível;
- policies de `remittance_nf` e `payment_proof` preservadas.

### 18.3 Lógica pura

- contatos `receives_billing` pré-selecionados;
- e-mail inválido não selecionado;
- marcar/desmarcar e extras;
- extras não alteram cadastro nem reaparecem no reenvio;
- deduplicação case-insensitive e lista exata salva;
- ao menos um e máximo 50 destinatários;
- empresa Fontes/Radial determina `From` e assinatura;
- assunto, corpo, vencimento, período e valor;
- mensagem adicional escapada;
- allowlist IURQ e configurações ausentes/inválidas bloqueiam;
- `send_request_id` v4 sem PII;
- mesmo ID + mesmo payload é retry; payload diferente é conflito;
- novo reenvio gera novo ID;
- a guarda semântica da Fatura é construída da projeção ordenada de `RentalInvoiceDocumentContent`, muda quando conteúdo efetivamente renderizado muda e ignora `financialStatus`/payments não renderizados;
- duas ou mais `billing_lines` com o mesmo `created_at` são sempre desempatadas por `id ASC`; preparação, PDF, guarda canônica e revalidação conservam a mesma sequência e não geram falso conflito;
- o teste de empate também confirma que mudança real de conteúdo ou da sequência semanticamente renderizada continua alterando a guarda quando aplicável;
- arrays, `null`, datas, quantidades e valores têm representação canônica explícita; não há `JSON.stringify` ingênuo de objeto de ordem variável;
- a Fatura é renderizada uma vez, e o mesmo `Buffer` chega ao provider; nenhum teste compara bytes de dois renders;
- o hash efêmero do boleto muda quando os bytes do objeto mudam e é comparado após segunda leitura pré-provider;
- nenhuma guarda/hash é persistida.

### 18.4 `needs_resend`

- cobrança nunca enviada continua false em criação/edição normal;
- cada mudança PostgreSQL relevante incrementa revision na mesma transação, inclusive antes do primeiro envio;
- cada coluna relevante do ciclo marca true depois de envio;
- update apenas de `sent_at`/flag não marca true;
- insert/update/delete de linha renderizada marca true;
- contrato/cliente/obra usam triggers focais e locks de ciclos em ordem determinística;
- alteração em `payments` não marca true nesta versão;
- mudança irrelevante não marca;
- boleto substituído marca true;
- `sent_at` não é apagado;
- envio bem-sucedido atual limpa false;
- edição concorrente durante envio mantém true.
- casos A–N da seção 7.3 não deixam falso negativo.

### 18.5 Endpoint

- sessão ausente/inválida: `401`;
- member comum: `403`;
- admin/financeiro: permitido;
- cross-tenant: sem vazamento;
- cobrança inexistente: `404`;
- sem boleto: bloqueado com mensagem aprovada;
- destinatário fora da allowlist IURQ: bloqueado antes do Resend;
- remetente derivado do contrato;
- mesmos destinatários enviados juntos em um e-mail;
- Fatura e boleto anexados;
- pending bloqueia preparação e CAS;
- revisão divergente antes do Resend aborta sem provider;
- falha do Resend não cria evento nem altera ciclo;
- sucesso cria evento, atualiza `sent_at` e trata `needs_resend`;
- mudança concorrente após preparação não é associada ao sucesso antigo, mantém `needs_resend` e solicita revisão;
- retry técnico não duplica;
- evento existente repara ciclo sem chamar Resend;
- retry antigo do envio X depois de mudança de conteúdo preserva `needs_resend=true`, não associa conteúdo corrente ao evento X e não cria novo evento;
- reenvio intencional cria segundo evento e atualiza `sent_at`;
- resposta sem `data.id` é falha, não sucesso;
- conflito de payload com mesma chave retorna `409`.
- finalização não recebe `contentStable`; compara `expected_content_revision` no banco.
- casos K–N da seção 7.3 distinguem reconciliação de replay e novo envio; somente evento novo e estável pode limpar o latch.

### 18.6 UI

- quatro estados do card;
- controles ocultos para não autorizado;
- modal com padrões, extras, allowlist e mensagem;
- duplo clique não cria nova tentativa;
- resumo do último evento;
- histórico mais recente primeiro;
- IDs técnicos ocultos;
- página mensal comum usa projeção explícita e não recebe indicadores; admin/financeiro recebe o grupo discreto autorizado.

Não fazer mega-auditoria fora do módulo. Em cada lote, rodar testes focais profundos do escopo, TypeScript e consistência de migration; QA real somente quando explicitamente autorizado.

## 19. QA manual no IURQ

Após implementação, migrations e pré-requisitos externos aprovados:

1. confirmar app apontado para IURQ;
2. habilitar `can_manage_billing` administrativamente para o usuário QA escolhido;
3. confirmar member comum bloqueado;
4. anexar boleto PDF de teste;
5. abrir por URL temporária;
6. substituir e verificar `needs_resend` quando aplicável;
7. abrir modal e conferir contatos/allowlist;
8. confirmar que endereço real fora da allowlist fica desabilitado e o servidor o rejeita;
9. enviar e-mail real somente para `thomas@radialenergia.com.br` e/ou `radial@radialenergia.com.br`;
10. validar `From`, `Reply-To`, assunto, HTML/texto e assinatura;
11. validar Fatura e boleto anexos;
12. validar evento, destinatários, `provider_message_id`, `sent_at` e `needs_resend=false`;
13. fazer reenvio deliberado;
14. confirmar novo `send_request_id`, segundo evento e `sent_at` mais recente;
15. simular falha do provedor e confirmar ausência de falso sucesso;
16. confirmar novamente que MISFY não foi acessado nem alterado.

## 20. Pré-requisitos externos Resend/DNS

Antes do QA real do Lote B:

1. criar/configurar a conta Resend;
2. adicionar `radialenergia.com.br`;
3. configurar no GoDaddy/Titan os registros SPF/DKIM exigidos pelo Resend;
4. avaliar/publicar DMARC de forma compatível com o domínio;
5. aguardar domínio verificado;
6. criar API key com permissão `sending_access`, restrita ao domínio quando disponível;
7. configurar `RESEND_API_KEY` somente no ambiente server-side do IURQ;
8. configurar modo `restricted` e allowlist;
9. fazer envio de prova controlado.

As caixas existentes `thomas@radialenergia.com.br` e `radial@radialenergia.com.br` permanecem no Titan. O remetente usado pela aplicação será `radial@radialenergia.com.br`.

Referências oficiais verificadas/revalidadas em 20/08/2026:

- Resend — Send Email: <https://resend.com/docs/api-reference/emails/send-email>
- Resend — Idempotency Keys: <https://resend.com/docs/dashboard/emails/idempotency-keys>
- Resend — Attachments: <https://resend.com/docs/dashboard/emails/attachments>
- Resend — Create API key: <https://resend.com/docs/api-reference/api-keys/create-api-key>
- Supabase — Storage Access Control: <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase — Database Functions e segurança `invoker`/`definer`: <https://supabase.com/docs/guides/database/functions>
- Supabase — restrições atuais dos schemas Auth/Storage/Realtime: <https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025>
- Supabase — Standard Uploads: <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
- Supabase — `auth.getUser`: <https://supabase.com/docs/reference/javascript/auth-getuser>
- Supabase — JWT/access token: <https://supabase.com/docs/guides/auth/jwts>

## 21. Critérios de aceite

A implementação futura estará aceita quando:

1. apenas admin/financeiro do tenant puder ver e operar boleto/envio/histórico;
2. cada cobrança tiver no máximo um boleto PDF atual no path determinístico;
3. substituição sobrescrever o mesmo objeto, sem histórico/exclusão, e marcar alteração após envio;
4. envio sem boleto for bloqueado na UI e no servidor;
5. modal usar contatos atuais, permitir seleção/extras e exigir destinatário;
6. extras não alterarem cadastro nem reaparecerem automaticamente;
7. um e-mail contiver todos os destinatários em `To` e os dois anexos;
8. Fatura for gerada da implementação existente, sem cópia no Storage;
9. remetente/assinatura vierem obrigatoriamente de `contract_company`;
10. IURQ operar fail-closed somente com os dois endereços autorizados;
11. falha/resultado indeterminado não criar falso evento nem alterar `sent_at`;
12. sucesso criar exatamente um evento, atualizar `sent_at` e reconciliar `needs_resend`;
13. retry técnico com mesmo ID não duplicar e reenvio deliberado gerar novo evento;
14. histórico imutável mostrar dados aprovados, mais recente primeiro;
15. `sent_at` representar o último sucesso e nunca ser apagado por edição;
16. mudanças realmente renderizadas marcarem `needs_resend`, enquanto alterações em `payments` não marcarem nesta versão;
17. a guarda de concorrência ser efêmera, não persistida e incapaz de substituir `needs_resend` ou criar versionamento;
18. toda mudança PostgreSQL renderizada incrementar `content_revision` atomicamente com a fonte e o CAS impedir falso negativo no primeiro envio/reenvio;
19. begin/pending/finish do boleto permanecer fail-closed sob concorrência, timeout, reload e retry;
20. a invariante documento/ciclo/contrato/organização ser garantida pelo mecanismo mais simples confirmado no schema;
21. RLS, Storage e integridade do banco/fluxo protegido bloquearem anon, member comum e cross-tenant;
22. NF de remessa, comprovantes e demais documentos não receberem novos privilégios;
23. página mensal comum não consultar nem receber `sent_at`/`needs_resend`/`has_boleto`;
24. nenhum segredo Resend chegar ao browser ou Git;
25. Lote A e Lote B puderem ser testados/aprovados separadamente;
26. nenhum acesso/configuração/migration ocorrer no MISFY sem etapa futura explícita.

## 22. Itens explicitamente adiados

- integração/generação de boleto Itaú;
- CNAB, webhook e baixa bancária;
- ledger persistente de tentativas pendentes além da janela idempotente de 24 horas;
- fila, retry assíncrono e agendamento;
- webhooks e métricas de entrega/abertura/clique;
- individualização de destinatários;
- templates editáveis;
- versionamento ou exclusão de boleto;
- armazenamento/reconstrução histórica da Fatura enviada;
- tela de permissões;
- nova página/dashboard de histórico;
- configuração e ativação no MISFY.

## 23. Pontos prováveis de integração no repositório

Arquivos atuais a modificar no futuro:

- `package.json` e lockfile — dependência Resend no Lote B;
- `src/lib/supabase.ts` ou novo helper server-only — manter cliente browser e adicionar cliente bearer do servidor sem expor segredo;
- `src/lib/contratos-locacoes/types.ts` — `can_manage_billing`, `needs_resend`, revision/coordenação de boleto, `boleto` e `BillingDeliveryEvent`;
- `src/lib/contratos-locacoes/queries.ts` — boleto, contatos, permissão, eventos e indicadores da lista;
- `src/lib/contratos-locacoes/mutations.ts` — remover `markBillingCycleSent` manual e o protocolo não atômico de propagação; triggers focais passam a coordenar fontes PostgreSQL;
- `src/lib/contratos-locacoes/company.ts` — perfil de empresa já usado pela Fatura e fonte coerente para assinatura/remetente;
- `src/lib/contratos-locacoes/remittance-documents.ts` e `payment-proofs.ts` — padrões reais de Storage privado a preservar, sem misturar policies/kinds;
- `src/lib/contratos-locacoes/rental-invoice.ts` — reutilização do snapshot; a guarda considera somente o conteúdo efetivamente renderizado, sem alterar o PDF;
- `src/lib/contratos-locacoes/pdf/RentalInvoiceDocument.tsx` — reutilização server-side, sem segunda versão;
- `src/app/contratos-locacoes/recibos/[id]/page.tsx` — continuar usando a mesma fatura;
- `src/components/contratos-locacoes/BillingPeriodCard.tsx`;
- `src/components/contratos-locacoes/ContractBillingSection.tsx`;
- `src/components/contratos-locacoes/BillingTable.tsx`;
- `src/app/contratos-locacoes/contratos/[id]/page.tsx`;
- `src/app/contratos-locacoes/cobrancas/page.tsx`;
- `src/lib/contratos-locacoes/migration-consistency.test.ts`;
- testes focais correspondentes já existentes.

Arquivos novos prováveis, sujeitos ao plano futuro:

- migration única do Lote A com nome gerado pelo Supabase CLI no momento da implementação;
- `src/lib/contratos-locacoes/boleto-documents.ts` e teste;
- `src/lib/contratos-locacoes/billing-delivery.ts` e teste;
- `src/lib/contratos-locacoes/billing-email-config.ts` e teste;
- componente de modal/histórico e testes;
- `src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.ts` e teste.

Não fixar agora nome/timestamp de migration inexistente.

## 24. Ambiguidades técnicas registradas

1. **Idempotência do Resend expira em 24 horas.** A recuperação automática completa após resultado perdido por mais de 24 horas exigiria um ledger durável de tentativa pendente. Como isso não foi aprovado e se aproxima de infraestrutura de fila, esta spec adota bloqueio/reconciliação manual depois da janela.
2. **Evento de sucesso é inserido com credencial do próprio usuário.** RLS garante tenant e permissão, mas um operador financeiro autorizado poderia chamar diretamente o Data API/RPC e fornecer um ID fictício. Sem `service_role` ou segredo server-only, o banco não prova criptograficamente a origem do ID. Não introduzir `service_role`; o Route Handler é o único fluxo suportado, e essa limitação nunca pode permitir cross-tenant ou escalada.
3. **O snapshot possui campos não renderizados e o PDF não é byte-determinístico entre renders.** `RentalInvoiceSnapshot` hoje inclui `financialStatus` derivado de `payments`, mas `RentalInvoiceDocument` não o usa. A guarda canônica deriva apenas de `RentalInvoiceDocumentContent`; a tentativa renderiza uma vez e envia esse mesmo buffer. Nunca comparar bytes de duas renderizações independentes. O boleto, por ser objeto persistido, continua com comparação de bytes.
4. **Mudanças em entidades compartilhadas podem alterar a Fatura.** Apenas os campos exatos de cliente, obra e contrato efetivamente renderizados acionam triggers focais. Cada trigger incrementa a geração dos ciclos afetados na mesma transação e bloqueia ciclos por ID crescente.
5. **Overwrite de Storage não participa da mesma transação do Postgres.** `begin_boleto_change` cria estado pending durável antes do write externo; `finish_boleto_change` valida o objeto, registra/reconcilia o documento, incrementa revision e libera pending. Falha mantém o envio bloqueado até reupload/reparo explícito com o mesmo UUID.
6. **`content_revision` não é versionamento de documento.** Existe somente um contador corrente por ciclo, sem conteúdo associado, consulta de revisão anterior ou coluna correspondente no evento. Fingerprint continua exclusivamente em memória.
7. **As transições internas exigem privilégio estreito.** Trigger functions ficam em `private`; RPCs de boleto/finalização chamadas pelo app ficam em `public`. `SECURITY DEFINER` existe apenas onde grants diretos de revision/pending/`sent_at` romperiam a ACL. Todas fixam `search_path`, qualificam relações e restringem `EXECUTE`; as RPCs ainda validam `auth.uid()`, membership, capability, tenant e recurso.

Esses pontos não mudam as decisões funcionais aprovadas e devem ser avaliados na revisão desta spec antes do plano do Lote A.
