# V1 — Checklist de execução

Fonte de escopo e ordem: [master plan](2026-09-23-controle-pedidos-tarefas-v1-implementation-plan.md). Este checklist registra execução; não substitui a spec nem autoriza migrations remotas.

Atualizado em 24/09/2026. Worktree: `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`; branch: `codex/controle-locacoes`.

## Protocolo de cada gate

- [ ] Ler o contrato do gate e conferir seu predecessor aprovado.
- [ ] Escrever e executar teste focal RED no ambiente local descartável.
- [ ] Implementar somente o gate e comprovar GREEN, compatibilidade e isolamento.
- [ ] Revisar SQL de verificação, recuperação e diff; TS/lint somente quando aplicáveis.
- [ ] Conferir identidade IURQ, inventário e dry-run com pendências explícitas.
- [ ] Obter aprovação do conjunto exato antes de aplicar migration no IURQ.
- [ ] QA focal, limpeza dos dados temporários e aceite humano.
- [ ] Após autorização: staging seletivo, staged gate, commit e push autorizado.

MISFY permanece proibido. Servidor Next é gerido pelo usuário. Usar RTK quando disponível. Preservar arquivos não relacionados.

## Execução na ordem aprovada

- [x] Gate 0 — inspeção READ-ONLY concluída; não repetir.
- [x] Gate 0.5 — M00 aplicada no IURQ, QA limpo, 148/148; commit `29b1d31c4ac30948dfd0a85cf1c6344d460bd609` publicado em `origin/codex/controle-locacoes`.

### Lote 1 — Fundação

- [x] **1A.1 — Frentes aditivas e criação legada compatível (M01): aplicada no IURQ e aceita; incluída no fechamento autorizado de 1A.1–1B.1.**
- [x] **1A.2 — Estados, espera e identidade (M02): aplicada no IURQ e aceita; incluída no fechamento autorizado de 1A.1–1B.1.**
- [x] **1A.3 — Subtarefas e dependências (M03): aplicada no IURQ, 34/34 migrations, QA limpo e aceite; incluída no fechamento autorizado de 1A.1–1B.1.**
- [x] **1B.1 — Leitores tolerantes: testes/QA e aceite concluídos; fechamento 1A.1–1B.1 no commit `5ea1be65d335fd12fdd3384f4d7cc33146618c5d`, push realizado. Preview publicada; comprovação de seu vínculo com IURQ substituída por validação da aplicação local contra IURQ mediante autorização humana explícita em 24/09/2026. Baseline de lint documentado.**
- [x] **1B.2 — Backfill idempotente (M04): aplicada exclusivamente no IURQ, 35/35 migrations sincronizadas; integridade e QA técnico aprovados. Correções de exclusão de subtarefa/nota retestadas e aceitas manualmente pelo usuário; fechamento Git autorizado.**
- [ ] 1B.3 — Prontidão nominal e associação explícita de responsáveis.
- [ ] 1C.1 — Comandos e ações humanas (M05).
- [ ] 1C.2 — Status canônico e bloqueio de writers obsoletos (M06).
- [ ] 1D — Validação de constraints (M07).

### Lote 2 — Tela do Pedido

- [ ] 2A — Indicadores e próxima ação puros.
- [ ] 2B — Consultas focadas, Resumo e navegação.
- [ ] 2C — Frentes, agrupamento e detalhe de tarefa.

### Lote 3 — Dashboard operacional

- [ ] 3A — Tarefa avulsa e leituras compatíveis (M08).
- [ ] 3B — Quatro filas, filtros reais e criação rápida.

### Lote 4 — Templates

- [ ] 4A — Blueprint, versões e datas civis (M09).
- [ ] 4B — Instanciação atômica, edição e duplicação (M10).
- [ ] 4C — Materialização após primeira conclusão (M11).

### Lote 5 — Timeline e Arquivos

- [ ] 5A — Expansão de atividades e captura de deltas (M12).
- [ ] 5B — Backfill verificável de comentários (M13).
- [ ] 5C — Troca da fonte canônica e vínculos (M14).
- [ ] 5D — Interface única de Atualizações e Arquivos.

### Lote 6 — Eventos e Calendário

- [ ] 6A — Eventos independentes e associações (M15).
- [ ] 6B — Projeção única do calendário.
- [ ] 6C — Calendário global e aba do Pedido.

## Prioridade e ponto de parada

Prioridade atual: fechamento Git autorizado de 1B.2 e preparação local de 1B.3. M04 aplicada com autorização humana no IURQ, 35 migrations locais/35 remotas, nenhuma pendente. O usuário autorizou substituir a comprovação da Preview pela validação da aplicação local compatível contra IURQ; essa decisão não comprova o runtime da Preview. Próximo gate: 1B.3, ainda não iniciado; identidades dependem de revisão humana nominal. Nenhuma próxima migration remota está autorizada. As oportunidades gerais de refatoração ficam nos gates correspondentes; não constituem uma frente paralela.

### Evidências de 1B.2 — aplicação e QA no IURQ (24/09/2026)

- Autorização: usuário respondeu “sim” à substituição da comprovação da Preview pela validação local contra IURQ, aplicação exclusiva de M04 e verificações de integridade/QA. Nenhum navegador, Computer Use ou controle de mouse/teclado foi usado nesta execução.
- Target: `supabase/.temp/project-ref` e identidade do pooler coincidem com `iurqgskfuupslrghgtej`; API confirmou esse projeto ACTIVE_HEALTHY. CLI 2.116.0 já instalada foi usada com `--project-ref iurqgskfuupslrghgtej` explícito. Dry-run: somente `20260923200300_pedidos_v1_backfill.sql`, seeds/roles vazios, `--skip-vault`.
- Aplicação local existente: `http://localhost:3001/` respondeu HTTP 200; a URL pública efetiva de `.env.local` é IURQ. Leitura HTTP dos 23 scripts servidos identificou exclusivamente o ref IURQ em `/_next/static/chunks/src_08e.-50._.js` e `normalizeOrderStatus` em `/_next/static/chunks/src_0bqt0rm._.js`. Evidência do artefato local, não prova de rede da Preview; nenhum segredo foi exibido.
- Aplicação: `db push --linked --project-ref iurqgskfuupslrghgtej --skip-vault --yes` executou apenas M04 com sucesso. Inventário posterior pela CLI: 35/35 versões coincidentes, sem migration inesperada ou pendente.
- Antes/depois, `supabase/verification/pedidos-v1-backfill.sql`: preservados 1 Pedido, 4 tarefas, 2 subtarefas, 1 comentário, 0 atividades anteriores e 0 anexos. Fingerprints dos campos preserváveis idênticos nas seis tabelas; ACL/políticas, RLS, triggers e rollout `legacy/legacy` idênticos. Responsáveis textuais preservados, quatro IDs continuam nulos e quatro `updated_at` continuam desconhecidos.
- Resultado: uma Frente Geral, quatro tarefas vinculadas/Aberta e Pedido Em andamento; uma atividade com chave única, status anterior Ação Pendente e data explicitamente identificada como migração. Zero vínculos inválidos, pais nulos novos, estados desconhecidos ou divergências bool/status. Trigger de timestamp habilitado; rotina privada SECURITY INVOKER, sem EXECUTE para anon/authenticated.
- Testes pós-migration: leitores/mappers, StatusBadge, sorting e Central `29/29`. QA adicional em `.e2e-run-smoke/m04/current-readers.test.tsx` `3/3`: dados reais lidos por CLI sob role authenticated/RLS, mapeamento sem perda, cartão acionável por teclado, drawer com quatro tarefas expansíveis, duas subtarefas, nota e proveniência. Dados reais ficaram apenas em memória; o harness está no diretório ignorado. Não houve inspeção visual de navegador nem teste de download de anexo, pois não existem anexos na amostra.
- QA de escrita no IURQ: transação explícita BEGIN/ROLLBACK, role authenticated de membro existente, somente registros temporários de QA; criação de Pedido/tarefa/Geral, edição de título/prazo, conclusão/reabertura, conclusão de subtarefa sem concluir pai, nota e finalização legada de Pedido passaram. Após rollback, repetição integral do inventário produziu resultado idêntico ao pós-M04: zero resíduos e nenhuma alteração nos registros históricos.
- Suítes amplas anteriores não repetidas. Docker indisponível nesta retomada; os testes SQL locais 378/378 + transição 30/30 da preparação continuam sendo a evidência registrada, não uma nova execução. `git diff --check` aprovado. M04 e QA técnico concluídos; teste manual/fechamento Git pendentes. MISFY não acessado; nenhuma migration seguinte aplicada.

### Pendências do teste manual de 1B.2 — exclusão de detalhes (24/09/2026)

- Teste manual encontrou duas pendências no Pedido: ação de excluir subtarefa não era utilizável de forma confiável e nota de campo não podia ser excluída por todos os membros autorizados. Gate 1B.2 permanece aberto; 1B.3 não foi iniciado.
- Causa comprovada no fluxo completo: os handlers e o `DELETE` físico já existiam, com grants e policies RLS por membership; a UI ocultava as ações por hover, a nota tinha um bloqueio nominal indevido para `Thomás`, não havia confirmação/carregamento e os handlers aceitavam zero linhas removidas como sucesso.
- Correção local mínima: ações sempre acessíveis quando o callback autorizado existe, confirmação nativa, estado pendente/disabled, erro sem remoção otimista e `DELETE ... RETURNING id` tenant-scoped para exigir exatamente o registro alvo antes de atualizar o estado. Nenhuma migration ou dependência adicionada.
- RED registrado: helper ausente e 5/5 cenários da interface falharam. GREEN focal: 17/17 em `OrderDrawer`, helper de exclusão e consistência de migration; TypeScript e lint focal passaram.
- QA no IURQ por integração autenticada e project ref explícito: transação `BEGIN/ROLLBACK` com registros marcados como descartáveis; membro removeu exatamente uma subtarefa e uma nota, identidade sem membership removeu zero, consulta equivalente à recarga não encontrou os alvos, e tarefa principal, irmãos, Pedido e histórico permaneceram. Após rollback, Pedido/tarefa/subtarefas/notas/histórico de QA ficaram todos com contagem zero.
- Aceite: o usuário retestou os dois caminhos da interface e confirmou “perfeito, tudo certo” em 24/09/2026. O QA visual foi realizado pelo usuário, não pelo agente. Fechamento seletivo de 1B.2 autorizado; sem deploy, nova migration ou acesso ao MISFY.

### Evidências de 1B.2 — preparação local

- M04 gerada pela CLI como `20260924153449_pedidos_v1_backfill.sql` e renomeada vazia, antes de uso, para a versão reservada `20260923200300_pedidos_v1_backfill.sql`. Nenhuma migration aplicada anteriormente foi editada.
- RED: 2/2 falhas esperadas por ausência de chave de proveniência e rotina privada. Transição executando a migration real sobre fixtures históricas dentro de rollback: 30/30. Após aplicação exclusivamente no Docker descartável: 30/30. Regressões: M03 62/62, M02 86/86, M01 52/52 e M00 148/148; total focal 378/378, além da transição. SQL de verificação local aprovado.
- Cobertura: sete estados legados/canônicos de Pedido; Frente Geral única; Frente personalizada preservada; nenhuma inferência de identidade mesmo quando o nome coincide; responsável válido preservado e inválido recusado; prazos, conclusão e timestamps desconhecidos preservados; notas/subtarefas sem pai preservadas; proveniência com data da migração; reexecução sem duplicar nem alterar IDs/datas; RLS entre duas organizações e rotina sem acesso das roles de API.
- A rotina só executa em modo legado. Bloqueios transacionais e limite de espera protegem a passagem; apenas o trigger de timestamp é suspenso durante o backfill e restaurado antes do término. Escrita comum após a migração continua recebendo timestamp. Validação de vínculo/tenant permanece ativa.
- Preflight remoto exclusivamente read-only: IURQ `iurqgskfuupslrghgtej` ACTIVE_HEALTHY, 35 locais/34 remotas, dry-run somente M04, sem seeds/roles. Inventário: um Pedido, quatro tarefas, duas subtarefas, um comentário, nenhuma Frente/atividade/anexo. M04 criará uma Geral e uma atividade de proveniência; normalizará um Pedido e quatro tarefas, preservando quatro responsáveis não vinculados e quatro datas de atualização desconhecidas. Zero vínculos inválidos.
- Seis tabelas originais continuam com RLS e sem TRUNCATE para authenticated; fingerprints de dados preserváveis, ACL/políticas e triggers registrados para comparação posterior. Rollout permanece legacy/legacy.
- GitHub confirmou publicação automática da Preview do commit `5ea1be6` (deployment `6641619727`, sucesso). URL: `https://sistema-pedidos-radial-lgwzla1jx-thogalego-4398s-projects.vercel.app`. O vínculo da Preview com IURQ ainda não foi confirmado; publicação não autoriza aplicação da M04.
- Recuperação: falha da migration reverte sua transação; após sucesso, eventual reparo deve ser focal e autorizado, preservando identidades/datas/proveniência. Não converter todos os status de volta indiscriminadamente. Na preparação, M04 ainda não estava aplicada; aplicação e QA posteriores estão registrados acima. 1B.3 não iniciado. MISFY não acessado.

### Evidências de 1A.1

- RED observado: 2/2 falhas por ausência de tabela/coluna; prova concorrente anterior a M01 falha por ausência de serialização.
- GREEN: 52/52 pgTAP; transição real sobre fixtures antigas com rollback: 54/54; regressão de 0.5: 148/148.
- Duas sessões PostgreSQL autenticadas: bloqueio observado, uma única Geral e duas tarefas vinculadas à mesma Frente.
- Após autorização explícita, identidade IURQ reconfirmada e dry-run com 32 migrations locais, 31 remotas e somente M01 pendente. Aplicada exclusivamente M01, sem seeds/roles/Vault; inventário final 32/32, versões e nomes correspondentes.
- Verificação remota: quatro tarefas antigas mantidas com `frente_id` nulo; nenhum backfill e nenhum vínculo inválido. Nova tabela com RLS habilitada e authenticated limitado a SELECT/INSERT/UPDATE/DELETE; anon/PUBLIC sem grants, funções privadas inacessíveis às roles de API. As seis tabelas anteriores mantêm RLS e authenticated sem TRUNCATE.
- QA em `http://localhost:3001`: lista e Pedido existente carregaram; duas tarefas descartáveis criadas pelo writer atual receberam uma única Geral; edição e persistência após recarga confirmadas; ambas excluídas pela UI. Histórico e área de anexos carregaram no estado original.
- Limpeza: removida exclusivamente a Frente vazia gerada pelo QA, por UUID/organização/Pedido e guarda de ausência de tarefas. Zero tarefas de QA e zero Frentes remanescentes; fingerprints do Pedido, quatro tarefas, duas subtarefas, comentário, atividades e anexos idênticos ao início desta execução (comparação de tarefas exclui apenas a coluna aditiva `frente_id`).
- Reexecução final local: Frentes 52/52, baseline 148/148 e concorrência de duas sessões PASS. Container descartável devolvido ao estado parado. Sem regressão funcional observada.
- Aceite: usuário autorizou executar o checklist no navegador e avançar se passasse. Nova rodada passou em lista/abertura/criação/edição/recarga/exclusão; usuário auxiliou nas confirmações de exclusão porque o diálogo nativo bloqueou a automação. Duas tarefas e Frente temporária removidas; fingerprints originais novamente idênticos. Aceite de 1A.1 registrado sem exigir repetição do teste.
- M01 cria Frentes, FK nullable e compatibilidade de INSERT; não altera status, escritores da UI ou dados antigos em massa. Grants/RLS novos são restritos à organização.
- Recuperação: se a validação remota encontrar regressão, interromper o gate e propor correção focal autorizada; preservar Frentes e vínculos já criados, sem DROP ou reversão destrutiva automática.
- CLI gerou inicialmente `20260924133419_pedidos_v1_frentes_expand.sql`; antes de qualquer aplicação, o arquivo vazio foi renomeado para o nome reservado M01 do master plan.
- Harness concorrente específico antecipado para este gate: `supabase/tests/concurrency/pedidos-v1-frentes.sh`, exclusivamente no container descartável nomeado. O harness geral de dependências permanece em 1A.3.
- Nenhum arquivo de produto TS/TSX modificado. SQL novo, testes e este checklist ainda não commitados.

### Evidências de 1A.2

- Inspeção focal no IURQ: membership sem nome; dois membros e nenhum nome nos campos de metadata examinados; nenhuma tabela/fonte de perfis ou convites mantida encontrada no escopo público ou código. O app usa nomes fixos e inferência por e-mail; o shell usa metadata apenas para apresentação. Decisão (b) do contrato: `organization_members.display_name` nullable, mantido via RPC de administrador, como fonte canônica mínima por organização. Nenhum nome/e-mail real publicado. Zero responsáveis antigos com ID fora de membership.
- RED antes de M02: 3/3 falhas esperadas (colunas/diretório ausentes), exit 1. GREEN local: 86/86. Transição aplicando o arquivo real sobre fixtures antigas, com rollback: 88/88, inclusive timestamps/status antigos nulos preservados.
- Regressão após aplicação exclusivamente local: Frentes 52/52; baseline 148/148; prova de duas sessões concorrentes PASS. SQL-only, sem alteração de TS/TSX, sem execução de suite geral do app.
- M02 adiciona campos nullable, prioridade padrão Normal, constraints de espera/membership e união dos sete status de Pedido. Diretório retorna somente UUID/nome da organização; manutenção de nome e associação explícita exigem admin. Membership segue sem UPDATE direto. Tabela privada de rollout sem grants de API, com RLS, modos `legacy`/`legacy`.
- Uma única regra deriva status a partir de `concluido` nesta fase e rejeita ativação prematura de status de workflow. Não há escritor V1 novo nem mudança na UI. Timestamp é independente: INSERT/alteração real recebem data; no-op conserva data; backfill futuro deve suspender somente o trigger de timestamp dentro da transação de migration, sem flag de bypass acessível via API.
- A associação explícita conserva texto legado e demais campos de negócio; a alteração real de identidade recebe timestamp pelo trigger comum. A captura histórica das ações de espera continua no gate de timeline; M02 não permite ao writer legado entrar em Aguardando.
- A FK de responsável é NOT VALID para inventariar/preservar vínculos antigos e validar novos. Remoção de membro referenciado é RESTRICT. Constraints de espera futura também testadas isoladamente em transação local com suspensão temporária do trigger legado; esse teste não ativa o rollout.
- CLI criou `20260924141029_pedidos_v1_status_members_expand.sql`; renomeado vazio antes de aplicação local para `20260923200100_pedidos_v1_status_members_expand.sql`, reservado no master. Nenhuma migration histórica alterada.
- Após autorização específica, identidade IURQ e dry-run reconfirmados: 33 locais/32 remotas, exclusivamente M02 pendente. Aplicada somente M02 com project-ref explícito e skip-vault, sem seeds/roles. Estado final: 33/33 migrations.
- SQL remoto de verificação aprovado passou: quatro tarefas antigas com status/updated_at nulos, nenhum vínculo de responsável/espera inválido, dois nomes ainda nulos, rollout legacy/legacy. Tabela técnica sem grants de PUBLIC/anon/authenticated; membership SELECT-only; quatro RPCs com EXECUTE apenas authenticated entre as roles de API e search_path vazio. RLS e ausência de TRUNCATE reconfirmados nas seis tabelas originais, Frentes e membership.
- QA pelo app existente em localhost:3001: lista e Pedido carregados; tarefa temporária criada como Aberta/Normal com timestamp real; concluída pelo controle visual (Concluída/true), reaberta (Aberta/false, concluida_em nulo) e recarregada com persistência. Nenhum arquivo de produto alterado.
- QA de RPCs no IURQ com role authenticated e identidades existentes de membro comum/admin, em transação com rollback: diretório e capabilities corretos, membro comum impedido de renomear/associar, consulta fora de membership negada, admin renomeia e associa explicitamente apenas tarefa de QA, texto legado preservado e associação repetida não sobrescreve identidade. Nenhuma alteração de nome/atribuição persistiu.
- Limpeza da tarefa e Frente vazia geradas pelo QA via SQL com role authenticated, IDs/tenant/Pedido exatos e proteção de ausência de vínculos. Não repetido o diálogo de exclusão da UI que exigiu intervenção humana no gate anterior. Resultado: zero resíduos, fingerprints dos campos originais das seis relações e membership idênticos ao início; quatro tarefas antigas mantêm nulos históricos e prioridade Normal prevista. App voltou a 0/4 tarefas.
- Sem regressão observada. Testes locais da preparação permanecem 86/86, transição 88/88, Frentes 52/52, baseline 148/148 e concorrência PASS; SQL não mudou após esses testes. Nesta aplicação executados QA remoto, verificação SQL e git diff --check. Recuperação: manter adições, interromper gate em regressão e usar correção focal autorizada; em vazamento comprovado do diretório, revogar acesso à RPC após aprovação, sem DROP ou exclusão de dados.
- Ao encerrar 1A.2, não houve avanço para 1A.3; posteriormente o usuário aceitou o gate ao solicitar o próximo passo, autorizando a preparação local registrada abaixo. Commit/push de 1A.1 e 1A.2 permanecem pendentes. MISFY não acessado.

### Evidências de 1A.3 — preparação local

- M03: `20260923200200_pedidos_v1_subtasks_dependencies.sql`. CLI gerou inicialmente `20260924144504_pedidos_v1_subtasks_dependencies.sql`; arquivo vazio renomeado antes de qualquer aplicação para o timestamp reservado no master. Nenhuma migration histórica alterada.
- RED observado: pgTAP 3/3 falhas por ausência de tabela/colunas; harness concorrente falhou pela ausência da RPC. Transição aplicando a M03 real sobre subtarefas existentes dentro de rollback: 62/62. Aplicação exclusivamente no Docker descartável seguida de GREEN: 62/62.
- Prazo e prioridade de subtarefa opcionais, sem backfill. Conclusão de subtarefa não conclui tarefa. Dependências limitadas à mesma organização/Pedido, com FKs compostas; rejeitados autorreferência, duplicação, órfãos e ciclos de dois/três nós. Exclusão de tarefa remove somente suas relações.
- Escrita de dependências exclusivamente pelas RPCs, que validam identidade/membership e bloqueiam o Pedido antes de verificar ciclos. Tabela com RLS, authenticated SELECT-only, PUBLIC/anon sem privilégios; helper privado inacessível pela API, search_path vazio. Isolamento de leitura e rejeição de escrita entre organizações comprovados com roles autenticadas.
- Duas sessões reais: bloqueio observado, tentativa inversa rejeitada com SQLSTATE 23514 e somente uma relação persistida. Fixtures temporárias removidas no finally; container local fixo, sem URL/credenciais remotas no harness.
- Decisão técnica: RPCs exigem isolamento READ COMMITTED (READ UNCOMMITTED tem a mesma semântica no PostgreSQL); snapshots REPEATABLE READ/SERIALIZABLE são recusados com 25001. Isso evita verificar um grafo antigo após aguardar o lock sem criar UPDATE artificial no Pedido. Rejeição de REPEATABLE READ testada no harness; a transação usual da API permanece compatível.
- Regressões após M03: M02 86/86, Frentes 52/52, baseline 148/148 e concorrência de criação da Geral PASS. Total das suites ordinárias: 348/348; transição de M03 adicional: 62/62. Lint focal do `.mjs` e git diff --check passaram. Sem alterações de produto TS/TSX nem suíte geral desnecessária.
- SQL de verificação executado localmente: zero ciclos/órfãos, constraints validadas, grants/RLS/RPCs corretos. Contagens de negócio zero após rollback/limpeza dos dados sintéticos; não são contagens do IURQ.
- Identidade remota reconfirmada: IURQ `iurqgskfuupslrghgtej`, ACTIVE_HEALTHY, vínculo local correspondente. Inventário 34 local/33 remoto e dry-run com somente M03, sem seeds/roles. Nenhuma aplicação remota nesta etapa; MISFY não acessado.
- Próximo gate autorizado separadamente: aplicar somente M03, verificar 34/34, testar adicionar/remover dependências via RPC em registros de QA e confirmar compatibilidade da UI atual, com limpeza e integridade do Pedido original. Recuperação: preservar colunas/dados e suspender RPC problemática somente após aprovação; sem DROP automático.
- Sem commit, push, merge, deploy ou avanço para 1B.1. Container descartável devolvido ao estado parado ao encerrar as verificações locais.

### Evidências de 1A.3 — aplicação e QA no IURQ

- Autorização explícita recebida: aplicar somente M03 e executar QA focal com limpeza. Reconfirmados project-ref `iurqgskfuupslrghgtej`, ACTIVE_HEALTHY, 34 arquivos locais/33 migrations remotas e dry-run exclusivamente M03. CLI aplicou apenas `20260923200200_pedidos_v1_subtasks_dependencies.sql`, sem seeds/roles/Vault. Inventário final 34/34; as 33 entradas anteriores preservadas.
- Verificações pós-aplicação: duas subtarefas históricas com os dois campos novos nulos; zero dependências automáticas; FKs/CHECK/PK validadas; RLS habilitada; authenticated SELECT-only na tabela, anon/PUBLIC sem grants. RPCs com EXECUTE authenticated e sem anon, search_path vazio; helper privado sem acesso das roles de API. Seis tabelas originais continuam com RLS e sem TRUNCATE para authenticated.
- UI em localhost:3001: lista e Pedido original carregam; duas tarefas descartáveis criadas; tarefa A editada e persistência confirmada após recarga; histórico e documentos carregam no estado original. Nenhum código de produto alterado nem servidor novo iniciado.
- QA de SQL/RPC com role authenticated e identidade real de membro comum escolhida internamente: adicionar/remover relação, remoção repetida, bloqueio de ciclo inverso/duplicação/escrita direta/organização forjada. Identidade sintética sem membership não lê o grafo nem remove relação. Subtarefa temporária permite prazo/prioridade, edição e conclusão sem concluir pai. Toda essa transação terminou em ROLLBACK; nenhum nome, vínculo, subtarefa ou dependência desse teste persistiu. Isolamento entre dois tenants reais continua coberto pelas fixtures locais, sem criar organizações ou usuários no IURQ.
- Limpeza das duas tarefas criadas pela UI e da Frente Geral vazia gerada pelo QA via SQL autenticado, com UUID/tenant/Pedido/título exatos e guarda de ausência de tarefas. A primeira tentativa referenciou `public.frentes`, nome inexistente, e foi revertida integralmente; após conferir M01, corrigido para `public.pedido_frentes` e limpeza concluída. Não houve exclusão parcial nem alteração no Pedido original.
- Resultado final: zero tarefas/Frentes temporárias, zero relações/ciclos/órfãos. Fingerprints das seis relações originais idênticos ao início, incluindo todos os campos das tarefas e excluindo somente as duas colunas aditivas das subtarefas. Permanecem um Pedido, quatro tarefas, duas subtarefas, um comentário, zero atividades e zero anexos. UI recarregada voltou a 0/4 tarefas.
- Advisor de segurança: as duas RPCs M03 aparecem no [aviso genérico de SECURITY DEFINER autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); exposição intencional do contrato, com membership/isolamento/search_path/grants verificados. Há também avisos em objetos fora da M03: [search_path mutável](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) em `update_updated_at_column`, [EXECUTE anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) em três funções de relatórios, tabelas técnicas com RLS sem policies e [proteção contra senhas vazadas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Registrados, sem ampliar este gate ou alterar esses objetos.
- Nenhuma regressão funcional observada. As suites locais da preparação permanecem 348/348, transição 62/62 e duas provas concorrentes PASS; migration não mudou desde então. Esta rodada validou aplicação, catálogo, RPCs e UI remotos, com limpeza e diff check. Sem commit/push/deploy ou avanço para 1B.1; MISFY não acessado.

### Evidências de 1B.1 — leitores tolerantes

- Aceite de 1A.3: usuário disse “pronto, siga”. Executado somente 1B.1, no mesmo worktree/branch. Nenhuma migration, backfill, troca da capability, commit, push ou deploy. MISFY não acessado.
- Tipos de domínio e fixtures introduzidos; adapters validam datas civis e campos recebidos com Zod, normalizam os sete status de Pedido, preservam null de timestamps/identidade e rejeitam status desconhecidos. No modo legacy, a conclusão da tarefa continua derivada de `concluido`; no modo v1, exige status canônico. Subtarefa histórica com `concluida` nula continua desmarcada, sem alteração no banco.
- A UI usa Em andamento/Finalizado/Cancelado, mantém prioridade legada separada e apresenta o nome legado sem restringir o tipo a funcionários fixos. `assigneeUserId` é preservado; “não vinculado” identifica nome sem ID. Diretório usa `list_pedido_members(p_org)`, resolve nome apenas quando único e apresenta falhas como erro. Leitor de capability validado, sem fallback silencioso. Uso do diretório nos novos controles e troca do filtro “Minhas” por ID continuam no gate 1B.3.
- Página usa adapter único em vez dos casts `any` do nested select, consulta capability, ignora respostas superadas/desmontadas e exibe erro de leitura. Writers atuais permanecem, com encoding de Pedido conforme capability. Criar Pedido usa Em andamento na UI/Ação Pendente no banco legacy; finalizar/reabrir automaticamente pelo fluxo antigo continua até 1C.1. Não expostos comandos novos de cancelamento/espera/dependências.
- Sorting mantém Pedidos encerrados abaixo dos ativos e desempate determinístico; badge sempre mostra status textual e conserva indicadores de prazo em separado. Central usa a projeção de conclusão com modo legacy como contrato vigente; consultas financeiras e URLs existentes preservadas. A ativação da consulta de status/capability na Central pertence ao cutover posterior, não foi antecipada.
- RED comportamental: 20 falhas esperadas nos adapters/diretório/status/sorting/consumidor Central, após módulos mínimos e correção do link esperado para o contrato existente `?pedido=`. Casos adicionais RED→GREEN para boolean nullable histórico e preservação do indicador de prazo hoje. GREEN final: **62/62 em 13 arquivos**, abrangendo Pedidos/Tarefas, Central, sorting e badge. `tsc --noEmit` passou; git diff --check passou.
- Lint: módulos novos e consumidores sem dívida anterior passaram. Lint focal completo retorna **7 erros e 2 warnings preexistentes**, comprovados executando ESLint sobre `git show HEAD:<arquivo>` sem editar o baseline: `page.tsx` (set-state-in-effect na inferência antiga do nome); `NewOrderDrawer.tsx` (set-state-in-effect no reset); `OrderDrawer.tsx` (dois any de reconhecimento de voz, dois ts-ignore, reset no effect; warnings de import e img). Nenhum diagnóstico novo. Os any do mapper da página foram removidos. Não declarar lint global verde nem ampliar o gate para reescrever voz/reset dos drawers.
- QA em localhost:3001: Pedido real abre como Em andamento, 0/4; criação de Pedido temporário com progresso 0/0, criação/edição de tarefa, conclusão/reabertura e recarga com persistência. Banco confirmou Ação Pendente na criação e Concluído após a conclusão, enquanto UI mostrou os rótulos normalizados. Link Central→Pedido abriu o detalhe correto; contagens operacionais e financeiras da Central carregaram.
- Pedido QA `c52b6068-0829-4583-886c-fe37ba7400f2`, tarefa `04153f19-7416-4342-9b69-cb11dfd39390` e Frente gerada removidos com SQL autenticado, IDs/tenant/título exatos e guardas contra conteúdo inesperado. Nenhum anexo criado. Zero resíduos e fingerprints das seis relações do Pedido original idênticos. Inventário remoto permanece 34 e local sem migration nova.
- Limite: sete status cobertos pela matriz unitária; navegador exercitou os estados presentes no IURQ e o ciclo do Pedido de QA. Aplicação disponível apenas no servidor local existente. Antes de aplicar M04, publicar/autorizar o leitor compatível no destino correto; não usar localhost como prova de publicação.
- Aceite e fechamento: usuário confirmou “feito pode fazer o commit e push e vamos para o proximo passo”. Autorizado registrar e enviar somente os arquivos dos gates concluídos 1A.1–1B.1, após staging seletivo e staged gate. A autorização não inclui deploy, merge ou aplicação de M04.
