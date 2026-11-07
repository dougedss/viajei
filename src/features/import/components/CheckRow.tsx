import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** o nome acessível, quando o rótulo é composto */
  ariaLabel?: string;
  detail?: ReactNode;
  /** à direita, fora da área do toque que marca (ex.: "Editar") */
  action?: ReactNode;
};

/** Uma linha da revisão que entra ou não na viagem: o mesmo desenho das listas. */
export function CheckRow({ checked, onChange, label, ariaLabel, detail, action }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-[16px] bg-card pl-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onChange(!checked)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <span
          className={cx(
            'grid size-7 shrink-0 place-items-center rounded-[9px] transition',
            checked ? 'bg-on-time text-white' : 'shadow-[inset_0_0_0_2px_var(--color-line)]',
          )}
          aria-hidden="true"
        >
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        {/* a coluna nunca passa da linha: um endereço longo da busca trunca em vez de alargar a tela */}
        <span className={cx('grid min-w-0 grid-cols-1', !checked && 'opacity-60')}>
          <span className="text-[16px] leading-snug [overflow-wrap:anywhere]">{label}</span>
          {detail ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
              {detail}
            </span>
          ) : null}
        </span>
      </button>
      {action ? <div className="shrink-0 pr-1">{action}</div> : null}
    </div>
  );
}
