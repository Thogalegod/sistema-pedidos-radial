# Handoff — Termografia com salvamento seguro

> Para transferir o projeto a outro agente/servidor, use também `PACOTE_HANDOFF_AGENTE_24H.md`. Esse segundo documento contém GitHub, bibliotecas, configuração do servidor, arquivos necessários e o estado mais recente da Task 5.

Atualizado em 02/07/2026. O trabalho foi pausado de forma intencional para desligamento do computador. Nenhuma alteração foi descartada.

## Onde continuar

- Repositório principal: `C:\Users\thoma\OneDrive\Área de Trabalho\Sistema _Pedidos_Radial`
- Worktree da implementação: `C:\Users\thoma\OneDrive\Área de Trabalho\Sistema _Pedidos_Radial\.worktrees\termografia-salvamento-seguro`
- Branch: `codex/termografia-salvamento-seguro`
- Branch base: `main`
- Plano: `docs/superpowers/plans/2026-07-02-termografia-salvamento-seguro.md`
- Especificação: `docs/superpowers/specs/2026-07-02-termografia-salvamento-seguro-design.md`

Não implementar na pasta principal enquanto esta worktree existir. Continuar dentro da worktree ou fazer checkout da branch em outro servidor.

## Estado atual do Git

Commits concluídos e revisados:

1. `bbc78eb` — infraestrutura de testes e tipos do domínio.
2. `caeefcc` — transformações de rascunho e migração do banco.
3. `fb262ee` — uploads confiáveis, download e utilitários de recorte.
4. `b0d8751` — modal de recorte acessível e indicador de salvamento.
5. `252535e` — primeira versão do hook de autosave serial.

Existem alterações **não commitadas** em:

- `src/hooks/useTermografiaDraft.ts`
- `src/hooks/useTermografiaDraft.test.ts`

Essas alterações são a correção em andamento da revisão da Task 5. Antes de qualquer checkout/reset, executar `git status` e preservar esses dois arquivos.

## O que já foi implementado

- Vitest + Testing Library + jsdom.
- Tipos de status do relatório, upload e dados gerais.
- Sanitização de campos transitórios antes de persistir pontos.
- Migração SQL idempotente com `atualizado_em`, índice e trigger.
- `uploadArquivo` lança erro em falha; não retorna sucesso vazio.
- URL assinada para download.
- Nomes de fotos baseados no ID permanente do ponto.
- Recorte com canvas, validação de área, limite de memória e fechamento de bitmap.
- Tratamento compatível do upload do CREA.
- Modal de recorte com:
  - usar original ou aplicar recorte;
  - erro visível e repetição;
  - limpeza de Object URLs;
  - foco inicial, trap de Tab, Escape e restauração de foco;
  - proteção contra corrida e rerender do callback.
- Banner de `Salvando`, `Salvo`, `Offline` e `Erro`.
- Primeira versão do hook de rascunho com debounce, fila serial, autenticação, busca/criação do rascunho e listeners de conexão/saída.

Até a Task 4, a suíte chegou a 23 testes. Durante a Task 5, chegou a 32 testes antes das correções finais em andamento.

## Ponto exato da pausa — Task 5

A revisão de especificação encontrou cinco pontos. O subagente começou a corrigi-los e foi interrompido para o desligamento:

1. `repetir()` precisa refazer autenticação/busca/criação quando a inicialização falhar e ainda não houver relatório.
2. `finalizar()` precisa revalidar upload pendente imediatamente antes de alterar o status para `gerado`.
3. O estado inicial não pode informar `salvo` antes de confirmação do servidor; deve iniciar como `salvando` ou estado equivalente seguro.
4. Exportar e usar `UseTermografiaDraftResult` com `salvoEm: Date | null` e contrato público coerente para pontos.
5. Adicionar testes para falha/repetição da inicialização, estado anterior à confirmação e upload iniciado durante a finalização.

### Primeiro passo ao retomar

```powershell
cd "C:\Users\thoma\OneDrive\Área de Trabalho\Sistema _Pedidos_Radial\.worktrees\termografia-salvamento-seguro"
git status --short
git diff -- src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaDraft.test.ts
npm test -- --configLoader runner
npx eslint src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaDraft.test.ts
npx tsc --noEmit --incremental false
```

Revisar se as cinco correções ficaram completas. Depois fazer revisão de especificação, revisão de qualidade e somente então atualizar/criar o commit da Task 5.

## O que falta executar

### Terminar Task 5

- Finalizar as correções acima.
- Rodar testes, ESLint focado e TypeScript.
- Passar novamente pelas revisões de especificação e qualidade.

### Task 6 — integrar rascunho à criação

- Substituir estados locais da página nova pelo hook.
- Mostrar banner persistente e mensagem de rascunho recuperado.
- Integrar recorte, compressão, upload individual e repetição.
- Adicionar `Adicionar novo ponto` abaixo de `Concluir ponto`.
- Trocar criação tardia por `Finalizar relatório`.
- Bloquear finalização com uploads pendentes ou falhos.

### Task 7 — relatório salvo

- Corrigir o carregamento de fotos no modal usando os pontos persistidos.
- Criar editor de todos os dados gerais, exceto número/proprietário/criação.
- Adicionar visualização, substituição e download das fotos.
- Usar nomes estáveis por ID também ao editar/adicionar pontos.

### Task 8 — listagem e regressão

- Ocultar rascunhos da lista de relatórios finalizados.
- Testar retomada, edição, impressão, download e falha de conexão.
- Validar cenário móvel com 50 pontos e 100 imagens.
- Rodar revisão final completa.

### Operação externa pendente

O arquivo `termografia_drafts_migration.sql` foi criado, mas **não foi aplicado ao Supabase remoto**. Aplicar no projeto correto antes de testar rascunhos em produção e verificar a coluna `atualizado_em`.

## Configuração do projeto

- Node usado: `v22.17.0`
- npm usado: `10.9.2`
- Next.js: `16.2.4`
- React: `19.2.4`
- Supabase JS: `^2.105.1`
- Banco/arquivos: Supabase, bucket `documentos-cabine`
- Dependências novas: `react-easy-crop`
- Dev dependencies novas: Vitest, jsdom e Testing Library.

Variáveis necessárias em `.env.local` — copiar os valores seguros do ambiente atual; não registrar valores no Git:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Scripts:

```powershell
npm ci
npm test -- --configLoader runner
npm run dev
npm run build
```

O Vitest/esbuild encontrou restrição de leitura dentro do sandbox da worktree. `--configLoader runner` funcionou. Em servidor normal, `npm test` também deve ser tentado.

## Instalação em servidor 24/7

Exemplo após enviar a branch ao repositório remoto:

```bash
git clone <URL_DO_REPOSITORIO> sistema-pedidos-radial
cd sistema-pedidos-radial
git checkout codex/termografia-salvamento-seguro
npm ci
cp .env.example .env.local  # ou criar manualmente sem expor segredos
npm test -- --configLoader runner
npm run build
npm start
```

Para serviço permanente, usar o gerenciador já adotado no servidor (systemd, Docker ou PM2). Não publicar esta branch como produção antes de concluir Tasks 5–8, aplicar a migração e testar os 50 pontos/100 imagens.

## Baseline conhecido

- O repositório já possuía 74 erros de ESLint fora do escopo, principalmente nos módulos de cabine e pedidos.
- O build precisa das variáveis Supabase; sem elas falha no prerender.
- O build também busca Google Fonts e precisa de acesso à internet ou de fontes locais.
- `npm install` no OneDrive travou com o cache padrão; funcionou com `--cache C:\tmp\radial-npm-cache`.
- O npm reportou vulnerabilidades em dependências preexistentes. Não foi executado `npm audit fix` para evitar mudanças fora do escopo.

## Segurança ao retomar

- Não executar `git reset --hard` nem `git checkout --` nos dois arquivos modificados da Task 5.
- Não aplicar a migração em banco errado.
- Não prometer funcionamento offline nesta etapa. Offline completo continua como etapa 2 futura.
- Não considerar foto salva antes de confirmação do Storage e persistência do caminho.
