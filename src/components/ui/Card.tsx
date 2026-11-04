import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx.ts';

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cx(
        'rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]',
        className,
      )}
      {...rest}
    />
  );
}
