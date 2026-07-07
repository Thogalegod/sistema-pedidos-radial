# Estado atual do projeto

Última atualização manual deste arquivo: 2026-07-07

## Objetivo deste arquivo

Dar contexto rápido para qualquer agente continuar o projeto sem depender do histórico inteiro do chat.

## Módulos em foco no momento

### 1. Termografia

Este foi o módulo mais recentemente trabalhado e já teve correções implementadas, testadas, enviadas ao GitHub e publicadas em produção.

#### Correções já feitas

- correção do preview das fotos na termografia;
- correção do fluxo de marcar componentes na foto digital;
- inclusão de rascunho local simples para reduzir perda ao sair ou voltar do navegador;
- ajuste do marcador para trabalhar com um único círculo vermelho redimensionável/reposicionável;
- correção do salvamento de imagens anotadas/recortadas/substituídas usando versionamento de nomes de arquivo, evitando erro de overwrite e problemas com RLS.

#### Arquivos já alterados na termografia

- `src/app/termografia/nova/page.tsx`
- `src/app/termografia/[id]/page.tsx`
- `src/components/termografia/PhotoAnnotationDialog.tsx`
- `src/components/termografia/PhotoAnnotationDialog.test.tsx`
- `src/hooks/useTermografiaDraft.ts`
- `src/hooks/useTermografiaDraft.test.tsx`
- `src/hooks/geracao-relatorio.test.tsx`
- `src/lib/termografia/draft.ts`
- `src/lib/termografia/draft.test.ts`
- `src/lib/termografia/images.ts`
- `src/lib/termografia/images.test.ts`

#### Validação já confirmada

- `npm test` passou na etapa de correção da termografia;
- `npx tsc --noEmit` passou na etapa de correção da termografia.

#### Git e deploy da termografia

- branch usada: `codex/termografia-correcoes-20260706`
- commit já feito: `5b747c9`
- mensagem do commit: `fix: corrige preview, marcação e rascunho da termografia`
- push para GitHub: confirmado
- deploy em produção: confirmado
- produção publicada em: [https://sistema-pedidos-radial.vercel.app](https://sistema-pedidos-radial.vercel.app)

#### Observação importante

Se um agente for voltar a mexer em termografia, primeiro deve conferir se a árvore local atual ainda corresponde a essa branch/estado ou se já houve novas mudanças depois disso.

### 2. Contratos e Locações

Este módulo está em fase de planejamento e execução guiada por etapas para outro agente.

#### Material de planejamento já existente

- `docs/contratos-locacoes-prompts-para-outro-agente.md`
- arquivos de planejamento/handoff em `docs/superpowers/` e/ou na branch remota de planejamento

#### O que já se sabe sobre esse módulo

- existe uma branch remota de planejamento: `origin/codex/planejamento-contratos-locacoes`
- houve revisão técnica dos arquivos dessa branch
- foram identificados e depois corrigidos pontos de base técnica nessa linha de trabalho:
  - validação da numeração/recibo;
  - transições permissivas demais;
  - alinhamento de tipos TypeScript com Postgres/Supabase;
  - risco de concorrência em `internal_number`;
  - policy ambígua em `organization_members`;
  - necessidade de FKs compostas por `organization_id`;
  - bloqueio de insert direto em `audit_events`;
  - teste estático de consistência da migration.

#### Ambiente Supabase dev/homolog confirmado

O módulo agora tem um projeto Supabase separado e exclusivo para desenvolvimento/homologação:

- `project ref`: `misfyiznwnuvldoccciw`
- `project URL`: `https://misfyiznwnuvldoccciw.supabase.co`
- esse projeto é dedicado somente ao módulo `Contratos e Locações`
- a URL é diferente do backend antigo compartilhado `https://iurqgskfuupslrghgtej.supabase.co`
- a configuração local ainda não foi apontada para esse ambiente
- as variáveis que serão configuradas na etapa seguinte são:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou chave publishable equivalente
- nenhuma migration foi aplicada nesta etapa
- nenhum deploy foi feito nesta etapa
- nenhum segredo real foi versionado nesta etapa

#### Status conhecido da execução em outra instância

Segundo o retorno informado pelo usuário, outro agente já conseguiu:

- trazer a base da branch de planejamento para trabalho local nessa outra execução;
- corrigir a base técnica;
- rodar `npm test` com sucesso;
- rodar `npx tsc --noEmit` com sucesso.

#### Limites importantes

- não há confirmação aqui, nesta árvore local atual, de que toda a implementação de contratos/locações esteja presente;
- não aplicar migrations nem fazer deploy sem nova validação;
- o trabalho desse módulo deve seguir por etapas em chats separados para economizar tokens.

## Organização recomendada de chats

### Mesmo chat

- Contratos e Locações: partes 1, 2 e 3
  - contexto
  - revisão da base
  - endurecimento técnico

### Novo chat por etapa

- Parte 4: cadastro central
- Parte 5: contratos, locações e itens
- Parte 6: cobranças, períodos e alertas
- Parte 7: importação das planilhas antigas
- Parte 8: recibo/PDF e numeração final
- Parte 9: offline/sincronização simples
- Parte 10: testes finais, revisão e handoff final

## Regra para continuidade por outro agente

Antes de agir, o agente deve ler:

1. `docs/AGENTE-INSTRUCOES.md`
2. `docs/ESTADO-ATUAL-PROJETO.md`
3. handoffs relevantes
4. o prompt/arquivo específico da etapa

## Próximo uso recomendado

Se o próximo trabalho for em Contratos e Locações, começar pela etapa específica desejada em chat separado, sempre levando os arquivos deste diretório `docs/` como contexto inicial.
