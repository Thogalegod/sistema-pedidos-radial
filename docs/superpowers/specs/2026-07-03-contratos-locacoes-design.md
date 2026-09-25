# Especificação — Módulo Contratos e Locações

**Data:** 03/07/2026  
**Status:** desenho aprovado pelo usuário; aguardando revisão do documento e criação do plano de implementação  
**Escopo:** planejamento somente; este documento não autoriza a implementação

## 1. Objetivo

Criar no aplicativo um novo módulo chamado **Contratos e Locações** para substituir o controle atual feito em planilhas. A primeira versão deve controlar locações de equipamentos e contratos recorrentes, incluindo gestão de energia, sem tentar construir agora o estoque, os pedidos ou o financeiro completo.

O módulo deve oferecer uma fonte central e confiável para clientes, obras, contatos, contratos, itens locados, ciclos de cobrança, documentos, vistorias, fotos, assinaturas e histórico. A estrutura deve permitir integração futura com estoque, pedidos e financeiro sem reconstruir os dados desta versão.

## 2. Contexto analisado

O aplicativo atual usa Next.js 16.2.4, React 19 e Supabase. Não existe ainda um módulo de locações nem um cadastro central de clientes. Dados de cliente aparecem separadamente em outros módulos e não devem ser usados como modelo definitivo sem uma migração planejada.

Foram analisados os arquivos fornecidos pelo usuário:

- `Controle locações.xlsx`: controle geral com cliente, pedido, recibo, período, emissão, vencimento, aviso, valor, e-mail e observações. A planilha possui grupos de locações e usa links e `IMPORTRANGE` para arquivos individuais.
- `Thorio - 20260121.xlsx`: exemplo de arquivo individual com as abas `OS`, `Resumo locação` e `Recibo`. Contém cadastro do atendimento, equipamentos, remessa, histórico mensal de cobranças e modelo de recibo.

Há aproximadamente 20 arquivos individuais a importar. As planilhas possuem exceções registradas em texto livre, como cobrança antecipada anual, meses isentos, contatos diferentes, atrasos e instruções especiais. A importação precisa preservar essas informações como observações quando não houver campo estruturado equivalente.

## 3. Abordagem escolhida

Foi aprovada a abordagem **núcleo de contratos com extensão de locações**.

O núcleo comum concentra clientes, obras, contatos, contratos, recorrência, cobranças, documentos, alertas e histórico. Funcionalidades exclusivas de locações — equipamentos, entrega, devolução, vistorias, fotos e danos — ficam isoladas em componentes e dados próprios.

Essa abordagem foi escolhida porque evita duplicar clientes e cobranças entre locações e contratos de serviço, mas não amplia a primeira versão para um ERP completo.

## 4. Tipos atendidos na primeira versão

- Locação de equipamentos.
- Contrato de gestão de energia.
- Serviço recorrente.
- Outro contrato recorrente.

Cada tipo usa o mesmo cadastro central e o mesmo mecanismo de cobrança. Somente locações habilitam itens locados, entrega, devolução e vistorias.

## 5. Modelo funcional e limites dos componentes

### 5.1 Organização e usuários

Todos os dados do módulo devem pertencer a uma organização. Na primeira versão, todos os usuários autorizados da empresa podem consultar e alterar todos os registros. A organização deve estar presente desde o início para permitir permissões mais detalhadas no futuro.

### 5.2 Clientes

O cadastro central de cliente deve suportar:

- razão social, nome fantasia, CNPJ ou CPF, inscrição estadual e municipal;
- situação ativa ou inativa;
- observações gerais;
- vários endereços, obras ou locais;
- vários contatos.

Um contato possui nome, função, departamento, telefone, WhatsApp, e-mail, observações e indicadores de contato principal, destinatário financeiro e destinatário técnico. O contato pode valer para toda a empresa cliente ou apenas para uma obra/local.

### 5.3 Obras e locais

Um cliente pode ter equipamentos e contratos em diferentes obras. Cada obra/local possui nome de identificação, endereço completo, contatos vinculados, observações e situação ativa ou inativa.

### 5.4 Contratos

Um contrato possui:

- número interno automático e imutável;
- tipo do contrato;
- cliente e obra/local;
- referência opcional ao pedido ou OS legado;
- datas de início e, quando aplicável, término;
- regra de recorrência;
- valor-base e forma de cálculo;
- contatos técnico e financeiro;
- observações e documentos;
- situação e histórico.

A recorrência padrão é mensal por ciclos de 30 dias contados da emissão inicial ou da nota de remessa. Deve ser possível usar um período personalizado menor ou diferente. Contratos de gestão de energia podem usar valor fixo, variável, percentual ou fixo mais variável.

Um contrato pode ser pausado com data e motivo. Durante a pausa, novas cobranças ficam suspensas. A reativação preserva todo o histórico.

### 5.5 Itens de locação

Enquanto o estoque não estiver integrado, cada item deve guardar uma fotografia estruturada dos dados no momento da locação:

- tipo e descrição;
- potência ou capacidade;
- código interno ou número de série;
- quantidade;
- valor de locação;
- observações.

O modelo deve reservar uma referência opcional a um futuro item de estoque, sem depender dela agora. Cada item pode ficar em uma das situações: locado, devolvido, substituído, perdido/danificado ou suspenso/isento.

Devoluções parciais são obrigatórias. Uma locação somente pode ser encerrada quando todos os itens estiverem devolvidos ou formalmente resolvidos.

### 5.6 Cobranças e linhas de cobrança

Cada período gera um registro próprio de cobrança, criado manualmente pelo usuário. O sistema alerta sobre a necessidade, mas não cria automaticamente um rascunho.

Cada cobrança deve conter:

- contrato e sequência do período;
- início e fim do período;
- emissão e vencimento;
- valor-base, desconto, acréscimo, isenção e justificativa;
- linhas por equipamento ou serviço;
- tipo e número do documento;
- situação;
- data e valor recebido;
- observações.

Situações previstas: rascunho, emitida/pendente, paga, vencida, isenta e cancelada. Uma cobrança emitida não pode ter seu número alterado. Registros financeiros não devem ser apagados; correções acontecem por cancelamento e novo registro.

Danos ou itens faltantes podem ser cobrados em documento separado ou adicionados ao próximo período, conforme escolha do usuário em cada ocorrência.

### 5.7 Numeração de documentos

O número interno do contrato/locação é separado do pedido/OS legado e do documento de cobrança.

Novos recibos usam o formato `R260121001`, com exatamente dez caracteres:

- `R`: tipo de documento;
- `260121`: referência curta da locação/pedido;
- `001`: sequência do período, permitindo até 999 cobranças.

O número curto deve ser único, pesquisável e imutável depois da emissão. Documentos legados, como `RC260121-1`, devem ser preservados sem conversão. Números reais de NFe também são preservados, por exemplo `NFE15`.

Nas buscas e no futuro financeiro, a identificação pode aparecer como `20260121 (R260121001)`.

### 5.8 Vistorias, fotos e assinaturas

Cada equipamento pode ter vistoria de saída e de retorno.

A vistoria de saída registra fotos, condição, acessórios, danos preexistentes, observações, data, responsável e assinatura do cliente. A vistoria de retorno registra os mesmos elementos, comparação com a saída, acessórios faltantes, danos, custo estimado ou cobrado e resolução.

As fotos devem ser compactadas no celular antes do envio, mantendo resolução suficiente para servir como evidência. Originais não compactados não são exigidos nesta versão.

A assinatura é simples, desenhada na tela, acompanhada de nome, documento e data/hora. Não é assinatura com certificado digital.

### 5.9 Documentos e PDFs

O módulo aceita anexos de pedido/OS, nota de remessa, contrato, recibo/NF e comprovante de pagamento.

Na primeira versão, deve gerar PDFs para:

- termo de entrega ou retirada;
- condições e fotos de saída;
- termo de devolução;
- fotos de retorno e danos;
- assinaturas e identificação dos responsáveis.

Os PDFs devem ser reproduzíveis a partir dos dados persistidos e não podem depender de arquivos ainda pendentes de sincronização.

### 5.10 Histórico e auditoria

Alterações relevantes registram organização, usuário, data/hora, tipo do evento, registro afetado e representação concisa dos valores anterior e novo. O log não duplica fotos ou documentos.

Devem ser auditados pelo menos: criação, alteração de situação, pausa/reativação, emissão/cancelamento de cobrança, pagamento, entrega, devolução, dano e encerramento.

## 6. Fluxos de trabalho

### 6.1 Criação e ativação de locação

1. Selecionar ou cadastrar cliente.
2. Selecionar ou cadastrar obra/local e contatos.
3. Informar pedido/OS, remessa, equipamentos, valores e recorrência.
4. Registrar vistoria de saída, fotos, acessórios e assinatura.
5. Ativar quando o equipamento sair fisicamente da empresa, seja por retirada do cliente ou entrega da Radial.

### 6.2 Ciclo de cobrança

1. O painel alerta sete dias antes e no vencimento.
2. No vencimento, a pendência permanece como `Emitir novo período`.
3. O usuário cria a cobrança, revisa valor e exceções e informa o documento.
4. A cobrança segue como pendente, paga, vencida, isenta ou cancelada.
5. Pagamento registra data e valor recebido.

### 6.3 Encerramento de locação

O ciclo de estados é:

`Ativa → Encerramento solicitado → Aguardando devolução → Em vistoria → Encerrada`

Itens podem retornar em datas diferentes. Danos são registrados por item e resolvidos por cobrança separada ou pelo próximo período. O encerramento definitivo exige que todos os itens e todas as sincronizações obrigatórias estejam resolvidos.

### 6.4 Contratos sem equipamento

Contratos de gestão de energia e serviços recorrentes usam cadastro, recorrência, cobranças, documentos, pausa e encerramento. Eles não exibem vistorias ou devoluções.

## 7. Telas e navegação

### 7.1 Painel inicial

O painel deve apresentar:

- cobranças vencidas;
- cobranças que vencem nos próximos sete dias;
- períodos que precisam ser emitidos;
- contratos e locações ativos ou pausados;
- encerramentos aguardando devolução;
- valor mensal recorrente previsto;
- valores emitido, pago e vencido;
- atalhos para novo cliente, contrato, locação e cobrança.

### 7.2 Pesquisa e filtros

As listagens devem pesquisar por cliente, obra/local, pedido/OS, número interno e recibo/NF. Filtros mínimos:

- ativo, pausado ou encerrado;
- vencendo, vencido, a emitir ou emitido;
- pago, pendente, vencido, isento ou cancelado;
- tipo de contrato.

### 7.3 Detalhe do contrato

O detalhe agrupa resumo, cliente/local, itens, cobranças, documentos, vistorias e histórico. A interface deve funcionar bem em celular e evitar formulários longos em uma única tela.

## 8. Funcionamento offline e sincronização

O escopo offline da primeira versão é a coleta de vistorias, fotos e assinaturas. Esses dados ficam em armazenamento local durável no aparelho e são enviados quando a conexão retorna.

Estados visuais obrigatórios:

- `Salvando neste celular`;
- `Salva neste celular — aguardando sincronização`;
- `Sincronizando`;
- `Sincronizada`;
- `Falha ao sincronizar — tentar novamente`.

Cada envio deve possuir identificador idempotente para que uma nova tentativa não duplique vistoria, foto ou assinatura. A remoção do arquivo local somente ocorre depois da confirmação do servidor. O app deve impedir PDF final e encerramento definitivo enquanto houver arquivos obrigatórios pendentes.

Conflitos de edição devem preservar o dado do servidor e apresentar a pendência local para revisão, sem descartar silenciosamente o trabalho.

## 9. Alertas

Na primeira versão, alertas aparecem apenas dentro do aplicativo:

- sete dias antes do vencimento;
- no vencimento;
- diariamente enquanto o novo período continuar sem emissão ou a cobrança vencida permanecer aberta.

A estrutura deve permitir futuramente e-mail e WhatsApp, mas nenhum envio externo faz parte deste escopo.

## 10. Importação das planilhas atuais

A importação deve aceitar um ZIP contendo o controle geral e os arquivos individuais `.xlsx`.

Etapas:

1. Ler e classificar os arquivos e abas conhecidas.
2. Extrair clientes, locais, contatos, contratos, itens, cobranças e observações.
3. Detectar duplicidades por CNPJ/CPF e, na ausência, por combinação normalizada de nome e endereço.
4. Relacionar arquivo individual ao pedido/OS e ao registro da planilha geral.
5. Exibir prévia com inclusões, atualizações, duplicidades, campos ausentes e erros.
6. Permitir correção ou exclusão de linhas problemáticas antes da confirmação.
7. Importar de forma idempotente, registrando origem, arquivo, aba e linha.
8. Gerar relatório final do que foi importado ou rejeitado.

A reimportação do mesmo lote não pode duplicar registros. Fórmulas externas como `IMPORTRANGE` não serão executadas; os valores presentes nos arquivos individuais serão a fonte para o histórico detalhado.

## 11. Regras de validação e erros

- Cliente e obra/local são obrigatórios para ativar uma locação.
- Locação exige pelo menos um item.
- Períodos de cobrança do mesmo contrato não podem se sobrepor sem confirmação e justificativa.
- Número de documento emitido deve ser único dentro da organização.
- Valor recebido não pode marcar automaticamente como pago quando diferir do valor devido; o usuário deve confirmar pagamento parcial ou ajuste.
- Exclusão de registros com histórico financeiro ou operacional é proibida; usar cancelamento/inativação.
- Ações destrutivas exigem confirmação clara.
- Falhas de upload não podem apagar o arquivo local.
- Falhas parciais de importação devem permitir continuar com registros válidos somente depois de confirmação explícita.

## 12. Segurança e armazenamento

- Todas as consultas e gravações devem respeitar a organização do usuário autenticado.
- Arquivos e fotos usam armazenamento privado; acesso ocorre por autorização do aplicativo, não por URLs públicas permanentes.
- Metadados financeiros e operacionais devem ser validados no servidor.
- O histórico não deve armazenar conteúdo binário nem informações desnecessárias.
- Dados locais offline devem ser isolados por usuário e organização e removidos após sincronização confirmada ou comando consciente do usuário.

## 13. Estratégia de testes

### 13.1 Regras unitárias

- cálculo de ciclos de 30 dias e períodos personalizados;
- datas dos alertas;
- numeração curta até 999 períodos;
- totais, descontos, acréscimos, isenções e pagamentos parciais;
- transições de estado de contratos e itens;
- elegibilidade para encerramento.

### 13.2 Integração

- criação de cliente, obra, contrato e itens;
- devolução parcial e final;
- pausa e reativação;
- cobrança de dano nas duas modalidades;
- permissão por organização;
- geração de PDFs;
- importação idempotente dos dois modelos fornecidos.

### 13.3 Offline e celular

- captura de várias fotos e assinatura sem conexão;
- fechamento e reabertura do navegador antes da sincronização;
- retomada após falha;
- prevenção de duplicidade;
- compactação e legibilidade das fotos;
- bloqueio de encerramento com pendências;
- teste prático em aparelhos móveis usados pela empresa.

## 14. Critérios de aceitação da primeira versão

A primeira versão estará funcional quando for possível:

1. Cadastrar um cliente com várias obras e contatos.
2. Criar e ativar uma locação com itens manuais e vistoria de saída.
3. Criar contrato recorrente sem equipamentos.
4. Visualizar alertas de vencimento e emitir manualmente o próximo período.
5. Registrar pagamento, isenção, cancelamento e valores variáveis.
6. Pausar e reativar um contrato sem perder histórico.
7. Registrar devolução parcial, vistoria, danos e cobrança correspondente.
8. Coletar fotos e assinatura sem internet e sincronizar depois sem duplicar ou perder dados.
9. Gerar os PDFs aprovados com fotos e assinaturas sincronizadas.
10. Pesquisar por cliente, obra, pedido/OS e recibo/NF.
11. Importar com prévia os arquivos atuais e obter um relatório auditável.
12. Consultar quem realizou as alterações relevantes.

## 15. Fora do escopo

- controle completo de estoque;
- pedidos, propostas e orçamentos integrados;
- financeiro geral, fluxo de caixa e conciliação bancária;
- emissão fiscal oficial;
- geração ou integração direta com boleto Itaú;
- envio automático por e-mail ou WhatsApp;
- permissões detalhadas por função;
- assinatura com certificado digital;
- execução de fórmulas ou sincronização contínua com Google Sheets.

## 16. Sequência recomendada para o futuro plano

1. Fundação de organização, clientes, obras e contatos.
2. Núcleo de contratos, estados, recorrência e auditoria.
3. Cobranças, alertas, painel e pesquisa.
4. Extensão de locações, itens e devoluções parciais.
5. Vistorias, compactação, assinatura e fila offline.
6. Documentos anexos e PDFs.
7. Importador com prévia e relatório.
8. Testes integrados, validação no celular e liberação gradual.

Essa sequência reduz riscos e permite validar o cadastro e as cobranças antes de adicionar os fluxos mais sensíveis de fotos e importação.
