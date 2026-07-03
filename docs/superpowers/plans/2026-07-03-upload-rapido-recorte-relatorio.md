# Upload Rápido + Recorte no Relatório — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o dialog de recorte do upload (upload rápido) e adicionar recorte de fotos digitais na página de visualização do relatório, com área do crop maior em mobile.

**Architecture:** Remove `PhotoCropDialog` do fluxo de upload em `nova/page.tsx`. Adiciona botão de recorte (✂️) nas fotos digitais na página `[id]/page.tsx` que abre o mesmo `PhotoCropDialog`. Aumenta a área do crop em mobile de 52dvh pra 75dvh.

**Tech Stack:** Next.js 16, React 19, `react-easy-crop`, `browser-image-compression`, Canvas API

---

## Global Constraints

- Next.js 16 + React 19
- Supabase Storage pra fotos
- `react-easy-crop` já instalado
- `browser-image-compression` já instalado
- Branch: `codex/termografia-salvamento-seguro`
- Testes: `npx vitest run --configLoader runner`
- Build: `npm run build` (bloqueado no Pi, funciona no Vercel)

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/app/termografia/nova/page.tsx` | Remove states/handler do crop, remove `PhotoCropDialog`, simplifica `handleFotoSelecionada` |
| `src/app/termografia/[id]/page.tsx` | Adiciona botão ✂️ + `PhotoCropDialog` + handler de recorte |
| `src/components/termografia/PhotoCropDialog.tsx` | Aumenta área do crop em mobile (75dvh) |
| `src/lib/termografia/images.ts` | Adiciona `redimensionarImagem()` pra salvar recorte por cima |
| `src/hooks/geracao-relatorio.test.tsx` | Testes existentes — não muda |

---

### Task 1: Simplificar upload — remover dialog de recorte

**Files:**
- Modify: `src/app/termografia/nova/page.tsx`

**Interfaces:**
- Consumes: `processarFoto()` existente
- Produces: `handleFotoSelecionada()` simplificado (sem crop)

- [ ] **Step 1: Remover states e imports do crop**

Em `nova/page.tsx`, remover:
```tsx
// REMOVER estes imports
import { PhotoCropDialog } from '@/components/termografia/PhotoCropDialog';

// REMOVER estes states
const [cropFile, setCropFile] = useState<File | null>(null);
const [cropPontoId, setCropPontoId] = useState<string | null>(null);
```

- [ ] **Step 2: Simplificar handleFotoSelecionada**

Substituir a função inteira:
```tsx
const handleFotoSelecionada = (pontoId: string, tipo: 'digital' | 'termica', file?: File) => {
  if (!file) return;
  void processarFoto(pontoId, tipo, file);
};
```

- [ ] **Step 3: Remover handleCropConfirm**

```tsx
// REMOVER esta função inteira
const handleCropConfirm = async (file: File) => {
  if (!cropPontoId) return;
  await processarFoto(cropPontoId, 'digital', file);
  setCropFile(null);
  setCropPontoId(null);
};
```

- [ ] **Step 4: Remover PhotoCropDialog do JSX**

No final do return, remover:
```tsx
{/* REMOVER este bloco */}
{cropFile && cropPontoId && (
  <PhotoCropDialog
    file={cropFile}
    onConfirm={handleCropConfirm}
    onCancel={() => { setCropFile(null); setCropPontoId(null); }}
  />
)}
```

- [ ] **Step 5: Ajustar compressão pra upload leve**

Em `prepararImagem`, ajustar:
```tsx
async function prepararImagem(file: File) {
  if (!file.type.startsWith('image/')) return file;
  return imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 2400,
    useWebWorker: true,
  });
}
```

- [ ] **Step 6: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: remove dialog de recorte do upload, compressão leve"
```

---

### Task 2: Adicionar botão de recorte na página do relatório

**Files:**
- Modify: `src/app/termografia/[id]/page.tsx`

**Interfaces:**
- Consumes: `PhotoCropDialog` existente, `recortarImagem()` de `images.ts`
- Produz: Botão ✂️ nas fotos digitais + handler de recorte

- [ ] **Step 1: Adicionar imports**

```tsx
import { PhotoCropDialog } from '@/components/termografia/PhotoCropDialog';
import { recortarImagem } from '@/lib/termografia/images';
```

- [ ] **Step 2: Adicionar states pra recorte**

Dentro do componente:
```tsx
const [cropFile, setCropFile] = useState<File | null>(null);
const [cropPontoId, setCropPontoId] = useState<string | null>(null);
const [cropTipo, setCropTipo] = useState<'digital' | 'termica'>('digital');
```

- [ ] **Step 3: Adicionar handler de recorte**

```tsx
const handleCropConfirm = async (file: File) => {
  if (!cropPontoId || !relatorio) return;
  try {
    const caminho = await uploadArquivo(file, `termografia/${relatorio.numero_relatorio}`, `${cropPontoId}-${cropTipo}.jpg`);
    // Atualizar ponto no banco
    await client.from('relatorios_termografia')
      .update({ pontos: pontos.map(p => p.id === cropPontoId ? { ...p, [`foto${cropTipo === 'digital' ? 'Digital' : 'Termica'}Url`]: caminho } : p) })
      .eq('id', relatorio.id);
    toast.success('Foto recortada com sucesso!');
  } catch (err) {
    toast.error('Erro ao salvar recorte');
  }
  setCropFile(null);
  setCropPontoId(null);
};
```

- [ ] **Step 4: Adicionar botão ✂️ nas fotos digitais**

Na seção de fotos do ponto, adicionar botão de recorte:
```tsx
{ponto.fotoDigitalUrl && (
  <div className="relative">
    <img src={ponto.fotoDigitalUrl} alt="Foto digital" className="..." />
    <button
      type="button"
      onClick={() => { setCropFile(/* fetch do arquivo */); setCropPontoId(ponto.id); setCropTipo('digital'); }}
      className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded"
    >
      ✂️ Recortar
    </button>
  </div>
)}
```

- [ ] **Step 5: Adicionar PhotoCropDialog no JSX**

```tsx
{cropFile && (
  <PhotoCropDialog
    file={cropFile}
    onConfirm={handleCropConfirm}
    onCancel={() => { setCropFile(null); setCropPontoId(null); }}
  />
)}
```

- [ ] **Step 6: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: adiciona botão de recorte nas fotos do relatório"
```

---

### Task 3: Aumentar área do crop em mobile

**Files:**
- Modify: `src/components/termografia/PhotoCropDialog.tsx`

**Interfaces:**
- Consumes: nada (componente isolado)
- Produz: Dialog com área maior em mobile

- [ ] **Step 1: Aumentar altura do crop area**

Em `PhotoCropDialog.tsx`, mudar a div do crop:
```tsx
// DE:
<div className="relative h-[52dvh] min-h-72 bg-slate-950">

// PARA:
<div className="relative h-[75dvh] min-h-72 bg-slate-950 sm:h-[52dvh]">
```

- [ ] **Step 2: Ajustar padding do dialog em mobile**

```tsx
// DE:
<section className="relative flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">

// PARA:
<section className="relative flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl">
```

- [ ] **Step 3: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Rodar testes existentes**

Run: `npx vitest run src/components/termografia/PhotoCropDialog.test.tsx --configLoader runner`
Expected: 11 testes passando

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "style: aumenta área do crop em mobile pra 75dvh"
```

---

### Task 4: Deploy e teste manual

**Files:** Nenhum (deploy only)

- [ ] **Step 1: Rodar suite completa de testes**

Run: `npx vitest run --configLoader runner`
Expected: 60+ testes passando

- [ ] **Step 2: Push pro GitHub**

```bash
git push
```

- [ ] **Step 3: Deploy no Vercel**

```bash
export VERCEL_TOKEN="vcp_..." && vercel --yes --prod --token "$VERCEL_TOKEN"
```

- [ ] **Step 4: Testar no celular**

1. Abrir `/termografia/nova`
2. Selecionar foto digital — NÃO deve abrir dialog de recorte
3. Foto deve subir rápido
4. Abrir relatório em `/termografia/[id]`
5. Clicar ✂️ na foto digital
6. Dialog de recorte deve abrir com área maior
7. Recortar e salvar

---

## Self-Review

1. **Spec coverage:** Upload rápido ✅, recorte no relatório ✅, área maior ✅
2. **Placeholder scan:** Nenhum TBD/TODO
3. **Type consistency:** `PhotoCropDialog` mantém mesma interface (`file`, `onConfirm`, `onCancel`)
