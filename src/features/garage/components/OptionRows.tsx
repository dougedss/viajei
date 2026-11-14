import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_COLORS,
  CAR_FINISHES,
  CAR_MODELS,
  CAR_WHEELS,
  OWN_CAR,
  type CarAccessoryKey,
  type CarColor,
  type CarFinish,
  type CarModel,
  type CarWheels,
} from '@shared/constants.ts';
import { WheelMark } from '@/art/cars/CarSide.tsx';
import type { CarSpec } from '@/art/cars/types.ts';
import { levelName, type TeamProgress } from '@/features/progression/team.ts';
import { cx } from '@/lib/cx.ts';
import {
  accessoryState,
  colorState,
  finishState,
  modelState,
  wheelsState,
  type ItemState,
  type Tap,
} from '../rules.ts';

/**
 * As linhas da garagem (fase 16, a escada nova): Modelo (os cinco, livres: escolha o seu carro),
 * Pintura (as oito cores; o dourado no nível 5), Acabamento e Rodas (o que os níveis liberam),
 * Acessórios (pelas conquistas) e, no fim, "O seu carro", trancado até uma versão futura. Tudo o que
 * se escolhe é tocável: o bloqueado abre a prévia com a frase do que falta. Alvos de 48 px, rolagem
 * na horizontal quando não cabe.
 */
type Props = {
  /** o carro gravado (o do perfil): o que ele já usa e o progresso não libera continua (`kept`) */
  mine: CarSpec;
  shown: CarSpec;
  progress: TeamProgress;
  onTap: (tap: Tap) => void;
};

const MODELS = Object.keys(CAR_MODELS) as CarModel[];
const COLORS = Object.keys(CAR_COLORS) as CarColor[];
const FINISHES = Object.keys(CAR_FINISHES) as CarFinish[];
const WHEELS = Object.keys(CAR_WHEELS) as CarWheels[];

/**
 * O que falta para liberar vira a descrição acessível do botão: o nome continua sendo o que está
 * escrito nele (WCAG 2.5.3, quem usa a voz diz "Fosca"), e o leitor de tela lê a regra logo depois.
 */
function LockedHint({ state, id }: { state: ItemState; id: string }) {
  if (state.status !== 'locked') return null;
  return (
    <span id={id} hidden>
      {`${state.hint}. Toque para ver a prévia`}
    </span>
  );
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

/** Um botão de pílula com o cadeado e o "nv N" quando bloqueado. */
function Pill({
  state,
  pressed,
  hintId,
  level,
  onClick,
  children,
}: {
  state: ItemState;
  pressed: boolean;
  hintId: string;
  level: number;
  onClick: () => void;
  children: ReactNode;
}) {
  const locked = state.status === 'locked';
  return (
    <button
      type="button"
      className={pillClass(pressed, locked)}
      aria-pressed={pressed}
      aria-describedby={locked ? hintId : undefined}
      data-state={state.status}
      onClick={onClick}
    >
      {locked ? <Lock className="size-4" aria-hidden="true" /> : null}
      {children}
      {locked ? (
        <small className="num text-[13px] font-semibold text-ink-2" aria-hidden="true">
          nv {level}
        </small>
      ) : null}
      <LockedHint state={state} id={hintId} />
    </button>
  );
}

export function OptionRows({ mine, shown, progress, onTap }: Props) {
  const ownCarOpen = progress.level >= OWN_CAR.level;
  return (
    <div className="grid gap-5">
      <Row title="Modelo · escolha o seu carro" id="h-garagem-modelo">
        {MODELS.map((m) => (
          <Pill
            key={m}
            state={modelState(m, progress, mine)}
            pressed={shown.model === m}
            hintId={`garagem-modelo-${m}`}
            level={CAR_MODELS[m].level}
            onClick={() => onTap({ kind: 'model', model: m })}
          >
            {CAR_MODELS[m].label}
          </Pill>
        ))}
      </Row>

      <Row title="Pintura" id="h-garagem-pintura">
        {COLORS.map((c) => {
          const state = colorState(c, progress, mine);
          const locked = state.status === 'locked';
          const pressed = shown.color === c;
          const hintId = `garagem-pintura-${c}`;
          return (
            <button
              key={c}
              type="button"
              className="grid min-h-12 min-w-12 shrink-0 snap-start place-items-center rounded-full"
              aria-pressed={pressed}
              aria-describedby={locked ? hintId : undefined}
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
                {/* o nome é a cor; o "nv 5" de baixo é só o desenho do que a descrição diz */}
                <span className="sr-only">{CAR_COLORS[c].label}</span>
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
              <LockedHint state={state} id={hintId} />
            </button>
          );
        })}
      </Row>

      <Row title="Acabamento" id="h-garagem-acabamento">
        {FINISHES.map((f) => (
          <Pill
            key={f}
            state={finishState(f, progress, mine)}
            pressed={shown.finish === f}
            hintId={`garagem-acabamento-${f}`}
            level={CAR_FINISHES[f].level}
            onClick={() => onTap({ kind: 'finish', finish: f })}
          >
            {CAR_FINISHES[f].label}
          </Pill>
        ))}
      </Row>

      <Row title="Rodas" id="h-garagem-rodas">
        {WHEELS.map((w) => (
          <Pill
            key={w}
            state={wheelsState(w, progress, mine)}
            pressed={shown.wheels === w}
            hintId={`garagem-rodas-${w}`}
            level={CAR_WHEELS[w].level}
            onClick={() => onTap({ kind: 'wheels', wheels: w })}
          >
            <WheelMark style={w} className="-ml-1 size-7 shrink-0" />
            {CAR_WHEELS[w].label}
          </Pill>
        ))}
      </Row>

      <Row title="Acessórios · desbloqueados por conquista" id="h-garagem-acessorios">
        {CAR_ACCESSORY_KEYS.map((k: CarAccessoryKey) => {
          const state = accessoryState(k, progress, mine);
          const locked = state.status === 'locked';
          const pressed = shown.accessories.includes(k);
          const hintId = `garagem-acessorio-${k}`;
          return (
            <button
              key={k}
              type="button"
              className={pillClass(pressed, locked)}
              aria-pressed={pressed}
              aria-describedby={locked ? hintId : undefined}
              data-state={state.status}
              onClick={() => onTap({ kind: 'accessory', key: k })}
            >
              {locked ? <Lock className="size-4" aria-hidden="true" /> : null}
              {CAR_ACCESSORIES[k].label}
              <LockedHint state={state} id={hintId} />
            </button>
          );
        })}
      </Row>

      {/* o último nível: o seu carro de verdade (fase 20). Nada a escolher aqui, e nada finge que há */}
      <section
        className="grid gap-1 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
        aria-labelledby="h-garagem-seu-carro"
        data-own-car={ownCarOpen ? 'liberado' : 'trancado'}
      >
        <h2
          id="h-garagem-seu-carro"
          className="flex items-center gap-2 font-num text-[19px] font-semibold"
        >
          {ownCarOpen ? null : <Lock className="size-4 text-ink-2" aria-hidden="true" />}
          {OWN_CAR.label}
          {ownCarOpen ? null : (
            <small className="num text-[13px] font-semibold text-ink-2">nv {OWN_CAR.level}</small>
          )}
        </h2>
        <p className="text-[15px] leading-snug text-ink-2">
          {ownCarOpen
            ? OWN_CAR.later
            : `No nível ${OWN_CAR.level} (${levelName(OWN_CAR.level)}). ${OWN_CAR.later}`}
        </p>
      </section>
    </div>
  );
}
