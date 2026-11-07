import { AlertTriangle, MapPin, MapPinOff, Pencil, Search, WifiOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CHECKLIST_KINDS, CONTACT_TYPES, RESERVATION_TYPES } from '@shared/constants.ts';
import { formatPhone, toE164 } from '@shared/phone.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { KIND_TEXT } from '@/features/itinerary/stop-kinds.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import { geoProgress, type GeoState, type GeoTarget } from '../geocode.ts';
import { canExtendTo, type Review, type ReviewStop } from '../plan.ts';
import {
  canSave,
  looseValue,
  parseLooseValue,
  reviewCounts,
  reviewWarnings,
  setDayIncluded,
  setItemIncluded,
  setLooseDestination,
  setStopIncluded,
} from '../review-edit.ts';
import { CheckRow } from './CheckRow.tsx';

type Props = {
  trip: Pick<Trip, 'start_date' | 'end_date'>;
  /** a revisão com os lugares que a busca já achou */
  review: Review;
  partial: boolean;
  targets: readonly GeoTarget[];
  geo: Readonly<Record<string, GeoState>>;
  /** paradas que já existiam no roteiro, por data */
  existingByDate: Readonly<Record<string, number>>;
  saving: boolean;
  onChange: (change: (review: Review) => Review) => void;
  onEditStop: (key: string) => void;
  onChoose: (key: string) => void;
  onSave: () => void;
  onDiscard: () => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
/** "2026-12-11T16:30" como "11/12 16:30": hora de parede, como o texto disse */
const wall = (stamp: string) => {
  const [date = '', time = ''] = stamp.split('T');
  const [, mm, dd] = date.split('-');
  return `${dd ?? ''}/${mm ?? ''}${time ? ` ${time.slice(0, 5)}` : ''}`;
};

function Place({
  stop,
  state,
  onChoose,
}: {
  stop: ReviewStop;
  state: GeoState | undefined;
  onChoose: () => void;
}) {
  if (stop.geo?.status === 'found') {
    return (
      <span className="inline-flex max-w-full min-w-0 items-center gap-1 text-on-time-ink">
        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{stop.geo.label}</span>
      </span>
    );
  }
  if (stop.geo?.status === 'none' || state?.kind === 'none') {
    return (
      <span className="inline-flex items-center gap-1">
        <MapPinOff className="size-3.5" aria-hidden="true" />
        Sem local · dá para marcar depois
      </span>
    );
  }
  if (state?.kind === 'choice') {
    return (
      <button
        type="button"
        onClick={onChoose}
        className="inline-flex min-h-8 items-center gap-1 font-semibold text-accent-ink underline"
      >
        <Search className="size-3.5" aria-hidden="true" />
        Escolher o local ({state.options.length})
      </button>
    );
  }
  if (state?.kind === 'offline') {
    return (
      <span className="inline-flex items-center gap-1">
        <WifiOff className="size-3.5" aria-hidden="true" />
        Localiza quando a rede voltar
      </span>
    );
  }
  return <span>Localizando…</span>;
}

function StopRow({
  stop,
  state,
  onToggle,
  onEdit,
  onChoose,
}: {
  stop: ReviewStop;
  state: GeoState | undefined;
  onToggle: (include: boolean) => void;
  onEdit: () => void;
  onChoose: () => void;
}) {
  return (
    <CheckRow
      checked={stop.include}
      onChange={onToggle}
      ariaLabel={stop.name}
      label={
        <span className="flex items-center gap-2">
          <span className="w-12 shrink-0 num text-ink-2">{stop.time ?? '—:—'}</span>
          <StopKindIcon kind={stop.kind} className={`size-4 shrink-0 ${KIND_TEXT[stop.kind]}`} />
          <span className="min-w-0 break-words">{stop.name}</span>
        </span>
      }
      detail={
        <>
          {stop.time === null ? <span>sem horário no texto</span> : null}
          {stop.closes_at ? <span>fecha às {stop.closes_at}</span> : null}
          {stop.repeated === 'trip' ? (
            <Chip kind="warn">Já está no roteiro</Chip>
          ) : stop.repeated === 'text' ? (
            <Chip kind="warn">Repetida neste dia</Chip>
          ) : null}
          {stop.include ? <Place stop={stop} state={state} onChoose={onChoose} /> : null}
        </>
      }
      action={
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${stop.name}`}
          className="grid size-11 place-items-center rounded-full text-ink-2"
        >
          <Pencil className="size-5" aria-hidden="true" />
        </button>
      }
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h2 className="label-caps text-accent-ink">{title}</h2>
      {children}
    </section>
  );
}

/** A revisão editável: cada coisa entra ou não, e nada do que já existe sai. */
export function ReviewStep({
  trip,
  review,
  partial,
  targets,
  geo,
  existingByDate,
  saving,
  onChange,
  onEditStop,
  onChoose,
  onSave,
  onDiscard,
}: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const counts = reviewCounts(review);
  const warnings = reviewWarnings(review);
  const progress = geoProgress(targets, geo);
  const stopOptions = review.days
    .filter((d) => d.include)
    .flatMap((d) => d.stops.filter((s) => s.include).map((s) => ({ key: s.key, name: s.name })));
  const summary = [
    plural(counts.days, 'dia', 'dias'),
    plural(counts.stops, 'parada', 'paradas'),
    counts.reservations > 0 ? plural(counts.reservations, 'reserva', 'reservas') : null,
    counts.contacts > 0 ? plural(counts.contacts, 'contato', 'contatos') : null,
    counts.quests > 0 ? plural(counts.quests, 'missão', 'missões') : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="font-num text-[20px] font-semibold">{summary.join(' · ')}</p>
        {partial ? (
          <p className="text-[15px] text-ink-2">
            A leitura parou antes do fim: aqui está só o que chegou inteiro.
          </p>
        ) : null}
        {warnings.outsideDays + warnings.repeatedStops > 0 ? (
          <p className="flex flex-wrap gap-2">
            {warnings.outsideDays > 0 ? (
              <Chip kind="warn">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {plural(warnings.outsideDays, 'dia fora das datas', 'dias fora das datas')}
              </Chip>
            ) : null}
            {warnings.repeatedStops > 0 ? (
              <Chip kind="warn">
                {plural(warnings.repeatedStops, 'parada repetida', 'paradas repetidas')}
              </Chip>
            ) : null}
          </p>
        ) : null}
        {progress.total > 0 ? (
          <p className="text-[14px] text-ink-2" aria-live="polite">
            {progress.offline
              ? 'Sem internet para localizar: as paradas ficam sem local até a rede voltar.'
              : progress.done < progress.total
                ? `Localizando os lugares… ${progress.done} de ${progress.total}`
                : 'Lugares localizados. Confira os que pedem escolha.'}
          </p>
        ) : null}
      </div>

      {review.days.map((day) => {
        const already = existingByDate[day.date] ?? 0;
        return (
          <Section
            key={day.date}
            title={`${formatDayShort(day.date)}${day.title ? ` · ${day.title}` : ''}`}
          >
            {day.outside ? (
              <Card className="grid gap-2 shadow-[inset_0_0_0_2px_var(--color-tight)]">
                <p className="text-[15px]">
                  Este dia fica fora da viagem ({formatDayShort(trip.start_date)} a{' '}
                  {formatDayShort(trip.end_date)}).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={day.include ? 'primary' : 'secondary'}
                    disabled={!canExtendTo(trip, review, day.date)}
                    aria-pressed={day.include}
                    onClick={() => onChange((r) => setDayIncluded(r, day.date, true))}
                  >
                    Ampliar até {formatDayShort(day.date)}
                  </Button>
                  <Button
                    size="sm"
                    variant={day.include ? 'secondary' : 'primary'}
                    aria-pressed={!day.include}
                    onClick={() => onChange((r) => setDayIncluded(r, day.date, false))}
                  >
                    Deixar de fora
                  </Button>
                </div>
              </Card>
            ) : null}
            {already > 0 ? (
              <p className="text-[14px] text-ink-2">
                Já no roteiro neste dia: {plural(already, 'parada', 'paradas')}. As novas entram
                pela hora.
              </p>
            ) : null}
            {day.include
              ? day.stops.map((stop) => (
                  <StopRow
                    key={stop.key}
                    stop={stop}
                    state={geo[stop.key]}
                    onToggle={(include) => onChange((r) => setStopIncluded(r, stop.key, include))}
                    onEdit={() => onEditStop(stop.key)}
                    onChoose={() => onChoose(stop.key)}
                  />
                ))
              : null}
          </Section>
        );
      })}

      {review.reservations.length > 0 ? (
        <Section title="Reservas">
          {review.reservations.map((r) => (
            <CheckRow
              key={r.key}
              checked={r.include}
              onChange={(v) => onChange((x) => setItemIncluded(x, 'reservations', r.key, v))}
              label={`${RESERVATION_TYPES[r.type].label} · ${r.name}`}
              detail={
                <>
                  {r.start_at ? (
                    <span>
                      {wall(r.start_at)}
                      {r.end_at ? ` → ${wall(r.end_at)}` : ''}
                    </span>
                  ) : null}
                  {r.amount !== null ? <span>{brl(r.amount)}</span> : null}
                  <span>
                    {r.confirmation_code ? `código ${r.confirmation_code}` : 'sem código no texto'}
                  </span>
                  {r.exists ? <Chip kind="warn">Já está na viagem</Chip> : null}
                </>
              }
            />
          ))}
        </Section>
      ) : null}

      {review.contacts.length > 0 ? (
        <Section title="Contatos">
          {review.contacts.map((c) => {
            const phone = c.phone ? toE164(c.phone) : null;
            return (
              <CheckRow
                key={c.key}
                checked={c.include && phone?.ok === true}
                onChange={(v) => {
                  // sem um telefone completo o contato não entra: a tabela exige o número
                  if (phone?.ok) onChange((x) => setItemIncluded(x, 'contacts', c.key, v));
                }}
                label={`${CONTACT_TYPES[c.type].label} · ${c.name}`}
                detail={
                  <>
                    <span className="num">
                      {phone?.ok ? formatPhone(phone.e164) : 'telefone incompleto: fica de fora'}
                    </span>
                    {c.exists ? <Chip kind="warn">Já está nos contatos</Chip> : null}
                  </>
                }
              />
            );
          })}
        </Section>
      ) : null}

      {(
        [
          ['before', CHECKLIST_KINDS.before.label, review.before],
          ['pack', CHECKLIST_KINDS.pack.label, review.pack],
        ] as const
      ).map(([section, title, rows]) =>
        rows.length > 0 ? (
          <Section key={section} title={title}>
            {rows.map((row) => (
              <CheckRow
                key={row.key}
                checked={row.include}
                onChange={(v) => onChange((x) => setItemIncluded(x, section, row.key, v))}
                label={row.text}
                detail={row.exists ? <Chip kind="warn">Já está na lista</Chip> : undefined}
              />
            ))}
          </Section>
        ) : null,
      )}

      {review.quests.length > 0 ? (
        <Section title={CHECKLIST_KINDS.quest.label}>
          {review.quests.map((q) => (
            <CheckRow
              key={q.key}
              checked={q.include}
              onChange={(v) => onChange((x) => setItemIncluded(x, 'quests', q.key, v))}
              label={q.text}
              detail={
                <>
                  {q.stop_ref ? <span>{q.stop_ref}</span> : null}
                  {q.exists ? <Chip kind="warn">Já está nas missões</Chip> : null}
                </>
              }
            />
          ))}
        </Section>
      ) : null}

      {review.unclassified.length > 0 ? (
        <Section title="Não classificados">
          <p className="text-[14px] text-ink-2">
            O que o texto diz e não coube em nenhum lugar. Decida para onde vai cada um.
          </p>
          {review.unclassified.map((u) => (
            <Card key={u.key} className="grid gap-2">
              <p className="text-[16px]">“{u.text}”</p>
              <select
                aria-label={`Destino de “${u.text}”`}
                value={looseValue(u.to)}
                onChange={(e) =>
                  onChange((x) => setLooseDestination(x, u.key, parseLooseValue(e.target.value)))
                }
                className="min-h-12 rounded-field bg-card px-3 text-[16px] shadow-[inset_0_0_0_1.5px_var(--color-line)]"
              >
                <option value="undecided">Escolher o destino…</option>
                <optgroup label="Observação de uma parada">
                  {stopOptions.map((s) => (
                    <option key={s.key} value={`stop:${s.key}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Observação de um dia">
                  {review.days
                    .filter((d) => d.include)
                    .map((d) => (
                      <option key={d.date} value={`day:${d.date}`}>
                        {formatDayShort(d.date)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Item de lista">
                  <option value="before">{CHECKLIST_KINDS.before.label}</option>
                  <option value="pack">{CHECKLIST_KINDS.pack.label}</option>
                </optgroup>
                <option value="discard">Descartar</option>
              </select>
            </Card>
          ))}
        </Section>
      ) : null}

      <div className="grid gap-2">
        <Button loading={saving} disabled={!canSave(review)} onClick={onSave}>
          Salvar na viagem
        </Button>
        <p className="text-center text-[14px] text-ink-2">
          {warnings.undecided > 0
            ? `Falta decidir ${plural(warnings.undecided, 'não classificado', 'não classificados')}.`
            : 'Acrescenta ao roteiro; nada do que já existe é apagado.'}
        </p>
        <Button variant="ghost" size="md" onClick={() => setConfirmDiscard(true)}>
          Descartar esta leitura
        </Button>
      </div>

      <Sheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Descartar a leitura?"
        description="Nada entra na viagem. O texto colado continua guardado para ler de novo."
      >
        <Button
          variant="danger"
          onClick={() => {
            setConfirmDiscard(false);
            onDiscard();
          }}
        >
          Descartar
        </Button>
        <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
          Voltar à revisão
        </Button>
      </Sheet>
    </div>
  );
}
