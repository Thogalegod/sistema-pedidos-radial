# Handoff - Contratos e Locações - diagnóstico da data e QA do anexo da NF

## Objetivo

Diagnosticar a validação de `start_date` no formulário de contrato e retomar o QA funcional do anexo de NF de remessa no Supabase dev/homolog `misfyiznwnuvldoccciw`.

## O que foi feito

- Reproduzido o cenário em `http://localhost:3001`.
- Confirmado que preencher `input[type=date]` por atribuição/automação de valor visível não atualizava o estado React: o DOM mostrava `2026-07-17`, mas o schema ainda recebia `start_date` vazio.
- Confirmado que a interação por teclado (`click`, selecionar/apagar, digitar e `Tab`) atualiza o estado corretamente; o submit avançou para a próxima validação da NF e preservou `start_date = '2026-07-17'`.
- Adicionados testes focais positivo e negativo ao `ContractForm`.
- Criada a locação de QA `#6`, com NF de remessa e início `2026-07-17`.
- Anexado o PDF inofensivo `qa-remittance-nf-20260717.pdf`.
- Confirmados abrir/baixar, recarga e reabertura do contrato com o arquivo persistido.

## Arquivos alterados nesta etapa

- `src/components/contratos-locacoes/ContractForm.test.tsx`
- `docs/handoffs/2026-07-17-contratos-locacoes-diagnostico-data-qa-anexo.md`

Não houve alteração de código de produção nesta etapa. O `ContractForm.tsx` já possuía mudanças locais anteriores e foi somente inspecionado.

## Testes rodados

- `rtk npx vitest run src/components/contratos-locacoes/ContractForm.test.tsx` — 9 testes passaram.
- `rtk npx tsc --noEmit` — sem erros.
- `rtk npx vitest run src/lib/contratos-locacoes src/components/contratos-locacoes` — 24 arquivos e 130 testes passaram.
- `rtk npm test` — 26 arquivos e 134 testes passaram.
- `git diff --check` — saída 0; somente avisos preexistentes de conversão LF/CRLF.

## Diagnóstico e decisão

O caso é **artefato de automação**, não bug do formulário.

- O handler de `ContractForm` mantém `start_date` em `draft` e envia `parsed.data` ao `onSubmit`.
- O schema exige `z.string().trim().min(1, 'Data de início é obrigatória')`.
- O teste focal confirma que os eventos `input`, `change` e `blur` preservam `start_date = '2026-07-17'` no payload e que data vazia ainda exibe a mensagem obrigatória.
- Não há patch de produção nem commit nesta etapa.

## QA do anexo

- Contrato QA: `#6`, locação ativa com NF habilitada.
- Arquivo exibido no detalhe: `qa-remittance-nf-20260717.pdf`.
- A ação `Abrir/Baixar` funcionou por URL temporária, sem expor a URL no relatório.
- Após atualizar e reabrir pela lista, o mesmo arquivo continuou disponível.
- A UI exibe apenas `Abrir/Baixar` e a mensagem de que substituição/remoção será etapa futura.
- O bucket é `contratos-locacoes-docs`, confirmado como privado pela migration aplicada.
- O registro `contract_documents` é limitado a um `remittance_nf` por organização/contrato pelo índice único da migration; o upload único do QA persistiu com caminho no formato `<organization_id>/<contract_id>/remittance_nf/<timestamp>-qa-remittance-nf-20260717.pdf`.

## Riscos e cuidados

- Não alterar nem reaplicar `supabase/migrations/202607081700_add_contract_remittance_document_support.sql`.
- O hash confirmado da migration nesta etapa foi `92bab51051a40511bc012f44bf7d7d0a6130989d`.
- Não fazer cleanup manual do registro/objeto de QA sem autorização explícita.

## Próximo passo recomendado

Nenhuma ação pendente para este diagnóstico. Em uma nova etapa, tratar os commits planejados anteriormente de forma separada, sem incluir o diagnóstico de automação em commit de produção.

## Branch e operações externas

- Branch: `codex/contratos-locacoes-fundacao`.
- Nenhum commit, push, deploy ou nova migration nesta etapa.
- Produção não foi acessada.
