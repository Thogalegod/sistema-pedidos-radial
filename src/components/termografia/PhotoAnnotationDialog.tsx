'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  type Annotation,
  type AnnotationAction,
  applyAction,
  generateId,
  renderAnnotationsToCanvas,
} from '@/lib/termografia/annotations';

export type PhotoAnnotationDialogProps = {
  file: File;
  onConfirm: (annotatedFile: File) => void | Promise<void>;
  onCancel: () => void;
};

const STROKE_COLOR = '#FF0000';
const DEFAULT_WIDTH_PCT = 15;
const ASPECT = 3 / 4;
const MAX_CANVAS_WIDTH = 2400;

const focusableSelector =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function mensagemErro(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível processar a imagem. Tente novamente.';
}

export function PhotoAnnotationDialog({
  file,
  onConfirm,
  onCancel,
}: PhotoAnnotationDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const processingRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  const [previewUrl, setPreviewUrl] = useState('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // Setup: focus trap, escape
  useEffect(() => {
    mountedRef.current = true;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !processingRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  // ObjectURL lifecycle
  useEffect(() => {
    const url = URL.createObjectURL(file);
    operationRef.current += 1;
    processingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    setAnnotations([]);
    setHistory([[]]);
    setSelectedIndex(null);
    setProcessando(false);
    setErro(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewUrl) return;

    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_CANVAS_WIDTH) {
        const ratio = MAX_CANVAS_WIDTH / w;
        w = MAX_CANVAS_WIDTH;
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);

      const scaleX = w / 100;
      const scaleY = h / 100;
      const refStroke = 6;

      annotations.forEach((ann, i) => {
        const cx = ann.x * scaleX;
        const cy = ann.y * scaleY;
        const rx = (ann.width / 2) * scaleX;
        const ry = (ann.height / 2) * scaleY;

        ctx.save();
        ctx.translate(cx, cy);
        if (ann.rotation !== 0) {
          ctx.rotate((ann.rotation * Math.PI) / 180);
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, 2 * Math.PI);
        ctx.strokeStyle = STROKE_COLOR;
        ctx.lineWidth = refStroke * (w / 2400);
        ctx.stroke();
        ctx.restore();

        // Selection indicator
        if (selectedIndex === i) {
          ctx.save();
          ctx.strokeStyle = '#3B82F6';
          ctx.lineWidth = 2 * (w / 2400);
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.ellipse(
            cx,
            cy,
            Math.max(rx, 0.5) + 6 * (w / 2400),
            Math.max(ry, 0.5) + 6 * (w / 2400),
            0,
            0,
            2 * Math.PI,
          );
          ctx.stroke();
          ctx.restore();
        }
      });
    };
    img.src = previewUrl;
  }, [previewUrl, annotations, selectedIndex]);

  const commitAction = useCallback(
    (action: AnnotationAction) => {
      setAnnotations((prev) => {
        const next = applyAction(prev, action);
        setHistory((h) => [...h, next]);
        return next;
      });
      setSelectedIndex(null);
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length <= 1) return h;
      const previous = h[h.length - 2];
      setAnnotations(previous);
      setSelectedIndex(null);
      return h.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    commitAction({ type: 'clear' });
  }, [commitAction]);

  const getPointerPct = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
    },
    [],
  );

  const hitTest = useCallback(
    (px: number, py: number): number | null => {
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        const dx = (px - ann.x) / (ann.width / 2 || 1);
        const dy = (py - ann.y) / (ann.height / 2 || 1);
        if (dx * dx + dy * dy <= 1.0) return i;
      }
      return null;
    },
    [annotations],
  );

  // Pointer interaction state
  const interactionRef = useRef<{
    mode: 'add' | 'move' | 'resize';
    index: number;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { x, y } = getPointerPct(e);

      // Check corner resize (within ~3% of ellipse edge)
      if (selectedIndex !== null) {
        const ann = annotations[selectedIndex];
        const dx = Math.abs(x - ann.x) / (ann.width / 2 || 1);
        const dy = Math.abs(y - ann.y) / (ann.height / 2 || 1);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 0.85) {
          interactionRef.current = {
            mode: 'resize',
            index: selectedIndex,
            startPx: x,
            startPy: y,
            origX: ann.x,
            origY: ann.y,
            origW: ann.width,
            origH: ann.height,
          };
          return;
        }
      }

      const hitIdx = hitTest(x, y);
      if (hitIdx !== null) {
        const ann = annotations[hitIdx];
        setSelectedIndex(hitIdx);
        interactionRef.current = {
          mode: 'move',
          index: hitIdx,
          startPx: x,
          startPy: y,
          origX: ann.x,
          origY: ann.y,
          origW: ann.width,
          origH: ann.height,
        };
      } else {
        const defaultH = DEFAULT_WIDTH_PCT * ASPECT;
        const existente = annotations[0];
        const newAnn: Annotation = existente
          ? {
              ...existente,
              x,
              y,
            }
          : {
              id: generateId(),
              x,
              y,
              width: DEFAULT_WIDTH_PCT,
              height: defaultH,
              rotation: 0,
            };

        if (existente) {
          setAnnotations([newAnn]);
          setHistory((h) => [...h, [newAnn]]);
          setSelectedIndex(0);
        } else {
          commitAction({ type: 'add', annotation: newAnn });
          setSelectedIndex(0);
        }
      }
    },
    [annotations, selectedIndex, hitTest, getPointerPct, commitAction],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const { x, y } = getPointerPct(e);
      const dx = x - interaction.startPx;
      const dy = y - interaction.startPy;

      if (interaction.mode === 'move') {
        setAnnotations((prev) =>
          prev.map((a, i) =>
            i === interaction.index
              ? {
                  ...a,
                  x: Math.max(0, Math.min(100, interaction.origX + dx)),
                  y: Math.max(0, Math.min(100, interaction.origY + dy)),
                }
              : a,
          ),
        );
      } else if (interaction.mode === 'resize') {
        setAnnotations((prev) =>
          prev.map((a, i) =>
            i === interaction.index
              ? {
                  ...a,
                  width: Math.max(3, Math.min(80, interaction.origW + dx)),
                  height: Math.max(3, Math.min(80, interaction.origH + dy)),
                }
              : a,
          ),
        );
      }
    },
    [getPointerPct],
  );

  const handlePointerUp = useCallback(() => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const current = annotations[interaction.index];
    if (!current) {
      interactionRef.current = null;
      return;
    }

    if (interaction.mode === 'move') {
      setHistory((h) => [...h, annotations]);
    } else if (interaction.mode === 'resize') {
      setHistory((h) => [...h, annotations]);
    }
    interactionRef.current = null;
  }, [annotations]);

  const executar = async () => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    processingRef.current = true;
    setProcessando(true);
    setErro(null);

    try {
      const url = URL.createObjectURL(file);
      let blob: Blob;
      try {
        blob = await renderAnnotationsToCanvas(url, annotations, MAX_CANVAS_WIDTH);
      } finally {
        URL.revokeObjectURL(url);
      }
      const annotatedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      await onConfirm(annotatedFile);
      if (mountedRef.current && operationRef.current === operation)
        onCancelRef.current();
    } catch (error) {
      if (mountedRef.current && operationRef.current === operation) {
        setErro(mensagemErro(error));
      }
    } finally {
      if (mountedRef.current && operationRef.current === operation) {
        processingRef.current = false;
        setProcessando(false);
      }
    }
  };

  const deleteSelected = useCallback(() => {
    if (selectedIndex === null) return;
    commitAction({ type: 'delete', id: annotations[selectedIndex].id });
  }, [selectedIndex, annotations, commitAction]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">
            Marcar foto
          </h2>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onCancelRef.current()}
            disabled={processando}
            className="min-h-11 px-3"
          >
            Cancelar
          </button>
        </header>

        <div className="relative flex-1 overflow-auto bg-slate-950 sm:h-[60dvh]">
          {previewUrl ? (
            <canvas
              ref={canvasRef}
              className="mx-auto block max-h-[65vh] touch-none object-contain sm:max-h-[55vh]"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              data-testid="annotation-canvas"
            />
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-200 p-4">
          {erro ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {erro}
            </p>
          ) : null}

          {selectedIndex !== null ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={deleteSelected}
                disabled={processando}
                className="min-h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                Excluir marcação
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={processando || history.length <= 1}
              className="min-h-12 rounded-xl border border-slate-300 px-2 text-sm font-semibold disabled:bg-slate-100"
            >
              Desfazer
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={processando || annotations.length === 0}
              className="min-h-12 rounded-xl border border-slate-300 px-2 text-sm font-semibold disabled:bg-slate-100"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => onCancelRef.current()}
              disabled={processando}
              className="min-h-12 rounded-xl border border-slate-300 px-2 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void executar()}
              disabled={processando}
              className="min-h-12 rounded-xl bg-blue-600 px-2 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              Salvar
            </button>
          </div>
        </div>

        {processando ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-white/80"
            role="status"
          >
            <span className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">
              Processando imagem…
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
