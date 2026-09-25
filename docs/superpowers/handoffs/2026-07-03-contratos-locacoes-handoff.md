# Handoff — Contratos e Locações

**Data da reconstrução:** 03/07/2026
**Branch local inspecionada:** `codex/planejamento-contratos-locacoes`
**Base remota:** `origin/codex/planejamento-contratos-locacoes`
**Estado Git no início da reconstrução:** branch local quatro commits à frente do remoto; nenhum arquivo rastreado modificado fora desses commits
**Escopo deste handoff:** reconstrução documental somente; nenhuma regra, migration ou UI foi alterada

## 1. Objetivo geral

Construir o módulo **Contratos e Locações** como um núcleo comum para clientes, obras, contatos, contratos recorrentes, cobranças, documentos e auditoria, com uma extensão específica para equipamentos locados, entrega, devolução parcial, vistorias, fotos, assinaturas e trabalho offline.

A primeira versão deve atender locações, gestão de energia e outros serviços recorrentes, sem implementar estoque completo, financeiro geral, boletos, emissão fiscal, envio automático ou permissões detalhadas.

## 2. Documentos e arquivos principais encontrados

### Encontrados

- `docs/superpowers/specs/2026-07-03-contratos-locacoes-design.md`: especificação funcional aprovada.
- `docs/superpowers/plans/2026-07-03-contratos-locacoes.md`: plano de implementação com 15 tarefas em 6 fases.
- `package.json`: dependências e scripts de teste já atualizados.
- `package-lock.json`: lockfile atualizado pelas dependências da Task 1.
- `vitest.config.ts`: Vitest configurado com `jsdom`, alias `@` e exclusão de `.worktrees/**`.
- `src/test/setup.ts`: importa `@testing-library/jest-dom/vitest`.
- `src/lib/contratos-locacoes/`: tipos, regras puras e testes.
- `supabase/migrations/202607030001_contracts_rentals_core.sql`: migration SQL do núcleo relacional e RLS.

### Não encontrados

- `task.md`: inexistente na raiz durante a inspeção.
- `walkthrough.md`: inexistente na raiz durante a inspeção.

## 3. O que já foi concluído

### Planejamento

- Especificação funcional concluída e presente na branch remota.
- Plano detalhado concluído e presente na branch remota.

### Task 1 — infraestrutura de testes e dependências

Commits locais:

- `42dd63d test: prepara modulo de contratos e locacoes`
- `e4fdf32 test: exclude worktrees from Vitest runs`

Implementado:

- scripts `test` e `test:watch`;
- dependências previstas para banco local, validação, offline, PDF e importação;
- Vitest com ambiente `jsdom`;
- Testing Library/Jest DOM;
- teste de fumaça;
- exclusão de worktrees da descoberta de testes.

### Task 3 do plano — regras puras de domínio

Commit local:

- `4e57ee4 feat: define regras de cobranca e ciclo contratual`

Implementado:

- tipos TypeScript das entidades planejadas;
- cálculo de período e classificação de alertas;
- cálculo e formatação de valores em centavos;
- geração e validação do número curto de recibo;
- transições de contrato e item;
- elegibilidade básica para encerramento;
- testes unitários dessas regras.

### Task 2 do plano — migration inicial

Commit local:

- `4fe9cd4 feat: cria modelagem do banco de dados (esquema e RLS)`

Implementado no arquivo SQL, mas **não confirmado em nenhum banco**:

- enums do domínio;
- 17 tabelas;
- índices e restrições;
- triggers de `updated_at`;
- geração de número interno;
- função `is_organization_member`;
- ativação de RLS nas 17 tabelas;
- policies iniciais;
- seed da organização `Radial Energia` sem associar usuários.

### Ainda não concluído

- schemas Zod, consultas e mutações;
- RPCs transacionais;
- cadastro de clientes, obras e contatos;
- telas de contratos, locações, cobranças e painel;
- vistorias, Storage, fotos, assinatura e fila offline;
- PDFs;
- importação de planilhas;
- integração com o Hub;
- testes de integração, RLS e mobile;
- manual operacional e liberação.

## 4. Lista exata de arquivos criados ou modificados

Diferença entre `origin/codex/planejamento-contratos-locacoes` e o `HEAD` local no momento da inspeção:

### Modificados

- `package.json`
- `package-lock.json`

### Criados

- `vitest.config.ts`
- `src/test/setup.ts`
- `src/lib/contratos-locacoes/smoke.test.ts`
- `src/lib/contratos-locacoes/types.ts`
- `src/lib/contratos-locacoes/dates.ts`
- `src/lib/contratos-locacoes/dates.test.ts`
- `src/lib/contratos-locacoes/money.ts`
- `src/lib/contratos-locacoes/money.test.ts`
- `src/lib/contratos-locacoes/numbering.ts`
- `src/lib/contratos-locacoes/numbering.test.ts`
- `src/lib/contratos-locacoes/transitions.ts`
- `src/lib/contratos-locacoes/transitions.test.ts`
- `supabase/migrations/202607030001_contracts_rentals_core.sql`

### Criado por esta reconstrução

- `docs/superpowers/handoffs/2026-07-03-contratos-locacoes-handoff.md`

Arquivos não rastreados e alheios a este módulo, como logs, `.superpowers/` e `.worktrees/`, não foram alterados nem incluídos nesta lista de implementação.

## 5. Comandos de validação

Comandos autorizados e executados nesta reconstrução:

```powershell
npm test
npx tsc --noEmit
```

Resultado observado em 03/07/2026:

- `npm test`: **PASSOU** com 5 arquivos de teste e 41 testes aprovados; exit code 0; duração reportada de 2,46 s.
- `npx tsc --noEmit`: **PASSOU** sem diagnósticos; exit code 0.

Não foram executados `npm run build`, `npm run lint`, comandos Supabase ou comandos de deploy porque não fazem parte da autorização desta reconstrução.

## 6. Estado atual da migration SQL

- **Existe:** sim.
- **Caminho exato:** `supabase/migrations/202607030001_contracts_rentals_core.sql`.
- **Commit local que a introduziu:** `4fe9cd4`.
- **Aplicada em banco local:** **não confirmado**.
- **Aplicada em banco remoto/desenvolvimento:** **não confirmado**.
- **Aplicada em produção:** **não confirmado**.
- **Evidência encontrada:** somente o arquivo e o commit local; não existem `task.md`, `walkthrough.md`, relatório de migração ou outro registro que demonstre aplicação.

Este handoff não consultou nenhum Supabase e não executou a migration.

## 7. Próximo passo recomendado

Antes de continuar as telas ou aplicar qualquer SQL, realizar uma **revisão estática de segurança e consistência da migration**, acompanhada de testes SQL executados apenas em um Supabase local e descartável quando isso for autorizado.

Ordem recomendada:

1. corrigir os riscos de RLS e integridade multi-organização descritos abaixo;
2. tornar a migration segura para uma execução limpa e definir uma estratégia consciente para falha parcial/reexecução;
3. alinhar SQL, `types.ts`, `numbering.ts` e `transitions.ts`;
4. adicionar testes de migration/RLS em ambiente local descartável;
5. somente depois retomar a Task 4 do plano: schemas Zod, consultas e mutações.

## 8. Regras obrigatórias de segurança

O próximo agente deve obedecer a todas estas restrições até receber autorização expressa em sentido contrário:

- **não aplicar migration em produção**;
- **não executar `supabase db push`**;
- **não conectar no Supabase remoto**;
- **não alterar `.env`, `.env.local` ou variáveis de ambiente**;
- **não usar, exibir ou criar credenciais reais**;
- **não fazer deploy ou promover preview na Vercel**;
- **não importar, copiar para fixtures ou versionar dados reais de clientes**;
- não assumir que a migration foi aplicada;
- não usar service role para contornar RLS;
- não alterar regras de negócio sem retornar ao design aprovado.

## 9. Riscos conhecidos

### 9.1 RLS permissivo demais

As policies atuais concedem `SELECT`, `INSERT` e `UPDATE` de praticamente todas as entidades a qualquer membro da organização. Isso acompanha a decisão inicial de acesso amplo, mas permite que qualquer membro altere cobranças, pagamentos, documentos e auditoria. O risco deve ser aceito explicitamente ou reduzido com RPCs/roles antes de uso real.

A policy administrativa de `organization_members` usa `FOR ALL` e uma subconsulta sem aliases distintos para a linha externa e interna. A expressão `organization_id = organization_members.organization_id` pode ser resolvida de maneira ambígua ou tautológica. Ela deve ser reescrita com aliases claros e testada contra acesso entre organizações.

### 9.2 Tabela sem RLS

A inspeção estática encontrou `ENABLE ROW LEVEL SECURITY` para todas as 17 tabelas criadas pela migration. `import_rows` não possui `organization_id` e depende de subconsulta em `import_batches`; essa policy precisa de teste específico.

Não há evidência de teste efetivo das policies. Qualquer tabela adicionada posteriormente precisa entrar numa verificação que compare tabelas criadas com tabelas protegidas por RLS.

### 9.3 Função `is_organization_member`

A função usa `SECURITY DEFINER` e `SET search_path = public`, mas o arquivo não restringe explicitamente `EXECUTE` nem fixa uma estratégia de owner/privilege. Revisar `REVOKE/GRANT`, propriedade da função e proteção contra objetos maliciosos no schema `public`.

A organização inicial é criada, mas nenhum usuário é associado. Sem um fluxo administrativo seguro, usuários autenticados não terão acesso ao módulo.

### 9.4 DELETE em tabelas críticas

Não existem policies `DELETE` explícitas para `contracts`, `billing_cycles`, `payments`, `inspections`, `contract_documents` e `audit_events`, o que está alinhado ao requisito de cancelar/inativar em vez de apagar para usuários comuns.

Porém:

- `organization_members` usa `FOR ALL`, incluindo `DELETE`;
- `customer_sites`, `customer_contacts`, `rental_items`, `billing_lines`, `inspection_photos` e `signatures` possuem policy `DELETE` para qualquer membro;
- muitas FKs usam `ON DELETE CASCADE`, inclusive a partir de `organizations`;
- `contract_documents` referencia `contracts` com `ON DELETE CASCADE`.

Revisar quais exclusões devem ser substituídas por inativação e se evidências/fotos/assinaturas podem ser apagadas depois de vinculadas a uma vistoria concluída.

### 9.5 Compatibilidade entre SQL e `types.ts`

Enums e campos principais parecem alinhados por inspeção, mas não existe teste automatizado nem tipos gerados a partir do banco. Pontos que exigem validação:

- `bigint` monetário e `internal_number` estão representados como `number` no TypeScript;
- `numeric percentage_rate` está representado como `number`;
- campos nulos/não nulos precisam permanecer sincronizados;
- `ImportRow` não possui `organization_id`, acompanhando a tabela, e depende da integridade via batch;
- `Record<string, any>` em auditoria/importação reduz a segurança de tipos;
- FKs não garantem que pai e filho tenham o mesmo `organization_id`.

O último item é um risco multi-tenant importante: uma linha filha pode declarar uma organização permitida e referenciar um UUID de outra organização se esse UUID for conhecido. Usar constraints compostas, triggers ou RPCs validadas.

### 9.6 Compatibilidade com `transitions.ts`

Os valores de enum coincidem com a migration, mas as transições ainda existem somente no cliente/TypeScript. As policies permitem `UPDATE` direto de status, portanto o banco não impede transições inválidas.

Riscos específicos:

- `active -> closed` é permitido sem receber o tipo do contrato; uma locação pode tentar pular devolução/vistoria;
- `closing_requested`, `awaiting_return` e `inspection` permitem chegar a `closed` sem integração obrigatória com `canCloseRental`;
- `canCloseRental([])` retorna `true`, embora uma locação deva possuir pelo menos um item;
- estados resolvidos podem voltar a `rented`, mas ainda não existe requisito de justificativa/auditoria para essa correção;
- não existem RPCs transacionais que imponham a máquina de estados no banco.

### 9.7 Numeração e concorrência

`set_contract_internal_number` usa `max(internal_number) + 1` sem lock e sem índice único por organização. Duas criações simultâneas podem receber o mesmo número.

`numbering.ts` aceita seis caracteres alfanuméricos, enquanto o plano descreve referência de seis dígitos. Alinhar a regra aprovada antes de criar documentos reais.

### 9.8 Reexecução e falha parcial da migration

As tabelas e índices usam em parte `IF NOT EXISTS`, mas enums, triggers e policies não são idempotentes. Uma execução parcial seguida de nova tentativa pode falhar. A migration deve ser tratada como uma unidade transacional limpa e testada do zero; não tentar corrigir um banco remoto manualmente.

### 9.9 Auditoria forjável

Qualquer membro pode inserir em `audit_events` informando livremente `actor_user_id`, `old_values` e `new_values`. A auditoria precisa ser produzida por triggers/RPCs confiáveis e deve amarrar o ator a `auth.uid()`.

## 10. Checklist para o próximo agente

- [ ] Ler `AGENTS.md`, a especificação, o plano e este handoff.
- [ ] Confirmar a branch e revisar os quatro commits locais ainda não enviados.
- [ ] Não aplicar a migration nem conectar a Supabase remoto.
- [ ] Reproduzir `npm test` e `npx tsc --noEmit` antes de alterar arquivos.
- [ ] Revisar todas as tabelas versus RLS e escrever testes multi-organização.
- [ ] Corrigir a policy administrativa de `organization_members` com aliases e escopo explícitos.
- [ ] Revisar `SECURITY DEFINER`, ownership e `REVOKE/GRANT` de `is_organization_member`.
- [ ] Garantir que FKs não permitam referências entre organizações.
- [ ] Revisar DELETE e cascatas em dados financeiros, operacionais e evidências.
- [ ] Tornar a numeração interna segura sob concorrência.
- [ ] Alinhar SQL e `types.ts`, preferencialmente com tipos gerados/testados.
- [ ] Alinhar `numbering.ts` com a regra de seis dígitos.
- [ ] Levar as transições para RPCs transacionais e impedir fechamento indevido de locação.
- [ ] Validar a migration somente em ambiente local descartável e apenas quando houver autorização.
- [ ] Depois da revisão de segurança, retomar a Task 4 do plano.
- [ ] Manter dados reais fora de fixtures, logs, commits e importações.

## 11. Observações de Git e continuidade

No início desta reconstrução, os quatro commits de implementação estavam somente na branch local, à frente de `origin/codex/planejamento-contratos-locacoes`. Este handoff não fez push, merge, rebase, deploy ou commit.

Antes de qualquer integração futura, comparar novamente:

```powershell
git status -sb
git log --oneline origin/codex/planejamento-contratos-locacoes..HEAD
git diff --name-status origin/codex/planejamento-contratos-locacoes..HEAD
```
