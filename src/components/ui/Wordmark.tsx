import { cx } from '@/lib/cx.ts';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cx('font-num leading-none font-bold tracking-wide', className)}
      aria-label="Viajei"
    >
      Viajei<span className="text-accent">.</span>
    </span>
  );
}
