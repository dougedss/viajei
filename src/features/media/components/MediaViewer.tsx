import { ChevronLeft, ChevronRight, Share2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useMediaBlob, useMediaImage, type MediaItem } from '@/lib/media/hooks.ts';
import {
  clampPan,
  containSize,
  doubleTap,
  IDENTITY,
  pinch,
  swipeDirection,
  type Box,
  type Point,
  type Zoom,
} from '../zoom.ts';

const PdfViewer = lazy(() => import('./PdfViewer.tsx'));

type Props = {
  items: readonly MediaItem[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** "Ana · 13:42": quem tirou e quando, embaixo */
  caption?: (item: MediaItem) => string | null;
};

/**
 * Tela cheia, a partir do Blob local (funciona sem sinal): foto com pinça e toque duplo, deslizar
 * entre as fotos, PDF pelo visualizador próprio e "Compartilhar" pela folha do sistema (abrir em
 * outro app, salvar em Arquivos).
 */
export function MediaViewer({ items, index, onIndex, onClose, caption }: Props) {
  const item = items[index] ?? null;
  const blob = useMediaBlob(item);
  const count = items.length;
  const go = (delta: -1 | 1) => {
    const next = index + delta;
    if (next >= 0 && next < count) onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < count - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndex, onClose]);

  if (!item) return null;
  const pdf = item.row.mime === 'application/pdf';
  const shareFile = blob ? new File([blob], item.row.filename, { type: item.row.mime }) : null;
  const canShare =
    shareFile !== null &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [shareFile] });
  const text = caption?.(item) ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pdf ? item.row.filename : 'Foto em tela cheia'}
      className="fixed inset-0 z-[60] grid grid-rows-[auto_1fr_auto] bg-[#0B0F1A] text-white"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-[max(10px,env(safe-area-inset-top,0px))] pb-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="grid size-12 place-items-center rounded-full bg-white/10"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
        <p className="num text-[15px] font-semibold text-white/80">
          {count > 1 ? `${index + 1} de ${count}` : pdf ? item.row.filename : ''}
        </p>
        {canShare ? (
          <button
            type="button"
            aria-label="Compartilhar"
            onClick={() => void navigator.share({ files: [shareFile] }).catch(() => undefined)}
            className="grid size-12 place-items-center rounded-full bg-white/10"
          >
            <Share2 className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-12" aria-hidden="true" />
        )}
      </div>

      <div className="relative min-h-0 overflow-hidden">
        {pdf ? (
          blob ? (
            <Suspense
              fallback={
                <p className="grid h-full place-items-center text-white/80" role="status">
                  Abrindo…
                </p>
              }
            >
              <PdfViewer blob={blob} name={item.row.filename} />
            </Suspense>
          ) : (
            <Unavailable known={blob !== undefined} />
          )
        ) : (
          <ImageStage key={item.row.id} item={item} onSwipe={(d) => go(d)} />
        )}
        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Anterior"
              disabled={index === 0}
              onClick={() => go(-1)}
              className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 disabled:opacity-0 sm:grid"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Próxima"
              disabled={index === count - 1}
              onClick={() => go(1)}
              className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 disabled:opacity-0 sm:grid"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      <p className="min-h-6 px-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom,0px))] text-center text-[15px] text-white/80">
        {text}
      </p>
    </div>
  );
}

function Unavailable({ known }: { known: boolean }) {
  return (
    <p className="grid h-full place-items-center px-8 text-center text-[15px] text-white/80">
      {known
        ? 'Este arquivo ainda não está no aparelho. Ele chega na próxima vez que houver sinal.'
        : 'Abrindo…'}
    </p>
  );
}

/**
 * O gesto, numa classe com métodos (o React Compiler não deixa mutar estado do render): cada evento
 * de ponteiro devolve a intenção, e a tela aplica.
 */
type Intent = { kind: 'zoom'; zoom: Zoom } | { kind: 'swipe'; dir: -1 | 1 } | null;

class Gesture {
  #pointers = new Map<number, Point>();
  #pinch: { zoom: Zoom; pts: [Point, Point] } | null = null;
  #pan: { zoom: Zoom; at: Point } | null = null;
  #down: Point | null = null;
  #lastTap: { p: Point; t: number } | null = null;
  #moved = false;

  #pair(): [Point, Point] | null {
    const [a, b] = [...this.#pointers.values()];
    return a && b ? [a, b] : null;
  }

  down(id: number, p: Point, zoom: Zoom): void {
    this.#pointers.set(id, p);
    this.#moved = false;
    if (this.#pointers.size === 1) {
      this.#down = p;
      this.#pan = { zoom, at: p };
    } else {
      const pair = this.#pair();
      if (pair) this.#pinch = { zoom, pts: pair };
      this.#pan = null;
    }
  }

  move(id: number, p: Point): Intent {
    if (!this.#pointers.has(id)) return null;
    this.#pointers.set(id, p);
    const pair = this.#pair();
    if (this.#pinch && pair) {
      this.#moved = true;
      return { kind: 'zoom', zoom: pinch(this.#pinch.zoom, this.#pinch.pts, pair) };
    }
    if (!this.#pan) return null;
    const dx = p.x - this.#pan.at.x;
    const dy = p.y - this.#pan.at.y;
    if (Math.hypot(dx, dy) > 6) this.#moved = true;
    const z = this.#pan.zoom;
    return z.scale > 1.01 ? { kind: 'zoom', zoom: { ...z, x: z.x + dx, y: z.y + dy } } : null;
  }

  up(id: number, p: Point, t: number, zoom: Zoom): Intent {
    this.#pointers.delete(id);
    if (this.#pointers.size > 0) return null;
    const down = this.#down;
    const wasPinch = this.#pinch !== null;
    this.#pinch = null;
    this.#pan = null;
    this.#down = null;
    if (!down || wasPinch) return null;
    if (this.#moved) {
      const dir = swipeDirection(p.x - down.x, p.y - down.y, zoom.scale);
      return dir === 0 ? null : { kind: 'swipe', dir };
    }
    const last = this.#lastTap;
    if (last && t - last.t < 320 && Math.hypot(p.x - last.p.x, p.y - last.p.y) < 30) {
      this.#lastTap = null;
      return { kind: 'zoom', zoom: doubleTap(zoom, p) };
    }
    this.#lastTap = { p, t };
    return null;
  }

  cancel(id: number): void {
    this.#pointers.delete(id);
    this.#pinch = null;
    this.#pan = null;
  }
}

function ImageStage({ item, onSwipe }: { item: MediaItem; onSwipe: (d: -1 | 1) => void }) {
  const image = useMediaImage(item);
  const hostRef = useRef<HTMLDivElement>(null);
  const [gesture] = useState(() => new Gesture());
  const [zoom, setZoom] = useState<Zoom>(IDENTITY);
  const content: Box = { width: item.row.width ?? 1600, height: item.row.height ?? 1200 };

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = hostRef.current?.getBoundingClientRect();
    return r
      ? { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
      : { x: 0, y: 0 };
  };
  const act = (intent: Intent) => {
    if (!intent) return;
    if (intent.kind === 'swipe') {
      onSwipe(intent.dir);
      return;
    }
    const r = hostRef.current?.getBoundingClientRect();
    const view: Box = { width: r?.width ?? 1, height: r?.height ?? 1 };
    setZoom(clampPan(intent.zoom, containSize(content, view), view));
  };

  if (!image.src && !image.placeholder) return <Unavailable known />;

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.down(e.pointerId, local(e), zoom);
      }}
      onPointerMove={(e) => act(gesture.move(e.pointerId, local(e)))}
      onPointerUp={(e) => act(gesture.up(e.pointerId, local(e), e.timeStamp, zoom))}
      onPointerCancel={(e) => gesture.cancel(e.pointerId)}
    >
      <div
        className="absolute inset-0 grid place-items-center"
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
      >
        <img
          src={image.src ?? image.placeholder ?? undefined}
          alt=""
          draggable={false}
          className={
            image.src ? 'max-h-full max-w-full object-contain' : 'size-full object-contain blur-md'
          }
        />
      </div>
    </div>
  );
}
