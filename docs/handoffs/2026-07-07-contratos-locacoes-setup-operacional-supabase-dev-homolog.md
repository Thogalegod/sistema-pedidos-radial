# Handoff — Contratos e Locações — setup operacional Supabase dev/homolog

**Data:** 2026-07-07  
**Etapa:** configuração local do ambiente Supabase separado de desenvolvimento/homologação  
**Branch atual:** `codex/contratos-locacoes-fundacao`  
**Escopo desta etapa:** apontar o app local para o projeto novo, confirmar que `.env.local` fica fora do git e deixar o repositório pronto para a próxima etapa sem tocar produção

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

### 2.3 O app local foi apontado para o novo ambiente

O client global do app continua dependendo de:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

O arquivo `.env.local` já foi ajustado para fazer o app falar com o novo projeto.

## 3. O que falta para apontar localmente o app

Ainda faltava a etapa separada de configuração local até o ajuste desta sessão:

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

Nesta etapa, a configuração local efetiva ficou em:

- `.env.local`

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

1. **Aplicação da migration**
   - aplicar a migration do módulo somente no projeto novo e somente na etapa autorizada.
2. **Validação das tabelas/RLS**
   - confirmar criação de tabelas, enums, funções, policies e seed esperado no projeto novo.
3. **Rerun do QA manual**
   - executar QA manual do módulo contra esse ambiente novo, sem envolver produção.

## 8. Riscos e cuidados

- não confundir o projeto novo com o backend antigo compartilhado;
- não usar a URL `iurqgskfuupslrghgtej.supabase.co` como destino da migration do módulo;
- não registrar segredo real em arquivo versionado;
- não versionar `.env.local`;
- não usar `service role` como atalho para contornar RLS;
- não fazer deploy;
- não tocar produção;
- não aplicar migration sem confirmação explícita do projeto correto.

## 9. Ferramentas e limitações operacionais desta etapa

- a ferramenta `rtk` foi verificada e está disponível no ambiente;
- a verificação local foi executada com `node.exe` para confirmar as variáveis do `.env.local`;
- a inspeção local continuou concentrada em arquivos do workspace;
- não houve conexão com Supabase remoto;
- não houve leitura de credenciais reais fora do workspace.

## 10. Arquivos alterados nesta etapa

- `.gitignore`
- `.env.local` local, não versionado
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
- `Get-Content -Raw src\\lib\\supabase.ts`
- `Get-Content -Raw src\\lib\\storage.ts`
- `Get-Content -Raw .env.local`
- `rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "Supabase|supabase|project ref|project_ref|anon key|anon_key|service role|service_role|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY" docs src supabase .`
- `rg --files --hidden --glob '!node_modules/**' --glob '!.git/**' | rg '(^|\\\\)(\\.env(\\.|$)|env\\.example|\\.env\\.example|\\.env\\.template)'`
- `git check-ignore -v .env.local`
- `& 'C:\\Users\\thoma\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe' -e "const fs=require('fs'); const path='.env.local'; const txt=fs.readFileSync(path,'utf8'); const wantUrl='https://misfyiznwnuvldoccciw.supabase.co'; const oldUrl='https://iurqgskfuupslrghgtej.supabase.co'; if(!txt.includes('NEXT_PUBLIC_SUPABASE_URL='+wantUrl)) throw new Error('new URL missing'); if(!txt.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Nv7OFKf0IR4qSAymLmUYOQ_2RFi3sLH')) throw new Error('new anon key missing'); if(txt.includes(oldUrl)) throw new Error('old URL still present'); console.log('LOCAL_SUPABASE_OK');"`
- `git status --short`
- `git branch --show-current`

Resultado:

- somente inspeção local;
- a validação local retornou `LOCAL_SUPABASE_OK`;
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
- o app local já aponta para o projeto novo via `.env.local`;
- `.env.local` está ignorado pelo git;
- a validação local confirmou a URL nova e a ausência da URL antiga nesse arquivo.

### Não confirmado

- o valor da chave client-side/publishable;
- a migration aplicada nesse projeto novo;
- a validação das tabelas/RLS neste projeto novo.

## 13. Próximo passo exato recomendado

Abrir a próxima etapa para **aplicação da migration no ambiente novo**:

- aplicar a migration do módulo somente no projeto novo e somente na etapa autorizada;
- depois validar tabelas/RLS;
- depois rerodar o QA manual.

## 14. Git / entrega

- commit: **não**
- push: **não**
- deploy: **não**
- migration: **não**
