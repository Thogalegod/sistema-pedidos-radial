# Especificação técnica — Boleto e envio de cobranças por Resend

**Data:** 19/08/2026

**Status:** desenho final para revisão; implementação não iniciada

**Escopo desta entrega:** especificação somente

**Branch/HEAD de referência:** `codex/controle-locacoes` em `4b4ed10d603f8f088323e6e51ab8b54743656c70`

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

### 4.2 Policies sem novo `SECURITY DEFINER`

As policies novas devem preferir um `EXISTS` direto sobre a própria linha de membership de `(select auth.uid())`. As policies atuais de `organization_members` permitem que o usuário leia a própria membership; portanto, a checagem financeira pode ser resolvida sem novo helper `SECURITY DEFINER`.

Se a implementação provar, por teste real, que a avaliação cruzada de RLS impede essa abordagem, qualquer exceção deverá ser justificada antes de implementada. Um eventual helper deverá:

- ficar com `search_path` fixo e referências qualificadas;
- verificar `auth.uid() IS NOT NULL` internamente;
- aplicar o predicado exato `admin OR can_manage_billing` e o tenant informado;
- revogar `EXECUTE` de `PUBLIC`, `anon` e qualquer papel não necessário;
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
```

Semântica:

- `sent_at`: instante do evento de envio bem-sucedido mais recente;
- `needs_resend=false`: o conteúdo atual da cobrança/boleto corresponde ao último envio, ou a cobrança nunca foi enviada;
- `needs_resend=true`: houve mudança relevante depois do último envio;
- uma mudança relevante nunca apaga `sent_at`.

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
- em `SELECT/UPDATE`, linha correspondente em `contract_documents` com `kind='boleto'`, mesmo tenant, contrato, ciclo e `storage_path`;
- em `INSERT/UPDATE`, metadata MIME `application/pdf` e extensão `.pdf`.

Não transformar o bucket em público, não criar signed URL permanente e não reutilizar a policy de leitura geral dos demais documentos para boleto.

### 6.3 Policies de `contract_documents`

As policies gerais atuais de `contract_documents` permitem member da organização ler/inserir qualquer `kind`. Apenas adicionar `boleto` ao `CHECK` faria member comum herdar acesso indevido. A migration futura deve:

1. substituir/refinar as policies gerais atuais para que elas se apliquem a `kind <> 'boleto'`, preservando exatamente o comportamento vigente dos outros kinds;
2. adicionar policies `SELECT` e `INSERT` exclusivas de boleto com o predicado financeiro;
3. manter a ausência de privilégio efetivo de `UPDATE/DELETE` para documentos;
4. provar por testes que NF de remessa e comprovantes não ganharam nem perderam acesso acidentalmente.

### 6.4 Anexar, abrir e substituir

No primeiro anexo:

1. validar PDF e tamanho no cliente para UX;
2. revalidar por policy/metadata;
3. enviar para o path determinístico;
4. inserir a única linha `contract_documents kind='boleto'`;
5. em falha do insert, reconciliar objeto órfão de modo restrito, sem habilitar exclusão normal de boletos.

Ao abrir, gerar URL assinada curta somente depois do `SELECT` autorizado.

Na substituição:

1. confirmar que a linha e o objeto pertencem ao ciclo/contrato/tenant;
2. validar o novo PDF;
3. sobrescrever o mesmo path;
4. se já houve envio, marcar `needs_resend=true` sem limpar `sent_at`;
5. só mostrar sucesso depois de overwrite e marcação concluídos.

Se o overwrite funcionar e a atualização de `needs_resend` falhar, retornar falha parcial explícita e manter uma ação idempotente de reparo. Repetir a mesma substituição no mesmo path é seguro. Um envio que já esteja em preparação compara novamente o conteúdo imediatamente antes da finalização e não pode limpar `needs_resend` se detectar a substituição concorrente.

## 7. `needs_resend`

### 7.1 Mudanças relevantes

Depois de ao menos um envio bem-sucedido, devem marcar `needs_resend=true`:

- em `billing_cycles`: `period_start`, `period_end`, `issue_date`, `due_date`, `base_amount`, `discount_amount`, `surcharge_amount`, `exemption_amount`, `total_amount`, `document_type`, `document_number` e `notes` quando efetivamente mudarem;
- `INSERT`, `UPDATE` ou `DELETE` de `billing_lines` da cobrança;
- mudanças em campos de contrato, cliente ou obra usados por `RentalInvoiceSnapshot`, quando o fluxo de edição permitir que atinjam uma cobrança já enviada;
- substituição dos bytes do boleto.

Embora `RentalInvoiceSnapshot` hoje carregue `financialStatus` calculado com `payments`, `RentalInvoiceDocument` não renderiza pago, saldo, status de pagamento nem status interno. Portanto, alterações em `payments` **não** marcam `needs_resend` e **não** entram na guarda de concorrência desta versão. A regra é sempre o conteúdo efetivamente renderizado, não a presença de um campo intermediário no snapshot.

Não marcam `needs_resend`:

- atualização de `sent_at`;
- atualização do próprio `needs_resend`;
- mudança de campo que não entra na Fatura nem no boleto;
- simples abertura/download;
- mudança de contatos/destinatários, pois destinatários são recalculados em cada envio e não alteram a Fatura.

### 7.2 Invariantes de banco e propagação controlada

Para `billing_cycles`, usar trigger específico que compare apenas as colunas relevantes com `IS DISTINCT FROM`. Para `billing_lines`, usar trigger específico por operação que marque somente o ciclo pai e apenas se ele já possui envio. Não usar trigger genérico baseado em qualquer `UPDATE`, pois a própria finalização atualiza `sent_at`.

Para entidades compartilhadas como cliente/obra/contrato, evitar trigger global que atualize indiscriminadamente todas as cobranças. Os mutators atuais que alterarem campos efetivamente renderizados devem propagar `needs_resend` para cobranças enviadas afetadas, com testes focais.

Durante uma tentativa de envio, calcular uma guarda efêmera a partir dos bytes da Fatura efetivamente renderizada e dos bytes do boleto preparados. Recalcular imediatamente antes da finalização. Essa guarda existe exclusivamente para detectar alteração entre preparação e finalização.

Ela não é fonte de verdade, versão da Fatura, snapshot histórico, versão do boleto nem substituto de `needs_resend`. Não persisti-la em evento, documento ou nova tabela.

Após um envio aceito:

- atualizar `sent_at` para o instante do novo evento;
- limpar `needs_resend` somente se a guarda efêmera confirmar que Fatura e boleto continuam iguais aos preparados;
- se houve edição concorrente durante o envio, não associar o sucesso ao conteúdo novo: registrar/reconciliar o sucesso externo com segurança, atualizar `sent_at` quando confirmado e manter `needs_resend=true`; a UI solicita revisão e nova tentativa deliberada.

UI: `Alterada após o último envio — reenviar cobrança.`

## 8. Geração da Fatura

A Fatura continua gerada sob demanda. Não salvar PDF no Storage nem criar segunda implementação visual.

No Route Handler:

1. carregar os mesmos dados atualmente usados por `getBillingRentalInvoice` no contexto RLS do usuário;
2. montar o mesmo `RentalInvoiceSnapshot` com `buildRentalInvoiceSnapshot`/`getBillingRentalInvoice`;
3. renderizar o mesmo `RentalInvoiceDocument` no servidor com a API server-side de `@react-pdf/renderer`, produzindo `Buffer` em memória;
4. anexar com `filename = snapshot.fileName` e conteúdo em memória.

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
5. validar a linha e o objeto privado do boleto;
6. obter o snapshot atual da Fatura;
7. gerar o PDF da Fatura em memória;
8. baixar os bytes do boleto privado;
9. calcular a guarda efêmera dos dois anexos preparados;
10. enviar um único e-mail pelo Resend para todos os destinatários em `To`;
11. exigir e capturar `provider_message_id`;
12. recalcular a guarda com o conteúdo autoritativo imediatamente antes de finalizar;
13. persistir/reconciliar o `billing_delivery_event` e atualizar `billing_cycles.sent_at`; limpar `needs_resend` somente se não houve mudança concorrente;
14. retornar sucesso atual ou aviso de conteúdo alterado que exige revisão/nova tentativa.

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
- mesmo ID com cobrança, destinatários, mensagem ou anexos diferentes é conflito e não é reenviado;
- `sent_at` é calculado a partir do evento de sucesso mais recente, nunca do clique.
- a guarda efêmera de concorrência existe apenas dentro da tentativa em curso e nunca é usada para comparar ou versionar eventos históricos.

Antes de chamar o Resend, o handler procura evento pelo `send_request_id` dentro do contexto autorizado:

- se não existe, continua o envio;
- se existe e pertence ao mesmo ciclo/tenant, não chama o Resend e executa somente reconciliação do resumo;
- se existe com conteúdo incompatível, responde `409`.

### 11.2 Finalização atômica

Preferir uma função SQL `SECURITY INVOKER`, transacional e idempotente para:

1. bloquear/carregar o ciclo do tenant;
2. inserir o evento com `ON CONFLICT (send_request_id)` controlado;
3. verificar que um conflito existente representa a mesma cobrança e o mesmo sucesso;
4. calcular o evento mais recente do ciclo;
5. atualizar `billing_cycles.sent_at` para esse instante;
6. aplicar a decisão de concorrência produzida no fluxo atual: limpar `needs_resend` somente quando o conteúdo permaneceu estável; caso contrário, mantê-lo `true`;
7. retornar o estado reconciliado.

A função continua sujeita aos grants e às policies RLS do caller; `SECURITY INVOKER` não contorna autorização. Revogar explicitamente o `EXECUTE` padrão de `PUBLIC`/`anon` e conceder somente a `authenticated`, mantendo nomes qualificados e `search_path` fixo por defesa em profundidade. Dentro da função, todas as linhas continuam tenant-scoped e exigem `admin OR can_manage_billing`; a função não pode permitir cross-tenant nem escalada de privilégio.

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
5. preserva `needs_resend` em modo fail-closed; evento histórico não contém fingerprint nem autoriza concluir que o conteúdo atual é o enviado;
6. retorna sucesso idempotente quando o resumo estiver consistente, ou solicita revisão se a atualidade do conteúdo não puder ser provada dentro da tentativa original.

Essa lógica também impede que retry de evento antigo faça `sent_at` regredir depois de um reenvio mais recente.

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

Manter `src/app/contratos-locacoes/cobrancas/page.tsx`. `BillingTable` pode mostrar discretamente:

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
| edição concorrente durante envio | guarda efêmera dos bytes renderizados + boleto; não associar sucesso ao conteúdo novo e manter `needs_resend=true` se houver mudança |
| exposição por URL | bucket privado e signed URL curta, sem URL pública permanente |
| HTML injection na mensagem | escapar conteúdo livre; gerar também versão texto |
| vazamento em logs | não registrar token, anexos, corpo ou destinatários completos; usar IDs técnicos sem PII |
| ampliação acidental de ACL | grants mínimos, policies por kind, testes negativos de NF/comprovante/anon/member |

O envio conjunto em `To` expõe os endereços entre os destinatários. Isso é uma decisão funcional aprovada e deve ser comunicado no modal se necessário; não substituir por BCC silenciosamente.

## 16. Lote A — banco, permissões e boleto

Escopo implementável e aprovável isoladamente:

1. migration com `can_manage_billing` e `needs_resend`;
2. `kind='boleto'`, checks, invariante documento/ciclo/contrato/organização pelo mecanismo mais simples confirmado no schema e índice único parcial;
3. `billing_delivery_events` pode ser criada estruturalmente aqui, ainda sem envio;
4. RLS/grants mínimos e refinamento das policies gerais de `contract_documents`;
5. policies Storage exclusivas de boleto para `SELECT/INSERT/UPDATE`;
6. tipos e queries do boleto/permissão;
7. upload, abrir e substituir no detalhe;
8. estados visuais ligados ao boleto;
9. invariantes estruturais de `needs_resend` para ciclos/linhas e substituição;
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
10. idempotência, finalização e reconciliação;
11. `sent_at`/`needs_resend`;
12. histórico no card;
13. indicadores discretos na página mensal;
14. testes focais e QA real apenas no IURQ/allowlist.

Critério de separação: nenhuma mudança ou configuração no MISFY; nenhum merge/deploy automático.

## 18. Estratégia de testes

### 18.1 Migration, grants e RLS

- `can_manage_billing` é `NOT NULL DEFAULT false`;
- `needs_resend` é `NOT NULL DEFAULT false`;
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
- função de finalização, se criada, é invoker, ACL mínima e não executável por `PUBLIC`/`anon`.

### 18.2 Storage

- path exato autorizado;
- path de outro tenant/contrato/ciclo bloqueado;
- pasta/nome adulterado bloqueado;
- upload PDF até 10 MB permitido;
- MIME não PDF bloqueado mesmo com extensão `.pdf`;
- primeiro upload permitido a admin/financeiro;
- upsert permitido a admin/financeiro;
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
- guarda efêmera muda com bytes renderizados da Fatura ou boleto e não é persistida;
- alteração em `payments` não muda a guarda enquanto `RentalInvoiceDocument` não renderizar pago, saldo ou status.

### 18.4 `needs_resend`

- cobrança nunca enviada continua false em criação/edição normal;
- cada coluna relevante do ciclo marca true depois de envio;
- update apenas de `sent_at`/flag não marca true;
- insert/update/delete de linha marca true;
- alteração em `payments` não marca true nesta versão;
- mudança irrelevante não marca;
- boleto substituído marca true;
- `sent_at` não é apagado;
- envio bem-sucedido atual limpa false;
- edição concorrente durante envio mantém true.

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
- falha do Resend não cria evento nem altera ciclo;
- sucesso cria evento, atualiza `sent_at` e trata `needs_resend`;
- mudança concorrente após preparação não é associada ao sucesso antigo, mantém `needs_resend` e solicita revisão;
- retry técnico não duplica;
- evento existente repara ciclo sem chamar Resend;
- reenvio intencional cria segundo evento e atualiza `sent_at`;
- resposta sem `data.id` é falha, não sucesso;
- conflito de payload com mesma chave retorna `409`.

### 18.6 UI

- quatro estados do card;
- controles ocultos para não autorizado;
- modal com padrões, extras, allowlist e mensagem;
- duplo clique não cria nova tentativa;
- resumo do último evento;
- histórico mais recente primeiro;
- IDs técnicos ocultos;
- página mensal mantém navegação e apenas indicadores discretos.

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

Referências oficiais verificadas em 19/08/2026:

- Resend — Send Email: <https://resend.com/docs/api-reference/emails/send-email>
- Resend — Idempotency Keys: <https://resend.com/docs/dashboard/emails/idempotency-keys>
- Resend — Attachments: <https://resend.com/docs/dashboard/emails/attachments>
- Resend — Create API key: <https://resend.com/docs/api-reference/api-keys/create-api-key>
- Supabase — Storage Access Control: <https://supabase.com/docs/guides/storage/security/access-control>
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
18. a invariante documento/ciclo/contrato/organização ser garantida pelo mecanismo mais simples confirmado no schema;
19. RLS, Storage e integridade do banco/fluxo protegido bloquearem anon, member comum e cross-tenant;
20. NF de remessa, comprovantes e demais documentos não receberem novos privilégios;
21. nenhum segredo Resend chegar ao browser ou Git;
22. Lote A e Lote B puderem ser testados/aprovados separadamente;
23. nenhum acesso/configuração/migration ocorrer no MISFY sem etapa futura explícita.

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
- `src/lib/contratos-locacoes/types.ts` — `can_manage_billing`, `needs_resend`, `boleto` e `BillingDeliveryEvent`;
- `src/lib/contratos-locacoes/queries.ts` — boleto, contatos, permissão, eventos e indicadores da lista;
- `src/lib/contratos-locacoes/mutations.ts` — remover `markBillingCycleSent` manual e propagar `needs_resend` nos mutators relevantes;
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
3. **O snapshot possui campos não renderizados.** `RentalInvoiceSnapshot` hoje inclui `financialStatus` derivado de `payments`, mas `RentalInvoiceDocument` não o usa. `needs_resend` e a guarda efêmera consideram somente o conteúdo renderizado e o boleto; pagamentos ficam explicitamente fora.
4. **Mudanças em entidades compartilhadas podem alterar a Fatura.** Apenas campos de cliente, obra e contrato efetivamente renderizados devem marcar reenvio. A guarda efêmera protege a janela da tentativa, sem virar fonte de verdade ou versão histórica.
5. **Overwrite de Storage não participa da mesma transação do Postgres.** A substituição deve ser idempotente, só confirmar sucesso após marcar `needs_resend` e reparar explicitamente falhas parciais; uma tentativa em curso detecta a mudança antes de finalizar.

Esses pontos não mudam as decisões funcionais aprovadas e devem ser avaliados na revisão desta spec antes do plano do Lote A.
