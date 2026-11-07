import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { KIND_TEXT } from '@/features/itinerary/stop-kinds.ts';
import { cx } from '@/lib/cx.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import type { GeoState } from '../geocode.ts';
import type { Preview } from '../preview.ts';

type Props = {
  reading: boolean;
  preview: Preview;
  geo: Readonly<Record<string, GeoState>>;
  onCancel: () => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ENTER = 'animate-[import-in_150ms_ease-out]';

/**
 * O preview progressivo: até o primeiro pedaço, "Lendo o roteiro…" (a IA pode estar pensando, em
 * silêncio); depois os dias e as paradas na ordem em que chegam. A última parada cresce enquanto o
 * nome chega; os campos de formato fixo (horário, "fecha às") só aparecem inteiros.
 */
export function ArrivingStep({ reading, preview, geo, onCancel }: Props) {
  const { counts } = preview;
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3" aria-live="polite">
        <p className="font-num text-[20px] font-semibold">
          {reading || counts.stops === 0 ? (
            <span className="motion-safe:animate-pulse">Lendo o roteiro…</span>
          ) : (
            <>
              Chegando · {plural(counts.days, 'dia', 'dias')} ·{' '}
              {plural(counts.stops, 'parada', 'paradas')}
            </>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {reading || counts.stops === 0 ? (
        <p className="text-[15px] text-ink-2">
          A IA está lendo o texto inteiro antes de escrever. Os dias aparecem aqui assim que
          começarem a chegar.
        </p>
      ) : null}

      <ol className="grid gap-3" aria-label="Dias que chegaram">
        {preview.days.map((day, di) => (
          <li key={day.date ?? `d${di}`} className={ENTER}>
            <Card className="grid gap-2">
              <p className="label-caps text-accent-ink">
                {day.date ? formatDayShort(day.date) : '…'}
                {day.title ? ` · ${day.title}` : ''}
              </p>
              <ul className="grid gap-1.5">
                {day.stops.map((stop, si) => {
                  const state = geo[`d${di}s${si}`];
                  return (
                    <li
                      key={`d${di}s${si}`}
                      className={cx('flex items-center gap-2 text-[16px]', ENTER)}
                    >
                      <span className="w-12 shrink-0 num text-ink-2">{stop.time ?? '—'}</span>
                      {stop.kind ? (
                        <StopKindIcon
                          kind={stop.kind}
                          className={`size-4 shrink-0 ${KIND_TEXT[stop.kind]}`}
                        />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {stop.name}
                        {stop.complete ? null : (
                          <span className="ml-0.5 text-accent-ink" aria-hidden="true">
                            ▍
                          </span>
                        )}
                      </span>
                      {stop.closes_at ? (
                        <span className="shrink-0 text-[13px] text-ink-2">
                          fecha {stop.closes_at}
                        </span>
                      ) : null}
                      {state?.kind === 'found' ? (
                        <MapPin
                          className="size-4 shrink-0 text-on-time-ink"
                          aria-label="Localizada"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ol>

      {counts.reservations + counts.contacts + counts.items > 0 ? (
        <p className={cx('text-[15px] text-ink-2', ENTER)}>
          {[
            counts.reservations > 0 ? plural(counts.reservations, 'reserva', 'reservas') : null,
            counts.contacts > 0 ? plural(counts.contacts, 'contato', 'contatos') : null,
            counts.items > 0 ? plural(counts.items, 'item de lista', 'itens de lista') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
