import type { ReactNode } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = {
  value: number;
  color?: string;
  className?: string;
  label?: string;
  children?: ReactNode;
};

/** Anel de progresso ou contagem. `value` de 0 a 1; `color` é qualquer cor CSS (usa o acento por padrão). */
export function Ring({ value, color = 'var(--color-accent)', className, label, children }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cx('relative aspect-square', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-line)" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${pct.toFixed(1)} 100`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center leading-none">
        {children}
      </div>
    </div>
  );
}
