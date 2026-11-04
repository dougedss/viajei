import { useRef } from 'react';
import { cx } from '@/lib/cx.ts';

type Tab = { id: string; label: string };
type Props = {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
};

/** Abas acessíveis (tablist, setas do teclado). O conteúdo fica a cargo de quem usa. */
export function Tabs({ tabs, value, onChange, label, className }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, delta: number) => {
    const next = (from + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cx(
        'flex gap-1 rounded-[16px] bg-card p-1 shadow-[inset_0_0_0_1px_var(--color-line)]',
        className,
      )}
    >
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i, 1);
              if (e.key === 'ArrowLeft') move(i, -1);
            }}
            className={cx(
              'min-h-10 flex-1 rounded-[12px] px-3 text-[15px] font-semibold transition',
              selected ? 'bg-accent-soft text-accent-ink' : 'text-ink-2',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
