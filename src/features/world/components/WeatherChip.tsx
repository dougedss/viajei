import { motion } from 'motion/react';
import { rangeText } from '@shared/weather.ts';
import { WeatherGlyph } from '@/features/weather/components/WeatherGlyph.tsx';
import type { DaySummary } from '@/features/weather/rules.ts';
import { usePlaceName } from '@/features/weather/usePlaceName.ts';
import { OPENING_TIMELINE } from '../opening.ts';

type Props = {
  summary: DaySummary | null;
  /**
   * `big`: na abertura do dia, sobre a origem, com o nome do lugar, entrando com o carro (o passo
   * `car`, 1,8 s). `small`: na faixa de cima do HUD, onde fica. O palco troca um pelo outro, e o mesmo
   * `layoutId` faz o motion levar o grande até o pequeno.
   */
  size: 'big' | 'small';
  reducedMotion: boolean;
};

/**
 * O chip do clima da maquete: a previsão do dia guardada no aparelho (funciona sem rede), em HTML por
 * cima da cena. Nada do tempo entra no 3D. Com reduzir movimento, aparece pequeno, sem animação.
 */
export function WeatherChip({ summary, size, reducedMotion }: Props) {
  const name = usePlaceName(summary?.start ?? null, null);
  if (!summary) return null;
  const range = rangeText(summary.day);
  // com reduzir movimento, nada voa: sem `layoutId`, a troca é seca
  const layout = reducedMotion ? {} : { layoutId: 'weather-chip' };

  if (size === 'big') {
    // quem o prende à origem é o palco (`useWorldAnchor`), pelo enquadramento atual
    const [carFrom] = OPENING_TIMELINE.car;
    return (
      <motion.span
        {...layout}
        className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-white/15 bg-hud px-3.5 py-2 mv-text-15 font-semibold whitespace-nowrap text-hud-ink shadow-[0_10px_24px_-10px_rgb(0_0_0/0.6)] backdrop-blur-sm"
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: carFrom / 1000, type: 'spring', stiffness: 380, damping: 26 }}
        data-weather-chip="big"
      >
        <WeatherGlyph code={summary.day.code} className="size-5" onDark />
        {name ? <span>{name}</span> : null}
        <span className="num">{range}</span>
      </motion.span>
    );
  }

  return (
    <motion.span
      {...layout}
      initial={false}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-hud px-2.5 mv-text-13 font-semibold text-hud-ink backdrop-blur-sm"
      aria-label={`Previsão do dia: ${range}`}
      data-weather-chip="small"
    >
      <WeatherGlyph code={summary.day.code} className="size-4" onDark />
      <span className="num" aria-hidden="true">
        {range}
      </span>
    </motion.span>
  );
}
