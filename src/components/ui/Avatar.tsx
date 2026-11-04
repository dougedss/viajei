import { PERSON_COLORS, type PersonColor } from '@shared/constants.ts';
import { cx } from '@/lib/cx.ts';

type Props = { name: string; color: PersonColor; size?: 'sm' | 'md' | 'lg'; className?: string };
const sizes = { sm: 'size-8 text-[15px]', md: 'size-10 text-[18px]', lg: 'size-16 text-[28px]' };

/** A inicial da pessoa na cor dela, a mesma que marca itens, gastos e trilha. */
export function Avatar({ name, color, size = 'md', className }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full font-num font-semibold text-white',
        sizes[size],
        className,
      )}
      style={{ background: PERSON_COLORS[color].hex }}
    >
      {initial}
    </span>
  );
}
