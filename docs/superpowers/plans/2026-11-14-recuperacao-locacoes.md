# Recuperação de Locações — primeiro lote

## Resultado atualizado

Primeiro lote PRONTO PARA TESTE MANUAL na prévia IURQ `dpl_86m1D9R9vhoytDYVkW7aSKwGRwWP`. Financeiro exclusivo da conta verificada de Thomás; RPC atômica/idempotente, bloqueios de banco/Storage/RPC e gate nas telas implementados. 89 testes Vitest, 5 node:test, 3 checks de ambiente, TypeScript local/R5 e build Vercel aprovados. 263/263 fontes enviadas conferem; 50/50 fontes termográficas preservadas. O bloqueio local de fontes foi superado pela compilação remota validada. A decisão posterior "somente eu" substitui a proposta anterior de grupo autorizado. O restante deste documento mantém o diagnóstico histórico; estado vigente e próximos passos no handoff. Domínio principal, commit e push aguardam teste manual do usuário.

Autorização: usuário pediu recuperar os módulos existentes e começar melhorias de UX, segurança e confiabilidade. Confirmou equipamentos primeiro e financeiro somente para pessoas autorizadas.

CHAT: MESMO. HARNESS: Codex. MODELO: gpt-6-astra. THINKING: nível da sessão, não exposto pelo harness. MOTIVO: revisão de permissões e gravações financeiras. WORKTREE: `C:\tmp\Sistema_Pedidos_Radial-unificar-transformador`. BRANCH: `codex/controle-locacoes`. SKILLS: radial-fast-development, radial-safety. RTK: PREFERENCIAL. YOLO: OFF.

## Evidência e limites

- Publicação atual `dpl_12aqXTyqbV6LH75UaHBvdw6rUCBn`: pacote de arquivos não contém contratos-locacoes; quatro rotas verificadas retornaram 404. O commit indicado nos metadados contém o módulo. Metadados Git não comprovam conteúdo efetivamente enviado.
- Base publicada de termografia: a39cd03; revisão de 14/11 em prévia separada ainda aguarda teste manual. Não sobrescrever nem promover essa revisão como parte deste lote.
- IURQ confirmado pela listagem de projetos. Políticas atuais de billing_cycles, billing_lines e payments autorizam membros da organização, sem exigir can_manage_billing. Não publicar o módulo como restrito antes de corrigir todas as vias de acesso.
- Mudanças locais anteriores preservadas. Nenhum estágio, commit, push ou deploy principal antes do teste manual e aprovação.

## Implementação autorizada e verificável

- [x] Reproduzir e corrigir painel que recalcula canceladas/isentas/rascunhos como dívida; reutilizar resolveEffectiveBillingStatus. Testar totais, alertas, próximas cobranças e pagamentos parciais.
- [x] Reproduzir e corrigir carregamento infinito após erro de leitura; mensagem persistente, tentativa manual, sem exibir erro técnico do banco. Testar recuperação e desmontagem.
- [x] Implementar verificação do pacote no fonte e no build; teste de ausência de rotas e API, fonte real com 11 rotas conferidas. Verificação do build real depende da compilação abaixo.
- [x] Testes focados: 46 Vitest + 5 node:test; TypeScript do workspace e pacote isolado; lint alterado e diff check aprovados.
- [ ] Build completo: tentativa falhou exclusivamente no download das fontes Geist/Geist Mono em fonts.googleapis.com neste ambiente. Não repetir sem resolver a conectividade ou escolher fonte local aprovada. Não há build de publicação aprovado.

## Pacote local de recuperação

259 arquivos em `node_modules/.cache/rental-restoration-20261114-r2`, manifesto em `docs/architecture/2026-11-14-locacoes-restoration-manifest.json`. Base estável HEAD 2bb9504 com os 50 arquivos publicados de termografia idênticos por SHA-1, sem a revisão local pendente de 14/11. Navegação, estilos, tipos e componentes de Pedidos são restaurados como conjunto da base estável; mesclar tipos antigos publicados com componentes atuais causou erros de compilação e foi rejeitado. Segunda composição passou em `next typegen` e `tsc --noEmit`.

O pacote é somente para revisão e ainda usa permissões financeiras antigas; não enviar para publicação. Script não copia env, não faz commit nem deploy. A cópia R1 no cache foi rejeitada e não deve ser usada. Downloads Vercel grandes vieram truncados, rejeitados por hash; fontes completas obtidas pelo conector GitHub no commit publicado e conferidas com o manifesto efetivo.

## Próximo lote de segurança, antes de liberar online

Projetar leitura restrita e gravação atômica de recebimentos. O fluxo atual insere pagamento, relê e atualiza cobrança em chamadas separadas; falha depois do INSERT deixa resultado ambíguo e retry pode duplicar. A correção exige operação única no banco com identificador estável, validação de permissão e concorrência; não mascarar com um bloqueio só na tela.

Valores também existem nos itens/contratos e documentos. Definir se usuários operacionais podem ver preço contratado; depois proteger leituras, arquivos, buscas e resumos de forma consistente. Identificar explicitamente quem receberá permissão; não inferir por nome nem conceder a todos.

## Validação manual posterior

No ambiente IURQ: localizar Locações pelo menu, cadastrar equipamento de teste, criar/devolver locação, conferir painel e testar contas autorizada/não autorizada. Publicação completa deve preservar fontes termográficas conferidas e passar na verificação de rotas. Financeiro geral Radial/Fontes e materiais de consumo permanecem lotes posteriores.
