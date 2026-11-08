import { Check, CloudRain, MapPinOff, SkipForward } from 'lucide-react';
import { motion } from 'motion/react';
import { PERSON_COLORS } from '@shared/constants.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useBlobUrl } from '@/lib/media/hooks.ts';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import type { StopStatus } from '@/features/travel-mode/rules.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { hhmm } from '@/lib/time/index.ts';
import type { OpeningPlan } from '../opening.ts';
import type { ProjectedNode } from '../project.ts';

/**
 * O HTML por cima da cena: pílulas das paradas projetadas uma vez por layout (ícone, nome, horário,
 * estado), o chip "Ana · 14:02" nas marcações do time, a legenda da curiosidade, "Fora da rota",
 * "+N paradas" e o "Pular" do replay. Nítidos no sol, nada de texto em textura. O canvas por baixo
 * é `aria-hidden`; o conteúdo acessível é a lista do dia.
 */
export type TeamChip = { name: string; time: string | null };
/** O cartão de foto do "Rever o dia": a primeira foto do nó, na cor de quem tirou, e "+N". */
export type PhotoCard = { attachment_id: string; color: string; extra: number; at: number };

type Props = {
  nodes: ProjectedNode[];
  stops: Map<string, Stop>;
  statuses: Record<string, StopStatus>;
  pops: Record<string, number>;
  teamChips: Record<string, TeamChip>;
  photoCards?: Record<string, PhotoCard>;
  /** mergulho de câmera em curso: as pílulas se escondem */
  hidePills: boolean;
  caption: string | null;
  offRouteM: number | null;
  overflow: number;
  skippable: boolean;
  onSkip: () => void;
  opening: { plan: OpeningPlan; startedAt: number } | null;
  reducedMotion: boolean;
  /** as paradas em que é mais provável chover no horário delas (a previsão guardada) */
  rainy?: ReadonlySet<string>;
};

export const HUD_TOP = 44;
export const HUD_BOTTOM = 72;

function formatDistance(m: number): string {
  if (m >= 10_000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function WorldHud(props: Props) {
  const { nodes, stops, statuses, pops, teamChips, hidePills, opening, reducedMotion } = props;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-world-hud>
      {nodes.map((node, i) => {
        const stop = stops.get(node.stop_id);
        if (!stop || !node.visible) return null;
        const status = statuses[node.stop_id] ?? 'pending';
        // o HUD nasce junto com a abertura: o atraso de cada pino é o do plano
        const pin = opening?.plan.pins.find((p) => p.stop_id === node.stop_id);
        const delay = pin ? pin.at_ms / 1000 : 0;
        const chip = teamChips[node.stop_id];
        const photo = props.photoCards?.[node.stop_id];
        return (
          /* a âncora usa a propriedade CSS `translate`; o `transform` fica livre para a animação */
          <div
            key={node.stop_id}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: node.x, top: node.y, zIndex: 10 + i }}
          >
            <motion.div
              className={cx('flex flex-col items-center gap-0.5', hidePills && 'opacity-0')}
              initial={opening && !reducedMotion ? { y: -36, opacity: 0 } : false}
              animate={{ y: 0, opacity: hidePills ? 0 : 1 }}
              transition={{ delay, type: 'spring', stiffness: 420, damping: 26 }}
            >
              {photo ? <PhotoCardView key={photo.at} card={photo} /> : null}
              <motion.span
                key={pops[node.stop_id] ?? 'still'}
                initial={
                  pops[node.stop_id] !== undefined && !reducedMotion ? { scale: 1.35 } : false
                }
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className={cx(
                  'flex min-h-[26px] items-center gap-1.5 rounded-full border bg-hud px-2.5 mv-text-13 font-semibold whitespace-nowrap text-hud-ink backdrop-blur-sm',
                  status === 'done' && 'border-on-time/60',
                  status === 'next' && 'border-sunset shadow-[0_0_0_3px_rgb(232_101_58/0.3)]',
                  status === 'pending' && 'border-white/10',
                  status === 'skipped' && 'border-white/10 opacity-60',
                )}
                data-status={status}
              >
                {status === 'done' ? (
                  <Check className="size-3.5 text-on-time" aria-hidden="true" />
                ) : (
                  <StopKindIcon kind={stop.kind} className="size-3.5 text-hud-muted" />
                )}
                <span
                  className={cx('max-w-[38vw] truncate', status === 'skipped' && 'line-through')}
                >
                  {stop.name}
                </span>
                {stop.time ? (
                  <time className="num mv-text-13 text-hud-muted">{hhmm(stop.time)}</time>
                ) : null}
                {props.rainy?.has(node.stop_id) ? (
                  <CloudRain
                    className="size-3.5 text-person-sky"
                    role="img"
                    aria-label="previsão de chuva"
                    data-pill-rain
                  />
                ) : null}
                {status === 'next' ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 animate-ping rounded-full bg-sunset/30 motion-reduce:animate-none"
                  />
                ) : null}
              </motion.span>
              {chip ? (
                <motion.span
                  initial={reducedMotion ? false : { y: -6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="rounded-full bg-sunset-deep px-2 py-0.5 mv-text-12 font-semibold text-white"
                >
                  {chip.name}
                  {chip.time ? ` · ${chip.time}` : ''}
                </motion.span>
              ) : null}
              <span
                className={cx(
                  'h-2.5 w-0.5 rounded-sm bg-white/60',
                  status === 'next' && 'bg-sunset',
                )}
                aria-hidden="true"
              />
            </motion.div>
          </div>
        );
      })}

      {/* legenda da curiosidade */}
      <div className="absolute inset-x-0 top-2 flex justify-center px-3">
        {props.caption ? (
          <motion.p
            key={props.caption}
            role="status"
            initial={reducedMotion ? false : { y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex max-w-[92%] items-center gap-2 rounded-full border border-sunset bg-hud px-4 py-2 text-center mv-text-14 font-semibold text-hud-ink backdrop-blur-sm"
          >
            <span className="text-sunset" aria-hidden="true">
              ✦
            </span>
            {props.caption}
          </motion.p>
        ) : null}
      </div>

      {/* faixa de baixo: fora da rota, +N paradas, Pular; o lugar do chip de XP fica reservado à fase 9 */}
      <div className="absolute inset-x-0 bottom-2 flex items-end justify-between gap-2 px-3">
        <div className="flex flex-wrap gap-2">
          {props.offRouteM !== null ? (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-late px-3 mv-text-13 font-semibold text-white">
              <MapPinOff className="size-4" aria-hidden="true" />
              Fora da rota · {formatDistance(props.offRouteM)}
            </span>
          ) : null}
          {props.overflow > 0 ? (
            <span className="inline-flex min-h-8 items-center rounded-full bg-hud px-3 mv-text-13 font-semibold text-hud-ink">
              +{props.overflow} {props.overflow === 1 ? 'parada' : 'paradas'}
            </span>
          ) : null}
          <span data-slot="xp" className="hidden" />
        </div>
        {props.skippable ? (
          <button
            type="button"
            onClick={props.onSkip}
            className="pointer-events-auto inline-flex min-h-12 items-center gap-1.5 rounded-full bg-hud px-4 mv-text-15 font-semibold text-hud-ink backdrop-blur-sm"
          >
            Pular
            <SkipForward className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A miniatura sobre a pílula: aparece com uma mola e some sozinha (quem tira é o palco). */
function PhotoCardView({ card }: { card: PhotoCard }) {
  const url = useBlobUrl(card.attachment_id);
  if (!url) return null;
  const hex = PERSON_COLORS[asPersonColor(card.color)].hex;
  return (
    <motion.span
      initial={{ y: 10, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className="relative mb-1 block size-16 overflow-hidden rounded-[14px] bg-hud"
      style={{ boxShadow: `0 0 0 3px ${hex}, 0 8px 20px -6px rgb(0 0 0 / 0.5)` }}
      data-photo-card={card.attachment_id}
    >
      <img src={url} alt="" className="size-full object-cover" />
      {card.extra > 0 ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-[rgb(8_12_24/0.7)] px-1.5 num mv-text-12 font-semibold text-white">
          +{card.extra}
        </span>
      ) : null}
    </motion.span>
  );
}
