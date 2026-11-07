import { QUEST_POINT_OPTIONS } from '@shared/constants.ts';
import { cx } from '@/lib/cx.ts';
import type { Stop, TripDay } from '@/lib/db/schema.ts';
import { formatDayShort } from '@/lib/time/index.ts';

/** Parada (opcional, por dia) e pontos de uma missão: 10, 20 ou 30. */
export function QuestFields({
  stops,
  days,
  stopId,
  points,
  onStop,
  onPoints,
}: {
  stops: readonly Stop[];
  days: readonly TripDay[];
  stopId: string | null;
  points: number;
  onStop: (id: string | null) => void;
  onPoints: (points: number) => void;
}) {
  const dayOf = new Map(days.map((d) => [d.id, d]));
  const ordered = days.flatMap((d) => stops.filter((s) => s.trip_day_id === d.id));
  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-[15px] font-semibold">Parada</span>
        <select
          value={stopId ?? ''}
          onChange={(e) => onStop(e.target.value === '' ? null : e.target.value)}
          className="min-h-12 rounded-[14px] bg-card px-3 text-[17px] shadow-[inset_0_0_0_1.5px_var(--color-line)]"
        >
          <option value="">Da viagem (nenhuma parada)</option>
          {ordered.map((s) => {
            const day = dayOf.get(s.trip_day_id);
            return (
              <option key={s.id} value={s.id}>
                {day ? `${formatDayShort(day.date)} · ` : ''}
                {s.name}
              </option>
            );
          })}
        </select>
      </label>
      <fieldset className="grid gap-1">
        <legend className="text-[15px] font-semibold">Pontos</legend>
        <div className="flex gap-2">
          {QUEST_POINT_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={points === p}
              onClick={() => onPoints(p)}
              className={cx(
                'min-h-12 flex-1 rounded-[14px] font-num text-[17px] font-semibold',
                points === p
                  ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              +{p}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
