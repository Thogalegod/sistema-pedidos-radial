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
const DEFAULT_SIZE_PCT = 20;
const MAX_CANVAS_WIDTH = 2400;
const MIN_SIZE = 5;
const MAX_SIZE = 80;

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
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [history, setHistory] = useState<(Annotation | null)[]>([null]);
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
    setAnnotation(null);
    setHistory([null]);
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

      if (!annotation) return;

      const scaleX = w / 100;
      const scaleY = h / 100;
      const refStroke = 10;

      const cx = annotation.x * scaleX;
      const cy = annotation.y * scaleY;
      const rx = (annotation.width / 2) * scaleX;
      const ry = (annotation.height / 2) * scaleY;

      // Draw red circle
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = refStroke * (w / 2400);
      ctx.stroke();

      // Draw resize handle at bottom-right
      const handleX = cx + rx * 0.707;
      const handleY = cy + ry * 0.707;
      const handleR = 8 * (w / 2400);
      ctx.beginPath();
      ctx.arc(handleX, handleY, handleR, 0, 2 * Math.PI);
      ctx.fillStyle = '#3B82F6';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2 * (w / 2400);
      ctx.stroke();
    };
    img.src = previewUrl;
  }, [previewUrl, annotation]);

  const commitAction = useCallback(
    (action: AnnotationAction) => {
      setAnnotation((prev) => {
        const result = applyAction(prev ? [prev] : [], action);
        const next = result.length > 0 ? result[0] : null;
        setHistory((h) => [...h, next]);
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length <= 1) return h;
      const previous = h[h.length - 2];
      setAnnotation(previous);
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

  // Check if pointer is on the resize handle
  const isOnResizeHandle = useCallback(
    (px: number, py: number): boolean => {
      if (!annotation) return false;
      const cx = annotation.x;
      const cy = annotation.y;
      const rx = annotation.width / 2;
      const ry = annotation.height / 2;
      const handleX = cx + rx * 0.707;
      const handleY = cy + ry * 0.707;
      const dist = Math.sqrt((px - handleX) ** 2 + (py - handleY) ** 2);
      return dist < 5; // 5% tolerance for handle
    },
    [annotation],
  );

  // Check if pointer is inside the circle
  const isInsideCircle = useCallback(
    (px: number, py: number): boolean => {
      if (!annotation) return false;
      const dx = (px - annotation.x) / (annotation.width / 2 || 1);
      const dy = (py - annotation.y) / (annotation.height / 2 || 1);
      return dx * dx + dy * dy <= 1.0;
    },
    [annotation],
  );

  // Pointer interaction state
  const interactionRef = useRef<{
    mode: 'move' | 'resize';
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

      // If no annotation exists, create one
      if (!annotation) {
        const newAnn: Annotation = {
          id: generateId(),
          x,
          y,
          width: DEFAULT_SIZE_PCT,
          height: DEFAULT_SIZE_PCT * (4 / 3),
          rotation: 0,
        };
        commitAction({ type: 'add', annotation: newAnn });
        return;
      }

      // Check resize handle first
      if (isOnResizeHandle(x, y)) {
        interactionRef.current = {
          mode: 'resize',
          startPx: x,
          startPy: y,
          origX: annotation.x,
          origY: annotation.y,
          origW: annotation.width,
          origH: annotation.height,
        };
        return;
      }

      // Check if inside circle (move)
      if (isInsideCircle(x, y)) {
        interactionRef.current = {
          mode: 'move',
          startPx: x,
          startPy: y,
          origX: annotation.x,
          origY: annotation.y,
          origW: annotation.width,
          origH: annotation.height,
        };
        return;
      }

      // Clicked outside — replace the circle at new position
      const newAnn: Annotation = {
        id: generateId(),
        x,
        y,
        width: DEFAULT_SIZE_PCT,
        height: DEFAULT_SIZE_PCT * (4 / 3),
        rotation: 0,
      };
      commitAction({ type: 'add', annotation: newAnn });
    },
    [annotation, getPointerPct, isOnResizeHandle, isInsideCircle, commitAction],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const { x, y } = getPointerPct(e);
      const dx = x - interaction.startPx;
      const dy = y - interaction.startPy;

      if (interaction.mode === 'move') {
        setAnnotation((prev) =>
          prev
            ? {
                ...prev,
                x: Math.max(0, Math.min(100, interaction.origX + dx)),
                y: Math.max(0, Math.min(100, interaction.origY + dy)),
              }
            : prev,
        );
      } else if (interaction.mode === 'resize') {
        // Resize based on distance from center
        const dist = Math.sqrt(dx * dx + dy * dy);
        const sign = dx + dy > 0 ? 1 : -1;
        const delta = dist * sign;
        setAnnotation((prev) =>
          prev
            ? {
                ...prev,
                width: Math.max(MIN_SIZE, Math.min(MAX_SIZE, interaction.origW + delta)),
                height: Math.max(MIN_SIZE, Math.min(MAX_SIZE, interaction.origH + delta)),
              }
            : prev,
        );
      }
    },
    [getPointerPct],
  );

  const handlePointerUp = useCallback(() => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    if (interaction.mode === 'move' || interaction.mode === 'resize') {
      setAnnotation((prev) => {
        if (!prev) return prev;
        setHistory((h) => [...h, { ...prev }]);
        return prev;
      });
    }
    interactionRef.current = null;
  }, []);

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
        blob = await renderAnnotationsToCanvas(
          url,
          annotation ? [annotation] : [],
          MAX_CANVAS_WIDTH,
        );
      } finally {
        URL.revokeObjectURL(url);
      }
      const annotatedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      await onConfirm(annotatedFile);
      if (mountedRef.current && operationRef.current === operation) onCancelRef.current();
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

          <p className="text-center text-sm text-slate-500">
            {annotation
              ? 'Toque para mover • Arraste o ponto azul para redimensionar'
              : 'Toque na foto para colocar o círculo'}
          </p>

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
              disabled={processando || !annotation}
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
