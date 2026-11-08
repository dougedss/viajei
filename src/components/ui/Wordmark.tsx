import { cx } from '@/lib/cx.ts';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-num leading-none font-bold tracking-wide', className)}>
      Viajei
      <span className="text-accent" aria-hidden="true">
        .
      </span>
    </span>
  );
}
