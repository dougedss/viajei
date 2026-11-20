import { Receipt, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_KEYS,
  PERSON_COLORS,
  type ExpenseCategory,
} from '@shared/constants.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { FilePickers } from '@/features/media/components/FilePickers.tsx';
import { MediaThumb } from '@/features/media/components/MediaThumb.tsx';
import { MediaViewer } from '@/features/media/components/MediaViewer.tsx';
import { asPersonColor } from '@/features/profile/queries.ts';
import { joinLabels } from '@/features/reservations/read/to-form.ts';
import { formatMoney, parseMoney } from '@/features/trips/rules.ts';
import { cx } from '@/lib/cx.ts';
import type { Expense, Profile, Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { useTripMedia } from '@/lib/media/hooks.ts';
import type { Staged } from '@/lib/media/stage.ts';
import { blobUrl, dropUrl } from '@/lib/media/urls.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import type { ExpenseValues } from '../actions.ts';
import { receiptMissing, suggestionLine } from '../receipt/to-expense.ts';
import { useReceipt, type ReceiptStep } from '../receipt/useReceipt.ts';
import { categoryForStop, clampToTrip } from '../rules.ts';

type Person = Pick<Profile, 'id' | 'name' | 'color'>;

export type ExpenseDraft = {
  date: string;
  stop_id: string | null;
  category: ExpenseCategory;
  /** veio de "Fotografar a nota" (o posto registrado sozinho, fase 15): a nota em primeiro lugar */
  receipt?: boolean;
};

type Props = {
  /** `null` fechada; o rascunho de um gasto novo; ou o gasto para editar */
  open: { draft: ExpenseDraft } | { expense: Expense } | null;
  tripId: string;
  trip: Pick<Trip, 'start_date' | 'end_date'>;
  days: readonly TripDay[];
  stops: readonly Stop[];
  /** os membros aceitos: quem pode ter pagado */
  team: readonly Person[];
  uid: string;
  onClose: () => void;
  /** `receipt`: a foto da nota já preparada (e, com rede, já no Storage), para virar anexo do gasto */
  onSave: (values: ExpenseValues, receipt: Staged | null) => void;
  onRemove?: (expense: Expense) => void;
};

const STEP_TEXT: Record<ReceiptStep, string> = {
  preparing: 'Preparando a foto…',
  qr: 'Lendo o QR code…',
  merchant: 'Procurando o estabelecimento…',
  reading: 'Lendo a nota…',
};

/**
 * O formulário do gasto, numa folha: valor (com `parseMoney`, teclado numérico), categoria, data
 * dentro da viagem, a parada, quem pagou (padrão: quem lança) e observações. O mesmo no "+ Gasto" do
 * Modo Viagem, que já vem com a data do dia, a parada e a categoria pelo tipo dela. Num gasto novo,
 * "Fotografar a nota" (fase 18): a foto vira anexo do gasto e o que ela diz (o total, o estabelecimento,
 * a data, a categoria) entra preenchido, pelo QR da NFC-e sem IA e pela IA no que falta; o que a nota
 * não diz fica vazio. Num gasto que já existe, a nota aparece e abre no visualizador.
 */
export function ExpenseSheet(props: Props) {
  const { open, onClose } = props;
  const key = open === null ? 'closed' : 'expense' in open ? open.expense.id : 'new';
  return (
    <Sheet
      open={open !== null}
      onClose={onClose}
      title={open !== null && 'expense' in open ? 'Gasto' : 'Novo gasto'}
    >
      {open !== null ? <Body key={key} {...props} open={open} /> : null}
    </Sheet>
  );
}

function Body({
  open,
  tripId,
  trip,
  days,
  stops,
  team,
  uid,
  onSave,
  onRemove,
}: Props & { open: NonNullable<Props['open']> }) {
  const editing = 'expense' in open ? open.expense : null;
  const draft = 'draft' in open ? open.draft : null;
  const [amount, setAmount] = useState(
    editing ? formatMoney(editing.amount).replace(/^R\$\s?/, '') : '',
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    (editing?.category as ExpenseCategory | undefined) ?? draft?.category ?? 'other',
  );
  const [date, setDate] = useState(editing?.date ?? draft?.date ?? trip.start_date);
  const [stopId, setStopId] = useState<string | null>(editing?.stop_id ?? draft?.stop_id ?? null);
  const [paidBy, setPaidBy] = useState(editing?.paid_by ?? uid);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState<{ amount?: string; date?: string }>({});
  const dayOf = new Map(days.map((d) => [d.id, d]));
  const ordered = days.flatMap((d) => stops.filter((s) => s.trip_day_id === d.id));
  const payers = team.some((p) => p.id === paidBy)
    ? team
    : [...team, { id: paidBy, name: 'Quem pagou (saiu da viagem)', color: 'sunset' }];

  // a nota (fase 18): o que ela deu entra nos campos uma vez, quando a leitura termina; a pessoa
  // mexe depois (o estado guarda qual nota já entrou: "storing information from previous renders")
  const receipt = useReceipt({ id: tripId, ...trip });
  const [applied, setApplied] = useState<string | null>(null);
  if (receipt.phase.kind === 'done' && applied !== receipt.phase.staged.id) {
    const s = receipt.phase.suggestion;
    setApplied(receipt.phase.staged.id);
    if (s.amount !== null) setAmount(formatMoney(s.amount).replace(/^R\$\s?/, ''));
    if (s.date) setDate(clampToTrip(s.date, trip));
    // a categoria do contexto (a parada) vale mais que a palpite da IA
    if (s.category && !draft?.stop_id) setCategory(s.category);
    if (s.merchant && notes.trim() === '') setNotes(s.merchant);
  }
  const receipts = useTripMedia(tripId, (row) => editing !== null && row.expense_id === editing.id);
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <form
      className="grid max-h-[72svh] gap-4 overflow-y-auto pb-1"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const value = parseMoney(amount);
        const next = {
          ...(value === null || Number.isNaN(value) || value <= 0
            ? { amount: 'Digite um valor acima de zero.' }
            : {}),
          ...(date < trip.start_date || date > trip.end_date
            ? { date: 'Escolha um dia da viagem.' }
            : {}),
        };
        setError(next);
        if (value === null || Number.isNaN(value) || value <= 0 || next.date) return;
        if (receipt.phase.kind === 'working') return;
        onSave(
          {
            amount: value,
            category,
            date,
            paid_by: paidBy,
            stop_id: stopId,
            notes: notes.trim() === '' ? null : notes.trim().slice(0, 500),
          },
          receipt.phase.kind === 'done' ? receipt.phase.staged : null,
        );
      }}
    >
      {editing ? (
        receipts.length > 0 ? (
          <div className="flex flex-wrap gap-3" aria-label="A nota">
            {receipts.map((m, i) => (
              <MediaThumb
                key={m.row.id}
                item={m}
                label="Abrir a nota"
                onOpen={() => setViewing(i)}
              />
            ))}
            {viewing !== null ? (
              <MediaViewer
                items={receipts}
                index={viewing}
                onIndex={setViewing}
                onClose={() => setViewing(null)}
              />
            ) : null}
          </div>
        ) : null
      ) : (
        <fieldset className="grid gap-2" data-receipt={receipt.phase.kind}>
          <legend className="text-[15px] font-semibold">A nota</legend>
          {receipt.phase.kind === 'done' ? (
            <ReceiptLine
              phase={receipt.phase}
              onReset={() => {
                dropUrl(receipt.phase.kind === 'done' ? receipt.phase.staged.id : '');
                receipt.reset();
              }}
            />
          ) : receipt.phase.kind === 'working' ? (
            <p className="text-[14px] text-ink-2" role="status">
              {STEP_TEXT[receipt.phase.step]}
            </p>
          ) : (
            <>
              <p className="text-[14px] text-ink-2">
                Fotografe a nota: o total, o estabelecimento e a data vêm dela, e ela fica anexada
                ao gasto.
              </p>
              <FilePickers
                mode="photo"
                remaining={1}
                onFiles={(files) => {
                  const file = files[0];
                  if (file) void receipt.start(file);
                }}
              />
              {receipt.phase.kind === 'error' ? (
                <p className="text-[14px] font-semibold text-late-ink" role="alert">
                  {receipt.phase.message}
                </p>
              ) : null}
            </>
          )}
        </fieldset>
      )}
      <TextField
        label="Valor"
        inputMode="decimal"
        placeholder="0,00"
        autoFocus={!editing && !draft?.receipt}
        value={amount}
        error={error.amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <fieldset className="grid gap-1.5">
        <legend className="text-[15px] font-semibold">Categoria</legend>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORY_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={category === k}
              onClick={() => setCategory(k)}
              className={cx(
                'min-h-12 rounded-full px-4 text-[15px] font-semibold',
                category === k
                  ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              {EXPENSE_CATEGORIES[k].label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Data"
          type="date"
          min={trip.start_date}
          max={trip.end_date}
          value={date}
          error={error.date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label className="grid gap-1.5">
          <span className="text-[15px] font-semibold">Parada</span>
          <select
            value={stopId ?? ''}
            onChange={(e) => {
              const id = e.target.value === '' ? null : e.target.value;
              setStopId(id);
              const stop = id ? stops.find((s) => s.id === id) : undefined;
              if (stop && !editing) setCategory(categoryForStop(stop.kind));
            }}
            className="min-h-13 w-full rounded-field bg-card px-3 text-[17px] shadow-[inset_0_0_0_1.5px_var(--color-line)]"
          >
            <option value="">Nenhuma</option>
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
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-[15px] font-semibold">Quem pagou</legend>
        <div className="flex flex-wrap gap-2">
          {payers.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={paidBy === p.id}
              onClick={() => setPaidBy(p.id)}
              className={cx(
                'inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] font-semibold',
                paidBy === p.id
                  ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: PERSON_COLORS[asPersonColor(p.color)].hex }}
                aria-hidden="true"
              />
              {p.name}
            </button>
          ))}
        </div>
      </fieldset>
      <TextArea
        label="Observações"
        rows={2}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="grid gap-2">
        <Button type="submit" size="lg" disabled={receipt.phase.kind === 'working'}>
          Salvar
        </Button>
        {editing && onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(editing)}
            className="inline-flex min-h-12 items-center justify-center gap-1 rounded-[12px] text-[15px] font-semibold text-late-ink"
          >
            <Trash2 className="size-5" aria-hidden="true" />
            Excluir gasto
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** O que a nota deu: a miniatura, a linha com o total, o lugar e a data, e o que faltou. */
function ReceiptLine({
  phase,
  onReset,
}: {
  phase: Extract<ReturnType<typeof useReceipt>['phase'], { kind: 'done' }>;
  onReset: () => void;
}) {
  const line = suggestionLine(phase.suggestion, formatMoney);
  const missing = receiptMissing(phase.suggestion);
  return (
    <div className="flex items-start gap-3 rounded-field bg-paper p-2" data-receipt-read>
      <img
        src={blobUrl(phase.staged.id, phase.staged.prepared.blob)}
        alt=""
        className="size-20 shrink-0 rounded-[14px] object-cover"
      />
      <div className="grid min-w-0 flex-1 gap-1 text-[14px]">
        <p className="flex items-center gap-1.5 font-semibold">
          <Receipt className="size-4 text-accent-ink" aria-hidden="true" />
          {line !== '' ? line : 'Nota anexada'}
        </p>
        <p className="text-ink-2">
          {phase.offline
            ? 'Sem internet: a foto sobe quando a rede voltar. Preencha o resto.'
            : missing.length === 0
              ? 'Confira e salve.'
              : `A nota não dizia: ${joinLabels(missing)}.`}
        </p>
      </div>
      <button
        type="button"
        aria-label="Tirar a foto da nota"
        onClick={onReset}
        className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
