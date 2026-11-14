# Locações — diagnóstico e próxima entrega

## Estado atualizado após decisão do usuário

Financeiro restrito exclusivamente a `thomas@radialenergia.com.br` no IURQ. A política usa proprietário privado vinculado à conta autenticada e ao vínculo ativo, sem liberação automática por papel admin. Banco e RPCs já aplicados e validados; recuperação das telas em pacote de prévia R5. Recebimentos agora são transacionais e idempotentes, com recuperação da mesma operação após falha. Acesso de outras pessoas será desenhado posteriormente, conforme decisão explícita do usuário. As seções seguintes registram o diagnóstico inicial e o planejamento anterior; o checkpoint vigente está no handoff de 14/11.

## Decisões do usuário

Em 14/11/2026, autorizou começar a recuperação e melhorar UX, segurança e possíveis erros. Escolheu equipamentos primeiro e financeiro para pessoas autorizadas. Não respondeu à pergunta opcional sobre preço visível a operadores: proposta conservadora é ocultar valores; não tratar isso como aprovação explícita. Pessoas a autorizar ainda não identificadas.

## Corrigido neste lote

1. Painel tratava rascunho, isenção e cancelamento como dívida. Usa agora o status efetivo já adotado na listagem; esses registros não entram em saldo, atraso ou próximas cobranças. Pagamento parcial mantém somente o saldo devido.
2. Falha de leitura deixava carregamento infinito. Tela agora oferece erro persistente e Tentar novamente, sem imprimir detalhes internos do banco.
3. Build agora verifica 11 rotas de locações no fonte e no manifesto compilado. Interrompe a publicação incompleta. O problema anterior era o pacote efetivamente enviado: ter um commit completo no GitHub não garantia que o deploy incluísse suas rotas.

## Segurança confirmada no IURQ, somente leitura

- RLS habilitado e SELECT anônimo revogado em contracts, rental_items, rental_assets, billing_cycles, billing_lines e payments.
- Usuários autenticados têm SELECT nas três tabelas financeiras. As políticas de billing_cycles, billing_lines e payments verificam apenas vínculo à organização; não verificam can_manage_billing.
- Payments permite INSERT ao papel authenticated, também com policy apenas de vínculo. UPDATE geral está revogado. Algumas outras tabelas possuem grants por coluna, portanto has_table_privilege=false não significa ausência total de gravação.
- can_manage_billing já existe e protege envio/boletos em algumas operações; deve ser aplicado consistentemente, sem inferir que hoje já protege saldos e recebimentos.
- recordBillingPayment faz INSERT, SELECT e UPDATE separados. Se a segunda ou terceira chamada falhar após INSERT, a UI recebe erro apesar de existir um pagamento; novo envio pode duplicar. Confirmado por fluxo de código e levantamento anterior com simulação; não alegar duplicidade observada em dados reais.
- Seleção inicial de organização usa limit(1) sem filtrar explicitamente o usuário na implementação atual. RLS permanece barreira; em cenários multiempresa a seleção deve usar conta autenticada e organização escolhida, sem depender da primeira linha visível.

## Próximo lote proposto

### Permissões

Reutilizar administrador/can_manage_billing. Administrador configura concessão explícita; não promover usuário com base em nome. Usuário operacional consulta equipamentos, disponibilidade, cliente e datas. Proposta conservadora: esconder preços, pagamentos, saldos e documentos financeiros da operação.

A restrição precisa incluir banco, RPCs, Storage, busca, painel, listagem e detalhes. Ocultar botões não basta. Itens de locação contêm valores e exigem uma projeção operacional segura: ajustar leitura e comandos operacionais antes de bloquear acesso bruto, evitando quebrar devoluções ou disponibilidade. Revisar acesso de fotos e NF de remessa separadamente de comprovantes/faturas/boletos.

### Recebimento

RPC transacional única: autenticar, verificar organização e permissão, bloquear a cobrança durante o cálculo, validar status/data/valor e gravar pagamento/status juntos. Identificador de operação gerado uma vez e reutilizado em retries; repetir a mesma operação retorna o mesmo resultado, payload diferente com a mesma identidade falha. RLS/grants devem impedir contornar o RPC por INSERT direto. Anexo é uma etapa recuperável após confirmação financeira.

Definir antes da implementação de correções: estorno auditável, pagamento acima do saldo e cobrança cancelada/isenta. Não adicionar crédito automático nem excluir históricos silenciosamente. A primeira versão pode recusar pagamento acima do saldo e apresentar orientação, sujeita à validação do usuário.

### UX operacional

- Entrada visível por Locações, atalhos para Equipamentos e Clientes.
- Equipamento identificado por código/série e situação: disponível, locado, manutenção ou inativo; disponibilidade derivada do vínculo existente.
- Separar falha de consulta de lista vazia; manter filtros e rascunho em erro; confirmação clara após gravar.
- Operação comum prioriza cliente/equipamento/data/devolução; financeiro só aparece para autorizados.
- Estados de pagamento parcial, atraso e envio permanecem distintos.

### Verificação exigida

Conta autorizada vs operacional na mesma organização; conta externa; acesso direto às rotas/API/Storage; retry após resposta perdida; duas baixas simultâneas; valores inválidos; mesma operação com payload diferente; canceladas/isentas/rascunhos; devolução mantendo disponibilidade correta; cada uma das 11 rotas presente no build.

## Outras observações

O advisor do IURQ mantém avisos em outros módulos: update_updated_at_column sem search_path fixado e funções de transformador com EXECUTE anônimo. Exigem revisão específica; não equivalem a exploração confirmada. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable e https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable . Funções security definer autenticadas não são vulnerabilidades por si; validar permissões internas.

Financeiro geral de Radial/Fontes e integração/substituição do Procfy continuam posteriores à segurança dos recebíveis existentes.
