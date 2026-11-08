import { ArrowUp, Check, CloudRain } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { PERSON_COLORS } from '@shared/constants.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useBlobUrl } from '@/lib/media/hooks.ts';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import type { StopStatus } from '@/features/travel-mode/rules.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { hhmm } from '@/lib/time/index.ts';
import type { LayoutNode } from '../layout.ts';
import type { OpeningPlan } from '../opening.ts';
import { PILL_LIFT } from '../project.ts';
import type { WorldRuntime } from '../scene/runtime.ts';

/**
 * O HTML por cima da cena: pílulas das paradas (ícone, nome, horário, estado), o chip "Ana · 14:02"
 * nas marcações do time e a legenda da curiosidade. Nítidos no sol, nada de texto em textura. Com a
 * câmera que segue o carro (fase 14) a posição de cada pílula é posta pelo laço da cena, a cada
 * quadro em movimento, direto no DOM (`data-pill`): o React só redesenha o que muda de verdade
 * (estado, chips). Só os nós em cena têm pílula; a da próxima parada fica presa à borda de cima
 * quando está fora da cena, para a pessoa saber para onde vai. "Fora da rota", "+N paradas" e o
 * "Pular" do replay moram na faixa de cima do palco. O canvas por baixo é `aria-hidden`; o conteúdo
 * acessível é a lista do dia.
 */
export type TeamChip = { name: string; time: string | null };
/** O cartão de foto do "Rever o dia": a primeira foto do nó, na cor de quem tirou, e "+N". */
export type PhotoCard = { attachment_id: string; color: string; extra: number; at: number };

type Props = {
  runtime: WorldRuntime;
  nodes: readonly LayoutNode[];
  stops: Map<string, Stop>;
  statuses: Record<string, StopStatus>;
  pops: Record<string, number>;
  teamChips: Record<string, TeamChip>;
  photoCards?: Record<string, PhotoCard>;
  /** mergulho de câmera em curso: as pílulas se escondem */
  hidePills: boolean;
  caption: string | null;
  opening: { plan: OpeningPlan; startedAt: number } | null;
  reducedMotion: boolean;
  /** as paradas em que é mais provável chover no horário delas (a previsão guardada) */
  rainy?: ReadonlySet<string>;
  /** tocar na pílula abre a folha da parada */
  onOpenStop?: ((stopId: string) => void) | undefined;
};

export const HUD_TOP = 44;
export const HUD_BOTTOM = 72;
/**
 * A pílula presa ao topo: a âncora é a base dela (a pílula sobe a partir daí, uns 70 px com a haste),
 * então fica inteira abaixo da faixa de cima do palco (o clima, "Rever o dia", até ~56 px)
 */
const PINNED_TOP = 136;
const PINNED_MARGIN_X = 56;
/** a pílula inteira cabe na tela: a base do nó abaixo da faixa de cima e acima do pé, com folga lateral */
const IN_VIEW = { top: PINNED_TOP, bottom: 24, side: 24 };

/**
 * Põe cada pílula onde o nó dela está na tela, pelo enquadramento atual: só as em cena; a da próxima
 * parada presa ao topo quando está fora. Roda a cada quadro em movimento e uma vez ao montar.
 */
function placePills(
  root: HTMLElement,
  runtime: WorldRuntime,
  nodes: readonly LayoutNode[],
  nextId: string | null,
): void {
  const { width, height } = runtime.viewport;
  for (const node of nodes) {
    const el = root.querySelector<HTMLElement>(`[data-pill="${node.stop_id}"]`);
    if (!el) continue;
    const [x, y, z] = node.position;
    const p = runtime.project([x, y + PILL_LIFT, z]);
    // em cena de verdade: a pílula inteira dentro do palco (a projeção tolera uma margem fora dele,
    // que aqui viraria uma pílula cortada pela borda)
    const inView =
      p.depth > 0 &&
      p.x >= IN_VIEW.side &&
      p.x <= width - IN_VIEW.side &&
      p.y >= IN_VIEW.top &&
      p.y <= height - IN_VIEW.bottom;
    const pinned = !inView && p.depth > 0 && node.stop_id === nextId;
    if (inView) {
      el.style.left = `${String(Math.round(p.x))}px`;
      el.style.top = `${String(Math.round(p.y))}px`;
      el.hidden = false;
      el.dataset.pinned = 'false';
    } else if (pinned) {
      const px = Math.min(width - PINNED_MARGIN_X, Math.max(PINNED_MARGIN_X, p.x));
      el.style.left = `${String(Math.round(px))}px`;
      el.style.top = `${String(PINNED_TOP)}px`;
      el.hidden = false;
      el.dataset.pinned = 'true';
    } else {
      el.hidden = true;
    }
    el.dataset.placed = 'true';
  }
}

export function WorldHud(props: Props) {
  const { runtime, nodes, stops, statuses, pops, teamChips, hidePills, opening, reducedMotion } =
    props;
  const root = useRef<HTMLDivElement>(null);
  const nextId = Object.entries(statuses).find(([, s]) => s === 'next')?.[0] ?? null;

  // a posição das pílulas pelo laço da cena: um atualizador por quadro, e uma vez ao montar ou
  // quando os nós ou a próxima mudam
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    placePills(el, runtime, nodes, nextId);
    return runtime.register(() => placePills(el, runtime, nodes, nextId));
  }, [runtime, nodes, nextId]);

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" data-world-hud>
      {nodes.map((node, i) => {
        const stop = stops.get(node.stop_id);
        if (!stop) return null;
        const status = statuses[node.stop_id] ?? 'pending';
        // o HUD nasce junto com a abertura: o atraso de cada pino é o do plano
        const pin = opening?.plan.pins.find((p) => p.stop_id === node.stop_id);
        const delay = pin ? pin.at_ms / 1000 : 0;
        const chip = teamChips[node.stop_id];
        const photo = props.photoCards?.[node.stop_id];
        return (
          /* a âncora é posicionada pelo laço (`left`/`top`); a propriedade CSS `translate` centra
             a pílula sobre o nó e deixa `transform` livre para a animação do motion */
          <div
            key={node.stop_id}
            className="group absolute -translate-x-1/2 -translate-y-full"
            style={{ zIndex: 10 + i }}
            data-pill={node.stop_id}
            hidden
          >
            <motion.div
              className={cx('flex flex-col items-center gap-0.5', hidePills && 'opacity-0')}
              initial={opening && !reducedMotion ? { y: -36, opacity: 0 } : false}
              animate={{ y: 0, opacity: hidePills ? 0 : 1 }}
              transition={{ delay, type: 'spring', stiffness: 420, damping: 26 }}
            >
              {photo ? <PhotoCardView key={photo.at} card={photo} /> : null}
              {/* o botão tem 48 px de alto (o alvo do toque); a pílula visível fica embaixo dele */}
              <button
                type="button"
                className="pointer-events-auto flex min-h-12 min-w-12 flex-col items-center justify-end"
                onClick={() => props.onOpenStop?.(node.stop_id)}
                aria-label={`${stop.name}${stop.time ? `, ${hhmm(stop.time)}` : ''}: abrir a parada`}
                disabled={!props.onOpenStop}
              >
                <motion.span
                  key={pops[node.stop_id] ?? 'still'}
                  initial={
                    pops[node.stop_id] !== undefined && !reducedMotion ? { scale: 1.35 } : false
                  }
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className={cx(
                    'relative flex min-h-[26px] items-center gap-1.5 rounded-full border bg-hud px-2.5 mv-text-13 font-semibold whitespace-nowrap text-hud-ink backdrop-blur-sm',
                    status === 'done' && 'border-on-time/60',
                    status === 'next' && 'border-sunset shadow-[0_0_0_3px_rgb(232_101_58/0.3)]',
                    status === 'pending' && 'border-white/10',
                    status === 'skipped' && 'border-white/10 opacity-60',
                  )}
                  data-status={status}
                >
                  <span className="hidden group-data-[pinned=true]:inline" aria-hidden="true">
                    <ArrowUp className="size-3.5 text-sunset" />
                  </span>
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
              </button>
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
                  'h-2.5 w-0.5 rounded-sm bg-white/60 group-data-[pinned=true]:hidden',
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
