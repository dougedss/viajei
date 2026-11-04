import type { ComponentProps } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = ComponentProps<'span'> & { kind?: 'neutral' | 'ok' | 'warn' | 'late' | 'off' | 'xp' };
const kinds = {
  neutral: 'bg-accent-soft text-accent-ink',
  ok: 'bg-on-time/15 text-on-time-ink',
  warn: 'bg-tight/20 text-tight-ink',
  late: 'bg-late/15 text-late-ink',
  off: 'bg-[#2B3140] text-white',
  xp: 'bg-night text-lane font-num text-[15px] tracking-wide',
};

/** Chip de estado: aviso, offline, sincronizado, XP. */
export function Chip({ kind = 'neutral', className, ...rest }: Props) {
  return (
    <span
      className={cx(
        'inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold',
        kinds[kind],
        className,
      )}
      {...rest}
    />
  );
}
