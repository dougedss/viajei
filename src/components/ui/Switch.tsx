import { cx } from '@/lib/cx.ts';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** Interruptor acessível (role="switch"), com rótulo e descrição curta, alvo de toque de 48 px. */
export function Switch({ checked, onChange, label, description, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left disabled:opacity-50',
      )}
    >
      <span className="grid gap-0.5">
        <span className="text-[17px] font-semibold">{label}</span>
        {description ? <span className="text-[14px] text-ink-2">{description}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-on-time' : 'bg-line',
        )}
      >
        <span
          className={cx(
            'absolute top-1 size-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none',
            checked ? 'translate-x-7' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  );
}
