# Inventário final — Pedidos/Tarefas

Data da auditoria: 2026-07-21.

Escopo: inventário read-only do IURQ necessário para reconstruir Pedidos/Tarefas no MISFY. Nenhuma linha de negócio foi lida; apenas catálogo, contagens, valores distintos de status/prioridade autorizados e estrutura do frontend.

## Tabelas legadas

### `pedidos`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `numero_pedido` | `text` | não | — |
| `projeto` | `text` | não | — |
| `cliente` | `text` | não | — |
| `endereco` | `text` | não | — |
| `prioridade` | `text` | não | — |
| `status` | `text` | não | — |
| `data_criacao` | `timestamptz` | não | `timezone('utc'::text, now())` |
| `prazo_concessionaria` | `date` | sim | — |
| `cep` | `text` | sim | — |

Checks: `prioridade IN ('Baixa', 'Normal', 'Alta')`; `status IN ('Ação Pendente', 'Aguardando Cliente', 'Prazo Concessionária', 'Concluído')`.

### `tarefas`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `pedido_id` | `uuid` | não | — |
| `descricao` | `text` | não | — |
| `responsavel` | `text` | sim | — |
| `concluido` | `boolean` | não | `false` |
| `vencimento` | `date` | sim | — |
| `prazo` | `timestamptz` | sim | — |
| `concluida_em` | `timestamptz` | sim | — |

FK: `pedido_id -> pedidos(id) ON DELETE CASCADE`.

### `subtarefas`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `tarefa_id` | `uuid` | sim | — |
| `descricao` | `text` | não | — |
| `concluida` | `boolean` | sim | `false` |
| `criado_em` | `timestamptz` | não | `timezone('utc'::text, now())` |

FK: `tarefa_id -> tarefas(id) ON DELETE CASCADE`.

### `comentarios_tarefa`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `tarefa_id` | `uuid` | sim | — |
| `texto` | `text` | não | — |
| `usuario` | `text` | não | — |
| `criado_em` | `timestamptz` | não | `timezone('utc'::text, now())` |

FK: `tarefa_id -> tarefas(id) ON DELETE CASCADE`.

### `atividades`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `pedido_id` | `uuid` | não | — |
| `descricao` | `text` | não | — |
| `usuario` | `text` | não | — |
| `criado_em` | `timestamptz` | não | `timezone('utc'::text, now())` |

FK: `pedido_id -> pedidos(id) ON DELETE CASCADE`.

### `anexos`

| Coluna | Tipo | Nulo | Default |
|---|---|---:|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `pedido_id` | `uuid` | não | — |
| `nome_arquivo` | `text` | não | — |
| `legenda` | `text` | sim | — |
| `tipo` | `text` | não | — |
| `url` | `text` | não | — |
| `criado_em` | `timestamptz` | não | `timezone('utc'::text, now())` |

FK: `pedido_id -> pedidos(id) ON DELETE CASCADE`.

## Índices, triggers e dados de domínio

- O IURQ possui somente os seis índices de chave primária nesse escopo.
- Não há triggers não internos nem funções de trigger ligadas às seis tabelas.
- Valores atualmente presentes: status `Ação Pendente`; prioridades `Alta` e `Normal`.
- O frontend também usa os valores válidos não presentes na pequena amostra: prioridade `Baixa`; status `Aguardando Cliente`, `Prazo Concessionária` e `Concluído`.
- Contagens exatas por metadata HEAD: 2 pedidos, 4 tarefas, 1 subtarefa, 1 comentário, 1 atividade e 0 anexos.
- RLS está habilitado e não forçado nas seis tabelas do IURQ, mas leitura anônima efetiva foi confirmada. Policies, grants e permissões legadas foram deliberadamente descartados.
- O bucket `anexos-pedidos` não existe no IURQ.

## Consultas e mutações reais do frontend

Consulta raiz exata:

```ts
.from('pedidos')
.select('*, tarefas(*, subtarefas(*), comentarios_tarefa(*)), atividades(*), anexos(*)')
```

Dependências:

- `pedidos`: leitura e CRUD de `numero_pedido`, `projeto`, `cliente`, `endereco`, `prioridade`, `status`, `data_criacao`, `prazo_concessionaria`; o formulário coleta `cep`.
- `tarefas`: leitura e CRUD de `descricao`, `responsavel`, `concluido`, `vencimento`, `concluida_em`. `prazo` não é usado.
- `subtarefas`: leitura e CRUD.
- `comentarios_tarefa`: leitura, insert e delete.
- `atividades`: leitura, insert e delete.
- `anexos`: leitura, insert e delete; o código legado usava bucket público, `<pedido_id>/<arquivo>`, `getPublicUrl` e a coluna `url`.
- `perfis` não é consultada pelo módulo; o nome exibido é derivado localmente do e-mail da sessão.

## Dependências MISFY confirmadas

- `organizations(id)` e `organization_members(organization_id, user_id)` existem; membership tem RLS.
- `public.is_organization_member(uuid)` e `public.is_organization_admin(uuid)` são `SECURITY DEFINER`, validam `auth.uid()` e têm `search_path = public`.
- `customers`, `customer_sites` e `customer_contacts` têm `UNIQUE (organization_id, id)` e RLS.
- As FKs MISFY existentes entre cliente/local/contato já usam `organization_id` composto.
- O modelo de grants aplicado concede acesso somente a `authenticated`, por tabela e operação.

## Decisões materializadas

- As seis tabelas e os campos texto legados permanecem.
- Todas recebem `organization_id NOT NULL`, unique `(organization_id, id)` e FKs filhas compostas.
- `pedidos` recebe `customer_id`, `site_id` e `contact_id` opcionais.
- Referências Auth são opcionais e não substituem `responsavel`/`usuario` texto.
- `tarefas.prazo` permanece nullable, comentada como depreciada e sem uso no código novo.
- `anexos.url` é substituída por `storage_path`; URLs são assinadas e efêmeras.
- O bucket privado usa `<organization_id>/<pedido_id>/<arquivo>`.
- A exclusão preserva o `storage_path`, remove primeiro o metadado e só então o objeto. Falha no metadado impede a remoção do objeto; falha posterior no Storage informa a possibilidade de objeto órfão. No sucesso, metadado e objeto desaparecem antes do registro pai.
- A policy DELETE de Storage exige membership, caminho exato e ausência da linha de metadados em `public.anexos`.
- A FK nova de `anexos` usa `ON DELETE RESTRICT` em vez do `CASCADE` legado para impedir que um pedido apague metadados antes da limpeza dos objetos privados.
- Não foram recriados `perfis`, relatórios, policies antigas ou grants antigos.

## Artefatos locais

- `supabase/migrations/202607211100_pedidos_tarefas_core.sql`
- `supabase/migrations/202607211130_pedidos_anexos_storage.sql`
- `src/lib/pedidos-tarefas/migration-consistency.test.ts`
- `src/lib/pedidos-tarefas/organization.test.ts`

Nenhuma migration foi aplicada e nenhum banco foi alterado durante esta auditoria.

## Verificações locais

- Testes focais: 14/14.
- Suíte completa: 144/144.
- TypeScript: `npx tsc --noEmit --incremental false` passou.
- ESLint dos novos helpers/testes e tipos: passou.
- O lint global continua bloqueado por 81 erros e 44 avisos preexistentes em módulos fora do escopo.
- O build compilou e concluiu TypeScript, mas a geração estática parou na rota preexistente `/cabine` porque o worktree limpo não contém `NEXT_PUBLIC_SUPABASE_URL`; nenhum `.env` foi criado ou alterado.
