# Termografia com Salvamento Seguro — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar rascunhos termográficos com autosave confirmado, uploads confiáveis, recorte de foto digital, retomada automática e edição completa após a finalização.

**Architecture:** O registro Supabase passa a existir desde o início como `rascunho`; um hook cliente serializa autosaves e impede respostas antigas de vencerem alterações novas. Fotos são tratadas individualmente, com recorte opcional, compressão, upload que lança erro e persistência do caminho somente após confirmação. A visualização do relatório recebe carregamento correto de URLs assinadas, edição dos dados gerais e download.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript, Supabase Database/Storage, `browser-image-compression`, `react-easy-crop`, Vitest e Testing Library.

---

## Estrutura de arquivos

- Criar `src/lib/termografia/draft.ts`: transformação pura de relatório/pontos, estados de salvamento e utilitários de versão.
- Criar `src/lib/termografia/draft.test.ts`: testes das transformações e proteção contra sobrescrita fora de ordem.
- Criar `src/lib/termografia/images.ts`: nomes estáveis, compressão e geração do recorte via canvas.
- Criar `src/lib/termografia/images.test.ts`: nomes estáveis e preservação de caminhos.
- Criar `src/components/termografia/PhotoCropDialog.tsx`: interface isolada para recorte ou uso do original.
- Criar `src/components/termografia/SaveStatusBanner.tsx`: comunicação uniforme de `salvando`, `salvo`, `offline` e `erro`.
- Criar `src/components/termografia/GeneralDataEditor.tsx`: edição dos dados gerais permitidos.
- Criar `src/hooks/useTermografiaDraft.ts`: criação, fila serial de autosave, retomada e finalização do rascunho.
- Criar `src/hooks/useTermografiaDraft.test.tsx`: testes do debounce e da serialização.
- Modificar `src/app/termografia/nova/page.tsx`: consumir os componentes/hook e enviar fotos individualmente.
- Modificar `src/app/termografia/[id]/page.tsx`: corrigir fotos, editar dados gerais e baixar arquivos.
- Modificar `src/lib/storage.ts`: falhar explicitamente e expor download assinado.
- Modificar `src/lib/termografia/types.ts`: status, metadados de atualização e tipos de formulário.
- Modificar `src/app/termografia/page.tsx`: excluir rascunhos da listagem finalizada.
- Criar `termografia_drafts_migration.sql`: coluna de atualização e índice para retomada eficiente.
- Modificar `package.json`: scripts e dependências de teste/recorte.
- Criar `vitest.config.ts` e `src/test/setup.ts`: ambiente de testes React.

## Task 1: Infraestrutura de testes e tipos do domínio

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `src/lib/termografia/types.ts`
- Create: `src/lib/termografia/draft.test.ts`

- [ ] **Step 1: Instalar dependências e scripts**

Run:

```powershell
npm install react-easy-crop
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Adicionar a `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Expected: `package-lock.json` registra as dependências e `npm run test -- --help` encerra com código 0.

- [ ] **Step 2: Configurar Vitest**

Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

Criar `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Escrever testes falhos dos tipos e sanitização**

Adicionar `src/lib/termografia/draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { limparPontoPersistido, podeFinalizar } from './draft';

describe('rascunho termográfico', () => {
  it('remove previews e URLs assinadas antes de persistir', () => {
    const ponto = {
      id: 'p-1', setor: 'A', local: 'QD1', inspecionado: true, ocorrencia: false,
      fotoDigitalUrl: 'termografia/1/p-1-digital.jpg',
      fotoDigitalSrc: 'blob:preview', _fotoDigitalFile: new File(['x'], 'x.jpg'),
    };
    expect(limparPontoPersistido(ponto)).toEqual({
      id: 'p-1', setor: 'A', local: 'QD1', inspecionado: true, ocorrencia: false,
      fotoDigitalUrl: 'termografia/1/p-1-digital.jpg',
    });
  });

  it('bloqueia finalização com upload pendente ou falho', () => {
    expect(podeFinalizar([{ digital: 'enviando', termica: 'salva' }])).toBe(false);
    expect(podeFinalizar([{ digital: 'erro', termica: 'vazia' }])).toBe(false);
    expect(podeFinalizar([{ digital: 'salva', termica: 'vazia' }])).toBe(true);
  });
});
```

- [ ] **Step 4: Executar e confirmar a falha**

Run: `npm test -- src/lib/termografia/draft.test.ts`

Expected: FAIL porque `./draft` ainda não existe.

- [ ] **Step 5: Ampliar os tipos**

Adicionar a `src/lib/termografia/types.ts`:

```ts
export type TermografiaStatus = 'rascunho' | 'gerado' | 'cancelado';
export type FotoUploadStatus = 'vazia' | 'local' | 'enviando' | 'salva' | 'erro';

export interface TermografiaDadosGerais {
  cliente_nome: string;
  cliente_cnpj: string;
  cliente_endereco: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cep: string;
  data_execucao: string;
  objetivo: string;
  equipamento: string;
  responsavel_nome: string;
  responsavel_crea: string;
}
```

Alterar `TermografiaRelatorio.status` para `TermografiaStatus` e adicionar `atualizado_em?: string`.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/lib/termografia/types.ts src/lib/termografia/draft.test.ts
git commit -m "test: prepara dominio de rascunhos termograficos"
```

## Task 2: Transformações puras e migração do banco

**Files:**
- Create: `src/lib/termografia/draft.ts`
- Modify: `src/lib/termografia/draft.test.ts`
- Create: `termografia_drafts_migration.sql`

- [ ] **Step 1: Implementar as funções mínimas**

Criar `src/lib/termografia/draft.ts`:

```ts
import type { FotoUploadStatus, TermografiaPonto } from './types';

export type PontoTransitorio = TermografiaPonto & {
  fotoDigitalSrc?: string | null;
  fotoTermicaSrc?: string | null;
  _fotoDigitalFile?: File;
  _fotoTermicaFile?: File;
};

export function limparPontoPersistido(ponto: PontoTransitorio): TermografiaPonto {
  const {
    fotoDigitalSrc: _digitalSrc, fotoTermicaSrc: _termicaSrc,
    _fotoDigitalFile, _fotoTermicaFile, ...persistido
  } = ponto;
  return persistido;
}

export function podeFinalizar(status: Array<{ digital: FotoUploadStatus; termica: FotoUploadStatus }>) {
  return status.every(({ digital, termica }) =>
    !['local', 'enviando', 'erro'].includes(digital)
    && !['local', 'enviando', 'erro'].includes(termica));
}

export function deveAplicarResposta(resposta: number, ultimaAplicada: number) {
  return resposta >= ultimaAplicada;
}
```

- [ ] **Step 2: Completar o teste de versão**

Adicionar ao `describe` existente:

```ts
it('ignora uma resposta anterior à última já aplicada', () => {
  expect(deveAplicarResposta(4, 5)).toBe(false);
  expect(deveAplicarResposta(5, 5)).toBe(true);
  expect(deveAplicarResposta(6, 5)).toBe(true);
});
```

e importar `deveAplicarResposta`.

- [ ] **Step 3: Rodar os testes**

Run: `npm test -- src/lib/termografia/draft.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 4: Criar a migração idempotente**

Criar `termografia_drafts_migration.sql`:

```sql
ALTER TABLE relatorios_termografia
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS relatorios_termografia_rascunho_usuario_idx
  ON relatorios_termografia (criado_por, status, atualizado_em DESC);

CREATE OR REPLACE FUNCTION atualizar_data_relatorio_termografia()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorios_termografia_atualizado_em ON relatorios_termografia;
CREATE TRIGGER relatorios_termografia_atualizado_em
BEFORE UPDATE ON relatorios_termografia
FOR EACH ROW EXECUTE FUNCTION atualizar_data_relatorio_termografia();
```

- [ ] **Step 5: Aplicar a migração no projeto Supabase e verificar**

Executar o SQL no editor Supabase autorizado para o projeto. Depois rodar:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'relatorios_termografia' AND column_name = 'atualizado_em';
```

Expected: uma linha `atualizado_em`.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/termografia/draft.ts src/lib/termografia/draft.test.ts termografia_drafts_migration.sql
git commit -m "feat: adiciona base persistente para rascunhos"
```

## Task 3: Storage confiável e utilitários de imagem

**Files:**
- Modify: `src/lib/storage.ts`
- Create: `src/lib/termografia/images.ts`
- Create: `src/lib/termografia/images.test.ts`

- [ ] **Step 1: Escrever testes falhos para nomes estáveis**

Criar `src/lib/termografia/images.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nomeFotoPonto } from './images';

describe('imagens de termografia', () => {
  it('usa o id permanente, não o índice', () => {
    expect(nomeFotoPonto('ponto-abc', 'digital')).toBe('ponto-abc-digital.jpg');
    expect(nomeFotoPonto('ponto-abc', 'termica')).toBe('ponto-abc-termica.jpg');
  });
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `npm test -- src/lib/termografia/images.test.ts`

Expected: FAIL porque `images.ts` não existe.

- [ ] **Step 3: Fazer upload lançar erro e adicionar download**

Em `src/lib/storage.ts`, substituir o retorno silencioso por:

```ts
if (error) throw new Error(`Falha ao enviar ${nomeArquivo}: ${error.message}`);
return caminho;
```

Alterar o retorno de `uploadArquivo` para `Promise<string>` e adicionar:

```ts
export async function getUrlDownload(caminho: string, nome: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos-cabine')
    .createSignedUrl(caminho, 300, { download: nome });
  if (error || !data?.signedUrl) throw new Error('Não foi possível preparar o download.');
  return data.signedUrl;
}
```

- [ ] **Step 4: Implementar nome e recorte**

Criar `src/lib/termografia/images.ts`:

```ts
export type CropPixels = { x: number; y: number; width: number; height: number };

export function nomeFotoPonto(id: string, tipo: 'digital' | 'termica') {
  return `${id}-${tipo}.jpg`;
}

export async function recortarImagem(file: File, area: CropPixels): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('O navegador não conseguiu preparar o recorte.');
  context.drawImage(
    bitmap,
    Math.round(area.x), Math.round(area.y), Math.round(area.width), Math.round(area.height),
    0, 0, canvas.width, canvas.height,
  );
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Não foi possível gerar a imagem recortada.')),
      'image/jpeg',
      0.9,
    );
  });
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
```

- [ ] **Step 5: Rodar testes e checks**

Run: `npm test -- src/lib/termografia/images.test.ts; npm run lint -- src/lib/storage.ts src/lib/termografia/images.ts`

Expected: testes PASS e lint sem erros.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/storage.ts src/lib/termografia/images.ts src/lib/termografia/images.test.ts
git commit -m "fix: confirma uploads e estabiliza nomes das fotos"
```

## Task 4: Componentes de recorte e estado de salvamento

**Files:**
- Create: `src/components/termografia/PhotoCropDialog.tsx`
- Create: `src/components/termografia/PhotoCropDialog.test.tsx`
- Create: `src/components/termografia/SaveStatusBanner.tsx`
- Create: `src/components/termografia/SaveStatusBanner.test.tsx`

- [ ] **Step 1: Escrever testes de comportamento**

Os testes devem montar os componentes e verificar:

```tsx
render(<PhotoCropDialog file={file} onConfirm={onConfirm} onCancel={vi.fn()} />);
await user.click(screen.getByRole('button', { name: 'Usar original' }));
expect(onConfirm).toHaveBeenCalledWith(file);

render(<SaveStatusBanner status="salvo" salvoEm={new Date('2026-07-02T14:32:00')} />);
expect(screen.getByText(/você pode sair e continuar depois/i)).toBeInTheDocument();
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test -- src/components/termografia`

Expected: FAIL porque os componentes ainda não existem.

- [ ] **Step 3: Implementar `SaveStatusBanner`**

Usar a união:

```ts
export type SaveStatus = 'salvando' | 'salvo' | 'offline' | 'erro';
```

Renderizar textos aprovados no design e receber `onRetry?: () => void`. `erro` mostra botão `Tentar novamente`; `offline` nunca usa a palavra `salvo`.

- [ ] **Step 4: Implementar `PhotoCropDialog`**

Usar `react-easy-crop` com zoom de 1 a 3 e recorte livre. `Aplicar recorte` chama `recortarImagem`; `Usar original` retorna o próprio `File`; ambos fecham somente após `onConfirm` resolver. Exibir overlay de processamento enquanto o callback estiver pendente.

- [ ] **Step 5: Rodar testes**

Run: `npm test -- src/components/termografia`

Expected: PASS para recorte original, confirmação e quatro estados do banner.

- [ ] **Step 6: Commit**

```powershell
git add src/components/termografia
git commit -m "feat: adiciona recorte e indicador de salvamento"
```

## Task 5: Hook de rascunho serializado

**Files:**
- Create: `src/hooks/useTermografiaDraft.ts`
- Create: `src/hooks/useTermografiaDraft.test.tsx`

- [ ] **Step 1: Escrever testes com timers falsos**

Cobrir criação, retomada, debounce e fila serial. O caso central:

```tsx
vi.useFakeTimers();
const { result } = renderHook(() => useTermografiaDraft({ supabase: fakeSupabase }));
act(() => result.current.atualizarDados({ cliente_nome: 'Cliente A' }));
act(() => result.current.atualizarDados({ cliente_nome: 'Cliente AB' }));
await act(() => vi.advanceTimersByTimeAsync(800));
expect(update).toHaveBeenCalledTimes(1);
expect(update).toHaveBeenCalledWith(expect.objectContaining({ cliente_nome: 'Cliente AB' }));
```

Adicionar teste em que a primeira atualização demora mais que a segunda intenção e confirmar que a fila envia na ordem, sem aplicar estado antigo.

- [ ] **Step 2: Confirmar falha**

Run: `npm test -- src/hooks/useTermografiaDraft.test.tsx`

Expected: FAIL porque o hook não existe.

- [ ] **Step 3: Implementar o contrato do hook**

```ts
export interface UseTermografiaDraftResult {
  relatorio: TermografiaRelatorio | null;
  dados: TermografiaDadosGerais;
  pontos: TermografiaPonto[];
  saveStatus: SaveStatus;
  salvoEm: Date | null;
  carregando: boolean;
  atualizarDados(patch: Partial<TermografiaDadosGerais>): void;
  atualizarPontos(pontos: TermografiaPonto[]): void;
  salvarAgora(): Promise<void>;
  repetir(): Promise<void>;
  finalizar(): Promise<string>;
}
```

Na montagem, consultar o rascunho mais recente por `criado_por`, `status = rascunho`, `order atualizado_em desc`, `limit 1`. Se não existir, criar um. Usar debounce de 800 ms, uma promise-chain para serializar updates e contador de versão para aplicar apenas a resposta atual.

- [ ] **Step 4: Proteger saída e conexão**

Adicionar listeners para `online`, `offline` e `beforeunload`. O `beforeunload` só bloqueia quando há mudanças locais ou uploads pendentes; removê-lo no cleanup.

- [ ] **Step 5: Rodar testes**

Run: `npm test -- src/hooks/useTermografiaDraft.test.tsx`

Expected: PASS para criação, retomada, debounce, ordem, offline e cleanup.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useTermografiaDraft.ts src/hooks/useTermografiaDraft.test.tsx
git commit -m "feat: implementa autosave serial de termografia"
```

## Task 6: Integrar o rascunho à criação

**Files:**
- Modify: `src/app/termografia/nova/page.tsx`

- [ ] **Step 1: Substituir estados gerais pelo hook**

Usar `useTermografiaDraft` como fonte única dos dados e pontos. Enquanto `carregando`, mostrar `Carregando ou recuperando rascunho…`. Quando houver rascunho retomado, mostrar toast `Seu relatório foi recuperado` com contagem de fotos persistidas.

- [ ] **Step 2: Integrar o banner aprovado**

Renderizar `SaveStatusBanner` abaixo do cabeçalho sticky com `status`, `salvoEm` e `onRetry={repetir}`. Manter a faixa visível nas duas etapas do formulário.

- [ ] **Step 3: Integrar recorte e upload unitário**

Ao selecionar foto digital, abrir `PhotoCropDialog`. Após confirmação: marcar o tipo como `enviando`, comprimir somente o arquivo confirmado, chamar `uploadArquivo` com `nomeFotoPonto(ponto.id, 'digital')`, atualizar o caminho e chamar `salvarAgora`. Em erro, manter o preview e arquivo para `Tentar novamente`.

Aplicar o mesmo fluxo de confirmação à térmica, sem abrir recorte.

- [ ] **Step 4: Ajustar os botões de ponto**

Manter o botão superior e adicionar abaixo de `Concluir ponto`:

```tsx
<button type="button" onClick={adicionarPonto} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md">
  <Plus size={16} /> Adicionar novo ponto
</button>
```

Após inclusão, usar `requestAnimationFrame` e `document.getElementById(novo.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.

- [ ] **Step 5: Trocar submit por finalização**

O botão chama primeiro `salvarAgora`, valida campos e uploads, depois `finalizar`. Renomear para `Finalizar relatório`. Desabilitar durante salvamento/upload e levar o foco ao primeiro ponto inválido.

- [ ] **Step 6: Verificar criação**

Run: `npm test; npm run lint -- src/app/termografia/nova/page.tsx; npm run build`

Expected: testes PASS, lint sem erros, build concluído.

- [ ] **Step 7: Commit**

```powershell
git add src/app/termografia/nova/page.tsx
git commit -m "feat: integra rascunho seguro ao fluxo de termografia"
```

## Task 7: Corrigir visualização e editar dados gerais

**Files:**
- Create: `src/components/termografia/GeneralDataEditor.tsx`
- Create: `src/components/termografia/GeneralDataEditor.test.tsx`
- Modify: `src/app/termografia/[id]/page.tsx`

- [ ] **Step 1: Escrever teste do editor**

Verificar que todos os campos permitidos são editáveis, o número aparece somente como texto e `onSave` recebe os valores com espaços externos removidos:

```tsx
await user.clear(screen.getByLabelText('Cliente'));
await user.type(screen.getByLabelText('Cliente'), '  Cliente Atualizado  ');
await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ cliente_nome: 'Cliente Atualizado' }));
expect(screen.queryByRole('textbox', { name: 'Número do relatório' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Implementar `GeneralDataEditor`**

Criar formulário modal controlado com cliente, CNPJ, endereço, cidade, UF, CEP, data, responsável, CREA, objetivo e equipamento. Validar cliente e data antes de chamar `onSave`.

- [ ] **Step 3: Corrigir a inicialização das fotos**

Ao carregar `data`, inicializar `pontos` com `data.pontos`. Em `abrirDetalhes`, atualizar a partir de `pontosBase`, não de um vetor possivelmente vazio:

```ts
setPontos(pontosBase.map((item) => {
  const assinado = assinados.find((p) => p.id === item.id);
  return assinado ?? item;
}));
```

Nunca persistir `fotoDigitalSrc` ou `fotoTermicaSrc`.

- [ ] **Step 4: Adicionar edição geral e download**

Adicionar `Editar dados gerais`; salvar via `.update(dados).eq('id', data.id)` e atualizar o estado somente após sucesso. Para cada foto, chamar `getUrlDownload(caminho, nomeFotoPonto(...))` no clique e navegar para a URL assinada.

- [ ] **Step 5: Usar nomes estáveis também na edição de pontos**

Substituir `oc-${index + 1}` por `nomeFotoPonto(ponto.id, tipo)` nos uploads de substituição e inclusão. Para ponto novo, gerar o ID antes do upload.

- [ ] **Step 6: Testar e verificar**

Run: `npm test -- src/components/termografia/GeneralDataEditor.test.tsx; npm run lint -- "src/app/termografia/[id]/page.tsx"; npm run build`

Expected: testes PASS, lint sem erros, build concluído.

- [ ] **Step 7: Commit**

```powershell
git add src/components/termografia/GeneralDataEditor.tsx src/components/termografia/GeneralDataEditor.test.tsx "src/app/termografia/[id]/page.tsx"
git commit -m "fix: restaura fotos e libera edicao da termografia"
```

## Task 8: Listagem, regressão e validação móvel

**Files:**
- Modify: `src/app/termografia/page.tsx`

- [ ] **Step 1: Excluir rascunhos da listagem final**

Adicionar `.eq('status', 'gerado')` à consulta. A entrada de criação continua responsável pela retomada automática.

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test; npm run lint; npm run build`

Expected: todos os testes PASS, ESLint sem erros e build Next.js concluído.

- [ ] **Step 3: Validar manualmente o caso de 50 pontos**

No viewport móvel, criar um rascunho com 50 pontos e duas fotos por ponto. Confirmar que:

- a faixa registra horários de salvamento;
- voltar e retornar recupera o relatório;
- adicionar ponto não exige rolar ao topo;
- nenhuma foto é reenviada ao editar outro ponto;
- a finalização só libera após 100 uploads confirmados.

- [ ] **Step 4: Validar relatório salvo**

Recarregar a página, abrir pontos do início/meio/fim, visualizar e baixar fotos, editar endereço e data, imprimir e confirmar os novos valores e imagens.

- [ ] **Step 5: Validar falhas reais**

Interromper a rede durante um autosave e durante um upload. Confirmar estado `Sem conexão`, alerta de saída, bloqueio da finalização e recuperação com `Tentar novamente` após reconectar.

- [ ] **Step 6: Commit final de integração**

```powershell
git add src/app/termografia/page.tsx
git commit -m "test: valida fluxo seguro de termografia"
```

## Critério de encerramento

Não declarar a etapa 1 concluída até que `npm test`, `npm run lint` e `npm run build` passem no mesmo estado do repositório e a validação móvel cubra retomada, 50 pontos, 100 fotos, falha de rede, download, edição e impressão. O modo offline persistente permanece fora deste plano e exige uma nova especificação antes de implementação.
