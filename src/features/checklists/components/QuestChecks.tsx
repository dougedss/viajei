import { Check, Flag } from 'lucide-react';
import { cx } from '@/lib/cx.ts';
import type { ChecklistItem } from '@/lib/db/schema.ts';
import { gainXp, tappedRect } from '@/features/progression/xp-gain.ts';
import { setDone } from '../actions.ts';

/**
 * As missões ativas de uma parada, com "Feito", sem abrir outra tela: na folha "Como foi?" e na
 * lista do dia. Para o passageiro: nada aqui abre sozinho nem conta tempo.
 */
export function QuestChecks({
  quests,
  uid,
  className,
}: {
  quests: readonly ChecklistItem[];
  uid: string;
  className?: string;
}) {
  if (quests.length === 0) return null;
  return (
    <ul className={cx('grid gap-2', className)} aria-label="Missões da parada">
      {quests.map((q) => {
        const done = q.done_at !== null;
        return (
          <li
            key={q.id}
            className="flex items-center gap-3 rounded-[16px] bg-card py-2 pr-2 pl-3 shadow-[inset_0_0_0_1px_var(--color-line)]"
          >
            <Flag className="size-5 shrink-0 text-on-time-ink" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={cx('block text-[16px] leading-snug', done && 'text-ink-2')}>
                {q.text}
              </span>
              <span className="font-num text-[13px] font-semibold text-on-time-ink">
                missão · +{q.points}
              </span>
            </span>
            <button
              type="button"
              aria-pressed={done}
              aria-label={`Missão feita: ${q.text}`}
              onClick={() => {
                const at = tappedRect();
                void setDone(q, uid, !done);
                if (!done) void gainXp(uid, 'quest_done', q.id, q.points, at);
              }}
              className={cx(
                'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 text-[15px] font-semibold',
                done
                  ? 'bg-on-time text-white'
                  : 'bg-on-time/15 text-on-time-ink shadow-[inset_0_0_0_1.5px_var(--color-on-time)]',
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : null}
              {done ? 'Feita' : 'Feito'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
