# Termografia: salvamento seguro e edição confiável

## Objetivo

Tornar o fluxo de termografia seguro para relatórios longos em celular. O usuário deve conseguir sair do navegador sem perder um rascunho confirmado, retomar o trabalho automaticamente, verificar que todas as fotos foram armazenadas, editar o relatório finalizado e reencontrar ou baixar suas imagens.

Esta especificação cobre a etapa 1, dependente de conexão com a internet. O funcionamento totalmente offline será uma etapa 2 separada, descrita apenas em alto nível ao final.

## Problemas confirmados no estado atual

- A criação mantém dados e arquivos apenas no estado do navegador até o envio final. Voltar ou fechar a página perde o relatório inteiro.
- O helper de upload transforma falhas em `null`, permitindo finalizar pontos sem que a interface deixe claro que a imagem não foi armazenada.
- Os nomes atuais das fotos dependem do índice do ponto e podem ser sobrescritos quando pontos são excluídos ou reordenados.
- A tela de visualização começa com o estado local de pontos vazio. Ao carregar URLs assinadas, ela atualiza somente esse vetor vazio, embora a impressão carregue diretamente os caminhos persistidos. Isso explica fotos presentes na impressão e ausentes no modal de edição.
- Depois da criação não há interface para editar os dados gerais do cliente, execução ou responsável.
- O botão para adicionar ponto fica distante quando há muitos registros.
- A captura digital não oferece recorte e o navegador móvel não garante salvar automaticamente a foto na galeria do aparelho.

## Escopo da etapa 1

### Rascunho incremental

Ao iniciar um relatório, o app cria um registro em `relatorios_termografia` com status `rascunho`, proprietário autenticado, número permanente e valores iniciais. Mudanças em dados gerais e pontos são persistidas com debounce curto, de modo que digitar não gere uma requisição por tecla.

O relatório em edição exibe uma faixa persistente com um dos estados:

- `Salvando…`
- `Rascunho salvo às HH:mm — você pode sair e continuar depois.`
- `Sem conexão — alterações ainda não enviadas.`
- `Falha ao salvar — tentar novamente.`

O texto de segurança só aparece depois da confirmação do servidor. Alterações ainda pendentes acionam um alerta de saída do navegador. Esse alerta é uma proteção adicional e não substitui o autosave.

Ao acessar a criação novamente, o sistema procura o rascunho mais recente do usuário e o abre automaticamente. A tela informa: `Seu relatório foi recuperado`, quantas fotos confirmadas existem e qual ponto estava aberto. A identificação do último ponto aberto pode ser mantida localmente; a integridade do relatório não pode depender dela.

### Fluxo de fotos

A foto digital segue a sequência:

1. Capturar ou selecionar imagem.
2. Abrir o editor de recorte com zoom e reposicionamento.
3. Escolher `Aplicar recorte` ou `Usar original`.
4. Comprimir a imagem sem deformar sua proporção.
5. Enviar para o Storage usando o ID permanente do ponto no nome do arquivo.
6. Confirmar que o upload retornou sucesso.
7. Persistir o caminho da imagem no ponto.
8. Exibir `Foto salva` e liberar visualização e download.

A foto térmica continua sendo anexada sem recorte obrigatório, mas usa as mesmas regras de nome permanente, confirmação, erro e repetição. Substituições usam `upsert` somente para o mesmo ponto e tipo de foto.

Uma falha de upload é tratada como erro, nunca como caminho vazio bem-sucedido. O ponto mantém indicação de pendência e oferece `Tentar novamente`. O relatório não pode ser finalizado enquanto houver upload em andamento ou com falha.

Como aplicações web não conseguem garantir gravação automática na galeria móvel, a cópia confiável será a armazenada no app. Toda foto confirmada terá uma ação `Baixar`, permitindo recuperá-la posteriormente no aparelho.

### Finalização e retomada

`Finalizar relatório` substitui o comportamento atual de criação tardia. A ação:

1. força o envio de alterações textuais pendentes;
2. verifica campos obrigatórios;
3. verifica que não há uploads pendentes ou com erro;
4. atualiza o status de `rascunho` para `gerado`;
5. encaminha para a visualização do relatório.

Rascunhos não aparecem misturados aos relatórios finalizados na listagem principal. A entrada `Novo relatório` retoma automaticamente o rascunho mais recente. A exclusão deliberada de um rascunho deverá exigir confirmação explícita.

## Interface

### Criação em celular

- Manter as etapas `1. Cliente` e `2. Fotos e pontos`.
- Mostrar a faixa de salvamento e segurança em posição visível durante todo o preenchimento.
- Colocar `Adicionar novo ponto` imediatamente abaixo de `Concluir ponto`.
- Manter também o botão superior existente, pois ele continua útil no início da lista.
- Após adicionar um ponto, abrir o novo cartão e levá-lo à área visível.
- Exibir o estado individual da foto junto à miniatura.

### Edição do relatório salvo

A visualização recebe `Editar dados gerais`, permitindo alterar:

- cliente;
- CNPJ;
- endereço;
- cidade;
- UF;
- CEP;
- data de execução;
- responsável técnico;
- CREA;
- objetivo;
- equipamento.

O número do relatório, o proprietário e a data original de criação permanecem bloqueados. Cada alteração confirmada atualiza a visualização e a impressão.

Pontos existentes mantêm edição, substituição de fotos e inclusão de novos pontos. O carregamento das fotos deve partir dos pontos persistidos mesmo quando o estado local ainda não foi inicializado. URLs assinadas são apenas dados de apresentação e nunca são gravadas dentro do JSON do relatório.

Cada foto confirmada oferece visualizar, substituir e baixar.

## Dados e limites técnicos

- O status distingue pelo menos `rascunho` e `gerado`; valores existentes continuam compatíveis.
- O ID do ponto é estável e compõe o caminho da imagem, por exemplo `termografia/<numero>/<ponto-id>-digital.jpg`.
- Autosaves devem ser serializados ou versionados para impedir que uma resposta antiga sobrescreva uma mudança recente.
- A atualização do JSON de pontos deve preservar caminhos já confirmados e remover campos transitórios, como previews locais e URLs assinadas.
- O app deve revogar URLs de objeto criadas no navegador quando elas não forem mais necessárias.
- O envio e a compressão devem processar somente a foto alterada, sem recomprimir ou reenviar as demais imagens do relatório.
- A implementação seguirá as APIs e convenções documentadas no `node_modules/next/dist/docs/` da versão Next.js 16.2.4 instalada.

## Tratamento de erros

- Falha ao criar rascunho: impedir avanço e mostrar ação de repetição.
- Falha em autosave: preservar o valor na tela, mudar o indicador para erro e permitir repetição.
- Perda de conexão: mostrar estado offline, manter as alterações atuais na sessão e alertar antes da saída. A persistência offline entre sessões não faz parte desta etapa.
- Falha de upload: manter preview e arquivo selecionado enquanto a página permanecer aberta, mostrar erro por foto e permitir novo envio.
- URL assinada expirada: solicitar uma nova URL ao reabrir ou baixar, sem alterar o caminho persistido.
- Finalização com pendências: bloquear e levar o usuário ao primeiro erro.

## Testes e critérios de aceitação

- Um relatório iniciado e salvo como rascunho é retomado automaticamente após navegar para trás e voltar à criação.
- O indicador só informa que é seguro sair após o servidor confirmar o salvamento.
- Alterações rápidas não são persistidas fora de ordem.
- Uma foto recortada é a mesma imagem exibida, impressa e disponibilizada para download.
- `Usar original` preserva a imagem sem recorte e sem deformação.
- Falha de Storage não produz um ponto aparentemente salvo sem foto.
- Excluir ou reordenar pontos não sobrescreve imagens de outros pontos.
- Um relatório com pelo menos 50 pontos e 100 imagens pode ser finalizado sem reenvio global das fotos.
- Fotos persistidas aparecem tanto na impressão quanto no modal de edição após recarregar a página.
- Fotos podem ser baixadas novamente a partir do relatório salvo.
- Todos os dados gerais permitidos podem ser editados e aparecem atualizados na impressão.
- O número do relatório não pode ser alterado pela interface.
- `Finalizar relatório` fica bloqueado durante upload ou após erro não resolvido.

Os testes incluem unidades para serialização e controle de versões do autosave, integração dos fluxos de rascunho e upload, e validação manual responsiva em navegador móvel.

## Etapa 2: offline completo

A etapa 2 terá especificação e plano próprios. A direção prevista é transformar a termografia em uma PWA com:

- cache do shell necessário para abrir a termografia sem rede;
- IndexedDB para dados e blobs das imagens;
- fila local de operações com IDs estáveis;
- sincronização automática ao recuperar conexão;
- estados visíveis de `salvo no aparelho`, `aguardando sincronização` e `sincronizado`;
- política de conflitos e controle de espaço disponível no aparelho.

Até essa etapa existir, a interface não deve prometer uso offline. Ela apenas detecta a perda de conexão e informa com precisão o que ainda não foi enviado.

## Fora de escopo

- Alterações em outros módulos do sistema.
- Salvamento automático na galeria do celular.
- Modo offline persistente na etapa 1.
- Mudança do formato visual completo do relatório impresso.
- Edição avançada de imagem além de recorte, zoom e reposicionamento.
