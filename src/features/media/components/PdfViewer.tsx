import { Minus, Plus } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * O PDF da reserva aberto dentro do app, a partir do Blob local: funciona sem sinal e no PWA
 * instalado do iPhone, onde `window.open(blob:)` abre em branco e o `<iframe>` mostra só a primeira
 * página. Carregado só quando um PDF abre (chunk próprio) e guardado no precache do service worker.
 */
type Props = { blob: Blob; name: string };

const ZOOMS = [1, 1.5, 2, 3] as const;

export default function PdfViewer({ blob, name }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof pdfjs.getDocument> | null = null;
    void blob
      .arrayBuffer()
      .then((data) => {
        if (cancelled) return null;
        task = pdfjs.getDocument({ data: new Uint8Array(data), wasmUrl: '/pdfjs/wasm/' });
        return task.promise;
      })
      .then((d) => {
        if (d && !cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  if (failed) {
    return (
      <p className="grid h-full place-items-center px-6 text-center text-[15px] text-white/80">
        Não deu para abrir {name} aqui. Use "Compartilhar" para abrir em outro app.
      </p>
    );
  }

  const scale = ZOOMS[zoom] ?? 1;
  return (
    <div className="relative size-full">
      <div ref={hostRef} className="size-full overflow-auto overscroll-contain bg-[#2B3140] p-3">
        {doc ? (
          <div className="mx-auto grid gap-3" style={{ width: `${scale * 100}%` }}>
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i} doc={doc} number={i + 1} scale={scale} />
            ))}
          </div>
        ) : (
          <p className="grid h-full place-items-center text-[15px] text-white/80" role="status">
            Abrindo {name}…
          </p>
        )}
      </div>
      {doc ? (
        <div className="absolute right-3 bottom-[max(12px,env(safe-area-inset-bottom,0px))] flex gap-2">
          <button
            type="button"
            aria-label="Diminuir"
            disabled={zoom === 0}
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            className="grid size-12 place-items-center rounded-full bg-[rgb(8_12_24/0.7)] text-white disabled:opacity-40"
          >
            <Minus className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Aumentar"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            className="grid size-12 place-items-center rounded-full bg-[rgb(8_12_24/0.7)] text-white disabled:opacity-40"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Uma página, desenhada quando aparece na tela, na resolução da tela (nítida no zoom). */
function PdfPage({ doc, number, scale }: { doc: PDFDocumentProxy; number: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(1.414);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let render: { cancel: () => void } | null = null;
    const draw = async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      setAspect(base.height / base.width);
      const width = canvas.clientWidth || base.width;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const task = page.render({ canvas, viewport });
      render = task;
      await task.promise.catch(() => undefined);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void draw();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
      render?.cancel();
    };
  }, [doc, number, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-[6px] bg-white shadow-card"
      style={{ aspectRatio: `1 / ${aspect}` }}
      aria-label={`Página ${number}`}
    />
  );
}
