# Handoff - Contratos e Locações - Empresa do contrato

## Objetivo
Adicionar o campo `Empresa` em contratos, com opções `Fontes` e `Radial`, e manter NF de remessa/Transporte visíveis só para `Locação`, com a emissora da NF espelhando a empresa do contrato.

## O que já foi feito
- Adicionado `contract_company` nos tipos e schema do módulo.
- Atualizado o formulário para exibir `Empresa` em `Dados centrais` para todos os tipos.
- Atualizado o formulário para espelhar a empresa escolhida no campo `Empresa emissora` quando `Locação` + NF = `Sim`.
- Atualizado o detalhe para exibir `Empresa` sempre e `Empresa emissora` como `Fontes`/`Radial`.
- Criada migration local nova para `contract_company` com `CHECK` restritivo.
- Atualizados testes do módulo e de componentes para o novo comportamento.

## Arquivos alterados
- `src/lib/contratos-locacoes/types.ts`
- `src/lib/contratos-locacoes/schemas.ts`
- `src/lib/contratos-locacoes/mutations.ts`
- `src/lib/contratos-locacoes/company.ts`
- `src/components/contratos-locacoes/ContractForm.tsx`
- `src/components/contratos-locacoes/ContractSummary.tsx`
- `src/components/contratos-locacoes/ContractForm.test.tsx`
- `src/components/contratos-locacoes/ContractSummary.test.tsx`
- `src/lib/contratos-locacoes/contracts.test.ts`
- `src/lib/contratos-locacoes/contracts-mutations.test.ts`
- `src/lib/contratos-locacoes/migration-consistency.test.ts`
- `src/lib/contratos-locacoes/receipt.test.ts`
- `src/lib/contratos-locacoes/pdf/ReceiptDocument.test.tsx`
- `src/lib/contratos-locacoes/billing-mutations.test.ts`
- `supabase/migrations/202607081500_add_contract_company_field.sql`

## Testes rodados
- `npx vitest run src/lib/contratos-locacoes/contracts.test.ts src/components/contratos-locacoes/ContractForm.test.tsx src/components/contratos-locacoes/ContractSummary.test.tsx src/lib/contratos-locacoes/migration-consistency.test.ts src/lib/contratos-locacoes/contracts-mutations.test.ts src/lib/contratos-locacoes/receipt.test.ts src/lib/contratos-locacoes/pdf/ReceiptDocument.test.tsx`
- `npx vitest run src/lib/contratos-locacoes src/components/contratos-locacoes`

## Resultado dos testes
- Suíte do recorte do módulo passou.
- Suíte completa do módulo passou: `22` arquivos, `106` testes.

## O que falta fazer
- Aplicar a migration no Supabase dev/homolog quando houver nova aprovação.
- Depois disso, validar no app se a persistência do campo novo continua batendo com a UI.

## Decisões tomadas
- `contract_company` ficou como `text not null default 'fontes'`.
- `CHECK` restringe os valores para `fontes` e `radial`.
- `Empresa emissora` não é editável manualmente nessa etapa.
- O texto da emissora da NF passa a ser `Fontes` ou `Radial`, não nome legal completo.

## Riscos / cuidados
- O CLI do Supabase não estava disponível localmente sem download via `npx`, e a tentativa de leitura do estado remoto foi bloqueada pela aprovação do ambiente.
- Não houve aplicação de migration, db push, commit, push ou deploy.

## Próximo passo exato recomendado
- Aprovar e aplicar a migration `supabase/migrations/202607081500_add_contract_company_field.sql` no projeto dev/homolog `misfyiznwnuvldoccciw`.

## Branch / estado
- Branch atual não alterada nesta etapa.
- Nenhum commit, push, deploy ou migration aplicada.
