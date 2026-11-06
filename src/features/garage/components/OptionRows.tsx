import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_COLORS,
  CAR_MODELS,
  type CarAccessoryKey,
  type CarColor,
  type CarModel,
} from '@shared/constants.ts';
import type { CarSpec } from '@/art/cars/types.ts';
import type { TeamProgress } from '@/features/progression/team.ts';
import { cx } from '@/lib/cx.ts';
import { accessoryState, colorState, modelState, type ItemState, type Tap } from '../rules.ts';

/**
 * As três linhas da garagem, como no style tile: Modelo (os cinco, com o nível de cada bloqueado),
 * Pintura (as oito cores; o dourado com "nv 5") e Acessórios (todos, os bloqueados com cadeado).
 * Tudo é tocável: o bloqueado abre a prévia com a frase do que falta. Alvos de 48 px, rolagem na
 * horizontal quando não cabe.
 */
type Props = {
  trip: CarSpec;
  shown: CarSpec;
  progress: TeamProgress;
  onTap: (tap: Tap) => void;
};

const MODELS = Object.keys(CAR_MODELS) as CarModel[];
const COLORS = Object.keys(CAR_COLORS) as CarColor[];

function lockedLabel(state: ItemState, label: string): string {
  return state.status === 'locked' ? `${state.hint}. Toque para ver a prévia` : label;
}

function Row({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section className="grid gap-2" aria-labelledby={id}>
      <h2 id={id} className="label-caps text-ink-2">
        {title}
      </h2>
      <div className="-mx-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1">
        {children}
      </div>
    </section>
  );
}

const pill =
  'inline-flex min-h-12 shrink-0 snap-start items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition active:scale-[.97]';

function pillClass(pressed: boolean, locked: boolean): string {
  return cx(
    pill,
    pressed
      ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
      : 'bg-card text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
    locked && !pressed && 'text-ink-2/80',
  );
}

export function OptionRows({ trip, shown, progress, onTap }: Props) {
  return (
    <div className="grid gap-5">
      <Row title="Modelo" id="h-garagem-modelo">
        {MODELS.map((m) => {
          const state = modelState(m, progress, trip);
          const locked = state.status === 'locked';
          const pressed = shown.model === m;
          return (
            <button
              key={m}
              type="button"
              className={pillClass(pressed, locked)}
              aria-pressed={pressed}
              aria-label={lockedLabel(state, CAR_MODELS[m].label)}
              data-state={state.status}
              onClick={() => onTap({ kind: 'model', model: m })}
            >
              {locked ? <Lock className="size-4" aria-hidden="true" /> : null}
              {CAR_MODELS[m].label}
              {locked ? (
                <small className="num text-[13px] font-semibold text-ink-2">
                  nv {CAR_MODELS[m].level}
                </small>
              ) : null}
            </button>
          );
        })}
      </Row>

      <Row title="Pintura" id="h-garagem-pintura">
        {COLORS.map((c) => {
          const state = colorState(c, progress, trip);
          const locked = state.status === 'locked';
          const pressed = shown.color === c;
          return (
            <button
              key={c}
              type="button"
              className="grid min-h-12 min-w-12 shrink-0 snap-start place-items-center rounded-full"
              aria-pressed={pressed}
              aria-label={lockedLabel(state, CAR_COLORS[c].label)}
              data-state={state.status}
              data-color={c}
              onClick={() => onTap({ kind: 'color', color: c })}
            >
              <span
                className={cx(
                  'relative grid size-9 place-items-center rounded-full border-2 shadow-[inset_0_-6px_10px_rgb(0_0_0/.3),inset_0_6px_10px_rgb(255_255_255/.2)]',
                  pressed
                    ? 'border-white shadow-[0_0_0_3px_rgb(232_101_58/.6),inset_0_-6px_10px_rgb(0_0_0/.3)]'
                    : 'border-white/20',
                )}
                style={{ background: CAR_COLORS[c].hex }}
              >
                {locked ? (
                  <span
                    className="absolute inset-0 grid place-items-center rounded-full bg-[repeating-linear-gradient(45deg,rgb(0_0_0/.45)_0_3px,transparent_3px_7px)]"
                    aria-hidden="true"
                  >
                    <Lock className="size-3.5 text-white" />
                  </span>
                ) : null}
              </span>
              {locked ? (
                <small
                  className="-mt-0.5 num text-[12px] font-semibold text-ink-2"
                  aria-hidden="true"
                >
                  nv {CAR_COLORS[c].level}
                </small>
              ) : null}
            </button>
          );
        })}
      </Row>

      <Row title="Acessórios · desbloqueados por conquista" id="h-garagem-acessorios">
        {CAR_ACCESSORY_KEYS.map((k: CarAccessoryKey) => {
          const state = accessoryState(k, progress, trip);
          const locked = state.status === 'locked';
          const pressed = shown.accessories.includes(k);
          return (
            <button
              key={k}
              type="button"
              className={pillClass(pressed, locked)}
              aria-pressed={pressed}
              aria-label={lockedLabel(state, CAR_ACCESSORIES[k].label)}
              data-state={state.status}
              onClick={() => onTap({ kind: 'accessory', key: k })}
            >
              {locked ? <Lock className="size-4" aria-hidden="true" /> : null}
              {CAR_ACCESSORIES[k].label}
            </button>
          );
        })}
      </Row>
    </div>
  );
}
