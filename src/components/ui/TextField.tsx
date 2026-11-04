import { useId, type ComponentProps } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = ComponentProps<'input'> & { label: string; hint?: string; error?: string | undefined };

/** Campo de texto com rótulo, dica e erro ligados por aria. Funciona com `register` do react-hook-form. */
export function TextField({ label, hint, error, id, className, ...rest }: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  return (
    <div className={cx('grid gap-1.5', className)}>
      <label htmlFor={inputId} className="text-[15px] font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cx(
          'min-h-13 w-full rounded-field bg-card px-4 text-[17px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] transition outline-none placeholder:text-ink-2/70 focus:shadow-[inset_0_0_0_2px_var(--color-accent)]',
          error && 'shadow-[inset_0_0_0_2px_var(--color-late)]',
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[14px] font-semibold text-late-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[14px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
