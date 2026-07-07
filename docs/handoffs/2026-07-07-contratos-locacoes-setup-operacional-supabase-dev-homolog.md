# Handoff — Contratos e Locações — setup operacional Supabase dev/homolog

**Data:** 2026-07-07  
**Etapa:** documentação operacional do ambiente Supabase separado de desenvolvimento/homologação  
**Branch atual:** `codex/contratos-locacoes-fundacao`  
**Escopo desta etapa:** registrar o projeto novo confirmado, documentar as variáveis locais que serão apontadas depois e deixar o repositório pronto para a próxima etapa sem tocar produção

## 1. Objetivo da etapa

Preparar a continuidade segura da opção já decidida para `Contratos e Locações`:

- usar um projeto Supabase separado para desenvolvimento/homolog;
- não usar o backend antigo compartilhado para aplicar a migration do módulo;
- não alterar `.env` nesta etapa;
- não aplicar migration nesta etapa;
- não fazer deploy nem tocar produção.

## 2. O que foi confirmado no workspace nesta etapa

### 2.1 O novo ambiente Supabase dev/homolog está confirmado

Foi confirmado o seguinte para o módulo `Contratos e Locações`:

- `project ref`: `misfyiznwnuvldoccciw`
- `project URL`: `https://misfyiznwnuvldoccciw.supabase.co`
- o projeto é exclusivo para desenvolvimento/homologação do módulo;
- o acesso administrativo ao painel Supabase está disponível pelo usuário do responsável;
- a chave client-side/publishable existe, mas o valor não foi registrado aqui;
- nenhuma migration foi aplicada nesta etapa;
- nenhum deploy foi feito nesta etapa;
- nenhum segredo real foi colocado em arquivo versionado.

### 2.2 A URL do novo projeto é diferente da URL do backend antigo compartilhado

Também ficou confirmado que o novo projeto não é o backend antigo usado antes pelo app:

- backend antigo compartilhado: `https://iurqgskfuupslrghgtej.supabase.co`
- novo projeto dev/homolog: `https://misfyiznwnuvldoccciw.supabase.co`

### 2.3 O app local ainda não foi apontado para o novo ambiente

O client global do app continua dependendo de:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Portanto, ainda falta atualizar a configuração local para fazer o app falar com o novo projeto.

## 3. O que falta para apontar localmente o app

Ainda falta a etapa separada de configuração local:

1. registrar o valor da URL nova no ambiente local;
2. registrar a chave client-side/publishable do projeto novo no ambiente local;
3. manter esses valores fora de qualquer arquivo com segredo real versionado;
4. validar que o app local está realmente falando com o projeto `misfyiznwnuvldoccciw` antes de qualquer migration.

### Variáveis locais que serão configuradas depois

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou chave publishable equivalente

## 4. Checklist operacional exato

### 4.1 Se o projeto novo ainda não existir

1. Confirmar quem é o responsável com acesso administrativo ao workspace/organização no Supabase.
2. Criar um projeto **novo e separado** para desenvolvimento/homologação do módulo `Contratos e Locações`.
3. Escolher nome inequívoco para evitar confusão com produção e com o backend antigo compartilhado.
4. Registrar o `project ref` do novo projeto.
5. Registrar a `project URL` do novo projeto.
6. Registrar a `anon key` do novo projeto.
7. Confirmar que a URL do novo projeto é diferente da URL atual compartilhada (`iurqgskfuupslrghgtej.supabase.co`).
8. Confirmar quem tem acesso administrativo para:
   - abrir o painel;
   - consultar API settings;
   - executar migration futuramente no projeto correto.
9. Confirmar se haverá necessidade futura de `service role`.
10. Se a resposta for sim, guardar essa chave fora do repositório e apenas documentar que ela existe, sem commitá-la.

### 4.2 Se o projeto novo já existir

1. Confirmar o `project ref`.
2. Confirmar a `project URL`.
3. Confirmar a `anon key`.
4. Confirmar que esse projeto é de dev/homolog e não produção.
5. Confirmar que esse projeto é separado do backend antigo compartilhado.
6. Confirmar quem possui acesso administrativo ao painel ou CLI autenticada.
7. Documentar esses metadados no repositório sem expor segredos sensíveis além do que já for política permitida para documentação interna.
8. Não aplicar migration ainda nesta etapa.
9. Não alterar `.env` ainda nesta etapa.

## 5. Como o ambiente foi documentado no repositório

Nesta etapa, a documentação foi registrada em:

- `.gitignore`
- `docs/ESTADO-ATUAL-PROJETO.md`
- `docs/handoffs/2026-07-07-contratos-locacoes-setup-operacional-supabase-dev-homolog.md`
- `.env.example`

Regras seguidas:

- não foi registrado segredo real;
- não foi registrada `service role key`;
- ficou explícito que o ambiente é exclusivo para dev/homolog do módulo;
- ficou explícito que o backend antigo compartilhado não deve receber a migration deste módulo.

## 6. Como apontar localmente o app para o novo ambiente em etapa posterior

Essa troca **não deve acontecer agora**, mas o fluxo seguro posterior é:

1. confirmar o novo projeto correto;
2. confirmar `project URL` e `anon key`;
3. revisar onde o app consome:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. atualizar a configuração local **em etapa separada e autorizada**;
5. validar que o app local está falando com o projeto novo antes de qualquer migration;
6. só depois seguir para a aplicação controlada da migration.

## 7. Próximos passos em ordem

1. **Ajuste local de configuração**
   - apontar o app para `https://misfyiznwnuvldoccciw.supabase.co` com a chave publishable correta.
2. **Aplicação da migration**
   - aplicar a migration do módulo somente no projeto novo e somente na etapa autorizada.
3. **Validação das tabelas/RLS**
   - confirmar criação de tabelas, enums, funções, policies e seed esperado no projeto novo.
4. **Rerun do QA manual**
   - executar QA manual do módulo contra esse ambiente novo, sem envolver produção.

## 8. Riscos e cuidados

- não confundir o projeto novo com o backend antigo compartilhado;
- não usar a URL `iurqgskfuupslrghgtej.supabase.co` como destino da migration do módulo;
- não registrar segredo real em arquivo versionado;
- não usar `service role` como atalho para contornar RLS;
- não fazer deploy;
- não tocar produção;
- não aplicar migration sem confirmação explícita do projeto correto.

## 9. Ferramentas e limitações operacionais desta etapa

- a ferramenta `rtk` foi verificada e está disponível no ambiente;
- não foi necessário executar comando ruidoso de longa duração nesta etapa;
- a inspeção local continuou concentrada em arquivos do workspace;
- não houve conexão com Supabase remoto;
- não houve leitura de credenciais reais fora do workspace.

## 10. Arquivos alterados nesta etapa

- `.gitignore`
- `docs/ESTADO-ATUAL-PROJETO.md`
- `docs/handoffs/2026-07-07-contratos-locacoes-setup-operacional-supabase-dev-homolog.md`
- `.env.example`

## 11. Testes/comandos executados nesta etapa

Comandos de inspeção local:

- `Get-Content -Raw docs/AGENTE-INSTRUCOES.md`
- `Get-Content -Raw docs/ESTADO-ATUAL-PROJETO.md`
- `Get-Content -Raw docs/handoffs/2026-07-07-contratos-locacoes-decisao-ambiente-supabase.md`
- `Get-Content -Raw RTK.md`
- `Get-Content -Raw C:\\Users\\thoma\\.codex\\plugins\\cache\\openai-curated-remote\\superpowers\\6.1.1\\skills\\using-superpowers\\SKILL.md`
- `Get-Content -Raw C:\\Users\\thoma\\.codex\\plugins\\cache\\openai-curated-remote\\superpowers\\6.1.1\\skills\\writing-plans\\SKILL.md`
- `rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "Supabase|supabase|project ref|project_ref|anon key|anon_key|service role|service_role|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY" docs src supabase .`
- `rg --files --hidden --glob '!node_modules/**' --glob '!.git/**' | rg '(^|\\\\)(\\.env(\\.|$)|env\\.example|\\.env\\.example|\\.env\\.template)'`
- `git status --short`
- `git branch --show-current`

Resultado:

- somente inspeção local;
- nenhum teste de app executado;
- nenhum comando Supabase remoto executado.

## 12. Estado final desta etapa

### Confirmado

- o projeto Supabase dev/homolog do módulo `Contratos e Locações` existe e está identificado;
- o `project ref` confirmado é `misfyiznwnuvldoccciw`;
- a `project URL` confirmada é `https://misfyiznwnuvldoccciw.supabase.co`;
- a URL é diferente do backend antigo compartilhado;
- o ambiente é exclusivo para esse módulo;
- a documentação do workspace já foi atualizada para registrar esse estado.

### Não confirmado

- o valor da chave client-side/publishable;
- a aplicação local ainda apontando para esse ambiente;
- a migration aplicada nesse projeto novo;
- a validação das tabelas/RLS neste projeto novo.

## 13. Próximo passo exato recomendado

Abrir a próxima etapa para **ajuste local de configuração**:

- apontar `NEXT_PUBLIC_SUPABASE_URL` para `https://misfyiznwnuvldoccciw.supabase.co`;
- preencher a chave publishable em `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente local;
- validar que o app local passou a usar o projeto novo;
- só depois aplicar a migration no ambiente novo.

## 14. Git / entrega

- commit: **não**
- push: **não**
- deploy: **não**
- migration: **não**
