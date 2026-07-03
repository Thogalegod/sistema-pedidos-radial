# Termografia — Imagens Confiáveis e Continuidade Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir previews, recorte e círculos vermelhos na termografia e, somente depois, permitir continuar offline um rascunho previamente aberto com internet sem perder ou duplicar fotos.

**Architecture:** Separar caminho persistente, fonte de preview e blob local. Centralizar resolução/validação de imagens, usar atualizações atômicas de pontos e confirmar Storage + autosave antes de exibir `Salva`. A segunda fase adiciona IndexedDB como armazenamento durável subordinado ao hook de autosave existente; ela não cria um segundo escritor de servidor e não permite iniciar relatório novo totalmente offline.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript, Supabase Database/Storage, `browser-image-compression`, `react-easy-crop`, Canvas API, Dexie/IndexedDB, Vitest, Testing Library e testes manuais em celular.

**Design aprovado:** `docs/superpowers/specs/2026-07-03-termografia-imagens-offline-design.md`

---

## Contexto obrigatório para o executor

- Branch remota diagnosticada: `origin/codex/termografia-salvamento-seguro`.
- Baseline reproduzida: `d9a8c83`.
- Diagnóstico no baseline: 10 arquivos/95 testes PASS; TypeScript PASS.
- Esses testes não exercitam a integração real de URL, `fetch`, MIME e canvas.
- O worktree antigo local está em `317abcd`, divergiu do remoto e possui alterações não commitadas. Não mesclar ou apagar automaticamente.
- A branch remota avançou durante o planejamento. Depois de `d9a8c83`, outro agente adicionou uma proxy `/api/supabase-storage`, um SQL de RLS e mudou o editor de vários círculos para um círculo. Partir da ponta remota mais recente, mas revisar esse diff antes de aceitá-lo.
- A proxy concorrente usa apenas `NEXT_PUBLIC_SUPABASE_ANON_KEY`, sem sessão do usuário; ela não satisfaz policy `TO authenticated` e pode continuar devolvendo erro. Não ampliar acesso anônimo para contornar o defeito.
- `fix-storage-rls-termografia.sql` não foi validado nem autorizado para aplicação. Ele concede DELETE amplo na pasta a qualquer autenticado.
- O requisito continua sendo **vários** círculos vermelhos. Não preservar a regressão para um único círculo.

### Preparar ambiente sem perder trabalho existente

```powershell
git fetch origin
git worktree add "C:\tmp\termografia-imagens-fix" -b codex/termografia-imagens-fix origin/codex/termografia-salvamento-seguro
cd "C:\tmp\termografia-imagens-fix"
npm ci
npm test
npx tsc --noEmit --incremental false
```

Expected: branch nova e limpa; 95 ou mais testes PASS; TypeScript sem erros. Se o baseline remoto mudar, registrar SHA e resultados antes de continuar.

Antes do primeiro teste, inspecionar:

```powershell
git log --oneline d9a8c83..HEAD
git diff --name-status d9a8c83..HEAD
git diff d9a8c83..HEAD -- src/app/api/supabase-storage/route.ts src/components/termografia/PhotoAnnotationDialog.tsx src/lib/termografia/annotations.ts fix-storage-rls-termografia.sql
```

Não executar o SQL. Registrar no PR quais partes concorrentes foram mantidas, substituídas ou removidas e por quê.

Antes de editar Next.js, reler os guias relevantes em `node_modules/next/dist/docs/`, principalmente Route Handlers, imagens, Client Components e formulários. Este plano não cria a rota `/api/supabase-storage`; as referências incorretas serão removidas.

## Mapa de arquivos

### Criar

- `src/lib/termografia/photo-source.ts`: valida URL/resposta/MIME e converte fonte em `File`.
- `src/lib/termografia/photo-source.test.ts`: 200, 401/403, 404, MIME inválido, blob vazio e renovação.
- `src/hooks/useTermografiaPhotoUrls.ts`: ciclo de vida de Object URLs locais.
- `src/hooks/useTermografiaPhotoUrls.test.tsx`: criação, substituição e revogação.
- `src/lib/termografia/offline-db.ts`: schema Dexie e adapter `TermografiaLocalStore`.
- `src/lib/termografia/offline-db.test.ts`: persistência, isolamento e limpeza confirmada.
- `src/lib/termografia/offline-sync.ts`: fila idempotente e reconciliação.
- `src/lib/termografia/offline-sync.test.ts`: ordem, retry, duplicidade e conflito.
- `src/components/termografia/PhotoPreview.tsx`: preview com estados local/enviando/salva/erro.
- `src/components/termografia/PhotoPreview.test.tsx`: nunca renderiza rota inexistente nem selo prematuro.

### Modificar

- `package.json` e `package-lock.json`: adicionar Dexie somente na fase offline.
- `src/lib/termografia/types.ts`: separar estado persistente, local e sincronização.
- `src/lib/termografia/draft.ts` e testes: limpar todos os campos transitórios.
- `src/lib/termografia/images.ts` e testes: decodificação com fallback e canvas real.
- `src/lib/storage.ts` e testes: URLs assinadas renováveis e cache-busting.
- `src/hooks/useTermografiaDraft.ts` e testes: atualização atômica, adapter local e fila única.
- `src/app/termografia/nova/page.tsx`: preview local, upload transacional, marcação pré-finalização.
- `src/app/termografia/[id]/page.tsx`: carregador validado, recorte/marcação confiáveis e cache renovada.
- `src/components/termografia/PhotoCropDialog.tsx` e testes: erros de decodificação e retry.
- `src/components/termografia/PhotoAnnotationDialog.tsx` e testes: arquivo real, múltiplos círculos e preservação.
- `src/components/termografia/SaveStatusBanner.tsx` e testes: distinguir local de online.
- `src/hooks/geracao-relatorio.test.tsx`: fluxo integrado online e offline.

## Fase 1 — Corrigir imagens no fluxo online

### Task 1: Congelar os bugs em testes de reprodução

**Files:**
- Create: `src/lib/termografia/photo-source.test.ts`
- Create: `src/components/termografia/PhotoPreview.test.tsx`
- Modify: `src/hooks/geracao-relatorio.test.tsx`

- [ ] **Step 1: Testar respostas HTTP e MIME**

Escrever testes contra a interface futura:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchImageFile } from './photo-source';

describe('fetchImageFile', () => {
  it('aceita somente resposta 2xx com MIME de imagem e blob não vazio', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(
      new Blob(['jpeg'], { type: 'image/jpeg' }),
      { status: 200, headers: { 'Content-Type': 'image/jpeg' } },
    ));
    const file = await fetchImageFile('https://signed/foto', 'foto.jpg', { fetcher });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
  });

  it.each([401, 403, 404, 500])('rejeita HTTP %s', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('erro', { status }));
    await expect(fetchImageFile('https://signed/foto', 'foto.jpg', { fetcher }))
      .rejects.toThrow(/imagem|foto/i);
  });

  it('rejeita HTML retornado com status 200', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>erro</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }));
    await expect(fetchImageFile('/rota-inexistente', 'foto.jpg', { fetcher }))
      .rejects.toThrow(/formato/i);
  });
});
```

- [ ] **Step 2: Testar que preview não usa a rota inexistente**

```tsx
render(<PhotoPreview src="blob:local" status="local" alt="Foto digital" />);
expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:local');
expect(screen.queryByText('Salva')).not.toBeInTheDocument();
expect(screen.getByRole('img').getAttribute('src')).not.toContain('/api/supabase-storage');
```

Adicionar caso `status="salva"` que mostra selo somente com `src` carregável e caso `erro` com botão de retry.

- [ ] **Step 3: Testar o fluxo da página**

Em `geracao-relatorio.test.tsx`, renderizar a página ou extrair o controlador de foto para testar:

- preview Object URL antes do upload;
- Storage resolvido, mas autosave pendente: ainda não `Salva`;
- upload + autosave resolvidos: `Salva`;
- nenhuma chamada para `/api/supabase-storage`;
- upload digital e térmico concorrentes preservam os dois caminhos.

- [ ] **Step 4: Confirmar as falhas no baseline**

```powershell
npm test -- src/lib/termografia/photo-source.test.ts src/components/termografia/PhotoPreview.test.tsx src/hooks/geracao-relatorio.test.tsx
```

Expected: FAIL porque `photo-source.ts`/`PhotoPreview.tsx` não existem e a página atual referencia a rota ausente.

- [ ] **Step 5: Preservar a evidência vermelha para a Task 2**

Não criar commit com a suíte quebrada. Registrar no log da execução quais testes falharam no baseline e manter os arquivos no worktree. O primeiro commit desta correção acontece ao final da Task 2, quando os testes de `photo-source.ts` estiverem verdes; `PhotoPreview` e integração ficam vermelhos até a Task 3/4.

### Task 2: Criar uma única fronteira de carregamento de imagem

**Files:**
- Create: `src/lib/termografia/photo-source.ts`
- Modify: `src/lib/storage.ts`
- Test: `src/lib/termografia/photo-source.test.ts`

- [ ] **Step 1: Definir erros e contrato**

```ts
export type PhotoSourceErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'http'
  | 'not_image'
  | 'empty';

export class PhotoSourceError extends Error {
  constructor(public code: PhotoSourceErrorCode, message: string) {
    super(message);
    this.name = 'PhotoSourceError';
  }
}

export type FetchImageOptions = {
  fetcher?: typeof fetch;
  renew?: () => Promise<string>;
};

export async function fetchImageFile(
  url: string,
  fileName: string,
  options?: FetchImageOptions,
): Promise<File>;
```

- [ ] **Step 2: Implementar validação e uma renovação**

Regras exatas:

- executar fetch;
- se 401/403 e `renew` existir, renovar uma vez e repetir;
- 404 -> `not_found`;
- outro `!ok` -> `http`;
- validar `Content-Type` da resposta e `blob.type` com `image/`;
- rejeitar `blob.size === 0`;
- construir `File` somente depois de validar.

Não aceitar HTML/JSON mesmo que status seja 200.

- [ ] **Step 3: Tornar URL assinada explícita**

Em `src/lib/storage.ts`, substituir retorno silencioso por função que lança erro:

```ts
export async function getRequiredSignedImageUrl(path: string, version?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos-cabine')
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error('Não foi possível autorizar a foto.');
  const url = new URL(data.signedUrl);
  if (version) url.searchParams.set('v', version);
  return url.toString();
}
```

Manter `getUrlArquivo` temporariamente como wrapper para não quebrar consumidores fora da termografia; migrar somente o módulo neste plano.

- [ ] **Step 4: Rodar testes**

```powershell
npm test -- src/lib/termografia/photo-source.test.ts
npx tsc --noEmit --incremental false
```

Expected: casos 2xx, HTTP, MIME, vazio e renovação PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/termografia/photo-source.ts src/lib/termografia/photo-source.test.ts src/lib/storage.ts
git commit -m "fix: valida fontes de imagem da termografia"
```

### Task 3: Preview local e atualização atômica de pontos

**Files:**
- Create: `src/hooks/useTermografiaPhotoUrls.ts`
- Create: `src/hooks/useTermografiaPhotoUrls.test.tsx`
- Create: `src/components/termografia/PhotoPreview.tsx`
- Modify: `src/lib/termografia/types.ts`
- Modify: `src/lib/termografia/draft.ts`
- Modify: `src/hooks/useTermografiaDraft.ts`
- Modify: `src/hooks/useTermografiaDraft.test.tsx`

- [ ] **Step 1: Testar ciclo de Object URLs**

Cobrir:

- `setLocalPhoto(pontoId, tipo, file)` chama `URL.createObjectURL`;
- substituir a mesma foto revoga a URL anterior;
- remover ponto revoga digital e térmica;
- unmount revoga todas;
- URL assinada não é revogada como Object URL.

- [ ] **Step 2: Adicionar mutação atômica ao hook**

O problema atual usa arrays capturados por closures assíncronas. Adicionar ao contrato:

```ts
atualizarPonto(
  pontoId: string,
  updater: (current: PontoTransitorio) => PontoTransitorio,
): void;
```

A implementação deve ler `pontosRef.current`, produzir o array seguinte, atualizar ref/estado e agendar autosave numa operação. Testar dois uploads resolvidos em ordem invertida e confirmar que digital e térmica permanecem.

- [ ] **Step 3: Ampliar campos transitórios**

Manter arquivos e fontes locais somente em `PontoTransitorio`:

```ts
_fotoDigitalFile?: File;
_fotoTermicaFile?: File;
fotoDigitalSrc?: string | null;
fotoTermicaSrc?: string | null;
```

`limparPontoPersistido` deve remover todos eles. Adicionar teste que o JSON salvo contenha somente caminhos persistentes.

- [ ] **Step 4: Implementar `PhotoPreview`**

O componente recebe `src`, `status`, `alt`, `onRetry` e `onLoadError`. Ele não resolve caminhos, não chama Storage e não monta URLs artificiais. `Salva` aparece somente em `status="salva"`.

- [ ] **Step 5: Rodar testes e commit**

```powershell
npm test -- src/hooks/useTermografiaPhotoUrls.test.tsx src/components/termografia/PhotoPreview.test.tsx src/hooks/useTermografiaDraft.test.tsx src/lib/termografia/draft.test.ts
git add src/hooks src/components/termografia/PhotoPreview.tsx src/lib/termografia/types.ts src/lib/termografia/draft.ts
git commit -m "fix: separa preview local de caminho persistente"
```

### Task 4: Corrigir criação, status `Salva` e marcação pré-finalização

**Files:**
- Modify: `src/app/termografia/nova/page.tsx`
- Modify: `src/hooks/geracao-relatorio.test.tsx`
- Modify: `src/components/termografia/PhotoAnnotationDialog.test.tsx`

- [ ] **Step 1: Remover todas as URLs da rota inexistente**

Eliminar as três ocorrências de `/api/supabase-storage` nas páginas e remover a rota concorrente quando ela ficar sem consumidores. Preview usa `fotoDigitalSrc`/`fotoTermicaSrc` local. Depois de retomada, a página resolve caminhos com `getRequiredSignedImageUrl` usando o cliente autenticado existente.

Adicionar asserção:

```powershell
rg -n "/api/supabase-storage" src
```

Expected: nenhuma ocorrência. Não manter a proxy anônima adicionada depois de `d9a8c83`.

- [ ] **Step 2: Tornar upload uma transação de interface**

Sequência de `processarFoto`:

1. guardar `File` e Object URL no ponto;
2. status `local` e depois `enviando`;
3. compactar;
4. digital: upload original e versão de trabalho; térmica: upload de trabalho;
5. atualizar caminhos via `atualizarPonto`;
6. `await salvarAgora()`;
7. somente então status `salva`.

Se upload/autosave falhar, manter arquivo/preview e status `erro`. Nunca apagar a versão anterior antes da confirmação.

- [ ] **Step 3: Marcar ocorrência usando o arquivo local**

Quando houver `_fotoDigitalFile`, abrir o editor diretamente com ele. Se não houver, obter `File` pelo carregador validado. O botão aparece quando `ocorrencia && (arquivoLocal || fotoDigitalUrl)`.

Ao confirmar:

- manter `fotoDigitalOriginalUrl`;
- atualizar `_fotoDigitalFile`, preview e versão de trabalho;
- fazer upload e `await salvarAgora()`;
- permitir vários círculos;
- em erro, manter editor e dados anteriores.

- [ ] **Step 4: Testar estado completo**

Casos obrigatórios:

- preview aparece antes de resolver upload;
- `Salva` não aparece antes do autosave;
- ocorrência abre editor antes da finalização;
- dois círculos são mantidos no arquivo confirmado;
- foto original permanece restaurável;
- falha do segundo upload digital não marca estado como salvo;
- finalização bloqueia status `local`, `enviando` ou `erro`.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/hooks/geracao-relatorio.test.tsx src/components/termografia/PhotoAnnotationDialog.test.tsx
npx eslint src/app/termografia/nova/page.tsx src/hooks/useTermografiaDraft.ts src/components/termografia
npx tsc --noEmit --incremental false
git add src/app/termografia/nova/page.tsx src/hooks/geracao-relatorio.test.tsx src/components/termografia
git commit -m "fix: exibe previews e marca ocorrencias antes de finalizar"
```

### Task 5: Decodificação e recorte compatíveis com celular

**Files:**
- Modify: `src/lib/termografia/images.ts`
- Modify: `src/lib/termografia/images.test.ts`
- Modify: `src/components/termografia/PhotoCropDialog.tsx`
- Modify: `src/components/termografia/PhotoCropDialog.test.tsx`

- [ ] **Step 1: Escrever testes de sucesso reais**

Os testes atuais cobrem apenas rejeição e mockam `recortarImagem`. Adicionar casos com canvas falso controlado:

- bitmap 4032x3024 + recorte 3:4 válido;
- arredondamento/clamp nas bordas;
- `canvas.toBlob` nulo;
- `createImageBitmap` ausente;
- `createImageBitmap` rejeita, fallback por `HTMLImageElement` funciona;
- orientação retrato e paisagem;
- arquivo cujo MIME não seja imagem é rejeitado antes de decodificar.

- [ ] **Step 2: Extrair decodificador**

```ts
export type DecodedImage = {
  width: number;
  height: number;
  draw(ctx: CanvasRenderingContext2D, ...args: number[]): void;
  close(): void;
};

export async function decodeImage(file: File): Promise<DecodedImage>;
```

Tentar `createImageBitmap`; em indisponibilidade/rejeição, usar Object URL + `Image` com cleanup. Não usar fallback para resposta HTTP/MIME inválida; isso deve falhar antes em `photo-source.ts`.

- [ ] **Step 3: Preservar limite sem rejeitar foto comum**

Em vez de rejeitar apenas por `sourceWidth * sourceHeight > 20_000_000`, calcular escala de saída para limitar o canvas a no máximo 12 MP ou 2400 px no lado maior. O recorte continua 3:4 vertical. Testar o tamanho final exato.

- [ ] **Step 4: Manter diálogo aberto no erro**

Erro de decodificação/`toBlob` aparece no modal; botões voltam a habilitar; `Tentar novamente` não perde área e zoom. `Cancelar` não altera foto.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- src/lib/termografia/images.test.ts src/components/termografia/PhotoCropDialog.test.tsx
git add src/lib/termografia/images.ts src/lib/termografia/images.test.ts src/components/termografia/PhotoCropDialog.tsx src/components/termografia/PhotoCropDialog.test.tsx
git commit -m "fix: torna recorte compativel com fotos de celular"
```

### Task 6: Corrigir edição do relatório finalizado

**Files:**
- Modify: `src/app/termografia/[id]/page.tsx`
- Create: `src/app/termografia/[id]/page.test.tsx`
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Testar carregamento e edição**

Mockar Supabase/Storage e cobrir:

- detalhe resolve caminho persistente para URL assinada;
- `getRequiredSignedImageUrl` falha -> estado de erro com retry;
- recorte digital e térmico recebem `File` de imagem validado;
- 404/HTML não abre cropper;
- 401/403 renova uma vez;
- marcação digital abre somente em ocorrência;
- upload confirmado renova preview;
- falha mantém preview anterior.

- [ ] **Step 2: Substituir `fetchPhotoAsFile`**

Remover a função local sem validação. Usar `fetchImageFile` com callback que gera nova URL assinada para o mesmo caminho.

- [ ] **Step 3: Corrigir cache**

Não guardar `null` como sucesso. Guardar caminho, URL assinada e instante de expiração/versão. Depois de upload:

- invalidar chave;
- gerar nova URL com `version = Date.now().toString()`;
- pré-carregar/validar;
- somente então trocar `foto*Src`.

- [ ] **Step 4: Persistir original e estado coerente**

Recorte/marcação substituem o objeto de trabalho no mesmo caminho. A foto digital original continua em caminho separado. Se um relatório legado não tiver original, não mostrar `Restaurar original`.

- [ ] **Step 5: Verificar e commit**

```powershell
npm test -- "src/app/termografia/[id]/page.test.tsx" src/lib/termografia/photo-source.test.ts
npx eslint "src/app/termografia/[id]/page.tsx" "src/app/termografia/[id]/page.test.tsx" src/lib/storage.ts
npx tsc --noEmit --incremental false
git add "src/app/termografia/[id]/page.tsx" "src/app/termografia/[id]/page.test.tsx" src/lib/storage.ts
git commit -m "fix: restaura recorte e marcacao no relatorio salvo"
```

### Gate da Fase 1

Não iniciar offline antes de:

```powershell
npm test
npx tsc --noEmit --incremental false
npx eslint src/app/termografia src/components/termografia src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaPhotoUrls.ts src/lib/termografia src/lib/storage.ts
```

E confirmar no celular:

- preview digital e térmico sem imagem quebrada;
- vários círculos antes de finalizar;
- recorte 3:4 de digital e térmica depois de finalizar;
- restauração da original;
- falha simulada preserva foto anterior.

Criar um commit/tag de checkpoint antes da Fase 2.

## Fase 2 — Continuidade offline simples e isolada

### Task 7: Banco local e adapter opcional

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/termografia/offline-db.ts`
- Create: `src/lib/termografia/offline-db.test.ts`

- [ ] **Step 1: Instalar Dexie**

```powershell
npm install dexie
```

Não adicionar service worker, Workbox ou cache de página.

- [ ] **Step 2: Definir registros locais**

```ts
export type LocalDraftRecord = {
  reportId: string;
  userId: string;
  serverUpdatedAt: string;
  localUpdatedAt: string;
  version: number;
  dirty: boolean;
  data: TermografiaDadosGerais;
  points: TermografiaPonto[];
};

export type PendingPhotoRecord = {
  key: string;
  reportId: string;
  pointId: string;
  type: 'digital' | 'digital-original' | 'termica';
  version: number;
  blob: Blob;
  fileName: string;
  status: 'pending' | 'uploading' | 'failed';
  attempts: number;
  lastError?: string;
};
```

Dexie:

```ts
this.version(1).stores({
  drafts: '&reportId, userId, dirty, localUpdatedAt',
  photos: '&key, reportId, pointId, status',
});
```

- [ ] **Step 3: Definir adapter para teste/fallback**

```ts
export interface TermografiaLocalStore {
  load(reportId: string, userId: string): Promise<LocalDraftRecord | null>;
  saveDraft(record: LocalDraftRecord): Promise<void>;
  enqueuePhoto(record: PendingPhotoRecord): Promise<void>;
  listPending(reportId: string): Promise<PendingPhotoRecord[]>;
  markPhotoFailed(key: string, message: string): Promise<void>;
  removePhoto(key: string): Promise<void>;
  markSynced(reportId: string, serverUpdatedAt: string): Promise<void>;
}
```

Fornecer adapter em memória para testes. Se Dexie abrir com erro/quota/privacidade, retornar modo indisponível e não quebrar o online.

- [ ] **Step 4: Testar persistência e isolamento**

Cobrir reabertura, dois usuários, dois relatórios, substituição por versão e remoção somente confirmada.

- [ ] **Step 5: Commit**

```powershell
npm test -- src/lib/termografia/offline-db.test.ts
git add package.json package-lock.json src/lib/termografia/offline-db.ts src/lib/termografia/offline-db.test.ts
git commit -m "feat: adiciona armazenamento local de rascunho termografico"
```

### Task 8: Fila idempotente de fotos

**Files:**
- Create: `src/lib/termografia/offline-sync.ts`
- Create: `src/lib/termografia/offline-sync.test.ts`
- Modify: `src/lib/termografia/types.ts`

- [ ] **Step 1: Escrever testes falhos da ordem de sincronização**

Ordem obrigatória:

```text
blob local -> upload Storage -> caminho no ponto -> autosave servidor -> limpeza local
```

Testar que falha em qualquer etapa não executa a etapa seguinte nem remove o blob. Testar duas chamadas simultâneas para a mesma chave e confirmar um upload.

- [ ] **Step 2: Gerar chave idempotente**

```ts
export function photoQueueKey(
  reportId: string,
  pointId: string,
  type: PendingPhotoRecord['type'],
  version: number,
): string {
  return `${reportId}:${pointId}:${type}:${version}`;
}
```

Versão nova da mesma foto substitui/torna obsoleta a anterior antes do upload. Não usar índice visual do ponto.

- [ ] **Step 3: Implementar sincronizador serial**

Uma instância por relatório, protegida por Promise/mutex em memória. Retry: imediato manual; automático em 2 s, 10 s, 30 s e 2 min enquanto a página estiver aberta. Parar quando `navigator.onLine === false`.

- [ ] **Step 4: Testar fechamento e retomada**

Simular interrupção depois do upload e antes do autosave. Na retomada, verificar objeto existente/caminho determinístico e concluir sem duplicar.

- [ ] **Step 5: Commit**

```powershell
npm test -- src/lib/termografia/offline-sync.test.ts
git add src/lib/termografia/offline-sync.ts src/lib/termografia/offline-sync.test.ts src/lib/termografia/types.ts
git commit -m "feat: cria fila idempotente de fotos offline"
```

### Task 9: Integrar offline ao hook sem segundo autosave

**Files:**
- Modify: `src/hooks/useTermografiaDraft.ts`
- Modify: `src/hooks/useTermografiaDraft.test.tsx`
- Modify: `src/app/termografia/nova/page.tsx`
- Modify: `src/components/termografia/SaveStatusBanner.tsx`
- Modify: `src/components/termografia/SaveStatusBanner.test.tsx`

- [ ] **Step 1: Preservar contrato público e injetar dependências**

Adicionar opções:

```ts
localStore?: TermografiaLocalStore;
syncPhotos?: (reportId: string) => Promise<void>;
```

O `useTermografiaDraft` continua sendo o único chamador de update do relatório. `offline-sync` devolve caminhos; não grava JSON por conta própria.

- [ ] **Step 2: Salvar snapshot local em toda alteração**

Depois que existe `relatorio.id`, dados e pontos são persistidos localmente antes do debounce de servidor. Se a gravação local falhar online, registrar aviso e continuar servidor. Offline, mostrar erro claro porque não há proteção durável.

- [ ] **Step 3: Recuperar com regra de versão**

Ao abrir com internet:

- carregar servidor;
- carregar snapshot do mesmo usuário/relatório;
- se local não está dirty, usar servidor;
- se dirty e baseline coincide, recuperar local e sincronizar;
- se servidor é mais novo, entrar em conflito; não sobrescrever.

Sem internet, somente recuperar um rascunho já conhecido/aberto. Não chamar RPC de criação offline.

- [ ] **Step 4: Diferenciar estados do banner**

Estados mínimos:

```ts
'salvando_local' | 'salvo_local' | 'sincronizando' | 'salvo_online' | 'offline_erro'
```

Textos:

- `Salvando neste celular…`
- `Salvo neste celular — aguardando internet`
- `Sincronizando fotos e dados…`
- `Sincronizado online às HH:mm`
- `Não foi possível proteger este rascunho offline`

Não reutilizar `Rascunho salvo` para estado somente local.

- [ ] **Step 5: Bloquear finalização**

`finalizar()` exige:

- online;
- nenhuma foto local/failed/uploading;
- snapshot `dirty === false`;
- fila serial concluída;
- último autosave confirmado.

Mensagem deve listar quantidade de fotos pendentes e oferecer `Sincronizar agora`.

- [ ] **Step 6: Testar cenários de conflito e fallback**

- IndexedDB indisponível + online -> autosave continua.
- IndexedDB indisponível + offline -> aviso, sem falsa confirmação.
- local dirty + servidor inalterado -> sincroniza.
- local dirty + servidor mais novo -> conflito, zero updates.
- finalizar offline -> rejeita.
- reconectar -> fotos primeiro, dados depois.

- [ ] **Step 7: Commit**

```powershell
npm test -- src/hooks/useTermografiaDraft.test.tsx src/components/termografia/SaveStatusBanner.test.tsx src/lib/termografia/offline-sync.test.ts
git add src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaDraft.test.tsx src/app/termografia/nova/page.tsx src/components/termografia/SaveStatusBanner.tsx src/components/termografia/SaveStatusBanner.test.tsx
git commit -m "feat: recupera e sincroniza rascunho termografico offline"
```

### Task 10: Limites de armazenamento e recuperação móvel

**Files:**
- Modify: `src/lib/termografia/offline-db.ts`
- Modify: `src/lib/termografia/offline-db.test.ts`
- Modify: `src/app/termografia/nova/page.tsx`

- [ ] **Step 1: Verificar quota antes de enfileirar**

Usar `navigator.storage.estimate()` quando disponível. Se `usage + blob.size` se aproximar de 80% da quota, impedir nova foto offline, preservar dados de texto e mostrar quanto espaço liberar. Não apagar fotos antigas automaticamente.

- [ ] **Step 2: Compactar antes de IndexedDB**

Guardar a mesma versão de trabalho compactada destinada ao upload. Nunca guardar data URL/base64. Preservar original digital compactada quando necessária para restauração.

- [ ] **Step 3: Testar lote grande sem alocar memória excessiva**

Usar blobs pequenos simulados com metadados equivalentes a 50 pontos/100 fotos. Confirmar paginação/iteração serial e ausência de `Promise.all` carregando 100 blobs simultaneamente.

- [ ] **Step 4: Commit**

```powershell
npm test -- src/lib/termografia/offline-db.test.ts src/lib/termografia/offline-sync.test.ts
git add src/lib/termografia/offline-db.ts src/lib/termografia/offline-db.test.ts src/app/termografia/nova/page.tsx
git commit -m "fix: protege quota e memoria do modo offline"
```

## Fase 3 — Verificação e entrega ao usuário

### Task 11: Regressão automatizada e validação manual

**Files:**
- Modify only when a failing test proves a defect: files from Tasks 1–10
- Create: `docs/termografia-imagens-offline-validacao.md`

- [ ] **Step 1: Rodar verificações completas**

```powershell
npm test
npx tsc --noEmit --incremental false
npx eslint src/app/termografia src/components/termografia src/hooks src/lib/termografia src/lib/storage.ts
npm run build
```

Expected: todos os testes PASS, TypeScript sem diagnósticos, lint focado sem erros e build concluído. Não esconder falhas preexistentes relevantes com `eslint-disable` novo.

- [ ] **Step 2: Testar online no celular**

1. Abrir rascunho com internet.
2. Adicionar digital e térmica em retrato/paisagem.
3. Confirmar preview imediato e selo somente depois da confirmação.
4. Marcar ocorrência e adicionar três círculos antes de finalizar.
5. Finalizar.
6. Recortar digital e térmica em 3:4.
7. Adicionar outros círculos na digital.
8. Restaurar original.
9. Imprimir e confirmar imagens sem fundo preto.

- [ ] **Step 3: Testar falhas online**

Simular 404, URL expirada, resposta HTML, upload negado e autosave negado. Em todos: mensagem específica, foto anterior preservada, retry funcional e nenhum selo falso.

- [ ] **Step 4: Testar offline no celular**

1. Abrir rascunho online.
2. Desligar rede.
3. Alterar texto e adicionar fotos.
4. Fechar completamente o navegador.
5. Reabrir ainda offline e confirmar recuperação.
6. Ligar rede mantendo app aberto.
7. Confirmar ordem de sincronização e zero duplicidades.
8. Reabrir relatório e conferir fotos/markings.

Esclarecer no manual: se o app estiver fechado, a sincronização começa na próxima abertura; não existe serviço em segundo plano.

- [ ] **Step 5: Documentar evidências**

Registrar SHA, aparelho/navegador, resultados, contagem de fotos, falhas simuladas e screenshots sem dados sensíveis em `docs/termografia-imagens-offline-validacao.md`.

- [ ] **Step 6: Commit**

```powershell
git add docs/termografia-imagens-offline-validacao.md
git commit -m "test: valida imagens e continuidade offline da termografia"
```

### Task 12: Revisão e publicação controlada

- [ ] **Step 1: Revisar diff contra a branch remota**

```powershell
git diff --check origin/codex/termografia-salvamento-seguro...HEAD
git diff --stat origin/codex/termografia-salvamento-seguro...HEAD
git status --short
```

Confirmar que não entraram mudanças em cabine, pedidos, contratos/locações, `.env`, credenciais ou migrations não relacionadas.

- [ ] **Step 2: Solicitar code review**

Usar `superpowers:requesting-code-review`. Prioridades: lifecycle de Object URLs, concorrência de uploads, cache assinada, idempotência, conflito offline, quota e bloqueio de finalização.

- [ ] **Step 3: Criar PR separado**

```powershell
git push -u origin codex/termografia-imagens-fix
```

Abrir PR para a branch de termografia ou para `main` conforme o responsável decidir depois de verificar o estado das branches. Não fazer merge automático.

- [ ] **Step 4: Não aplicar operações externas sem autorização**

Este plano não autoriza:

- migrations no Supabase;
- execução de `fix-storage-rls-termografia.sql`;
- alteração de `.env`;
- service role;
- deploy preview ou produção;
- importação de dados reais;
- exclusão do worktree antigo divergente.

## Critério final de encerramento

Não considerar concluído apenas porque os 95 testes antigos continuam verdes. A entrega exige novos testes que falhem no baseline e passem depois, mais evidência no celular de:

- nenhum preview quebrado;
- nenhuma dependência de `/api/supabase-storage`;
- digital e térmica recortáveis;
- múltiplos círculos antes e depois da finalização;
- original digital restaurável;
- erro sem perda da imagem anterior;
- rascunho aberto previamente recuperado offline após fechar o navegador;
- sincronização sem duplicidade;
- fluxo online funcional quando IndexedDB está indisponível;
- testes, TypeScript, lint focado e build verdes no mesmo SHA.

