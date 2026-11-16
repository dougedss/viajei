import { Check, CloudRain } from 'lucide-react';
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
import type { LayoutNode, LayoutPlace } from '../layout.ts';
import type { OpeningPlan } from '../opening.ts';
import {
  declutterLabels,
  HUD_TOP,
  LABEL_CHAR_PX,
  LABEL_HEIGHT_PX,
  PILL_LIFT,
  pillInView,
  type PlaceLabel,
} from '../project.ts';
import type { WorldRuntime } from '../scene/runtime.ts';

/**
 * O HTML por cima da cena: pílulas das paradas (ícone, nome, horário, estado), o chip "Ana · 14:02"
 * nas marcações do time, os nomes das cidades de passagem e a legenda da curiosidade. Nítidos no sol,
 * nada de texto em textura. A posição de cada pílula é posta pelo laço da cena, a cada quadro em
 * movimento, direto no DOM (`data-pill`): o React só redesenha o que muda de verdade (estado, chips).
 * No repouso (fase 22) todas as pílulas estão em cena, porque a câmera de repouso enquadra o dia
 * inteiro com as mesmas folgas; no modo de perto e no mergulho só as em cena aparecem, e nenhuma fica
 * presa à borda. "Fora da rota", "+N paradas" e o "Pular" do replay moram na faixa de cima do palco.
 * O canvas por baixo é `aria-hidden`; o conteúdo acessível é a lista do dia.
 */
export { HUD_BOTTOM, HUD_TOP } from '../project.ts';

export type TeamChip = { name: string; time: string | null };
/** O cartão de foto do "Rever o dia": a primeira foto do nó, na cor de quem tirou, e "+N". */
export type PhotoCard = { attachment_id: string; color: string; extra: number; at: number };

type Props = {
  runtime: WorldRuntime;
  nodes: readonly LayoutNode[];
  /** as cidades de passagem: o nome pequeno na beira da estrada, sem pílula e sem toque */
  places: readonly LayoutPlace[];
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
  /** a altura do que está sobre o pé do palco (o cartão da vez, "Detalhes", o "Agora"): nenhuma pílula fica por baixo */
  bottomInset: number;
};

/** o nome da cidade fica um pouco acima do chão */
const PLACE_LIFT = 1.2;
/** a âncora do carro, para quem lê a tela por fora (o e2e e o laboratório tocam nela) */
const CAR_LIFT = 0.8;

/**
 * Põe cada pílula onde o nó dela está na tela, pelo enquadramento atual: só as em cena. Roda a cada
 * quadro em movimento e uma vez ao montar.
 */
function placePills(
  root: HTMLElement,
  runtime: WorldRuntime,
  nodes: readonly LayoutNode[],
  bottomInset: number,
): void {
  for (const node of nodes) {
    const el = root.querySelector<HTMLElement>(`[data-pill="${node.stop_id}"]`);
    if (!el) continue;
    const [x, y, z] = node.position;
    const p = runtime.project([x, y + PILL_LIFT, z]);
    // em cena de verdade: a pílula inteira dentro do palco (a projeção tolera uma margem fora dele,
    // que aqui viraria uma pílula cortada pela borda)
    if (pillInView(p, runtime.viewport, bottomInset, HUD_TOP)) {
      el.style.left = `${String(Math.round(p.x))}px`;
      el.style.top = `${String(Math.round(p.y))}px`;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
    el.dataset.placed = 'true';
  }
}

/** Os nomes das cidades de passagem e a âncora do carro, pelo mesmo laço. */
function placeLabels(
  root: HTMLElement,
  runtime: WorldRuntime,
  places: readonly LayoutPlace[],
): void {
  const { width, height } = runtime.viewport;
  const shown: PlaceLabel[] = [];
  places.forEach((place, i) => {
    const el = root.querySelector<HTMLElement>(`[data-passing-place="${String(i)}"]`);
    if (!el) return;
    const [x, y, z] = place.position;
    const p = runtime.project([x, y + PLACE_LIFT, z]);
    const inView =
      p.depth > 0 && p.x > 8 && p.x < width - 8 && p.y > HUD_TOP + 16 && p.y < height - 8;
    if (!inView) {
      el.hidden = true;
      return;
    }
    shown.push({
      index: i,
      x: p.x,
      y: p.y,
      w: place.name.length * LABEL_CHAR_PX,
      h: LABEL_HEIGHT_PX,
      pop: place.pop,
    });
  });
  // dois nomes que se cruzam: o da cidade menor desce uma linha ou some (fase 24)
  for (const label of declutterLabels(shown)) {
    const el = root.querySelector<HTMLElement>(`[data-passing-place="${String(label.index)}"]`);
    const at = shown.find((s) => s.index === label.index);
    if (!el || !at) continue;
    el.hidden = label.hidden;
    if (label.hidden) continue;
    el.style.left = `${String(Math.round(at.x))}px`;
    el.style.top = `${String(Math.round(label.y))}px`;
  }
  const car = root.querySelector<HTMLElement>('[data-world-car-anchor]');
  if (car) {
    const q = runtime.layout.pathAt(runtime.motion.s);
    const p = runtime.project([q.x, q.y + CAR_LIFT, q.z]);
    car.style.left = `${String(Math.round(p.x))}px`;
    car.style.top = `${String(Math.round(p.y))}px`;
    car.dataset.visible = String(p.visible);
  }
}

export function WorldHud(props: Props) {
  const {
    runtime,
    nodes,
    places,
    stops,
    statuses,
    pops,
    teamChips,
    hidePills,
    opening,
    reducedMotion,
    bottomInset,
  } = props;
  const root = useRef<HTMLDivElement>(null);

  // a posição das pílulas e dos nomes pelo laço da cena: um atualizador por quadro, e uma vez ao
  // montar ou quando os nós, as cidades ou a altura medida mudam
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const place = () => {
      placePills(el, runtime, nodes, bottomInset);
      placeLabels(el, runtime, places);
    };
    place();
    return runtime.register(place);
  }, [runtime, nodes, places, bottomInset]);

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" data-world-hud>
      {/* as cidades de passagem (fase 22): só nome, fora da árvore de acessibilidade, sem toque */}
      {places.map((place, i) => (
        <span
          key={`${place.name}-${place.uf}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 mv-text-12 font-semibold tracking-[0.18em] whitespace-nowrap text-white/85 uppercase [text-shadow:0_1px_2px_rgb(0_0_0/0.7)]"
          data-passing-place={i}
          aria-hidden="true"
          hidden
        >
          {place.name}
        </span>
      ))}
      {/* onde o carro está na tela, para quem testa por fora tocar nele */}
      <span className="absolute size-0" data-world-car-anchor aria-hidden="true" />
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
