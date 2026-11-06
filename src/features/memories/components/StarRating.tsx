import { Star } from 'lucide-react';
import { PERSON_COLORS } from '@shared/constants.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { cx } from '@/lib/cx.ts';
import type { Profile, StopMemory } from '@/lib/db/schema.ts';

/** As cinco estrelas da folha "Como foi?". Tocar na mesma de novo tira a nota. */
export function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} de 5`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cx(
              'grid size-12 place-items-center rounded-[14px] bg-paper transition active:scale-95 motion-reduce:transition-none',
              on ? 'text-tight' : 'text-line',
            )}
          >
            <Star className={cx('size-7', on && 'fill-current')} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** "★ 4" na cor de quem deu: a nota de cada pessoa no card da parada. */
export function RatingChips({
  memories,
  profiles,
}: {
  memories: readonly Pick<StopMemory, 'id' | 'user_id' | 'rating'>[];
  profiles: ReadonlyMap<string, Profile>;
}) {
  const rated = memories.filter((m) => m.rating !== null);
  if (rated.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5" aria-label="Notas do time">
      {rated.map((m) => {
        const p = profiles.get(m.user_id);
        const hex = PERSON_COLORS[asPersonColor(p?.color ?? 'sunset')].hex;
        return (
          <span
            key={m.id}
            className="inline-flex min-h-7 items-center gap-1 rounded-full bg-paper px-2 text-[13px] font-semibold"
            style={{ boxShadow: `inset 0 0 0 1.5px ${hex}` }}
            aria-label={`${p?.name ?? 'Alguém'}: ${m.rating ?? 0} de 5`}
          >
            <span className="size-2 rounded-full" style={{ background: hex }} aria-hidden="true" />
            <Star className="size-3.5 fill-current text-tight" aria-hidden="true" />
            <span className="num">{m.rating}</span>
          </span>
        );
      })}
    </span>
  );
}
