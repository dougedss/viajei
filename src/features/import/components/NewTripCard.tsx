import { CalendarDays, MapPin, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { formatMoney, formatPeriod } from '@/features/trips/rules.ts';
import { cx } from '@/lib/cx.ts';
import type { StoredReview } from '../draft.ts';
import { headerProblems, moveStart, spanOf, type NewTripDraft } from '../new-trip.ts';

type Props = {
  draft: NewTripDraft;
  /** uma mudança no cabeçalho, que pode mexer nos dias da revisão junto (as datas) */
  onChange: (change: (stored: StoredReview) => StoredReview) => void;
};

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "Faltam 2 coisas: as datas e a origem." A regra 16: diz antes quantas perguntas são. */
function askedLine(draft: NewTripDraft): string | null {
  const missing = [
    draft.asked.dates ? 'as datas' : null,
    draft.asked.origin ? 'de onde o carro sai' : null,
    draft.asked.name ? 'o nome' : null,
  ].filter((x): x is string => x !== null);
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? (missing[0] ?? '')
      : `${missing.slice(0, -1).join(', ')} e ${missing.at(-1) ?? ''}`;
  return `${missing.length === 1 ? 'Falta 1 coisa' : `Faltam ${String(missing.length)} coisas`} que o texto não disse: ${list}. Já vem uma proposta; mude o que quiser.`;
}

function Choice({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'min-h-12 rounded-full px-4 text-[15px] font-semibold',
        pressed
          ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
          : 'bg-paper text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
      )}
    >
      {children}
    </button>
  );
}

/**
 * "A viagem", no topo da revisão da viagem nova (fase 17): o nome, as datas e a origem que saíram do
 * texto, e o que faltou como pergunta, com a proposta já escolhida (a regra do não-preencher). Mudar
 * o começo leva os dias e as reservas junto.
 */
export function NewTripCard({ draft, onChange }: Props) {
  const { header, asked } = draft;
  const [editingDates, setEditingDates] = useState(asked.dates);
  const [otherOrigin, setOtherOrigin] = useState(
    asked.origin && header.origin !== null && header.origin !== draft.originProposal,
  );
  const setHeader = (patch: Partial<NewTripDraft['header']>) =>
    onChange((s) =>
      s.newTrip
        ? { ...s, newTrip: { ...s.newTrip, header: { ...s.newTrip.header, ...patch } } }
        : s,
    );
  const problems = headerProblems(header);
  const line = askedLine(draft);
  const days = spanOf(header);

  return (
    <section className="grid gap-2" aria-labelledby="h-a-viagem" data-new-trip>
      <h2 id="h-a-viagem" className="label-caps text-accent-ink">
        A viagem
      </h2>
      <Card className="grid gap-4">
        {line ? (
          <p className="text-[15px] text-ink-2" data-asked>
            {line}
          </p>
        ) : null}

        <TextField
          label="Nome da viagem"
          value={header.name}
          autoComplete="off"
          onChange={(e) => setHeader({ name: e.target.value })}
          error={problems.find((p) => p.includes('nome'))}
        />

        <div className="grid gap-2" data-trip-dates>
          <p className="flex items-center gap-2 text-[16px] font-semibold">
            <CalendarDays className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
            <span>
              {formatPeriod(header.start_date, header.end_date)} · {plural(days, 'dia', 'dias')}
            </span>
          </p>
          {editingDates ? (
            <TextField
              label={asked.dates ? 'O texto não diz quando. A viagem começa em' : 'Começa em'}
              type="date"
              value={header.start_date}
              hint="Os dias e as reservas mudam juntos."
              onChange={(e) => {
                const start = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
                onChange((s) => {
                  if (!s.newTrip) return s;
                  const moved = moveStart(s.newTrip, s.review, start);
                  return { ...s, newTrip: moved.draft, review: moved.review };
                });
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingDates(true)}
              className="inline-flex min-h-12 w-fit items-center text-[15px] font-semibold text-accent-ink underline"
            >
              Mudar a data
            </button>
          )}
          {problems
            .filter((p) => !p.includes('nome'))
            .map((p) => (
              <p key={p} role="alert" className="text-[14px] font-semibold text-late-ink">
                {p}
              </p>
            ))}
        </div>

        <div className="grid gap-2" data-trip-origin>
          {asked.origin && draft.originProposal ? (
            <>
              <p className="flex items-center gap-2 text-[16px]">
                <MapPin className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
                <span>
                  Saindo de <b>{draft.originProposal}</b>, como da última vez?
                </span>
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="De onde o carro sai">
                <Choice
                  pressed={!otherOrigin && header.origin === draft.originProposal}
                  onClick={() => {
                    setOtherOrigin(false);
                    setHeader({ origin: draft.originProposal });
                  }}
                >
                  Sim, de lá
                </Choice>
                <Choice
                  pressed={otherOrigin}
                  onClick={() => {
                    setOtherOrigin(true);
                    setHeader({ origin: '' });
                  }}
                >
                  Outro lugar
                </Choice>
                <Choice
                  pressed={!otherOrigin && header.origin === null}
                  onClick={() => {
                    setOtherOrigin(false);
                    setHeader({ origin: null });
                  }}
                >
                  Sem origem
                </Choice>
              </div>
            </>
          ) : null}
          {otherOrigin || (asked.origin && !draft.originProposal) || !asked.origin ? (
            <TextField
              label={asked.origin ? 'De onde o carro sai? (se quiser)' : 'Saindo de'}
              value={header.origin ?? ''}
              placeholder="Papanduva/SC"
              autoComplete="off"
              onChange={(e) => setHeader({ origin: e.target.value })}
            />
          ) : null}
        </div>

        {header.budget !== null ? (
          <p className="flex items-center gap-2 text-[16px]">
            <Wallet className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
            <span>Orçamento {formatMoney(header.budget)}</span>
          </p>
        ) : null}
      </Card>
    </section>
  );
}
