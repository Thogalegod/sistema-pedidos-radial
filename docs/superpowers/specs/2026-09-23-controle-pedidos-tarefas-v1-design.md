# Controle de Pedidos + Tarefas — desenho arquitetural da V1

**Data:** 23/09/2026

**Estado:** spec para revisão do usuário; implementação não autorizada

**Base inspecionada:** `codex/controle-locacoes`, HEAD `3b6efe40ccf7b3de87aedb4204d7ea5bfb9cac9a`

**Escopo deste documento:** evolução do Controle de Pedidos existente por camadas

## 1. Resultado esperado e limites

Uma pessoa deve abrir o sistema e identificar rapidamente o que fazer hoje, o que atrasou, quem responde por cada ação, de quem se espera retorno, quais cobranças de retorno vencem hoje, como está cada Pedido e o que mudou recentemente. A V1 prioriza clareza, velocidade, poucos campos obrigatórios e leitura visual. Pedido, Frente, Tarefa e atualização têm papéis distintos; alertas derivados não alteram status nem prioridade manual.

### Princípio central aprovado

**Evoluir o Controle de Pedidos existente por camadas.** Não criar sistema paralelo nem reescrever o módulo do zero. Preservar sempre que possível Pedidos, tarefas, subtarefas, anexos, atividades, organização/tenant, RLS, navegação e fluxos úteis atuais. Quando um contrato atual conflitar com a V1, fazer transição controlada e explícita. Cada conceito tem uma fonte de verdade definida em cada fase; não manter tabelas ou fluxos duplicados para evitar a adaptação do modelo atual.

A arquitetura usa unidades pequenas com responsabilidades claras, helpers/serviços testáveis, queries focadas, compatibilidade com dados existentes e migrations incrementais. Cada lote termina com o aplicativo funcional e pode ser aprovado ou interrompido antes do seguinte. Dentro de um lote, mudanças de banco e código seguem fases compatíveis para que uma publicação parcial não quebre o fluxo em uso.

O fluxo existente de Controle de Pedidos é a base. Esta spec não propõe reescrita, módulo paralelo, Kanban nem uma plataforma genérica de gestão de projetos. Também ficam fora da V1: arrastar e soltar, notificações push, WhatsApp/Telegram, e-mail automático, sugestões ou resumos por IA, favoritos/recentes, campos genéricos, dependências entre Pedidos, automações avançadas, integração Google Calendar, métricas de produtividade, SLA, visualizações customizáveis e diário de obra sofisticado.

Este documento não autoriza migration, alteração de Supabase, implementação, commit, push, merge ou deploy. IURQ é desenvolvimento/homologação; MISFY é produção protegida e exige autorização humana explícita e separada por ação. A inspeção anterior foi apenas do repositório; dados e schema ao vivo não foram consultados.

## 2. Base existente e decisão arquitetural

O schema em `supabase/migrations/202607211100_pedidos_tarefas_core.sql` já contém `pedidos`, `tarefas`, `subtarefas`, `comentarios_tarefa`, `atividades` e `anexos`, todos com `organization_id`, RLS e relações entre linhas da mesma organização. `supabase/migrations/202607211130_pedidos_anexos_storage.sql` fornece bucket privado por caminho `organization_id/pedido_id/arquivo`. `src/app/page.tsx` consulta Pedidos com filhos, executa as mutações e renderiza `OrderCard`, `OrderDrawer` e `NewOrderDrawer`. `src/app/hub/page.tsx` e `src/lib/central/` já apresentam tarefas atrasadas/para hoje ao lado de pendências financeiras. `src/lib/pedidos-tarefas/task-due.ts` compara datas de tarefa com o dia local.

Diferenças relevantes a resolver:

| Hoje | V1 |
| --- | --- |
| Pedido: `Ação Pendente`, `Aguardando Cliente`, `Prazo Concessionária`, `Concluído` | Pedido: `Em andamento`, `Finalizado`, `Cancelado`; condições de espera e prazo são indicadores. |
| Marcar a última tarefa conclui automaticamente o Pedido; adicionar tarefa pode reabri-lo | Somente ação humana explícita muda o status do Pedido. |
| Tarefa tem `concluido` booleano e `pedido_id NOT NULL` | Quatro estados próprios; tarefa avulsa usa `pedido_id NULL`. |
| Responsável é gravado como nome; `responsavel_user_id` não é preenchido pelo fluxo atual | Identidade autenticada é a referência para novos responsáveis; nome legado permanece para migração e exibição. |
| Notas da tarefa e atividades do Pedido ficam em tabelas/áreas distintas | Uma timeline do Pedido com contexto opcional de Frente ou Tarefa. |
| Drawer único carrega também todos os anexos | Resumo padrão e abas, com consultas focalizadas. |

Serão preservados os campos existentes de Pedido — número, projeto, cliente, endereço, CEP, referências opcionais de cliente/local/contato, prioridade legada e prazo da concessionária. A prioridade legada do Pedido não substitui a prioridade manual de cada Tarefa nem muda automaticamente. `tarefas.vencimento` segue como prazo da tarefa; `tarefas.prazo` continua depreciado e não recebe novas gravações.

## 3. Modelo funcional

### 3.1 Pedido

Pedido é o contêiner de Frentes, tarefas, atualizações, arquivos e eventos associados. Seus únicos status manuais na V1 são **Em andamento**, **Finalizado** e **Cancelado**. Novo Pedido começa Em andamento. Não existe um estado “Aberto” separado. A finalização e o cancelamento exigem ação explícita com confirmação; concluir todas as tarefas apenas mostra “Tudo concluído — pronto para finalizar”. A conclusão automática e a reabertura automática atuais deixam de existir. Finalizado/Cancelado não recebe tarefas novas até uma reabertura explícita; reabrir, quando necessário, também é ato humano.

O progresso é `tarefas concluídas / total de tarefas vinculadas`; Pedido sem tarefas mostra estado vazio, não 100%. Resumo e cartão exibem, separadamente, tarefas atrasadas, para hoje, aguardando terceiros, follow-ups vencidos/hoje e bloqueios. Um Pedido Finalizado ou Cancelado conserva histórico, arquivos e tarefas. O status manual é exibido mesmo que algum indicador mereça atenção; indicadores não o sobrescrevem.

### 3.2 Frente/Etapa

Uma Frente pertence a exatamente um Pedido e agrupa suas tarefas. Tem nome e ordem de exibição; não tem status manual. Seu progresso e seus alertas derivam das tarefas vinculadas, pela mesma regra do Pedido. Frentes podem ser criadas, renomeadas e reordenadas; remover uma Frente exige antes mover ou desvincular tarefas, atualizações, arquivos e eventos associados, preservando o histórico. Uma tarefa vinculada a Pedido pertence a exatamente uma Frente do mesmo Pedido. O botão “+ Nova tarefa” dentro da Frente a pré-seleciona. No botão geral, a única Frente existente é pré-selecionada; entre várias, o usuário escolhe. Se ainda não houver nenhuma, o fluxo permite criar “Geral” junto da primeira tarefa. Pedidos existentes recebem uma Frente “Geral” na migração, com suas tarefas vinculadas. Um Pedido novo em branco pode começar sem Frentes nem tarefas.

### 3.3 Tarefa

Os status são **Aberta**, **Em andamento**, **Aguardando** e **Concluída**. Prioridade manual independente: **Urgente**, **Alta**, **Normal** e **Baixa**; padrão Normal. O sistema nunca a eleva ou reduz automaticamente. Prazo (`date`) e follow-up (`date`) são independentes entre si e do status/prioridade; follow-up é permitido em qualquer tarefa não concluída. Aguardando não pausa nem altera o prazo. Uma tarefa pode aparecer simultaneamente em “Atrasadas”, “Aguardando Cliente” e “Follow-ups de hoje”. Tarefas concluídas deixam as filas de ação, mas mantêm prazo, follow-up e histórico para consulta.

“Responsável interno” indica quem acompanha e cobra. Para tarefa criada em Pedido, o padrão é o usuário autenticado que a criou. `responsavel_user_id` deve identificar um membro da mesma organização; a interface mostra nome legível. `responsavel` em texto fica como compatibilidade dos registros antigos, não como fonte de identidade para novos filtros.

“Aguardando de” é outra dimensão. O tipo de espera é **Cliente**, **Concessionária**, **Fornecedor**, **Pessoa interna** ou **Outro**. Esses são os únicos tipos estáveis do domínio; nomes de funcionários não são categorias de schema. Quando o tipo for Pessoa interna, `waiting_user_id` referencia um membro real da mesma organização e a interface resolve seu nome, permitindo apresentar “Aguardando · Thomás”, “Aguardando · Katlyn” ou qualquer membro futuro sem alterar schema. Nos demais tipos, `waiting_user_id` deve ser nulo. Um complemento livre é sempre opcional. Uma tarefa em Aguardando exige tipo de espera e, para Pessoa interna, exige o membro; ao sair desse status, os campos deixam de compor os alertas, e a alteração permanece na timeline. RLS e constraints devem impedir referências a membro de outra organização.

Criar tarefa vinculada a Pedido exige apenas título e Frente. Status Aberta, prioridade Normal e responsável criador são defaults; descrição, prazo, follow-up e subtarefas são opcionais. O botão de conclusão exige clique explícito. Concluir todas as subtarefas mostra “Subtarefas concluídas — pronta para concluir”, sem mudar o status da tarefa. A existência de subtarefas ainda abertas ou de dependências não concluídas produz orientação visível; a V1 não transforma esses indicadores em outro status nem conclui outros registros automaticamente.

Tarefa rápida/avulsa usa a **mesma tabela `tarefas`**, com `pedido_id` e `frente_id` nulos. Seu responsável padrão é Thomás, com troca permitida. O padrão deve resolver o membro Thomás da organização para um ID real; se a identidade não puder ser resolvida com segurança, a criação pede escolha de responsável, sem gravar um ID inventado. A V1 cria e acompanha a tarefa avulsa; a ação de vinculá-la posteriormente a um Pedido é evolução futura, não pré-requisito do dashboard. Quando essa ação existir, exigirá Frente do Pedido e preservará tarefa, subtarefas e atualizações. Dependências só passam a valer quando todos os envolvidos são tarefas do mesmo Pedido.

### 3.4 Subtarefas e dependências

Subtarefa reaproveita `subtarefas`: descrição, checkbox, prazo opcional e prioridade opcional. Não recebe responsável, status completo nem comentários próprios. O prazo de subtarefa pode aparecer no calendário; sua conclusão não conclui a tarefa principal. Dependência é uma relação dirigida “tarefa A depende de tarefa B”. Ambas precisam pertencer à mesma organização e ao mesmo Pedido; tarefa avulsa não participa de dependências nesta V1. Duplicatas, auto dependência e ciclos são rejeitados. O indicador “Bloqueada por N tarefas” conta apenas predecessoras ainda não concluídas e some quando elas terminam. Bloqueada não é status; uma tarefa pode também estar Aguardando e atrasada.

### 3.5 Templates

Novo Pedido oferece “Em branco” ou “Usar template”. Um template pertence à organização, pode ser criado, editado e duplicado e contém Frentes, tarefas, subtarefas, dependências, prioridades sugeridas e regras relativas de prazo/follow-up. A definição é um blueprint validado e versionado em `pedido_templates`, não outra tabela de Pedidos ou tarefas operacionais. Instanciar produz cópias editáveis nas tabelas operacionais existentes, com novos IDs; alterar o template depois não altera Pedidos existentes. A criação de Pedido a partir de template precisa ser atômica: ou Pedido, Frentes, tarefas, subtarefas e dependências são criados juntos, ou nada é criado.

Regras D+n usam **dias corridos**, contados da data local de criação do Pedido. “Hoje” é D+0. “N dias após concluir outra tarefa” guarda a referência à tarefa origem na instância; antes da conclusão, o prazo derivado fica pendente e isso é mostrado ao usuário. Na primeira conclusão da origem, a data é calculada uma vez. Reabrir a origem não altera retroativamente esse prazo; edição manual da data prevalece. Esta é uma regra focal de template, não um mecanismo genérico de automações. Follow-ups sugeridos seguem a mesma regra de dias corridos quando definidos em template. Salvar um Pedido existente como template fica para evolução posterior.

### 3.6 Atualizações, arquivos, eventos e calendário

Cada Pedido tem uma timeline única. Uma atualização contém texto, autor e data/hora, com vínculo opcional a Frente e/ou Tarefa do mesmo Pedido e follow-up associado quando fizer sentido. Fotos/documentos são anexos ligados à atualização. A timeline inclui também mudanças operacionais relevantes (por exemplo, conclusão, reabertura, finalização e alteração de espera), identificadas como registros do sistema, sem registrar cada edição trivial. Notas antigas de `comentarios_tarefa` e registros de `atividades` devem aparecer cronologicamente nessa timeline, preservando texto, autor e data. Novas notas passam a usar `atividades` como fonte canônica única; não permanecem duas caixas independentes de comentários e histórico. Uma atualização de tarefa avulsa tem Tarefa, mas não Pedido; aparece no detalhe da tarefa. Se a tarefa for vinculada a Pedido no futuro, suas atualizações passam a compor a timeline daquele Pedido pelo vínculo com a Tarefa, sem criar cópias.

`anexos` continua sendo o repositório de arquivos por Pedido e o bucket privado conserva o caminho atual. Cada arquivo permanece ligado ao Pedido e pode ter vínculo opcional a Frente, Tarefa e/ou atualização do mesmo Pedido. Todos aparecem na aba Arquivos; filtros por tipo, Frente e Tarefa podem ser incrementais. A remoção de arquivo/Pedido mantém as proteções atuais contra metadados ou objetos órfãos. Não há upload de arquivo “solto” sem Pedido nesta V1.

Evento é entidade distinta de Tarefa: Reunião, Visita, Serviço externo ou Outro. Tem título, data, horário, responsável, observação e associações opcionais a cliente, Pedido, Frente e Tarefa, com coerência entre elas. Pode existir sem Pedido. Calendário é leitura unificada dos prazos de tarefas/subtarefas, follow-ups e eventos; não duplica nem edita uma cópia dos dados. Alterar um item abre a entidade de origem. Não há sincronização com Google Calendar.

No Lote 6, o Radial recebe uma visão **global** do calendário. Ela reúne prazo de Tarefa, prazo de Subtarefa, Follow-up, Reunião, Visita, Serviço externo e Outro Evento de todos os Pedidos, além de Eventos sem Pedido, sempre respeitando a organização atual. `Pedido > Calendário` usa as mesmas fontes e regras, apenas filtradas para o Pedido aberto; não mantém dados ou regras paralelas.

## 4. Telas e consultas

### 4.1 Pedido

Abrir `/?pedido=<id>` continua levando ao Pedido, preservando links da Central e da busca. A aba padrão é **Resumo**; as demais são **Tarefas**, **Atualizações**, **Arquivos** e **Calendário**. O Resumo mostra progresso geral e por Frente, atrasadas, aguardando, follow-ups, bloqueios, próxima ação relevante e atualização recente. A “próxima ação” é selecionada por regra determinística e explicável: atraso, vencimento hoje, follow-up vencido/hoje e depois próximo prazo; empate por data e prioridade manual. Ela não altera prioridade. Se não houver ação, mostrar estado vazio claro.

Tarefas abrem por **Etapa**; alternativa **Prazo**. Ambas mostram as mesmas tarefas e permitem abrir seu detalhe, editar e concluir. A criação dentro de Frente pré-seleciona a Frente. Não há Kanban. A aba Atualizações apresenta uma única linha do tempo com contexto visível; a aba Arquivos reúne todos os arquivos do Pedido; Calendário filtra a visão global unificada ao Pedido.

### 4.2 Dashboard operacional

A Central existente evolui, preservando as seções atuais de locações e cobranças. Para Pedidos/Tarefas, oferece **Atrasadas**, **Hoje**, **Follow-ups** e **Aguardando**, com entrada rápida para criar tarefa avulsa. As seções não são mutuamente exclusivas: a mesma tarefa pode aparecer em várias. “Follow-ups” mostra datas até hoje e destaca hoje/atrasados; “Hoje” usa prazo da tarefa igual à data local. Filtros Todas, Minhas, por membro interno (por exemplo, Katlyn) e aguardando Cliente/Fornecedor/Concessionária podem ser adicionados sem criar visualizações salvas genéricas. “Minhas” e os filtros por pessoa usam IDs reais de membros da organização, nunca comparação de substring de e-mail ou nome.

Cada item deve comunicar sem abrir: título, Pedido/número e cliente quando houver, urgência automática, status, prioridade manual, responsável interno, de quem se aguarda retorno, prazo, follow-up, última atualização e próxima ação. Para tarefa avulsa, o cartão identifica “Tarefa avulsa” no lugar de Pedido/cliente. “Última atualização” usa a atualização manual mais recente da tarefa/Frente/Pedido quando houver, ou a última alteração registrada da tarefa; um registro legado sem data confiável mostra “Não registrada”, sem fabricar data. A navegação abre a tarefa correta, inclusive dentro do Pedido; não apenas o topo do Pedido. Consultas de dashboard são filtradas por organização, estado e datas, em vez de carregar todos os Pedidos com todos os anexos e gerar URLs assinadas antecipadamente.

O contrato visual separa as dimensões: urgência automática (“Atrasada há 3 dias”, “Vence hoje”), status (“Aguardando”), prioridade manual (“Alta”), responsável (“Responsável · Thomás”), espera (“Aguardando · Cliente”) e follow-up (“Follow-up hoje”) não são fundidos em um único badge ou status. Última atualização e próxima ação permanecem textos próprios. Cada dimensão usa rótulo ou ícone com texto, ordem consistente e apresentação compacta; cor pode reforçar o significado, mas nunca é o único meio de distingui-lo. A mesma linguagem visual vale para listas do Pedido e para a Central.

## 5. Contratos de dados e transição

As migrations abaixo são **propostas**, não arquivos a criar nesta etapa. Cada nova tabela e relação exposta mantém `organization_id`, RLS, grants mínimos e chaves que impedem vínculo entre organizações. O plano de implementação deverá separar migração aditiva, backfill verificado, troca dos leitores/escritores e eventual limpeza futura. Nenhuma migration antiga é editada.

| Lote | Evolução de dados prevista |
| --- | --- |
| 1 | Nova `pedido_frentes` (Pedido, nome, ordem). `tarefas`: `frente_id`, status, prioridade, descrição, follow-up, `waiting_type`, `waiting_user_id`, complemento de espera e timestamp de alteração para novas gravações. `waiting_user_id` referencia membro da mesma organização apenas para `waiting_type = internal_user`. `subtarefas`: prazo e prioridade opcionais. Nova relação de dependências com duas FKs de tarefa e validação do mesmo Pedido. Status de `pedidos` ajustado ao novo conjunto. Índices por organização, Pedido/Frente, responsável, status, prazo, follow-up e espera. |
| 2 | Nenhuma migration prevista: tela e consultas usam os dados consolidados no Lote 1. |
| 3 | `tarefas.pedido_id` passa a aceitar `NULL`; vínculo com Frente também é nulo para avulsas. Restrições asseguram que tarefa com Pedido tenha Frente do mesmo Pedido e tarefa avulsa não tenha Frente. Consultas e índices contemplam tarefas avulsas. |
| 4 | Templates da organização e definição editável de Frentes/tarefas/subtarefas/dependências/regras relativas; metadados da regra de prazo derivado nas tarefas geradas. Instanciação transacional com remapeamento de IDs. |
| 5 | `atividades` evolui para a timeline canônica, com tipo, vínculos opcionais e referência de autor. `pedido_id` pode ser nulo somente para atualização vinculada a tarefa avulsa; uma atualização de Pedido mantém `pedido_id`. Notas legadas são incorporadas de forma idempotente, com chave de proveniência para impedir duplicatas. `anexos` ganha referências opcionais coerentes ao Pedido/Frente/Tarefa/Atualização, sem mudar seu caminho privado. |
| 6 | Nova tabela de eventos com associações opcionais e índices de data/organização. Calendário global e aba do Pedido consultam as mesmas tabelas fonte; não existe tabela duplicada de entradas de calendário. |

Backfill planejado: criar Frente “Geral” para cada Pedido existente e associar suas tarefas; `tarefas.concluido=true` vira Concluída, demais Aberta, sem inventar `concluida_em` ou data de alteração histórica ausente. Para Pedidos, `Concluído` vira Finalizado; os demais viram Em andamento. O valor legado de `Aguardando Cliente` e `Prazo Concessionária` fica recuperável em registro de transição de `atividades`, e `prazo_concessionaria` permanece como dado do Pedido; o backfill não inventa tarefas ou responsáveis de espera. Esse registro é proveniência histórica, não outro status ativo. Responsáveis em texto só ganham `responsavel_user_id` quando houver correspondência inequívoca com membro da organização; os demais ficam visíveis para resolução posterior.

O Lote 1 usa publicação compatível em fases: ampliar constraints/schema aceitando temporariamente valores antigos e novos; publicar leitores capazes de interpretar ambos; executar e conferir backfill; trocar os escritores; só então restringir aos valores novos. Antes da troca, `concluido` é a entrada canônica dos escritores legados e status é derivado; depois, status é a entrada canônica e `concluido` é projeção de compatibilidade. Uma regra única no banco sincroniza essa projeção e rejeita gravação inconsistente; não há dois escritores independentes. O mesmo sequenciamento vale para status de Pedido, para que `StatusBadge`, ordenação, criação e conclusão atuais não recebam valores desconhecidos durante a publicação.

No Lote 3, notas de tarefa avulsa continuam no fluxo de `comentarios_tarefa` já existente até a unificação do Lote 5; não se cria uma terceira fonte de notas. No Lote 5, gravadores e leitores passam à timeline canônica `atividades`, e a tabela antiga deixa de receber novas notas. Atualizações de tarefa avulsa usam `pedido_id NULL` e `tarefa_id` obrigatório; quando a tarefa tiver Pedido, a leitura da timeline as inclui via Tarefa. Relações de Frente/Tarefa/Atualização e atribuição de responsável são validadas também na persistência quanto à organização e ao Pedido, não só pela interface.

Condição de liberação de cada migration: inventário de valores/linhas afetadas no IURQ, backfill reversível ou recuperação definida, verificação de órfãos e de relações entre organizações, testes de RLS/grants e das leituras/mutações impactadas. MISFY não é alvo implícito de nenhum lote.

## 6. Componentes e fronteiras de código

- `src/types/index.ts` ou tipos focados de `src/lib/pedidos-tarefas/`: contratos de Pedido, Frente, Tarefa, Subtarefa e indicadores; não manter campos novos apenas como `any` no mapeamento.
- `src/lib/pedidos-tarefas/`: leituras e comandos por entidade, cálculo puro de progresso/alertas/bloqueios/próxima ação, regras de templates e calendário. A regra de status manual fica separada dos indicadores derivados.
- `src/app/page.tsx` e componentes de Pedido: entrada/lista existentes, Resumo e abas, detalhe de tarefa e criação com Frente. Reduzir gradualmente a concentração atual de leitura/mutações na página, sem trocar a rota pública de uma vez.
- `src/lib/central/queries.ts`, `operational.ts` e `src/app/hub/page.tsx`: consultas operacionais e apresentação das novas filas, preservando as pendências existentes de locações/cobranças.
- `src/lib/pedidos-tarefas/navigation.ts` e busca global: deep links que selecionam Pedido e Tarefa ou tarefa avulsa.
- Storage e exclusão atuais: estender vínculos de metadados sem alterar permissões amplamente nem abandonar as verificações de exclusão.

Leitura de dashboard, detalhe do Pedido, timeline e arquivos são consultas separadas com estados de loading/erro próprios. Mutação que falhar não apresenta sucesso local; dados derivados são recalculados a partir do estado confirmado. Operações multi-entidade (template e vínculos de dependência) exigem unidade transacional ou mecanismo equivalente que evite instâncias parciais.

## 7. Sequência de entrega e aceite

1. **Fundação:** Frentes, novos campos de Tarefa, subtarefas e dependências; backfill e mudança da conclusão automática. Aceite: registros antigos continuam legíveis; nenhuma tarefa órfã; Pedido só finaliza por confirmação; alertas não mudam prioridade/status; não há janela em que tela antiga e schema sejam incompatíveis. O implementation plan deve obrigatoriamente dividir este lote em subetapas/gates pequenos — no mínimo schema aditivo, backfill/compatibilidade, troca controlada dos leitores/escritores e validação/limpeza posterior à aprovação, ainda que use nomes ou uma divisão técnica mais adequada. Frentes, novos status, subtarefas, dependências, backfill e troca de writers não podem formar uma única alteração monolítica. Cada subetapa preserva compatibilidade, mantém a aplicação funcional e valida o resultado no IURQ antes da próxima; MISFY nunca é alvo implícito.
2. **Tela do Pedido:** Resumo padrão, Tarefas por etapa/prazo e detalhe. Aceite: usuário vê progresso e próxima ação sem percorrer checklist inteiro; criação em Frente já a seleciona; links atuais continuam abrindo o Pedido.
3. **Dashboard:** quatro filas, responsáveis, espera, follow-up e tarefa avulsa. Aceite: uma tarefa pode figurar em várias filas; “Minhas” usa identidade; avulsa não exige Pedido; cartões mostram contexto e abrem a tarefa.
4. **Templates:** branco ou template, gestão/duplicação e datas relativas. Aceite: instância é editável e independente; D+n usa dias corridos; dependências e regras após conclusão referenciam os novos IDs; falha não deixa Pedido parcial.
5. **Timeline e Arquivos:** histórico único e vínculos opcionais de arquivos. Aceite: notas/atividades anteriores aparecem na ordem correta com autor/data; notas de tarefa avulsa permanecem acessíveis e entram na timeline se a tarefa for vinculada futuramente; todas as mídias do Pedido aparecem em Arquivos; não se criam dois canais de atualização.
6. **Eventos e Calendário:** eventos independentes e calendário projetado. Aceite: a visão global reúne todos os tipos previstos, inclusive Eventos sem Pedido; a aba do Pedido mostra o mesmo conjunto filtrado; prazo, subtarefa, follow-up e evento aparecem da fonte correta, sem registros duplicados.

Testes futuros devem focar regras puras, transições de status, backfill/integridade, RLS e consultas/mutações tocadas. Já existem testes de migration, organização, vencimento, navegação, exclusão de anexos e Central em `src/lib/pedidos-tarefas/` e `src/lib/central/`; a página principal e o drawer ainda precisam de cobertura de seus fluxos críticos quando forem alterados. Cada lote termina no gate do projeto **PRONTO PARA TESTE MANUAL**; staging, gate staged, commit e push só após aprovação humana, salvo autorização explícita diferente.
