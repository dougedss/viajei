import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { weatherCode, type WeatherIcon } from '@shared/weather.ts';
import { cx } from '@/lib/cx.ts';

const ICONS: Record<WeatherIcon, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  'cloud-sun': CloudSun,
  'cloud-moon': CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  hail: CloudHail,
};

/** As cores pelos tokens: o sol no âmbar, a chuva no azul, a trovoada no roxo, o resto na tinta. */
const TONE: Record<WeatherIcon, string> = {
  sun: 'text-person-amber',
  moon: 'text-ink-2',
  'cloud-sun': 'text-person-amber',
  'cloud-moon': 'text-ink-2',
  cloud: 'text-ink-2',
  fog: 'text-ink-2',
  drizzle: 'text-person-sky',
  rain: 'text-person-sky',
  snow: 'text-person-sky',
  storm: 'text-person-grape',
  hail: 'text-person-grape',
};

type Props = {
  code: number | null;
  isDay?: boolean;
  className?: string;
  /** sobre fundo escuro (o HUD da maquete): a tinta clara em vez das cores */
  onDark?: boolean;
};

/** O ícone do tempo de um código WMO, com o rótulo para leitor de tela. */
export function WeatherGlyph({ code, isDay = true, className, onDark = false }: Props) {
  const info = weatherCode(code, isDay);
  const Icon = ICONS[info.icon];
  return (
    <Icon
      role="img"
      aria-label={info.label}
      className={cx('shrink-0', onDark ? 'text-hud-ink' : TONE[info.icon], className)}
    />
  );
}
