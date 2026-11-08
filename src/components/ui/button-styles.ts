import { cx } from '@/lib/cx.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-button font-num font-bold tracking-wide transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-60';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-sunset-deep text-white shadow-[0_6px_16px_-6px_rgb(232_101_58/0.7)]',
  secondary: 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]',
  ghost:
    'font-ui text-ink-2 font-semibold tracking-normal shadow-[inset_0_0_0_1.5px_var(--color-line)]',
  danger: 'bg-late text-white',
};
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-12 px-3 mv-text-15',
  md: 'min-h-12 px-4 mv-text-17',
  lg: 'min-h-13 px-5 mv-text-19',
};

/** As mesmas classes para `<button>` e para `<Link>` com cara de botão. */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}
