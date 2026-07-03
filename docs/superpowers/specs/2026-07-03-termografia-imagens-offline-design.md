# Termografia — Imagens Confiáveis e Continuidade Offline

**Data:** 03/07/2026
**Status:** desenho aprovado; planejamento somente
**Baseline reproduzida:** `origin/codex/termografia-salvamento-seguro` no commit `d9a8c83`

## Objetivo

Corrigir o preview quebrado das fotos, os erros de recorte digital e térmico e a marcação por círculos vermelhos. Permitir marcar a foto digital durante a criação do ponto, antes da finalização. Depois que o fluxo online estiver estável, permitir continuar offline um rascunho que tenha sido aberto anteriormente com internet e sincronizá-lo quando a conexão voltar.

Não faz parte deste escopo criar um relatório novo totalmente offline, instalar service worker/PWA, salvar fotos na galeria do aparelho ou alterar regras de classificação termográfica.

## Estado encontrado

A branch remota contém 14 commits posteriores ao primeiro autosave, incluindo recorte 3:4, zoom 5x, exclusão de relatório, editor de círculos e testes. A suíte do commit `d9a8c83` passa com 95 testes e `npx tsc --noEmit --incremental false` passa sem diagnósticos.

Esses testes não reproduzem a integração real entre página, URL de Storage, `fetch`, MIME, canvas e cache. Por isso passam apesar dos defeitos observados no celular.

O worktree antigo `codex/termografia-salvamento-seguro` está parado em `317abcd`, possui três arquivos modificados e diverge da branch remota. A execução futura deve partir de `origin/codex/termografia-salvamento-seguro@d9a8c83` num worktree limpo. As alterações antigas devem ser preservadas para comparação, não mescladas automaticamente.

Enquanto este planejamento era escrito, outro agente avançou a branch depois de `d9a8c83`. Ele adicionou `src/app/api/supabase-storage/route.ts`, `fix-storage-rls-termografia.sql` e alterou o editor para manter somente um círculo. O executor deve partir da ponta remota mais recente, mas usar `d9a8c83` como baseline reproduzida e auditar esses commits concorrentes antes de editar.

A rota nova instancia Supabase com a chave anônima e não encaminha a sessão do usuário. Isso não satisfaz policies `TO authenticated` do Storage e pode continuar retornando erro ao criar URL assinada. Se a permissão for ampliada para fazê-la funcionar, a rota passa a assinar caminhos informados livremente por query string. Portanto, o desenho aprovado continua sendo remover a dependência da proxy e resolver URLs assinadas no cliente autenticado.

O SQL concorrente de RLS é apenas artefato não validado. Ele permite leitura, atualização e exclusão de toda a pasta `termografia/` a qualquer usuário autenticado. Este planejamento não autoriza aplicá-lo. O editor concorrente de um círculo contradiz o requisito aprovado de vários círculos e deve ser corrigido por testes, não aceito como nova regra.

## Causas confirmadas e riscos

### Preview quebrado na criação

`src/app/termografia/nova/page.tsx` transforma caminhos de Storage em URLs no formato:

```text
/api/supabase-storage?path=...
```

Nenhuma rota `src/app/api/supabase-storage/route.ts` existe na branch. O navegador recebe 404 em vez de imagem. O selo `Salva` representa o sucesso do upload, mas não valida se o preview pode ser carregado.

### Marcação durante a criação

O botão já existe para pontos com ocorrência, mas busca a foto pela mesma rota inexistente. O código não verifica `response.ok` nem `Content-Type`; uma resposta HTML de erro é convertida em `File` e enviada ao editor como se fosse imagem.

### Recorte e marcação após finalizar

A página salva usa URLs assinadas, mas `fetchPhotoAsFile` não valida status HTTP, MIME ou blob vazio. URL expirada, 404, erro do Storage ou resposta não-imagem chegam a `createImageBitmap`/canvas e produzem erro genérico.

Depois de substituir uma foto, o caminho permanece igual e a cache em memória é atualizada, mas browser/CDN podem reutilizar conteúdo anterior. A renovação precisa ter uma estratégia explícita de cache-busting.

### Cobertura de testes insuficiente

O cropper é mockado nos testes de componente e `recortarImagem` é mockada. Os testes de `images.ts` cobrem apenas entradas inválidas. Os testes do editor de marcação mockam a renderização final. Não há teste de página que falhe quando a rota de preview não existe.

### Offline atual

O hook atual usa `navigator.onLine`, `dirtyRef`, fila em Promise e `beforeunload`. Quando fica offline, muda o banner e conserva alterações apenas na memória React. Se o navegador for fechado, recarregado ou removido da memória pelo celular, o trabalho pode ser perdido. Fotos não possuem fila local durável.

## Arquitetura aprovada

### Uma origem persistente e uma origem de apresentação

Cada foto mantém responsabilidades separadas:

- `fotoDigitalUrl`, `fotoDigitalOriginalUrl` e `fotoTermicaUrl`: caminhos persistentes do Supabase Storage, sem URL assinada e sem blob URL.
- `fotoDigitalSrc` e `fotoTermicaSrc`: fontes transitórias para `<img>`, nunca persistidas no JSON do relatório.
- arquivo/blob local: evidência ainda não sincronizada, guardada em IndexedDB quando necessário.

Durante a seleção, a tela cria Object URL imediatamente. Depois de recarregar, resolve o caminho persistente com URL assinada. A rota inexistente `/api/supabase-storage` deve ser removida; não será criada uma proxy redundante.

### Carregador único de fotos

Um utilitário isolado deve:

1. aceitar blob local, Object URL, URL assinada ou caminho persistente;
2. renovar a URL assinada quando necessário;
3. executar `fetch` somente quando precisa transformar a imagem em `File`;
4. rejeitar `!response.ok`, MIME que não comece por `image/` e blob vazio;
5. expor mensagens distintas para expiração, permissão, ausência e formato inválido;
6. permitir uma única renovação/repetição quando a URL assinada estiver expirada.

Preview, recorte e marcação devem consumir esse utilitário, evitando três implementações diferentes.

### Fluxo online de criação

1. Usuário seleciona foto.
2. O app valida tipo e cria Object URL local.
3. O preview aparece como `Local/Enviando`, sem selo `Salva`.
4. A imagem é compactada e enviada.
5. O caminho retornado é colocado no ponto e o rascunho é salvo.
6. Somente depois das duas confirmações o estado vira `Salva`.
7. O Object URL permanece enquanto o componente precisar dele e é revogado na substituição/desmontagem.

Se a foto digital pertencer a um ponto com ocorrência, `Marcar componentes` usa o arquivo/blob local enquanto estiver disponível. O usuário pode adicionar vários círculos vermelhos antes de concluir ou finalizar. O resultado anotado substitui apenas a versão de trabalho; a versão original permanece em `fotoDigitalOriginalUrl`.

O upload inicial continua rápido: não abrir recorte automaticamente. O recorte 3:4 é uma ação opcional para foto digital ou térmica.

### Fluxo online após finalização

Ao abrir detalhes, o app resolve URLs assinadas e mostra estados `Carregando`, `Disponível` ou `Erro ao carregar`. Recorte e marcação só abrem depois de obter um arquivo de imagem validado.

Ao confirmar uma edição:

1. gerar o JPEG;
2. compactar dentro dos limites aprovados;
3. fazer upload;
4. confirmar o caminho persistente no relatório;
5. renovar a URL assinada com cache-busting;
6. trocar o preview somente no sucesso.

Em falha, manter a foto anterior e o editor aberto para repetir ou cancelar.

### Continuidade offline simples

O offline será implementado somente depois dos testes do fluxo online passarem. Ele vale apenas para rascunho que já possua ID de servidor e tenha sido aberto com internet ao menos uma vez.

Será usado IndexedDB, porque `localStorage` não suporta com segurança dezenas de blobs e possui limite pequeno. Uma camada `TermografiaLocalStore` guardará:

- snapshot dos dados gerais e pontos;
- versão local e `updatedAt`;
- blobs de fotos pendentes;
- operações de upload com chave idempotente;
- identificação do usuário e do rascunho.

O hook atual continuará sendo o único coordenador do autosave. Não haverá um segundo hook gravando no servidor em paralelo.

Sequência:

1. Toda alteração atualiza estado React e snapshot local.
2. Online: a fila atual salva no servidor; ao confirmar, marca o snapshot como sincronizado.
3. Offline: mantém snapshot e blobs como pendentes.
4. Ao reconectar: envia fotos primeiro, substitui blobs por caminhos persistentes, salva o JSON do relatório e somente então remove itens locais confirmados.
5. Uma chave por `rascunho + ponto + tipo + versão` evita upload duplicado.

A finalização é bloqueada enquanto houver dados, fotos ou marcações locais pendentes. O banner deve distinguir `Salvo neste celular` de `Sincronizado online`.

Se IndexedDB estiver indisponível, o fluxo online continua funcionando e o app avisa que a proteção offline não está disponível. A falha local não pode interromper upload, recorte ou finalização online.

### Conflitos

O offline não deve sobrescrever silenciosamente uma versão mais nova do servidor. O snapshot guarda a versão/horário visto ao abrir. Se o servidor tiver sido atualizado por outra sessão, a sincronização para e oferece:

- manter a versão online;
- revisar e reaplicar o rascunho deste celular.

Na primeira entrega, não haverá merge automático de pontos conflitantes.

## Estratégia de testes

### Utilitários

- 200 com `image/jpeg` retorna `File` válido.
- 401/403 renova URL uma vez e repete.
- 404 apresenta arquivo ausente.
- 200 com HTML, JSON ou blob vazio é rejeitado.
- fallback de decodificação funciona quando `createImageBitmap` não existe/falha.
- canvas respeita 3:4 e limita memória sem rejeitar fotos comuns de celular.

### Criação

- preview local aparece antes do upload.
- selo `Salva` exige Storage e autosave confirmados.
- rota `/api/supabase-storage` não é chamada.
- substituição revoga Object URL anterior.
- ocorrência permite vários círculos antes da finalização.
- anotação preserva foto original.
- falha mantém preview e permite repetir.

### Relatório finalizado

- digital e térmica carregam por URL assinada.
- recorte de ambos troca preview e mantém caminho coerente.
- círculos digitais funcionam após finalização.
- URL expirada é renovada.
- cache não mostra imagem anterior após upload.
- resposta não-imagem nunca chega a cropper/canvas.

### Offline

- dados sobrevivem a desmontagem/reabertura.
- 50 pontos e 100 fotos compactadas ficam recuperáveis dentro dos limites definidos.
- reconexão preserva ordem: upload, caminho, autosave, limpeza local.
- repetir não duplica foto.
- fechar durante sincronização não perde fila.
- conflito de versão não sobrescreve servidor.
- IndexedDB indisponível mantém online funcional.

### Validação manual móvel

Testar no mesmo tipo de celular do relato:

1. digital e térmica em retrato e paisagem;
2. preview imediato;
3. vários círculos antes de finalizar;
4. recorte 3:4 de ambos após finalizar;
5. desligar rede, editar rascunho aberto, fechar navegador, reabrir e reconectar;
6. conferir relatório e impressão sem fundo preto ou imagem quebrada.

## Critérios de aceitação

- Nenhuma referência a `/api/supabase-storage` permanece sem rota.
- Preview não fica quebrado depois de upload confirmado.
- Círculos podem ser aplicados antes e depois da finalização.
- Recorte digital e térmico funciona após finalização.
- Erro de URL/MIME produz mensagem específica e não destrói a foto anterior.
- Foto original digital pode ser restaurada.
- Rascunho previamente aberto sobrevive offline ao fechamento do navegador.
- A volta da rede sincroniza sem duplicar e diferencia local de online.
- Fluxo online continua funcional quando IndexedDB falha.
- Testes, TypeScript, lint focado e build passam antes de deploy.

## Fora do escopo

- iniciar relatório novo totalmente offline;
- service worker ou PWA completa;
- salvar automaticamente na galeria;
- editor de formas além de vários círculos vermelhos;
- alteração do PDF fora do necessário para consumir os caminhos corrigidos;
- refatoração de outros módulos;
- aplicação de migration, deploy ou uso de credenciais durante o planejamento.
- aplicação de `fix-storage-rls-termografia.sql` sem revisão e autorização específicas.

