import { Check } from 'lucide-react';
import type { LegName } from '@/features/travel-mode/legs.ts';
import { cx } from '@/lib/cx.ts';

/**
 * O indicador pequeno dos trechos do dia, na faixa de cima da maquete (fase 28, a decisão 13): "ida ·
 * volta" numa ida e volta, o número de cada trecho nos outros dias. Um toque num trecho espia aquele
 * trecho (o feito aparece como feito); um toque no da vez volta a ele. O trecho mostrado tem
 * `aria-pressed`; o feito, um visto. Num dia de um trecho só, nada aparece. Fica na faixa de cima e não
 * na barra do dia, que já tem o nome da viagem, a data, o "Hoje" e a escolha da lista; a faixa já tem o
 * clima e o "Rever o dia", e o indicador tem a altura do botão dele.
 */
export function LegIndicator({
  names,
  shown,
  current,
  done,
  disabled = false,
  onPick,
}: {
  names: readonly LegName[];
  /** o trecho que a maquete mostra */
  shown: number;
  /** o trecho da vez */
  current: number;
  /** quais trechos já foram feitos (o objetivo concluído) */
  done: readonly boolean[];
  /** durante o "Rever o dia", o indicador só mostra */
  disabled?: boolean;
  onPick: (index: number) => void;
}) {
  if (names.length <= 1) return null;
  return (
    <div
      role="group"
      aria-label="Trechos do dia"
      className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full bg-hud p-0.5 backdrop-blur-sm"
      data-leg-indicator
    >
      {names.map((n, i) => {
        const pressed = i === shown;
        const state = i === current ? 'o trecho da vez' : done[i] ? 'feito' : 'ainda não';
        return (
          <button
            key={n.name}
            type="button"
            aria-pressed={pressed}
            aria-label={`${n.name}, ${state}`}
            disabled={disabled}
            onClick={() => onPick(i)}
            className={cx(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 mv-text-13 font-semibold',
              pressed ? 'bg-sunset-deep text-white' : 'text-hud-ink',
              disabled && 'opacity-70',
            )}
            data-leg={i}
          >
            {done[i] ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {n.short}
          </button>
        );
      })}
    </div>
  );
}
