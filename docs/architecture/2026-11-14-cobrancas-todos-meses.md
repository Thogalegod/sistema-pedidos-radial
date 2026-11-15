# Cobranças: todos os meses por padrão

- Pedido: entrar em Cobranças mostrando os saldos em aberto de todos os meses; escolher um mês somente quando desejado.
- Padrão sem parâmetros: Todos os meses + Em aberto. Em aberto inclui emitidas/vencidas com saldo positivo, inclusive recebimento parcial. Pagas, canceladas, isentas, saldo zero e rascunhos ficam fora; A emitir continua como filtro explícito.
- Filtrar por mês abre o seletor de mês, com navegação anterior/próximo e retorno a Todos os meses. Links com mês/status explícitos continuam respeitados; status acompanha a URL e o voltar do navegador.
- Alteração somente de leitura/apresentação: sem migration, alteração de valores ou permissões. Mantida a proteção financeira exclusiva do proprietário.
- Validação: 3 falhas reproduzidas antes da mudança; 20 testes focados aprovados após a correção; TypeScript aprovado; ESLint sem erros (um aviso anterior sobre SupabaseRow).
- Base remota: af58ba5b005c89abd1ec1e2df853f62ebafe7956. Publicar somente este ajuste sobre o pacote que já está online. Índice temporário preserva o Git local, cuja metadata fica fora da pasta gravável.
