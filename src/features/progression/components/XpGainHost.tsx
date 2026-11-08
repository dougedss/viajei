import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { useXpGains } from '../xp-gain.ts';

/** Os "+N XP" que estão no ar, por cima de tudo. Sem animação de movimento sob reduzir movimento. */
export function XpGainHost() {
  const gains = useXpGains();
  const reduced = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
      {gains.map((g) => (
        <span
          key={g.id}
          data-xp-gain={g.points}
          className="absolute rounded-full bg-sunset-deep px-2.5 py-0.5 font-num text-[15px] font-bold text-white shadow-[0_4px_12px_rgb(0_0_0/0.18)]"
          style={{
            left: g.x,
            top: g.y,
            translate: reduced ? '-50% 0' : undefined,
            // sob reduzir movimento, aparece parado e sai quando o tempo acaba
            animation: reduced ? 'none' : 'xp-rise 1.2s ease-out forwards',
          }}
        >
          +{g.points} XP
        </span>
      ))}
    </div>
  );
}
