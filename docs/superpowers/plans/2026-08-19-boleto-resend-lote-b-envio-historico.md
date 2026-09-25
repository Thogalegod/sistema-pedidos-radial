# Lote B — Envio Resend e histórico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar a mesma Fatura aprovada e o boleto privado em um único e-mail Resend, com autenticação/RLS do usuário, allowlist fail-closed, idempotência, histórico imutável e reconciliação segura.

**Architecture:** Um Route Handler Node.js autentica bearer token e usa um cliente Supabase com as credenciais do caller, nunca `service_role`. Helpers server-only preparam configuração, destinatários, corpo, Fatura e boleto; o orquestrador captura `content_revision`, exige ausência de pending, cria guarda canônica do conteúdo da Fatura, renderiza seu PDF uma vez, compara novamente semântica e bytes do boleto imediatamente antes do Resend e finaliza por CAS em uma RPC `SECURITY DEFINER` estreita. A RPC distingue evento novo de replay existente; nenhuma guarda/revision é persistida no evento.

**Tech Stack:** Next.js 16.2.4 App Router/Route Handlers, React 19, TypeScript, Vitest 4, Supabase/Postgres 17, `@react-pdf/renderer` 4.5.1, `@supabase/supabase-js` 2.105.1 e SDK `resend` fixado no momento da implementação.

**Spec:** `docs/superpowers/specs/2026-08-19-boleto-resend-cobrancas-design.md`

## Global Constraints

- Antes de executar qualquer tarefa, ler integralmente a spec acima e confirmar que o Lote A foi aprovado e validado no IURQ.
- Não tocar no MISFY `misfyiznwnuvldoccciw`; configuração, migration e QA real deste lote ficam restritos ao IURQ `iurqgskfuupslrghgtej` após aprovação explícita.
- `RESEND_API_KEY` é server-only, nunca recebe prefixo `NEXT_PUBLIC_`, nunca entra em logs e nunca é enviado ao browser.
- Nenhum `service_role`; todas as consultas e RPCs usam o access token do caller e continuam sujeitas a grants/RLS.
- Em IURQ, modo `restricted` aceita somente `thomas@radialenergia.com.br` e `radial@radialenergia.com.br`; configuração ausente/inválida/vazia bloqueia.
- Um e-mail usa todos os destinatários em `To`; não trocar por BCC.
- From: `Fontes Energia <radial@radialenergia.com.br>` ou `Radial Equipamentos <radial@radialenergia.com.br>` conforme `contract_company`; Reply-To sempre `radial@radialenergia.com.br`.
- Não alterar `RentalInvoiceDocument`; renderizar a mesma dupla `RentalInvoiceSnapshot` + `RentalInvoiceDocument` no servidor.
- Pagamentos ficam fora de `needs_resend` e da guarda efêmera enquanto não forem renderizados no documento.
- Não persistir fingerprint/hash/versão; não criar fila, webhook, ledger de tentativas, background job ou snapshot histórico.
- Renderizar a Fatura uma única vez por tentativa e anexar exatamente esse buffer; nunca comparar bytes de duas renderizações PDF independentes.
- Consultar as `billing_lines` renderizadas sempre em `created_at ASC, id ASC` na preparação e na revalidação pré-Resend; snapshot, conteúdo, `tableRows`, PDF e guarda canônica preservam exatamente essa sequência. Nunca ordenar apenas o hash.
- A guarda canônica da Fatura e o SHA-256 dos bytes do boleto são efêmeros e separados; `content_revision`/pending continuam sendo a guarda durável.
- `content_revision` é somente a geração corrente monotônica; a tentativa captura `R`, mas o evento não armazena revisão, snapshot ou versão recuperável.
- `boleto_change_pending=true` bloqueia preparo e finalização estável; não há abort/timeout que limpe automaticamente uma operação de boleto incompleta.
- Resend Idempotency-Key é exatamente `send_request_id`; retries técnicos conservam ID/payload e reenvio intencional gera novo UUID v4.
- Replay de evento existente reconcilia somente `sent_at` monotonicamente e preserva `needs_resend`; apenas evento novo desta execução pode limpar o latch por CAS estável.
- A janela de idempotência do Resend é 24 horas; depois dela, resultado externo perdido pode exigir reconciliação manual nesta versão.
- Fluxo do projeto: implementação focal → testes focais → revisão → QA manual → somente após aprovação, um commit/push do lote. Não fazer commits por tarefa.

---

## File Structure

### Arquivos a criar

- `src/lib/supabase-server.ts` e teste — cria cliente bearer stateless com publishable/anon key e valida `auth.getUser(accessToken)`.
- `src/lib/contratos-locacoes/billing-email-config.ts` e teste — parser server-only de modo, project ref, allowlist e `RESEND_API_KEY`, sempre fail-closed.
- `src/lib/contratos-locacoes/billing-email.ts` e teste — schemas, normalização/deduplicação, remetente, assunto e HTML/texto escapados.
- `src/lib/contratos-locacoes/billing-email-attachments.server.tsx` e teste — projeção/canonicalização do conteúdo renderizado, render único da mesma Fatura, download do boleto e SHA-256 efêmero somente dos bytes persistidos do boleto.
- `src/lib/contratos-locacoes/billing-delivery.ts` e teste — orquestra autorização, preparo, revalidação pré-provider, Resend, CAS, falhas A–H, intercalações A–J e idempotência K–N.
- `src/lib/contratos-locacoes/billing-send-client.ts` e teste — cliente browser que obtém token, prepara modal e conserva `send_request_id` durante retry técnico.
- `src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.ts` e teste — `GET` autenticado para preparar o modal e `POST` para enviar; runtime Node.js, no-store e mapeamento de status.
- `src/components/contratos-locacoes/BillingEmailModal.tsx` e teste — seleção, extras, mensagem, aviso restricted e prevenção de duplo clique.
- `src/components/contratos-locacoes/BillingDeliveryHistory.tsx` e teste — último evento e histórico expansível, sem IDs técnicos na UI normal.
- `supabase/migrations/<timestamp-cli>_finalize_billing_delivery.sql` — RPC transacional `SECURITY DEFINER` estreita e endurecida, criada via `npx supabase migration new finalize_billing_delivery`.
- `supabase/tests/database/billing_delivery_finalization.test.sql` — pgTAP para idempotência, ACL, cross-tenant e reconciliação.

### Arquivos a modificar

- `package.json` e `package-lock.json` — instalar `resend` com versão exata; nenhuma outra dependência.
- `.env.example` — documentar chaves sem valor secreto real.
- `src/lib/contratos-locacoes/types.ts` — request/response e resultado de finalização, sem fingerprint persistido.
- `src/lib/contratos-locacoes/queries.ts` e teste — contatos, contexto de envio e eventos ordenados.
- `src/lib/contratos-locacoes/migration-consistency.test.ts` — contrato estático da RPC, owner, `search_path`, grants e uso focal de função privilegiada.
- `src/components/contratos-locacoes/BillingPeriodCard.tsx`, `ContractBillingSection.tsx`, `BillingTable.tsx` e testes — enviar/reenviar, histórico e indicadores.
- `src/components/contratos-locacoes/ContractSummary.tsx` e teste — encaminha modal, eventos e callbacks pela composição real do detalhe.
- `src/app/contratos-locacoes/contratos/[id]/page.tsx` e teste — abre modal, executa retry/reenvio e recarrega estado.
- `src/app/contratos-locacoes/cobrancas/page.tsx` e teste existente/novo focal — mantém navegação e indicadores.

### Interfaces consumidas e produzidas

- Consome do Lote A: `OrganizationMember.can_manage_billing`, `BillingCycle.needs_resend`, `content_revision`, estado pending do boleto, `ContractDocument.kind='boleto'`, `BillingDeliveryEvent`, policies privadas e um boleto por ciclo.
- Consome `getBillingRentalInvoice`, `RentalInvoiceSnapshot`, `RentalInvoiceDocument`, `getBillingCompanyProfile`, contatos `receives_billing` e o bucket privado.
- Produz `BillingSendRequest`, `BillingSendResult`, `BillingEmailConfig`, `PreparedProviderEmail`, `BillingDeliveryDependencies`, `finalize_billing_delivery(...)`, `BillingSendClient.prepare(...)` e `sendBillingDelivery(...)`.
- O `GET` do Route Handler retorna apenas opções autorizadas do modal; o `POST` é o único caminho suportado de envio.

## Interfaces centrais

```ts
export interface BillingSendRequest {
  send_request_id: string;
  recipients: string[];
  additional_message: string | null;
}

export interface PreparedProviderEmail {
  from: string;
  replyTo: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: Array<{ filename: string; content: string }>;
}

export type BillingSendResult =
  | { status: 'sent'; event: BillingDeliveryEvent; sent_at: string; needs_resend: false }
  | { status: 'sent_content_changed'; event: BillingDeliveryEvent; sent_at: string; needs_resend: true; review_required: true }
  | { status: 'reconciled'; event: BillingDeliveryEvent; sent_at: string; needs_resend: boolean; review_required: boolean }
  | { status: 'manual_reconciliation_required'; send_request_id: string; review_required: true };

export interface BillingDeliveryFinalizationInput {
  organizationId: string;
  billingCycleId: string;
  sentAt: string;
  recipients: string[];
  providerMessageId: string;
  sendRequestId: string;
  additionalMessage: string | null;
  expectedContentRevision: DbBigInt;
}
```

Nenhuma dessas estruturas possui fingerprint, versão de Fatura ou versão de boleto. `expectedContentRevision` é argumento efêmero de CAS e não entra no evento.

---

## Matriz obrigatória de falhas A–H

### A) Falha antes de chamar Resend

1. Auth, autorização, payload, allowlist, contrato, boleto ou render falha.
2. `sendProviderEmail` não é chamado.
3. Nenhum evento é inserido; `sent_at`/`needs_resend` permanecem intactos.
4. UI conserva seleções e `send_request_id` para retry técnico quando a falha for corrigível.

### B) Erro do Resend

1. Provider retorna erro, timeout sem confirmação ou resposta sem `data.id`.
2. Orquestrador não chama `finalizeBillingDelivery`.
3. Resposta é `502/503`; UI não mostra sucesso e conserva o mesmo ID/payload.

### C) Resend aceitou, mas persistência falhou

1. Provider devolve `provider_message_id`; RPC falha.
2. Endpoint responde estado indeterminado, nunca sucesso.
3. Retry dentro de 24 horas usa mesmo ID/payload; Resend recebe a mesma Idempotency-Key e devolve o mesmo resultado sem novo e-mail.
4. RPC é repetida. Sem evento após 24 horas, não há retry automático: operador verifica o Resend e reconcilia manualmente.

### D) Evento persistiu, mas resumo do ciclo ficou inconsistente

1. Retry encontra evento por `send_request_id` antes do provider.
2. Não chama Resend.
3. RPC recalcula o evento mais recente, repara `sent_at` e preserva `needs_resend` fail-closed quando a atualidade do conteúdo não pode ser provada.
4. Retry antigo nunca faz `sent_at` regredir.

### E) Retry técnico com o mesmo `send_request_id`

1. Browser conserva ID, destinatários normalizados e mensagem da intenção.
2. Se há evento, mesmo ID com cobrança/destinatários/mensagem divergentes retorna `409` antes do Resend; anexos históricos não são comparáveis.
3. Evento existente compatível executa apenas reconciliação.
4. Sem evento e dentro da janela operacional, provider recebe a mesma key; payload divergente é tratado como conflito/erro do Resend, sem finalização nem criação automática de nova intenção.

### F) Reenvio intencional com novo `send_request_id`

1. Usuário clica `Reenviar cobrança` após revisar dados atuais.
2. Modal recalcula contatos atuais; extras antigos não reaparecem.
3. `crypto.randomUUID()` gera novo ID somente na confirmação.
4. Novo sucesso cria segundo evento e atualiza `sent_at` ao mais recente.

### G) Mudança concorrente da Fatura

1. Handler exige pending false, captura revisão `R`, cria a guarda canônica do `RentalInvoiceDocumentContent` e renderiza a Fatura uma única vez.
2. Na última revalidação imediatamente anterior ao Resend, revision diferente de `R`, pending ativo ou guarda canônica diferente aborta sem chamar o provider; a revalidação não renderiza segundo PDF.
3. Se a mutação ocorrer depois dessa revalidação, Resend pode aceitar os anexos já preparados.
4. A RPC compara `expected_content_revision=R` e pending sob lock; divergência registra/reconcilia o sucesso externo, atualiza `sent_at`, força `needs_resend=true` e retorna revisão obrigatória.
5. A finalização nunca afirma que o conteúdo corrente foi enviado; a UI solicita revisão e nova tentativa deliberada.

### H) Substituição concorrente do boleto

1. `begin_boleto_change` grava pending durável antes de qualquer overwrite no mesmo path.
2. Se pending existir na preparação ou na última revalidação pré-provider, o envio aborta sem chamar Resend.
3. Se begin ocorrer depois da última revalidação, a RPC vê pending sob lock e aplica o resultado divergente de G.
4. Upload/finish falho mantém pending; não existe janela em que bytes novos sejam tratados como conteúdo estável sem bump de revisão.

### K–N) Idempotência depois da finalização

- **K — resposta perdida após finalização:** evento existe, conteúdo não mudou e retry usa o mesmo ID. O handler não chama provider; a RPC valida payload, reconcilia `sent_at` monotonicamente e preserva `needs_resend=false`.
- **L — conteúdo muda antes do retry antigo:** evento existe e latch está true. O retry não chama provider, não cria evento, não associa conteúdo atual ao evento antigo e preserva `needs_resend=true`.
- **M — CAS divergente já registrou evento:** retry do mesmo ID não duplica evento nem atravessa o latch true, ainda que o caller forneça a revision corrente.
- **N — reenvio intencional:** novo `send_request_id`; somente esse evento novo pode limpar `needs_resend`, e apenas se sua própria revision/pending estiver estável sob lock.

---

### Task 1: Fixar e instalar apenas o SDK Resend e a configuração fail-closed

**Objetivo:** Pin de dependência e parser server-only seguro, sem chamada real nos testes.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `src/lib/contratos-locacoes/billing-email-config.ts`
- Create: `src/lib/contratos-locacoes/billing-email-config.test.ts`

**Interfaces:**

```ts
export type BillingEmailMode = 'restricted' | 'production';
export interface BillingEmailConfig { mode: BillingEmailMode; allowedRecipients: ReadonlySet<string>; resendApiKey: string; supabaseProjectRef: string }
export function loadBillingEmailConfig(env: NodeJS.ProcessEnv): BillingEmailConfig;
export function isRecipientAllowed(config: BillingEmailConfig, email: string): boolean;
```

- [ ] **Step 1: Escrever o teste RED**

Cobrir configuração ausente, modo desconhecido, allowlist vazia/inválida, IURQ em `production`, project ref desconhecido e chave vazia como erros. Cobrir IURQ restricted apenas com os dois endereços aprovados. Provar que o módulo importa `server-only` e que nenhuma variável começa com `NEXT_PUBLIC_RESEND`.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/billing-email-config.test.ts`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar o mínimo**

Executar `npm install --save-exact resend`. Em `.env.example`, adicionar placeholders sem segredo:

```text
RESEND_API_KEY=__SET_SERVER_SIDE_ONLY__
BILLING_EMAIL_MODE=restricted
BILLING_EMAIL_ALLOWED_RECIPIENTS=thomas@radialenergia.com.br,radial@radialenergia.com.br
```

Extrair project ref de `NEXT_PUBLIC_SUPABASE_URL`; rejeitar `production` no IURQ e qualquer configuração no MISFY durante este lote. O parser normaliza e deduplica allowlist.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/contratos-locacoes/billing-email-config.test.ts`

Expected: PASS sem rede/provider.

**Critérios para revisão:** só `resend` foi instalado; versão exata no manifest/lock; segredo não público; configuração fail-closed; MISFY desabilitado.

---

### Task 2: Criar cliente Supabase bearer server-side sem service role

**Objetivo:** Autenticar cada request e manter todas as consultas no contexto RLS do caller.

**Files:**
- Create: `src/lib/supabase-server.ts`
- Create: `src/lib/supabase-server.test.ts`

**Interfaces:**

```ts
export function readBearerToken(header: string | null): string;
export class BillingAuthError extends Error { readonly code: 'unauthorized' }
export function createBearerSupabaseClient(accessToken: string): SupabaseClient;
export async function authenticateBearerUser(accessToken: string): Promise<{ client: SupabaseClient; userId: string }>;
```

- [ ] **Step 1: Escrever o teste RED**

Testar header ausente/malformado, cliente com `persistSession:false`, `autoRefreshToken:false`, header `Authorization: Bearer ...`, uso de publishable/anon key e chamada `auth.getUser(accessToken)`. Proibir qualquer leitura de `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/supabase-server.test.ts`

Expected: FAIL porque o helper não existe.

- [ ] **Step 3: Implementar o mínimo**

Adicionar `import 'server-only'`; usar `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, options)` e validar usuário remotamente por `getUser(accessToken)`. Token ausente/inválido lança erro tipado `BillingAuthError('unauthorized')` sem incluir token na mensagem.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/supabase-server.test.ts`

Expected: PASS.

**Critérios para revisão:** grants/RLS do caller continuam ativos; sem cookie/session refresh; sem service role; logs/erros sem token.

---

### Task 3: Implementar domínio puro de destinatários e mensagem

**Objetivo:** Validar payload, contatos, extras, remetente, assunto e HTML/texto determinísticos.

**Files:**
- Create: `src/lib/contratos-locacoes/billing-email.ts`
- Create: `src/lib/contratos-locacoes/billing-email.test.ts`
- Modify: `src/lib/contratos-locacoes/types.ts`

**Interfaces:**

```ts
export function parseBillingSendRequest(value: unknown): BillingSendRequest;
export function buildDefaultRecipients(contacts: CustomerContact[]): string[];
export function normalizeBillingRecipients(input: string[]): string[];
export function buildBillingSender(company: ContractCompany): { from: string; replyTo: string; signature: string };
export function buildBillingEmailContent(input: { snapshot: RentalInvoiceSnapshot; additionalMessage: string | null; company: ContractCompany }): { subject: string; html: string; text: string };
```

- [ ] **Step 1: Escrever o teste RED**

Cobrir `receives_billing`, e-mail inválido, trim/case-insensitive, deduplicação determinística, 1–50, UUID v4, mensagem limitada e escapada, extras não persistidos, From/Reply-To, assunto aprovado e company inválida sem fallback. Provar que pagamentos/financialStatus não entram no assunto/corpo.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/billing-email.test.ts`

Expected: FAIL porque funções e tipos não existem.

- [ ] **Step 3: Implementar o mínimo**

Usar Zod já instalado para payload e e-mails; escapar mensagem como texto antes do HTML e gerar versão texto separada. Salvar exatamente o array normalizado enviado em `To`. Não aceitar remetente, organization, role ou flag no payload.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/contratos-locacoes/billing-email.test.ts`

Expected: PASS.

**Critérios para revisão:** todos em um único `To`; máximo 50; extras não alteram cadastro; corpo sem injection; remetente derivado do banco.

---

### Task 4: Canonicalizar a Fatura, renderizar uma vez e hashear o boleto

**Objetivo:** Produzir em memória a Fatura aprovada uma única vez, guardar semanticamente apenas o que ela renderiza e comparar bytes reais do boleto persistido.

**Files:**
- Create: `src/lib/contratos-locacoes/billing-email-attachments.server.tsx`
- Create: `src/lib/contratos-locacoes/billing-email-attachments.server.test.tsx`

**Interfaces:**

```ts
export type CanonicalRentalInvoiceContent = readonly [
  title: string,
  number: string,
  issuerName: string,
  issuerLines: readonly string[],
  recipientLines: readonly string[],
  invoiceDataRows: readonly (readonly [label: string, value: string])[],
  description: string,
  tableHeaders: readonly string[],
  tableRows: readonly (readonly [quantity: string, description: string, unitAmount: string, totalAmount: string])[],
  adjustmentRows: readonly (readonly [label: string, value: string])[],
  totalLabel: string,
  totalInWords: string,
  notes: string | null,
  fiscalNotice: string,
];
export interface PreparedBillingAttachments { invoice: Buffer; invoiceFileName: string; boleto: Buffer; boletoFileName: string; invoiceSemanticGuard: string; boletoBytesGuard: string }
export function buildCanonicalRentalInvoiceContent(snapshot: RentalInvoiceSnapshot): CanonicalRentalInvoiceContent;
export function computeCanonicalRentalInvoiceGuard(content: CanonicalRentalInvoiceContent): string;
export async function renderRentalInvoiceBuffer(snapshot: RentalInvoiceSnapshot): Promise<Buffer>;
export function computeBoletoBytesGuard(boleto: Uint8Array): string;
export async function prepareBillingAttachments(input: { snapshot: RentalInvoiceSnapshot; boletoBytes: ArrayBuffer; billingCycleId: string }): Promise<PreparedBillingAttachments>;
```

- [ ] **Step 1: Escrever o teste RED**

Mockar `@react-pdf/renderer` e provar que recebe `<RentalInvoiceDocument snapshot={snapshot}>` exatamente uma vez; o `Buffer` retornado é a mesma referência/conteúdo anexada ao payload posterior, sem segundo render de verificação. `filename` usa `snapshot.fileName`; boleto usa `boleto-<billingCycleId>.pdf`.

Fixar a canonicalização a partir de `buildRentalInvoiceDocumentContent(snapshot)`, projetando somente os campos da tupla acima. O `id` de `tableRows` fica fora porque é React key e não texto renderizado, mas a sequência das rows já chega determinada pela leitura `billing_lines ORDER BY created_at ASC, id ASC`. A tupla fixa a ordem das propriedades; arrays preservam a mesma ordem semântica usada pelo PDF; cada row vira tupla ordenada; datas, quantidades e valores usam as strings finais já normalizadas pelo builder; ausência é `null`. O SHA-256 serializa apenas essa árvore de arrays/primitivos em ordem fixa — não aplicar `JSON.stringify` ingênuo ao snapshot/objeto arbitrário e não ordenar somente a árvore canônica.

Provar que a guarda semântica muda com qualquer string/row efetivamente renderizada, muda com reordenação de linhas, permanece igual para objetos com ordem incidental diferente e não muda com `snapshot.financialStatus`/payments. Provar separadamente que o hash do boleto muda com seus bytes. Nenhum retorno público/evento persiste as guardas.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/billing-email-attachments.server.test.tsx`

Expected: FAIL porque o módulo não existe.

- [ ] **Step 3: Implementar o mínimo**

Reutilizar `buildRentalInvoiceDocumentContent` como fronteira entre snapshot e semântica renderizada e preservar a ordem total das linhas recebida da consulta; nenhuma função deste helper reordena `tableRows`. Usar API server-side `renderToBuffer` uma vez e `node:crypto.createHash('sha256')` apenas em memória para a representação canônica e para os bytes do boleto. Validar tamanho combinado codificado antes do provider. Não alterar `RentalInvoiceDocument`, não salvar PDF e não criar snapshot/fingerprint persistente.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/contratos-locacoes/billing-email-attachments.server.test.tsx`

Expected: PASS.

**Critérios para revisão:** mesma implementação visual; um único render e exatamente seu buffer no provider; nenhuma comparação PDF-vs-PDF; canonicalização explícita e determinística somente do conteúdo renderizado; `tableRows`, PDF e guarda preservam a ordem total `created_at ASC, id ASC` fornecida pela leitura, sem sort exclusivo do hash; boleto comparado por bytes após nova leitura; sem browser-only; payments fora; guardas exclusivas da janela preparação→última revalidação, sem comparação pós-provider nem persistência.

---

### Task 5: Criar finalização transacional CAS com SECURITY DEFINER focal

**Objetivo:** Inserir/reconciliar evento e resumo do ciclo atomicamente, com ACL mínima e sem prova falsa sobre o provider.

**Files:**
- Create: `supabase/migrations/<timestamp-cli>_finalize_billing_delivery.sql`
- Create: `supabase/tests/database/billing_delivery_finalization.test.sql`
- Modify: `src/lib/contratos-locacoes/migration-consistency.test.ts`

**Interfaces:**

```sql
public.finalize_billing_delivery(
  p_organization_id uuid,
  p_billing_cycle_id uuid,
  p_sent_at timestamptz,
  p_recipients text[],
  p_provider_message_id text,
  p_send_request_id uuid,
  p_additional_message text,
  p_expected_content_revision bigint
)
```

Retorna `event_id`, `effective_sent_at`, `needs_resend`, `inserted_event` e `review_required`.

- [ ] **Step 1: Escrever o teste RED**

O Vitest exige `SECURITY DEFINER`, owner confiável não assumível por role de API, `SET search_path = ''`, nomes qualificados, `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated, service_role` seguido de grant somente da assinatura exata a `authenticated`. pgTAP prova `auth.uid()` obrigatório, autorização admin/financeiro explícita, member/anon/cross-tenant bloqueados, `created_by=auth.uid()`, conflito de payload, evento imutável e `sent_at` mais recente.

Provar sob row lock caminhos disjuntos: (a) **evento novo**, no qual revisão esperada + pending false permite limpar `needs_resend`, enquanto revisão divergente/pending força true; (b) **evento existente**, no qual tenant/ciclo/recipients/mensagem/provider ID são validados, nenhum insert ocorre, `sent_at` é reparado por `max(sent_at)` e o latch corrente é preservado sem exceção. Duas finalizações concorrentes do mesmo ID produzem um único `RETURNING`: a vencedora pode aplicar CAS; a perdedora entra no replay e não limpa latch. O teste obrigatório persiste evento X, arma `needs_resend=true` por mudança posterior e repete X com a revision corrente: zero novo evento, `sent_at` sem regressão e latch ainda true. Nenhum teste usa GUC/flag do caller como bypass e nenhum evento recebe `content_revision`.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/migration-consistency.test.ts -t "finalizes billing delivery with hardened revision CAS"`

Expected: FAIL porque a migration/RPC não existe.

- [ ] **Step 3: Implementar o mínimo**

Criar migration com `npx supabase migration new finalize_billing_delivery`. A função privilegiada é necessária porque `sent_at`, limpeza de `needs_resend` e demais campos internos não têm grant direto seguro. Ela valida explicitamente `auth.uid()`, membership financeira, tenant e ciclo; bloqueia a cobrança; tenta `INSERT ... ON CONFLICT (send_request_id) DO NOTHING RETURNING id`. Somente uma linha realmente retornada fixa o ramo evento novo; conflito, inclusive corrida simultânea, carrega o evento vencedor e fixa o ramo replay antes de qualquer transição. O latch reconhece somente o `current_user` desse owner confiável durante a RPC; nunca aceita GUC, bypass booleano, `created_by` do caller ou revisão no evento.

No ramo **evento novo**, inserir o evento e calcular o resumo na mesma transação. Se `content_revision = p_expected_content_revision` e `boleto_change_pending=false`, atualizar `sent_at` pelo sucesso mais recente e limpar `needs_resend`; se divergir, preservar o evento confirmado, atualizar `sent_at`, forçar true e retornar `review_required=true`.

No ramo **evento existente/replay**, validar payload/tenant/ciclo/recipients/mensagem/provider ID compatíveis, não inserir evento e não executar a transição de sucesso novamente. Recalcular `sent_at` pelo maior evento sem regressão e preservar exatamente o `needs_resend` lido sob lock. `p_expected_content_revision` do retry nunca prova o conteúdo histórico nem autoriza `true → false`.

- [ ] **Step 4: Executar GREEN estático e comportamental**

Run: `npm test -- src/lib/contratos-locacoes/migration-consistency.test.ts -t "finalizes billing delivery with hardened revision CAS"`

Run: `npx supabase test db supabase/tests/database/billing_delivery_finalization.test.sql`

Expected: ambos PASS.

**Critérios para revisão:** definer focal com autorização interna, owner/search path/EXECUTE endurecidos e relações qualificadas; nenhuma role de API recebe escrita direta nos campos protegidos; sem service role/secret; row lock e CAS cobrem evento novo, primeiro envio, reenvio e pending; replay existente só reconcilia monotonicamente e nunca limpa latch; operador financeiro autorizado ainda pode fornecer ID fictício via Data API, risco residual documentado que nunca permite cross-tenant ou escalada.

---

### Task 6: Orquestrar envio, falhas A–H e intercalações/idempotência A–N com Resend mockado

**Objetivo:** Implementar a ordem autoritativa completa e a reconciliação sem falso sucesso.

**Files:**
- Create: `src/lib/contratos-locacoes/billing-delivery.ts`
- Create: `src/lib/contratos-locacoes/billing-delivery.test.ts`
- Modify: `src/lib/contratos-locacoes/queries.ts`
- Modify: `src/lib/contratos-locacoes/queries.test.ts`

**Interfaces:**

```ts
export interface AuthorizedBillingDeliveryContext { membership: OrganizationMember; billing: BillingCycle /* inclui content_revision e pending */; contract: Contract; customer: Customer; site: CustomerSite | null; contacts: CustomerContact[]; billingLines: BillingLine[]; payments: Payment[]; boleto: ContractDocument }
export interface BillingDeliveryDependencies {
  loadContext(billingId: string): Promise<AuthorizedBillingDeliveryContext>;
  findEvent(sendRequestId: string): Promise<BillingDeliveryEvent | null>;
  downloadBoleto(document: ContractDocument): Promise<ArrayBuffer>;
  renderSnapshot(context: AuthorizedBillingDeliveryContext): Promise<RentalInvoiceSnapshot>;
  sendProviderEmail(payload: PreparedProviderEmail, idempotencyKey: string): Promise<{ id: string }>;
  finalize(input: BillingDeliveryFinalizationInput): Promise<BillingSendResult>;
}
export async function sendBillingDelivery(deps: BillingDeliveryDependencies, billingId: string, request: BillingSendRequest): Promise<BillingSendResult>;
```

- [ ] **Step 1: Escrever o teste RED**

Criar um `describe.each` com A–H da matriz de falhas e casos explícitos A–N da tabela abaixo. Asserções mínimas: ordem de chamadas; pending false e captura de `R`; Fatura renderizada exatamente uma vez; revalidação canônica sem segundo render; segunda leitura/hash do boleto; provider recebe o mesmo buffer único da Fatura e o buffer de boleto revalidado; provider zero vezes se revision/pending/guarda/hash divergir; provider `id` obrigatório; divergência de payload retorna conflito; evento existente pula provider e preserva latch; novo ID cria novo evento; CAS divergente pós-provider preserva evento e mantém flag; finalização falha retorna indeterminado. Mock Resend e Supabase; nenhum teste chama rede.

Adicionar em `queries.test.ts` e no teste do orquestrador um caso focal com ao menos duas `billing_lines` cujo `created_at` seja exatamente igual e IDs distintos. Provar que a leitura aplica `created_at ASC, id ASC`, preparação e revalidação recebem a mesma sequência, `RentalInvoiceSnapshot`/`RentalInvoiceDocumentContent`/`tableRows` e o PDF preservam essa sequência, o hash canônico permanece igual sem mutação e o provider não é bloqueado por falso conflito. No mesmo conjunto, alterar conteúdo efetivamente renderizado ou a sequência semântica quando aplicável e provar que a guarda diverge e o envio aborta antes do provider.

| Caso | Intercalação a provar | Resultado obrigatório |
|---|---|---|
| A | mutação termina antes da preparação | preparação captura a revisão nova e envia o conteúdo novo |
| B | mutação PostgreSQL durante preparação | trigger incrementa revisão atomicamente; revalidação aborta ou CAS diverge |
| C | mutação após a última revalidação e antes do Resend | CAS lê revisão diferente e mantém `needs_resend=true` |
| D | mutação enquanto o Resend responde | CAS detecta a revisão incrementada |
| E | mutação entre Resend e RPC | CAS detecta a revisão incrementada |
| F | RPC finaliza primeiro, mutação depois | lock serializa; trigger posterior incrementa revisão e marca true |
| G | boleto começa overwrite durante preparação/envio | begin grava pending antes da Storage API; revalidação ou CAS bloqueia |
| H | upload termina e finish falha | pending permanece durável e nenhum envio prepara/finaliza como estável |
| I | primeiro envio concorrente com alteração | revisão muda mesmo com `sent_at` nulo; CAS não depende de `needs_resend` prévio |
| J | reenvio concorrente com alteração | revisão/CAS detecta a mudança; latch fica true até sucesso estável posterior |
| K | resposta perdida após finalização, evento existe e conteúdo não mudou | zero provider/evento novo; `sent_at` reconciliado sem regressão; latch false preservado |
| L | conteúdo muda depois do evento e retry antigo repete o ID | zero provider/evento novo; conteúdo atual não é associado ao evento; latch true preservado |
| M | evento foi criado por CAS divergente e depois há replay | zero duplicação; latch true continua true mesmo com revision corrente no retry |
| N | reenvio intencional com novo ID | evento novo só limpa latch se sua própria revision/pending finalizar estável |

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/billing-delivery.test.ts`

Expected: FAIL porque o orquestrador não existe.

- [ ] **Step 3: Implementar o mínimo**

Executar a ordem da spec:

1. autenticar/autorizar, validar payload e tratar evento idempotente já existente sem chamar provider nem executar a transição de limpeza do latch;
2. carregar contexto com `billing_lines` explicitamente ordenadas por `created_at ASC, id ASC`, exigir `boleto_change_pending=false`, capturar `R=content_revision`, construir a guarda canônica C1 preservando essa sequência, renderizar a Fatura uma vez na mesma ordem, baixar boleto B1 e calcular H1 dos bytes;
3. imediatamente antes do Resend, recarregar contexto/fontes repetindo `billing_lines ORDER BY created_at ASC, id ASC`, exigir pending false e revisão `R`, reconstruir somente a guarda canônica C2 na mesma sequência, baixar boleto B2 e calcular H2; abortar se C1 != C2 ou H1 != H2, sem renderizar segunda Fatura e sem ordenar apenas o hash;
4. chamar o provider com o buffer único da Fatura e B2, os bytes efetivamente revalidados, e obter ID confirmado;
5. chamar a finalização com `expectedContentRevision=R`; a RPC decide estável/divergente sob lock.

Não existe recálculo de guarda depois do provider: revision/pending + CAS protegem essa janela. Chamar SDK como:

```ts
await resend.emails.send(payload, { idempotencyKey: request.send_request_id });
```

Sucesso exige `data.id` não vazio e ausência de erro. Eventos existentes são comparados por tenant/ciclo/recipients/mensagem/provider ID; como o evento não guarda revision/fingerprint, a reconciliação histórica ignora `expectedContentRevision` para fins de limpeza e preserva o `needs_resend` corrente.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/contratos-locacoes/billing-delivery.test.ts`

Expected: PASS para todos os cenários de falha A–H, intercalações A–J, idempotência K–N e zero chamadas externas reais.

**Critérios para revisão:** nenhum falso sucesso/falso negativo; empates em `billing_lines.created_at` são resolvidos por `id ASC` sem falso aborto; preparação, PDF, guarda e revalidação usam a mesma sequência; mudança real continua detectável; render único e buffer idêntico no provider; última revalidação canônica/hash ocorre antes do provider; provider antes da persistência e finalização CAS depois do ID; evento confirmado é preservado mesmo em divergência; replay nunca limpa latch; sem ledger/fila/webhook; 24 h documentadas; pagamentos fora da guarda.

---

### Task 7: Expor Route Handler autenticado e no-store

**Objetivo:** Disponibilizar preparo autorizado do modal e POST de envio com códigos/status seguros.

**Files:**
- Create: `src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.ts`
- Create: `src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.test.ts`

**Interfaces:**

```ts
export const runtime = 'nodejs';
export async function GET(request: Request, context: RouteContext<'/api/contratos-locacoes/cobrancas/[billingId]/enviar'>): Promise<Response>;
export async function POST(request: Request, context: RouteContext<'/api/contratos-locacoes/cobrancas/[billingId]/enviar'>): Promise<Response>;
```

GET retorna contatos atuais, defaults, modo restricted e disponibilidade permitida, sem segredo. POST recebe apenas `BillingSendRequest`.

- [ ] **Step 1: Escrever o teste RED**

Cobrir 401 token ausente/inválido; 403 member; 404 recurso invisível/cross-tenant; 409 conflito de intenção, revision divergente ou boleto pending; 422 payload/recipients/boleto; 502/503 provider/finalização; 200 sucesso/reconciliação. Exigir `Cache-Control: private, no-store` em todas as respostas e ausência de token/e-mails/anexos no logger mockado.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.test.ts`

Expected: FAIL porque a rota não existe.

- [ ] **Step 3: Implementar o mínimo**

Usar `const { billingId } = await context.params` conforme Next.js 16. GET e POST repetem auth/autorização; GET/POST falham fechados quando o boleto está pending e POST chama o orquestrador. Responder JSON tipado e sanitizado. Nenhum cache e nenhum redirect.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.test.ts`

Expected: PASS.

**Critérios para revisão:** endpoint não confia em org/role/from do browser; cross-tenant não vaza existência; segredo e PII não aparecem; runtime Node explícito.

---

### Task 8: Criar cliente browser e modal com retry deliberado

**Objetivo:** Preparar destinatários e manter uma intenção estável sem duplo clique nem extras persistentes.

**Files:**
- Create: `src/lib/contratos-locacoes/billing-send-client.ts`
- Create: `src/lib/contratos-locacoes/billing-send-client.test.ts`
- Create: `src/components/contratos-locacoes/BillingEmailModal.tsx`
- Create: `src/components/contratos-locacoes/BillingEmailModal.test.tsx`

**Interfaces:**

```ts
export interface BillingSendClient {
  prepare(billingId: string): Promise<BillingSendPreparation>;
  send(billingId: string, request: BillingSendRequest): Promise<BillingSendResult>;
}
export interface BillingSendPreparation { contacts: CustomerContact[]; defaultRecipients: string[]; allowedRecipients: string[]; mode: 'restricted' | 'production'; hasBoleto: boolean; invoiceFileName: string; boletoFileName: string }
export function createBillingSendIntent(input: { recipients: string[]; additionalMessage: string | null }): BillingSendRequest;
```

- [ ] **Step 1: Escrever o teste RED**

Testar token atual no Authorization, defaults `receives_billing`, contatos fora da allowlist desabilitados, extras, deduplicação, mensagem, banner IURQ, dois anexos no resumo, ao menos um recipient, UUID só ao confirmar, duplo clique uma chamada, falha preserva ID/escolhas, reenvio novo gera novo ID e não repõe extras antigos.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/lib/contratos-locacoes/billing-send-client.test.ts src/components/contratos-locacoes/BillingEmailModal.test.tsx`

Expected: FAIL porque cliente/modal não existem.

- [ ] **Step 3: Implementar o mínimo**

O cliente obtém `session.access_token`, mas o servidor valida com `getUser`. Modal conserva intenção em memória durante retry; não restaura automaticamente uma intenção indeterminada após recarregar a página. Ao ultrapassar a janela operacional de 24 h com resultado indeterminado, bloquear novo retry automático e mostrar reconciliação manual.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/lib/contratos-locacoes/billing-send-client.test.ts src/components/contratos-locacoes/BillingEmailModal.test.tsx`

Expected: PASS.

**Critérios para revisão:** nenhum segredo no bundle; retry mantém ID/payload; reenvio deliberado novo ID; allowlist repetida no servidor; resultado indeterminado não vira sucesso.

---

### Task 9: Integrar envio, reenvio e histórico no card

**Objetivo:** Completar os quatro estados aprovados e histórico imutável no detalhe da locação.

**Files:**
- Create: `src/components/contratos-locacoes/BillingDeliveryHistory.tsx`
- Create: `src/components/contratos-locacoes/BillingDeliveryHistory.test.tsx`
- Modify: `src/components/contratos-locacoes/BillingPeriodCard.tsx`
- Modify: `src/components/contratos-locacoes/BillingPeriodCard.test.tsx`
- Modify: `src/components/contratos-locacoes/ContractBillingSection.tsx`
- Modify: `src/components/contratos-locacoes/ContractBillingSection.test.tsx`
- Modify: `src/components/contratos-locacoes/ContractSummary.tsx`
- Modify: `src/components/contratos-locacoes/ContractSummary.test.tsx`
- Modify: `src/app/contratos-locacoes/contratos/[id]/page.tsx`
- Modify: `src/app/contratos-locacoes/contratos/[id]/page.test.tsx`
- Modify: `src/lib/contratos-locacoes/queries.ts`
- Modify: `src/lib/contratos-locacoes/queries.test.ts`

**Interfaces:**

```ts
listBillingDeliveryEvents(organizationId: string, billingCycleIds: string[]): Promise<BillingDeliveryEvent[]>;
onSendBilling(billing: BillingCycle): Promise<void>;
```

- [ ] **Step 1: Escrever o teste RED**

Cobrir: sem boleto bloqueia com texto aprovado; boleto pronto mostra `Enviar cobrança`; enviado atual mostra destinatários e `Reenviar cobrança`; alterado mostra aviso/último envio; não autorizado não vê envio/histórico; histórico desc por sent_at/created_at/id, mostra data/recipients/mensagem e oculta provider/send IDs. Sucesso recarrega; conteúdo alterado mostra revisão; falha mantém modal.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/components/contratos-locacoes/BillingDeliveryHistory.test.tsx src/components/contratos-locacoes/BillingPeriodCard.test.tsx src/components/contratos-locacoes/ContractBillingSection.test.tsx src/components/contratos-locacoes/ContractSummary.test.tsx src/app/contratos-locacoes/contratos/[id]/page.test.tsx src/lib/contratos-locacoes/queries.test.ts`

Expected: FAIL pela ausência de histórico/modal/callbacks.

- [ ] **Step 3: Implementar o mínimo**

Abrir modal no card; gerar intenção apenas na confirmação; após `sent` fechar/recarregar; após `sent_content_changed` fechar e exibir alerta de revisão; após erro manter modal/ID. Query de eventos é financeira e tenant-scoped por RLS. Nenhuma página separada.

- [ ] **Step 4: Executar o GREEN**

Run: `npm test -- src/components/contratos-locacoes/BillingDeliveryHistory.test.tsx src/components/contratos-locacoes/BillingPeriodCard.test.tsx src/components/contratos-locacoes/ContractBillingSection.test.tsx src/components/contratos-locacoes/ContractSummary.test.tsx src/app/contratos-locacoes/contratos/[id]/page.test.tsx src/lib/contratos-locacoes/queries.test.ts`

Expected: PASS.

**Critérios para revisão:** histórico imutável; IDs técnicos ocultos; member comum sem controles; estado usa evento/`sent_at`/`needs_resend`, não fingerprint.

---

### Task 10: Finalizar indicadores mensais e regressões focais

**Objetivo:** Refletir boleto/envio/alteração na página geral sem ampliar operações e fechar o lote com testes de segurança.

**Files:**
- Modify: `src/components/contratos-locacoes/BillingTable.tsx`
- Modify: `src/components/contratos-locacoes/BillingTable.test.tsx`
- Modify: `src/app/contratos-locacoes/cobrancas/page.tsx`
- Modify: teste focal correspondente da página, se necessário para a integração existente.

**Interfaces:**
- Consumes: `BillingListItem.delivery_indicators: BillingDeliveryIndicators | null` produzido no Lote A; o objeto autorizado contém `has_boleto`, `sent_at` e `needs_resend`.
- Produces: labels discretos `Boleto anexado/não anexado`, `Enviada/não enviada`, `Alterada após envio`.

- [ ] **Step 1: Escrever o teste RED**

Exigir os três indicadores somente quando `delivery_indicators` não for `null`, link atual `Abrir locação`, `Abrir fatura` e ausência de botão de envio na página geral. Para member comum, `delivery_indicators:null` oculta todos os indicadores sem renderizar ausência falsa. Incluir regressão de saldo/status existente e teste de member/anon no endpoint já criado.

- [ ] **Step 2: Executar o RED**

Run: `npm test -- src/components/contratos-locacoes/BillingTable.test.tsx src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.test.ts`

Expected: FAIL até os indicadores finais estarem presentes.

- [ ] **Step 3: Implementar o mínimo**

Adicionar somente textos/badges no card mensal a partir do objeto autorizado; operações continuam no detalhe. Não consultar revision/pending na lista, não alterar filtros/navegação/saldo e não converter `null` em três flags falsas. Corrigir apenas regressões focais reveladas.

- [ ] **Step 4: Executar o GREEN e typecheck/build focal**

Run: `npm test -- src/lib/contratos-locacoes/billing-email-config.test.ts src/lib/supabase-server.test.ts src/lib/contratos-locacoes/billing-email.test.ts src/lib/contratos-locacoes/billing-email-attachments.server.test.tsx src/lib/contratos-locacoes/billing-delivery.test.ts src/lib/contratos-locacoes/billing-send-client.test.ts src/app/api/contratos-locacoes/cobrancas/[billingId]/enviar/route.test.ts src/components/contratos-locacoes/BillingEmailModal.test.tsx src/components/contratos-locacoes/BillingDeliveryHistory.test.tsx src/components/contratos-locacoes/BillingPeriodCard.test.tsx src/components/contratos-locacoes/BillingTable.test.tsx`

Run: `npx tsc --noEmit`

Expected: todos PASS e TypeScript exit 0.

**Critérios para revisão:** nenhum mega-suite/Playwright sem causa; página geral discreta e sem indicador para member comum; endpoint e helpers cobrem negativos; Resend sempre mockado nos automatizados.

---

## Pré-requisitos externos do QA real

1. Lote A aprovado no IURQ.
2. Domínio `radialenergia.com.br` verificado no Resend.
3. SPF e DKIM configurados; DMARC avaliado de forma compatível.
4. API key com `sending_access`, restrita ao domínio quando disponível.
5. `RESEND_API_KEY`, modo `restricted` e allowlist configurados apenas no runtime server-side do IURQ.
6. Nenhuma configuração correspondente no MISFY.

## QA manual no IURQ — envio real restrito

1. Abrir modal como admin/financeiro; confirmar member comum bloqueado.
2. Conferir contatos `receives_billing`, seleção, extras e banner restricted.
3. Confirmar que e-mail fora da allowlist aparece indisponível e que POST forjado também é rejeitado.
4. Enviar somente para `thomas@radialenergia.com.br` e/ou `radial@radialenergia.com.br`.
5. Validar From, Reply-To, assunto, HTML/texto, assinatura e mensagem adicional.
6. Abrir anexos recebidos: mesma Fatura aprovada e boleto correto.
7. Conferir evento, destinatários, provider ID técnico, `sent_at` e `needs_resend=false`.
8. Fazer reenvio deliberado; confirmar novo `send_request_id`, segundo evento e `sent_at` mais recente.
9. Simular falha controlada do provider/configuração e confirmar ausência de evento/falso sucesso.
10. Nos casos controlados, mutar Fatura/boleto antes da última revalidação e confirmar zero chamada ao provider; repetir depois da revalidação e confirmar evento preservado, `needs_resend=true` e aviso de revisão.
11. Confirmar novamente que MISFY não foi acessado nem alterado.

## Gates do lote

- **Gate 1 — testes focais:** helpers, endpoint, Resend mockado, UI focal, migration consistency, pgTAP local, TypeScript e `git diff --check` verdes.
- **Gate 2 — revisão de segurança:** bearer/getUser, autorização interna da RPC definer, owner/`search_path`/EXECUTE, allowlist, segredo server-only, CAS/locks, cross-tenant, anon/member, Storage privado e logs sem PII.
- **Gate 3 — IURQ:** somente após aprovação, aplicar migration/configuração no IURQ; nunca no MISFY.
- **Gate 4 — QA manual do usuário:** envio real apenas à allowlist e validação dos dois anexos/histórico/reenvio/falhas.
- **Gate 5 — somente após aprovação:** stage apenas do Lote B, revisar diff, criar um único commit do lote e push da branch autorizada.

MISFY está fora. Nenhum merge ou deploy faz parte deste plano.

## Auto-revisão obrigatória antes de entregar o lote

- Mapear seções 8–15, 17–22 e critérios de aceite da spec às Tasks 1–10.
- Executar `rg -n "TO.DO|TB.D|FIX.ME"` sem os pontos nos arquivos modificados e exigir saída vazia.
- Conferir consistência de `BillingSendRequest`, `BillingSendResult`, RPC e dependências entre testes/implementação.
- Confirmar que o lote só assume os campos/policies/eventos entregues pelo Lote A.
- Confirmar cobertura explícita da matriz de falhas A–H, das intercalações A–J, da idempotência K–N e da janela de 24 horas.
- Confirmar que não existe fingerprint em SQL, tipo persistido, evento ou tabela.
- Confirmar que `expected_content_revision` existe somente na tentativa/RPC; o evento não guarda revision, e primeiro envio/reenvio passam pelo mesmo CAS revision+pending.
- Confirmar que a Fatura tem um único render e esse buffer exato chega ao provider; a última revalidação compara revision/pending, conteúdo canônico reconstruído sem segundo PDF e nova leitura/hash do boleto imediatamente antes do Resend, sem guarda pós-provider.
- Confirmar que canonicalização seleciona apenas `RentalInvoiceDocumentContent`, fixa propriedade/array/row/null/datas/números e não usa serialização ingênua de objeto; payments/`financialStatus` ficam fora.
- Confirmar que a leitura de `billing_lines` usa ordem total `created_at ASC, id ASC` na preparação e revalidação; snapshot, conteúdo, `tableRows`, PDF e guarda preservam essa sequência, o teste cobre timestamps empatados sem falso conflito e nenhuma camada ordena somente o hash.
- Confirmar que a RPC é o único caminho de limpeza do latch: definer focal, autorização explícita, row lock, relações qualificadas, owner/`search_path`/EXECUTE endurecidos e nenhuma escrita direta nos campos internos.
- Confirmar caminhos disjuntos na RPC: evento novo pode aplicar CAS; replay existente somente valida payload, reconcilia `sent_at` monotonicamente e preserva `needs_resend`, inclusive no retry antigo depois de mudança.
- Confirmar que payments não aciona `needs_resend` nem a guarda.
- Confirmar ausência de service role, secret no browser, public URL, fila, webhook, ledger e background job.
- Confirmar que nenhum passo toca MISFY ou faz commit antes dos Gates 1–4.
- Executar `git diff --check` e `git status --short`; revisar escopo antes de qualquer aprovação de commit.

## Cobertura spec → plano

- Resend/configuração/allowlist: Tasks 1, 3, 6 e 7.
- Auth bearer/RLS sem service role: Tasks 2, 5, 6 e 7.
- Mesma Fatura com render único/canonicalização, boleto privado com hash de bytes e pending: Task 4 e cenários G/H da Task 6.
- Destinatários, remetente, assunto e corpo: Tasks 3 e 8.
- Idempotência novo-vs-replay, CAS/finalização, falhas A–H e intercalações A–N: Tasks 5 e 6.
- Modal, reenvio, histórico e página mensal: Tasks 8–10.
- Segurança negativa e QA real restrito: Tasks 5–7, gates e seção de QA.

## Ambiguidades técnicas preservadas, sem ampliar escopo

- UUID v4 não carrega idade e não existe ledger persistente; após perda do resultado e da memória do browser, o backend não consegue provar que uma intenção sem evento está dentro de 24 horas. A versão permanece fail-closed e exige verificação manual antes de novo envio.
- `billing_delivery_events` é histórico operacional. Com credencial do caller e sem segredo no banco, Postgres não prova criptograficamente que um provider ID veio do Resend; RLS/ACL ainda bloqueiam cross-tenant e escalada.
- Evento antigo não guarda anexos/fingerprint; uma reconciliação posterior preserva `needs_resend` quando não puder provar que o conteúdo atual corresponde ao enviado.
- `content_revision` não é histórico nem identifica bytes antigos; somente serializa a geração corrente. Pending de boleto sem finish não expira nem é limpo automaticamente: o reparo reutiliza a operação conhecida do Lote A antes de novo envio.
- `@react-pdf/renderer` pode variar bytes de trailer entre renders semanticamente iguais. O plano não tenta tornar o PDF determinístico: produz um buffer uma vez, guarda semanticamente o conteúdo que o gerou e envia aquele mesmo buffer.
