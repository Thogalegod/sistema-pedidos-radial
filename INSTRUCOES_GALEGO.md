# Instruções para continuar no PC

## O que foi feito

### ✅ Task 0 — Gap da Task 5 corrigido
- `salvoEm` agora é preenchido com o `atualizado_em` do servidor quando o rascunho é carregado/criado
- Arquivo: `src/hooks/useTermografiaDraft.ts` (linha 155)

### ✅ Task 6 — Nova página de criação reescrita
A página `/termografia/nova` agora:
- Usa o `useTermografiaDraft` como fonte única dos dados
- Mostra `SaveStatusBanner` com status de salvamento (Salvando, Salvo, Offline, Erro)
- Recupera rascunho automaticamente ao entrar
- Upload individual de cada foto (não mais tudo de uma vez no final)
- Recorte de foto digital com `PhotoCropDialog`
- Status individual por foto (enviando/salva/erro)
- Botão "Adicionar novo ponto" abaixo de "Concluir ponto"
- Botão "Finalizar relatório" no lugar de "Salvar Relatório"
- Bloqueio de finalização com uploads pendentes
- Arquivo: `src/app/termografia/nova/page.tsx`

### ✅ Task 7 — Visualização do relatório corrigida
- **Bug das fotos ausentes corrigido** — `pontos` agora é inicializado com `data.pontos`
- **GeneralDataEditor criado** — modal pra editar cliente, CNPJ, endereço, etc.
- Nº do relatório, proprietário e data de criação bloqueados
- Botão de download pra cada foto
- Botão de excluir ponto individual
- Nomes de foto estáveis (usam `nomeFotoPonto` com ID permanente)
- Arquivos:
  - `src/app/termografia/[id]/page.tsx`
  - `src/components/termografia/GeneralDataEditor.tsx`

### ✅ Task 8 — Listagem filtra só "gerado"
- Adicionado `.eq('status', 'gerado')` na query
- Rascunhos não aparecem misturados na lista
- Arquivo: `src/app/termografia/page.tsx`

---

## Como testar no PC

### 1. Abrir o projeto no Windows
Abra o terminal PowerShell na pasta do projeto (worktree ou clone).

### 2. Instalar dependências
```powershell
npm ci
```

### 3. Rodar os testes
```powershell
npx vitest run --configLoader runner
```

### 4. Rodar o servidor de desenvolvimento
```powershell
npm run dev
```

### 5. Testar o fluxo completo
- Abrir `http://localhost:3000/termografia/nova`
- Preencher dados do cliente, ir pra etapa 2
- Adicionar pontos com fotos
- Ver o banner "Salvando…" → "Rascunho salvo"
- Fechar o navegador e voltar → ver "Seu relatório foi recuperado"
- Clicar "Finalizar relatório"
- Ver o relatório salvo na listagem
- Clicar no relatório, editar dados gerais, baixar fotos

### 6. Migração SQL pendente
No Supabase, executar `termografia_drafts_migration.sql` no SQL Editor.
Essa migração adiciona a coluna `atualizado_em` e o trigger de atualização automática.

---

## Lista de arquivos alterados/criados

**Modificados:**
- `src/hooks/useTermografiaDraft.ts` — fix salvoEm
- `src/app/termografia/nova/page.tsx` — reescrita completa
- `src/app/termografia/[id]/page.tsx` — reescrita completa
- `src/app/termografia/page.tsx` — filtro status=gerado

**Criados:**
- `src/components/termografia/GeneralDataEditor.tsx`
