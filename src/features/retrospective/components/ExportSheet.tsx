import { Clapperboard, Image, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { cx } from '@/lib/cx.ts';
import { deliverFiles } from '@/lib/files/deliver.ts';
import {
  CARD_KINDS,
  CARD_LABELS,
  CARD_SIZES,
  drawCard,
  drawFilmOverlay,
  loadFonts,
  type CardKind,
  type CardSize,
  type FilmArt,
} from '../draw.ts';
import { chooseVideo, fileSlug, VIDEO, videoLabel, type VideoPlan } from '../export-format.ts';
import type { FilmHandle } from './FilmStage.tsx';

/**
 * Compartilhar a viagem: o vídeo vertical de 15 s para stories e os cards como imagem para o
 * WhatsApp. O vídeo é gerado quadro a quadro (pode levar meio minuto num celular) e aparece aqui
 * mesmo para conferir; compartilhar é outro toque, porque o Safari só abre a folha com o gesto da
 * pessoa. Sem a folha de compartilhar com arquivos, download. Tudo offline.
 */
type VideoState =
  | { status: 'idle' }
  | { status: 'running'; progress: number }
  | { status: 'done'; file: File; url: string }
  | { status: 'error' };

export function ExportSheet({
  open,
  onClose,
  art,
  film,
  name,
}: {
  open: boolean;
  onClose: () => void;
  art: FilmArt;
  film: FilmHandle | null;
  name: string;
}) {
  const toast = useToast();
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [video, setVideo] = useState<VideoState>({ status: 'idle' });
  const [size, setSize] = useState<CardSize>('stories');
  const [kinds, setKinds] = useState<ReadonlySet<CardKind>>(() => new Set(CARD_KINDS));
  const [sharing, setSharing] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const slug = fileSlug(name);

  // o que este aparelho sabe gravar, perguntado quando a folha abre (o chunk do vídeo vem junto)
  useEffect(() => {
    if (!open || plan) return;
    let alive = true;
    void import('../video.ts')
      .then(({ detectCaps }) => detectCaps())
      .then((caps) => {
        if (alive) setPlan(chooseVideo(caps));
      })
      .catch(() => {
        if (alive) setPlan({ path: 'none' });
      });
    return () => {
      alive = false;
    };
  }, [open, plan]);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );
  const doneUrl = video.status === 'done' ? video.url : null;
  useEffect(
    () => () => {
      if (doneUrl) URL.revokeObjectURL(doneUrl);
    },
    [doneUrl],
  );

  const makeVideo = async () => {
    if (!plan || plan.path === 'none') return;
    const controller = new AbortController();
    abort.current = controller;
    setVideo({ status: 'running', progress: 0 });
    try {
      await loadFonts();
      const { exportVideo } = await import('../video.ts');
      const { width, height } = VIDEO;
      const result = await exportVideo(
        plan,
        async (t, ctx) => {
          if (film) {
            ctx.putImageData(await film.renderFrame(t), 0, 0);
            drawFilmOverlay(ctx, width, height, art, t, { background: false });
          } else {
            drawFilmOverlay(ctx, width, height, art, t, { background: true });
          }
        },
        {
          signal: controller.signal,
          onProgress: (progress) => setVideo({ status: 'running', progress }),
        },
      );
      if (!result) {
        setVideo({ status: 'idle' });
        return;
      }
      const file = new File([result.blob], `${slug}.${result.extension}`, { type: result.mime });
      setVideo({ status: 'done', file, url: URL.createObjectURL(file) });
    } catch (err) {
      console.warn('viajei: vídeo', err);
      setVideo({ status: 'error' });
    } finally {
      abort.current = null;
    }
  };

  const shareFiles = async (files: File[], title: string) => {
    setSharing(true);
    try {
      const r = await deliverFiles(files, title);
      if (r === 'downloaded')
        toast.show({
          title: files.length > 1 ? 'Imagens baixadas' : 'Arquivo baixado',
          kind: 'ok',
        });
    } finally {
      setSharing(false);
    }
  };

  const makeCards = async () => {
    setSharing(true);
    try {
      await loadFonts();
      const { w, h } = CARD_SIZES[size];
      const files: File[] = [];
      for (const kind of CARD_KINDS.filter((k) => kinds.has(k))) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        drawCard(ctx, w, h, kind, art);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.92),
        );
        if (blob)
          files.push(new File([blob], `${slug}-${kind}-${size}.jpg`, { type: 'image/jpeg' }));
      }
      setSharing(false);
      await shareFiles(files, name);
    } finally {
      setSharing(false);
    }
  };

  const toggleKind = (k: CardKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <Sheet open={open} onClose={onClose} title="Compartilhar a viagem">
      <div className="grid max-h-[70svh] gap-5 overflow-y-auto pb-1" data-export-sheet>
        <section className="grid gap-2" aria-labelledby="h-video">
          <h3 id="h-video" className="flex items-center gap-2 text-[17px] font-semibold">
            <Clapperboard className="size-5 text-sunset" aria-hidden="true" />
            Vídeo para stories
          </h3>
          <p className="text-[14px] text-ink-2" data-export-path={plan?.path ?? 'pending'}>
            {plan === null
              ? 'Vendo o que este aparelho grava…'
              : plan.path === 'none'
                ? 'Este aparelho não grava vídeo. Os cards abaixo funcionam.'
                : `${videoLabel(plan)} · ${VIDEO.width} × ${VIDEO.height} · 15 s · sem som`}
          </p>
          {video.status === 'running' ? (
            <div className="grid gap-2" role="status" data-export-state="running">
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-sunset"
                  style={{ width: `${Math.round(video.progress * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[15px]">
                <span>Gerando… {Math.round(video.progress * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : video.status === 'done' ? (
            <div className="grid gap-2" data-export-state="done">
              <video
                src={video.url}
                className="mx-auto max-h-[38svh] rounded-card bg-black"
                controls
                playsInline
                muted
                data-export-video
              />
              <Button
                size="lg"
                loading={sharing}
                onClick={() => void shareFiles([video.file], name)}
              >
                <Share2 className="size-5" aria-hidden="true" />
                Compartilhar vídeo
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={!plan || plan.path === 'none'}
              onClick={() => void makeVideo()}
              data-export-state={video.status}
            >
              <Clapperboard className="size-5" aria-hidden="true" />
              {video.status === 'error' ? 'Tentar de novo' : 'Gerar vídeo'}
            </Button>
          )}
        </section>

        <section className="grid gap-3" aria-labelledby="h-cards">
          <h3 id="h-cards" className="flex items-center gap-2 text-[17px] font-semibold">
            <Image className="size-5 text-sunset" aria-hidden="true" />
            Cards como imagem
          </h3>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Formato">
            {(Object.keys(CARD_SIZES) as CardSize[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={size === k}
                onClick={() => setSize(k)}
                className={cx(
                  'min-h-11 rounded-full text-[15px] font-semibold',
                  size === k
                    ? 'bg-ink text-paper'
                    : 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--color-line)]',
                )}
              >
                {CARD_SIZES[k].label}
              </button>
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {CARD_KINDS.map((k) => (
              <li key={k}>
                <label className="flex min-h-11 items-center gap-2 text-[16px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-sunset)]"
                    checked={kinds.has(k)}
                    onChange={() => toggleKind(k)}
                  />
                  {CARD_LABELS[k]}
                </label>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="lg"
            loading={sharing}
            disabled={kinds.size === 0}
            onClick={() => void makeCards()}
          >
            <Share2 className="size-5" aria-hidden="true" />
            {kinds.size === 1 ? 'Compartilhar 1 imagem' : `Compartilhar ${kinds.size} imagens`}
          </Button>
          <p className="text-[13px] text-ink-2">
            Sem a folha de compartilhar neste aparelho, as imagens são baixadas.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
