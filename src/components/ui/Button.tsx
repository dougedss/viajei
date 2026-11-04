import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-button font-num font-bold tracking-wide transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-60';
const variants = {
  primary: 'bg-sunset text-white shadow-[0_6px_16px_-6px_rgb(232_101_58/0.7)]',
  secondary: 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]',
  ghost:
    'font-ui text-ink-2 font-semibold tracking-normal shadow-[inset_0_0_0_1.5px_var(--color-line)]',
  danger: 'bg-late text-white',
};
const sizes = { md: 'min-h-12 px-4 text-[17px]', lg: 'min-h-13 px-5 text-[19px]' };

/** Botão com alvo de toque de 48 px ou mais. Em `loading`, mostra o spinner e bloqueia o clique. */
export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cx(base, variants[variant], sizes[size], className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
