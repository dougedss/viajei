import { Award } from 'lucide-react';
import { Card } from '@/components/ui/Card.tsx';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { levelPhrase, type LevelProgress } from '../level.ts';

/**
 * A barra de nível: o nível e o nome, o XP contra o limiar seguinte, a barra que anda e a frase do
 * que o próximo nível libera. Na viagem é a do time ("vocês"), com o XP de quem está mais adiante e
 * sem nome; no Perfil, a da pessoa. A barra anima ao subir (sem animação sob reduzir movimento).
 */
export function LevelBar({
  progress,
  who,
  solo = false,
  label,
}: {
  progress: LevelProgress;
  who: 'team' | 'me';
  solo?: boolean;
  /** "Nível do time" na viagem; no Perfil, só "Nível" */
  label?: string;
}) {
  const reduced = useReducedMotion();
  const { level, next, xp, fraction } = progress;
  const pct = Math.round(fraction * 1000) / 10;
  return (
    <Card
      className="grid gap-2"
      data-level={level.level}
      data-xp={xp}
      aria-label={`${label ?? 'Nível'} ${level.level}, ${level.name}: ${xp} XP`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 font-num text-[18px] font-semibold">
          <Award className="size-[18px] text-sunset" aria-hidden="true" />
          {label ? `${label} · ` : ''}Nível {level.level} · {level.name}
        </span>
        <span className="font-num text-[15px] text-ink-2 tabular-nums">
          {next ? `${xp} / ${next.xp} XP` : `${xp} XP`}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Caminho até o próximo nível"
      >
        <div
          className={
            reduced
              ? 'h-full rounded-full bg-sunset'
              : 'h-full rounded-full bg-sunset transition-[width] duration-700 ease-out'
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <small className="text-[14px] text-ink-2">{levelPhrase(progress, who, solo)}</small>
    </Card>
  );
}
