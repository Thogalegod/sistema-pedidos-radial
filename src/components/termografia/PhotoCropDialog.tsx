'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { recortarImagem, type CropPixels } from '@/lib/termografia/images';

type PhotoCropDialogProps = {
  file: File;
  onConfirm: (file: File) => void | Promise<void>;
  onCancel: () => void;
};

const focusableSelector =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function mensagemErro(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Não foi possível processar a imagem. Tente novamente.';
}

export function PhotoCropDialog({ file, onConfirm, onCancel }: PhotoCropDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const processingRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  const [previewUrl, setPreviewUrl] = useState('');
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropPixels | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    mountedRef.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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

  useEffect(() => {
    const url = URL.createObjectURL(file);
    operationRef.current += 1;
    processingRef.current = false;
    // A troca do arquivo é uma sincronização externa: inicia uma nova sessão de edição.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setProcessando(false);
    setErro(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const executar = async (prepararArquivo: () => File | Promise<File>) => {
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    processingRef.current = true;
    setProcessando(true);
    setErro(null);

    try {
      const arquivo = await prepararArquivo();
      await onConfirm(arquivo);
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

  const atualizarArea = (_area: Area, pixels: Area) => {
    setCroppedAreaPixels({
      x: pixels.x,
      y: pixels.y,
      width: pixels.width,
      height: pixels.height,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">Recortar foto</h2>
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

        <div className="relative h-[52dvh] min-h-72 bg-slate-950">
          {previewUrl ? (
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={3}
              aspect={undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={atualizarArea}
            />
          ) : null}
        </div>

        <div className="space-y-4 p-4">
          {erro ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p> : null}
          <label className="block text-sm font-semibold text-slate-700">
            Zoom da foto
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={processando}
              className="mt-2 w-full"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void executar(() => file)}
              disabled={processando}
              className="min-h-12 rounded-xl border border-slate-300 px-4 font-semibold"
            >
              Usar original
            </button>
            <button
              type="button"
              onClick={() => {
                if (croppedAreaPixels) {
                  void executar(() => recortarImagem(file, croppedAreaPixels));
                }
              }}
              disabled={processando || !croppedAreaPixels}
              className="min-h-12 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:bg-slate-300"
            >
              Aplicar recorte
            </button>
          </div>
        </div>

        {processando ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80" role="status">
            <span className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">
              Processando imagem…
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
