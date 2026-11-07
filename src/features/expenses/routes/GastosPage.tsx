import {
  BedDouble,
  Fuel,
  Plus,
  Receipt,
  Ticket,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { EXPENSE_CATEGORIES, PERSON_COLORS, type ExpenseCategory } from '@shared/constants.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useTripReservations } from '@/features/reservations/queries.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { formatMoney, todayISO } from '@/features/trips/rules.ts';
import type { Expense, Profile } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import { createExpense, removeExpense, updateExpense } from '../actions.ts';
import { BudgetBar, CategoryBars } from '../components/Budget.tsx';
import { ExpenseSheet } from '../components/ExpenseSheet.tsx';
import { useTripExpenses } from '../queries.ts';
import { asCategory, clampToTrip, fromCents, groupByDay, totals } from '../rules.ts';

const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  lodging: BedDouble,
  fuel: Fuel,
  food: UtensilsCrossed,
  attractions: Ticket,
  other: Receipt,
};

/**
 * Os gastos da viagem: a barra do orçamento, os totais por categoria e a lista por dia (valor,
 * categoria, quem pagou com a cor da pessoa e a parada). `?abrir=<id>` abre um gasto (é para onde
 * o "Gasto lançado" da reserva leva); `?novo=1` abre o formulário.
 */
export default function GastosPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const expenses = useTripExpenses(tripId);
  const reservations = useTripReservations(tripId) ?? [];
  const members = useTripMembers(tripId);
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  if (trip === undefined || days === undefined || expenses === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const team = members
    .filter((m) => m.member.status === 'accepted')
    .flatMap((m) => (m.profile ? [m.profile] : []));
  const profiles = new Map<string, Profile>();
  for (const m of members) if (m.profile) profiles.set(m.profile.id, m.profile);
  const t = totals(expenses);
  const groups = groupByDay(expenses, trip);
  const openId = params.get('abrir');
  const opened = expenses.find((e) => e.id === openId) ?? null;
  const creating = params.get('novo') === '1';
  const setParam = (key: 'abrir' | 'novo', value: string | null) =>
    setParams(
      (p) => {
        p.delete('abrir');
        p.delete('novo');
        if (value) p.set(key, value);
        return p;
      },
      { replace: true },
    );
  const close = () => setParam('abrir', null);
  const sheet = opened
    ? { expense: opened }
    : creating
      ? {
          draft: {
            date: clampToTrip(todayISO(), trip),
            stop_id: null,
            category: 'other' as ExpenseCategory,
          },
        }
      : null;

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}`}
        title="Gastos"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
        actions={
          <Button size="sm" onClick={() => setParam('novo', '1')}>
            <Plus className="size-4" aria-hidden="true" />
            Gasto
          </Button>
        }
      />

      <BudgetBar totals={t} budget={trip.budget} editHref={`/viagens/${trip.id}/editar`} />
      <CategoryBars totals={t} />

      {groups.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum gasto ainda"
          text="Lance o que o time gastar: combustível, hospedagem, comida, ingressos. Funciona sem sinal."
          action={
            <Button size="md" onClick={() => setParam('novo', '1')}>
              Lançar o primeiro gasto
            </Button>
          }
        />
      ) : (
        groups.map((g) => (
          <section
            key={g.date ?? 'fora'}
            aria-label={g.date ?? 'Fora das datas da viagem'}
            className="grid gap-2"
          >
            <h2 className="flex items-baseline justify-between label-caps text-accent-ink">
              <span>{g.date ? formatDayShort(g.date) : 'Fora das datas da viagem'}</span>
              <span className="font-num text-ink-2">{formatMoney(fromCents(g.cents))}</span>
            </h2>
            <ul className="grid gap-2">
              {g.items.map((e) => (
                <ExpenseRow
                  key={e.id}
                  expense={e}
                  payer={profiles.get(e.paid_by)}
                  title={
                    reservations.find((r) => r.id === e.reservation_id)?.name ??
                    stops.find((s) => s.id === e.stop_id)?.name ??
                    e.notes ??
                    EXPENSE_CATEGORIES[asCategory(e.category)].label
                  }
                  onOpen={() => setParam('abrir', e.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <ExpenseSheet
        open={sheet}
        trip={trip}
        days={days}
        stops={stops}
        team={team}
        uid={uid}
        onClose={close}
        onSave={(values) => {
          close();
          void (opened ? updateExpense(opened.id, values) : createExpense(trip.id, uid, values));
        }}
        onRemove={(e) => {
          close();
          void removeExpense(e).then((undo) =>
            toast.show({
              title: 'Gasto excluído',
              description: formatMoney(e.amount),
              action: { label: 'Desfazer', onClick: () => void undo() },
              duration: 8000,
            }),
          );
        }}
      />
    </div>
  );
}

function ExpenseRow({
  expense,
  payer,
  title,
  onOpen,
}: {
  expense: Expense;
  payer: Profile | undefined;
  title: string;
  onOpen: () => void;
}) {
  const category = asCategory(expense.category);
  const Icon = CATEGORY_ICONS[category];
  const tint = EXPENSE_CATEGORIES[category].color;
  const color = payer ? PERSON_COLORS[asPersonColor(payer.color)].hex : 'var(--color-line)';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-[16px] bg-card px-4 py-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)]"
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[12px]"
          style={{
            background: `color-mix(in oklab, ${tint} 16%, transparent)`,
            color: tint,
          }}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[17px] font-semibold">{title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ background: color }}
                aria-hidden="true"
              />
              {payer?.name ?? 'Alguém do time'}
            </span>
            <span>{EXPENSE_CATEGORIES[category].label}</span>
            {expense.reservation_id ? <span>da reserva</span> : null}
          </span>
        </span>
        <span className="font-num text-[19px] font-semibold">{formatMoney(expense.amount)}</span>
      </button>
    </li>
  );
}
