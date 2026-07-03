# Pacote de transferência — Sistema de Pedidos Radial / Termografia

Este documento foi preparado para entregar o projeto a outro agente em um servidor 24/7. Ele foi escrito para ser compreensível mesmo sem experiência avançada em programação.

**Data do handoff:** 02/07/2026  
**Estado:** trabalho pausado com segurança, mas ainda não finalizado nem pronto para produção.

---

## 1. Resumo simples

Estamos melhorando somente o módulo de **relatório termográfico**. Os outros módulos não devem ser alterados.

Objetivos aprovados:

1. Salvar o relatório automaticamente enquanto ele é preenchido.
2. Recuperar automaticamente o rascunho se o navegador voltar ou fechar.
3. Mostrar claramente `Salvando`, `Rascunho salvo`, `Sem conexão` ou `Erro`.
4. Considerar uma foto salva somente depois da confirmação do Supabase Storage.
5. Permitir recortar a foto digital no celular ou usar a original.
6. Colocar `Adicionar novo ponto` abaixo de `Concluir ponto`.
7. Corrigir fotos que aparecem na impressão, mas somem na edição.
8. Permitir editar todos os dados gerais do relatório salvo, exceto número/proprietário/data de criação.
9. Permitir visualizar, substituir e baixar as fotos depois.
10. Deixar o funcionamento totalmente offline para uma segunda etapa futura.

---

## 2. GitHub e Git

### Repositório

```text
git@github.com:Thogalegod/sistema-pedidos-radial.git
```

O acesso atual usa SSH. No servidor novo, a conta/chave SSH precisa ter permissão nesse repositório.

### Branches

- Branch remota atual de produção/desenvolvimento: `origin/main`
- Branch local principal: `main`
- Branch local desta implementação: `codex/termografia-salvamento-seguro`
- Worktree local:

```text
C:\Users\thoma\OneDrive\Área de Trabalho\Sistema _Pedidos_Radial\.worktrees\termografia-salvamento-seguro
```

### Aviso muito importante

A branch `codex/termografia-salvamento-seguro` **ainda não foi enviada ao GitHub**. Além disso, há correções não commitadas. Portanto, apenas clonar o GitHub no servidor 24/7 **não recupera todo o trabalho descrito aqui**.

Para transferir sem perder nada, use uma destas opções:

1. **Mais simples para o usuário:** envie ao outro agente uma cópia/ZIP da pasta da worktree inteira, excluindo somente `node_modules`, `.next` e `.git`. O outro agente deve clonar o GitHub e sobrepor os arquivos do ZIP no clone.
2. **Mais correta via Git:** antes da transferência, terminar a correção pendente, criar commit, enviar a branch ao GitHub e o servidor executar `git checkout codex/termografia-salvamento-seguro`.

Não incluir `.env.local` em ZIP público ou no GitHub. As credenciais devem ser fornecidas de forma privada.

### Commits locais existentes

```text
317abcd feat: implementa autosave serial de termografia
b0d8751 feat: adiciona recorte e indicador de salvamento
fb262ee fix: confirma uploads e estabiliza nomes das fotos
caeefcc feat: adiciona base persistente para rascunhos
bbc78eb test: prepara dominio de rascunhos termograficos
a5476ad docs: planeja salvamento seguro da termografia
2c1506a docs: define salvamento seguro da termografia
```

O `origin/main` ainda aponta para `c4a8fc4` no momento deste handoff.

### Arquivos locais ainda não commitados

```text
M  src/hooks/useTermografiaDraft.ts
M  src/hooks/useTermografiaDraft.test.tsx
M  termografia_drafts_migration.sql
?? termografia_drafts_migration.test.ts
?? CONTINUAR_TERMOGRAFIA.md
?? PACOTE_HANDOFF_AGENTE_24H.md
```

Não executar `git reset --hard`, `git checkout --` ou limpeza automática nesses arquivos.

---

## 3. Documentos que explicam a solução

O novo agente deve ler nesta ordem:

1. `AGENTS.md`
2. `CONTINUAR_TERMOGRAFIA.md`
3. `PACOTE_HANDOFF_AGENTE_24H.md` (este arquivo)
4. `docs/superpowers/specs/2026-07-02-termografia-salvamento-seguro-design.md`
5. `docs/superpowers/plans/2026-07-02-termografia-salvamento-seguro.md`
6. Documentação local relevante em `node_modules/next/dist/docs/`, pois o projeto usa Next.js 16.2.4 com mudanças incompatíveis.

O fluxo usado foi Superpowers:

- brainstorming e aprovação do design;
- writing-plans;
- worktree isolada;
- desenvolvimento orientado a testes;
- revisão de especificação;
- revisão de qualidade após cada tarefa.

O novo agente deve continuar o mesmo fluxo e não pular revisões.

---

## 4. Tecnologias e bibliotecas

### Runtime usado

```text
Node.js 22.17.0
npm 10.9.2
```

### Dependências principais

```text
@supabase/supabase-js ^2.105.1
browser-image-compression ^2.0.2
clsx ^2.1.1
date-fns ^4.1.0
lucide-react ^1.14.0
next 16.2.4
react 19.2.4
react-dom 19.2.4
react-easy-crop ^5.5.6
react-hot-toast ^2.6.0
react-pdf ^10.4.1
recharts ^3.8.1
tailwind-merge ^3.5.0
```

### Dependências de desenvolvimento/testes

```text
@tailwindcss/postcss ^4
@testing-library/jest-dom ^6.6.3
@testing-library/react ^16.3.0
@testing-library/user-event ^14.6.1
@types/node ^20
@types/react ^19
@types/react-dom ^19
eslint ^9
eslint-config-next 16.2.4
jsdom ^26.1.0
tailwindcss ^4
typescript ^5
vitest ^3.2.4
```

Usar `package.json` e `package-lock.json` entregues. No servidor, preferir `npm ci`.

---

## 5. Variáveis e serviços externos

O projeto usa Supabase para autenticação, banco e Storage.

Criar `.env.local` no servidor com:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=VALOR_PRIVADO_DO_PROJETO
NEXT_PUBLIC_SUPABASE_ANON_KEY=VALOR_PRIVADO_DO_PROJETO
```

Esses valores existem no computador atual, mas não foram copiados para este documento por segurança.

### Supabase

- Tabela: `relatorios_termografia`
- Bucket Storage usado: `documentos-cabine`
- RLS já existe e limita relatórios por `criado_por = auth.uid()`.
- Schema original: `termografia_schema.sql`
- Migração nova: `termografia_drafts_migration.sql`

### Migração ainda não aplicada

`termografia_drafts_migration.sql` ainda precisa ser revisado, finalizado e executado no Supabase correto. Ele adiciona:

- `atualizado_em`;
- índice para buscar rascunho do usuário;
- trigger de atualização;
- índice único do número do relatório;
- RPC `criar_rascunho_termografia()` para criar/reusar rascunho e gerar número de forma atômica.

Não aplicar em banco desconhecido. Antes, confirmar o projeto Supabase e fazer backup/esquema atual.

---

## 6. Configuração no servidor 24/7

### Se a branch já tiver sido enviada ao GitHub

```bash
git clone git@github.com:Thogalegod/sistema-pedidos-radial.git
cd sistema-pedidos-radial
git checkout codex/termografia-salvamento-seguro
npm ci
```

Criar `.env.local` com as duas variáveis Supabase.

Depois:

```bash
npx vitest run --configLoader runner
npx tsc --noEmit --incremental false
npm run build
npm start
```

### Se receber um ZIP da worktree

1. Clonar o GitHub conforme acima.
2. Extrair o ZIP por cima do clone, preservando os arquivos do ZIP.
3. Não copiar `node_modules`, `.next`, `.git` ou `.env.local` do Windows.
4. Executar `npm ci` no Linux/servidor.
5. Criar `.env.local` manualmente.
6. Rodar testes e TypeScript antes de continuar.
7. Executar `git status --short` para confirmar os arquivos recebidos.

### Serviço permanente

Pode usar systemd, Docker ou PM2. Exemplo simples com PM2 após o build:

```bash
npm install -g pm2
pm2 start npm --name sistema-pedidos-radial -- start
pm2 save
pm2 startup
```

O projeto deve ficar atrás de HTTPS/reverse proxy no uso real. Câmera, PWA e várias APIs móveis dependem de contexto seguro HTTPS.

Não colocar esta branch em produção antes de concluir as Tasks 5–8 e testar no celular.

---

## 7. O que já foi implementado e revisado

### Task 1 — concluída

- Vitest/jsdom/Testing Library.
- Tipos de rascunho, upload e dados gerais.
- Testes iniciais do domínio.

### Task 2 — concluída

- Sanitização dos pontos antes de persistir.
- Bloqueio de finalização com upload pendente/falho.
- Base da migração SQL.

### Task 3 — concluída

- Upload agora lança erro em vez de retornar `null` silencioso.
- Download por URL assinada.
- Nome de foto por ID permanente do ponto.
- Recorte por canvas com validação e limite de memória.
- Compatibilidade corrigida no upload do CREA.

### Task 4 — concluída

- `PhotoCropDialog` acessível e seguro.
- `SaveStatusBanner`.
- Tratamento de erro e repetição.
- Limpeza de Object URLs.
- Trap de foco, Escape, restauração de foco.
- Proteções contra concorrência/rerender.

### Task 5 — quase concluída, mas ainda aberta

Implementado:

- debounce de 800 ms;
- fila serial de autosave;
- autenticação;
- retomada/criação de rascunho;
- retry de inicialização;
- proteção StrictMode/remount;
- bloqueio/serialização de finalização;
- validação de cliente, data e pontos;
- RPC atômica/idempotente;
- listeners online/offline/beforeunload.

Última suíte informada pelo implementador: **42 testes passando**.

### Último ponto exato antes da pausa

A última revisão encontrou um único gap:

- Quando o hook retoma/cria um rascunho e define `saveStatus = 'salvo'`, também deve definir `salvoEm = new Date(valor.atualizado_em)`.
- Adicionar teste confirmando que o horário exibido vem do `atualizado_em` retornado pelo Supabase/RPC.

Um subagente começou essa correção, mas foi interrompido imediatamente a pedido do usuário. O novo agente deve inspecionar o diff para saber se alguma parte chegou a ser escrita.

Após corrigir:

```bash
npx vitest run --configLoader runner
npx eslint src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaDraft.test.tsx
npx tsc --noEmit --incremental false
git diff --check
```

Depois repetir revisão de especificação e revisão de qualidade da Task 5.

---

## 8. O que falta implementar

### Task 6 — integrar à tela de novo relatório

- Usar o hook como fonte dos dados e pontos.
- Mostrar `SaveStatusBanner` nas duas etapas.
- Exibir aviso `Seu relatório foi recuperado`.
- Integrar recorte, compressão e upload individual.
- Mostrar estado individual de cada foto e botão de repetição.
- Revogar previews blob quando não forem mais usados.
- Manter botão superior `+ Ponto`.
- Adicionar `Adicionar novo ponto` abaixo de `Concluir ponto`.
- Rolar até o novo ponto.
- Trocar `Salvar Relatório` por `Finalizar relatório`.
- Bloquear finalização com upload pendente/falho.

### Task 7 — tela do relatório salvo

- Corrigir o bug das fotos ausentes no modal.
- Inicializar `pontos` com `data.pontos` e assinar URLs sobre `pontosBase`.
- Criar `GeneralDataEditor` e testes.
- Liberar cliente, CNPJ, endereço, cidade, UF, CEP, data, responsável, CREA, objetivo e equipamento.
- Bloquear número do relatório, proprietário e criação.
- Adicionar visualizar, substituir e baixar em cada foto.
- Usar nome de arquivo por ID em inclusão/substituição.

### Task 8 — listagem e regressão

- Mostrar somente `status = gerado` na listagem principal.
- Validar impressão com dados/fotos atualizados.
- Validar retomada após voltar no navegador.
- Validar falha/retry de rede e Storage.
- Testar no celular com 50 pontos e 100 imagens.
- Rodar suíte, TypeScript, lint focado e build.
- Fazer revisão final do conjunto.

### Etapa 2 futura — offline completo

Fora do escopo atual. Exigirá PWA, cache do app, IndexedDB para blobs, fila de sincronização e tratamento de conflito. Não prometer funcionamento offline completo antes disso.

---

## 9. Arquivos essenciais para enviar ao outro agente

Enviar o projeto inteiro é mais seguro. Se precisar enviar apenas arquivos relacionados, incluir pelo menos:

```text
AGENTS.md
package.json
package-lock.json
vitest.config.ts
src/test/setup.ts
termografia_schema.sql
termografia_drafts_migration.sql
termografia_drafts_migration.test.ts
src/lib/storage.ts
src/lib/supabase.ts
src/lib/termografia/types.ts
src/lib/termografia/draft.ts
src/lib/termografia/draft.test.ts
src/lib/termografia/images.ts
src/lib/termografia/images.test.ts
src/hooks/useTermografiaDraft.ts
src/hooks/useTermografiaDraft.test.tsx
src/components/termografia/PhotoCropDialog.tsx
src/components/termografia/PhotoCropDialog.test.tsx
src/components/termografia/SaveStatusBanner.tsx
src/components/termografia/SaveStatusBanner.test.tsx
src/app/termografia/nova/page.tsx
src/app/termografia/[id]/page.tsx
src/app/termografia/[id]/imprimir/page.tsx
src/app/termografia/page.tsx
docs/superpowers/specs/2026-07-02-termografia-salvamento-seguro-design.md
docs/superpowers/plans/2026-07-02-termografia-salvamento-seguro.md
CONTINUAR_TERMOGRAFIA.md
PACOTE_HANDOFF_AGENTE_24H.md
```

Não enviar `node_modules` ou `.next`; eles são recriados com `npm ci` e `npm run build`.

---

## 10. Testes e problemas conhecidos do projeto original

- Antes desta feature já havia aproximadamente 74 erros de ESLint em outros módulos, especialmente cabine/pedidos.
- Não corrigir esses erros gerais como parte da termografia sem autorização específica.
- O build falha sem as variáveis do Supabase.
- O build pode buscar Google Fonts e requer internet.
- No sandbox Windows/OneDrive, Vitest/esbuild teve restrição de leitura; `npx vitest run --configLoader runner` funcionou.
- `npm install` no cache padrão do OneDrive travou; funcionou usando `--cache C:\tmp\radial-npm-cache`.
- O npm informou vulnerabilidades preexistentes. Não executar `npm audit fix --force` automaticamente.

---

## 11. Regras para o próximo agente

1. Trabalhar apenas na branch/worktree da feature.
2. Ler a documentação local do Next.js 16 antes de alterar código Next.
3. Não descartar arquivos modificados/untracked.
4. Usar TDD.
5. Uma tarefa por vez.
6. Fazer revisão de especificação antes da revisão de qualidade.
7. Não considerar upload salvo antes da confirmação do Storage.
8. Não aplicar migração sem confirmar o Supabase correto.
9. Não alterar outros módulos, salvo correção de compatibilidade diretamente causada por esta feature.
10. Não publicar em produção sem teste móvel real.

---

## 12. Checklist simples para o usuário

Ao entregar ao outro agente, forneça:

- [ ] Este arquivo MD.
- [ ] `CONTINUAR_TERMOGRAFIA.md`.
- [ ] ZIP da worktree sem `node_modules`, `.next`, `.git` e `.env.local`, **ou** branch enviada ao GitHub.
- [ ] Acesso ao GitHub por SSH.
- [ ] Valores de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` por canal privado.
- [ ] Confirmação de qual projeto Supabase é o correto.
- [ ] Um celular para teste final das fotos/câmera.

Se algo estiver confuso, o agente deve primeiro executar `git status`, ler este documento e o plano, e não fazer limpeza automática.
