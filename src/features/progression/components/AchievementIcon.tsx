import type { AchievementKey } from '@shared/constants.ts';
import {
  AlarmClockCheck,
  Camera,
  Flag,
  Grape,
  Luggage,
  Map,
  Mountain,
  PartyPopper,
  PiggyBank,
  SignalZero,
  Star,
  Sunrise,
  Umbrella,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';

/** O ícone de cada conquista (o nome está em `ACHIEVEMENTS[key].icon`; aqui, o componente). */
const ACHIEVEMENT_ICONS: Record<AchievementKey, LucideIcon> = {
  first_stop: Flag,
  early_bird: Sunrise,
  on_time_3: AlarmClockCheck,
  nature_3: Waves,
  winery_2: Grape,
  offline_hero: SignalZero,
  ready_to_go: Luggage,
  on_budget: PiggyBank,
  photographer: Camera,
  chronicler: Star,
  trip_done: PartyPopper,
  team: Users,
  planner: Map,
  coast: Umbrella,
  downhill: Mountain,
};

export function AchievementIcon({ name, className }: { name: AchievementKey; className?: string }) {
  const Icon = ACHIEVEMENT_ICONS[name];
  return <Icon className={className} aria-hidden="true" />;
}
