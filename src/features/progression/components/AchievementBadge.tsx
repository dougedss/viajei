import {
  ACHIEVEMENT_KEYS,
  ACHIEVEMENTS,
  CAR_ACCESSORIES,
  type AchievementKey,
} from '@shared/constants.ts';
import { Lock } from 'lucide-react';
import { cx } from '@/lib/cx.ts';
import { accessoryFor } from '../moments.ts';
import { AchievementIcon } from './AchievementIcon.tsx';

/** Um selo de conquista: o ícone na cor dela e o nome; bloqueado, cinza, com o cadeado. */
export function AchievementBadge({
  name,
  unlocked,
  className,
}: {
  name: AchievementKey;
  unlocked: boolean;
  className?: string;
}) {
  const def = ACHIEVEMENTS[name];
  return (
    <span
      className={cx(
        'flex min-h-12 items-center gap-2.5 rounded-card bg-card px-3 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
        className,
      )}
      data-achievement={name}
      data-unlocked={unlocked}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-white"
        style={{ background: unlocked ? def.color : 'var(--color-line)' }}
      >
        {unlocked ? (
          <AchievementIcon name={name} className="size-[18px]" />
        ) : (
          <Lock className="size-4 text-ink-2" aria-hidden="true" />
        )}
      </span>
      <b className={cx('text-[15px] leading-tight font-semibold', !unlocked && 'text-ink-2')}>
        {def.name}
      </b>
    </span>
  );
}

/**
 * As 15 conquistas no Perfil: as minhas coloridas, com o que foi feito; as que faltam dizem o que
 * falta, no tom da garagem ("Prancha: chegando a menos de 3 km do mar").
 */
export function AchievementGrid({ mine }: { mine: ReadonlySet<AchievementKey> }) {
  const ordered = [
    ...ACHIEVEMENT_KEYS.filter((k) => mine.has(k)),
    ...ACHIEVEMENT_KEYS.filter((k) => !mine.has(k)),
  ];
  return (
    <ul className="grid gap-2" aria-label="Conquistas">
      {ordered.map((k) => {
        const unlocked = mine.has(k);
        const acc = accessoryFor(k);
        const detail = unlocked
          ? ACHIEVEMENTS[k].done
          : acc
            ? `${CAR_ACCESSORIES[acc].label}: ${CAR_ACCESSORIES[acc].hint}`
            : '';
        return (
          <li key={k} className="grid gap-1">
            <AchievementBadge name={k} unlocked={unlocked} />
            <small className="px-1 text-[14px] text-ink-2">{detail}</small>
          </li>
        );
      })}
    </ul>
  );
}
