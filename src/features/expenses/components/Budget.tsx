import { Link } from 'react-router';
import { EXPENSE_CATEGORIES } from '@shared/constants.ts';
import { formatMoney } from '@/features/trips/rules.ts';
import { cx } from '@/lib/cx.ts';
import {
  budget as budgetOf,
  categoryBars,
  fromCents,
  percent,
  type BudgetState,
  type Totals,
} from '../rules.ts';

const BAR: Record<BudgetState, string> = {
  'on-time': 'bg-on-time',
  tight: 'bg-tight',
  late: 'bg-late',
};
const INK: Record<BudgetState, string> = {
  'on-time': 'text-on-time-ink',
  tight: 'text-tight-ink',
  late: 'text-late-ink',
};
const STATE_LABEL: Record<BudgetState, string> = {
  'on-time': 'dentro do orçamento',
  tight: 'perto do limite',
  late: 'acima do orçamento',
};

/**
 * O total contra `trips.budget`: verde até 80%, âmbar até 100%, vermelho acima (os tokens de estado),
 * sempre com o valor e a fração em texto, nunca só a cor. Sem orçamento, o total e o convite.
 */
export function BudgetBar({
  totals,
  budget,
  editHref,
}: {
  totals: Totals;
  budget: number | null;
  editHref: string;
}) {
  const b = budgetOf(totals.total, budget);
  const spent = formatMoney(fromCents(totals.total));
  if (!b) {
    return (
      <div className="grid gap-1 rounded-card bg-card p-4 shadow-card">
        <p className="font-num text-[28px] leading-none font-semibold">{spent}</p>
        <p className="text-[15px] text-ink-2">
          gastos até agora ·{' '}
          <Link to={editHref} className="font-semibold text-accent-ink">
            Definir orçamento
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div
      className="grid gap-2 rounded-card bg-card p-4 shadow-card"
      data-budget={b.state}
      role="group"
      aria-label={`Orçamento: ${spent} de ${formatMoney(budget)}, ${percent(b.ratio)}, ${STATE_LABEL[b.state]}`}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-num text-[28px] leading-none font-semibold">{spent}</span>
        <span className="text-[15px] text-ink-2">de {formatMoney(budget)}</span>
      </p>
      <div
        className="h-3 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(b.ratio * 100))}
        aria-label="Gasto do orçamento"
      >
        <div
          className={cx('h-full rounded-full transition-[width] duration-500', BAR[b.state])}
          style={{ width: `${Math.min(100, b.ratio * 100)}%` }}
        />
      </div>
      <p className={cx('text-[15px] font-semibold', INK[b.state])}>
        {percent(b.ratio)} ·{' '}
        {b.leftCents >= 0
          ? `faltam ${formatMoney(fromCents(b.leftCents))}`
          : `passou ${formatMoney(fromCents(-b.leftCents))}`}
      </p>
    </div>
  );
}

/** Totais por categoria em barras simples, com o valor e a fração em texto. */
export function CategoryBars({ totals }: { totals: Totals }) {
  const bars = categoryBars(totals);
  if (bars.length === 0) return null;
  return (
    <section aria-labelledby="h-categorias" className="grid gap-2">
      <h2 id="h-categorias" className="label-caps text-accent-ink">
        Por categoria
      </h2>
      <ul className="grid gap-2">
        {bars.map((b) => (
          <li key={b.category} className="grid gap-1">
            <p className="flex items-baseline justify-between gap-2 text-[15px]">
              <span className="font-semibold">{EXPENSE_CATEGORIES[b.category].label}</span>
              <span className="font-num text-ink-2">
                {formatMoney(fromCents(b.cents))} · {percent(b.share)}
              </span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${b.share * 100}%`,
                  background: EXPENSE_CATEGORIES[b.category].color,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
