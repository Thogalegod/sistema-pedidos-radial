# Relatórios de Cabine — desenho de unificação

## Escopo

Reconstruir somente o módulo legado de Relatórios de Cabine no MISFY. A etapa cria migrations locais posteriores a `202607211130` e adapta apenas o frontend em `src/app/cabine` e seus helpers diretos. Não aplica migrations e não altera Termografia ou Transformadores.

## Modelo aprovado

- Manter somente `public.relatorios_cabine`.
- Preservar os campos históricos do relatório e substituir `art_arquivo_url` por `art_storage_path` nullable.
- Adicionar `organization_id` obrigatório, `legacy_id` opcional e referências opcionais a `customers`, `customer_sites` e `customer_contacts`.
- Usar unique por organização para `id` e `numero_relatorio`; usar índice unique parcial `(organization_id, legacy_id) WHERE legacy_id IS NOT NULL`.
- Manter `criado_por` como UUID relacionado a `auth.users` e restringir status a `gerado`, `revisado`, `emitido` e `cancelado`.
- Aplicar RLS por `public.is_organization_member`, policies somente para `authenticated`, revogação total de `anon`/`PUBLIC` e grants CRUD mínimos.

## Documentos

O bucket `documentos-cabine` será privado, limitado a 10 MiB e aceitará somente `application/pdf`. O path será `<organization_id>/<relatorio_id>/<arquivo>`. URLs persistidas serão proibidas; a interface abrirá a ART com signed URL temporária.

O relatório será criado antes do upload. Após o upload, o frontend atualizará `art_storage_path`. Se a atualização falhar, removerá somente o objeto recém-enviado e relatará claramente se a compensação também falhar.

Na exclusão, o path será preservado em memória, o relatório será excluído primeiro e somente depois o objeto será removido. Falha do banco impede a remoção do objeto; falha posterior do Storage informa a possibilidade de objeto órfão.

## Storage RLS

- SELECT: membership na organização do primeiro segmento, path organizacional válido e relatório da mesma organização referenciando exatamente o objeto.
- INSERT: membership e relatório correspondente já existente na mesma organização.
- DELETE: bucket/path/membership válidos e `NOT EXISTS` de relatório com `art_storage_path = storage.objects.name`.
- Não haverá policy UPDATE nem acesso `anon`.
- `owner_id` não será exigido porque a exclusão de um relatório é autorizada para qualquer membro da organização, que pode não ser o autor original do upload.

## Compatibilidade do frontend

A criação, contagem mensal, listagem, impressão, cancelamento, vinculação de ART e exclusão serão escopadas por organização. O PDF do relatório continuará sendo produzido pela impressão do navegador, e a renderização da ART continuará usando `react-pdf` com signed URL.

## Verificação

Testes focais cobrirão o contrato estático das migrations, signed URL, compensação do upload, ordem banco→Storage e mensagens de possível órfão. Também serão executados TypeScript e `git diff --check`, sem suíte geral.
