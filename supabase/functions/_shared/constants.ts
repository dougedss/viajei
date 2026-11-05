/**
 * Constantes de domínio compartilhadas entre o client (alias @shared) e as Edge Functions (Deno).
 * Os códigos são os mesmos dos `check` do banco; os rótulos em pt-BR vivem só aqui.
 */
export const PERSON_COLORS = {
  sunset: { label: 'Pôr do sol', hex: '#E8653A' },
  sky: { label: 'Céu', hex: '#3B8BD6' },
  leaf: { label: 'Folha', hex: '#3E9D5A' },
  grape: { label: 'Uva', hex: '#6D4BA3' },
  guava: { label: 'Goiaba', hex: '#D6567C' },
  lavender: { label: 'Lavanda', hex: '#8A7FD6' },
  teal: { label: 'Mar', hex: '#2F8F8F' },
  amber: { label: 'Âmbar', hex: '#D9922F' },
} as const;
export type PersonColor = keyof typeof PERSON_COLORS;
export const PERSON_COLOR_KEYS = Object.keys(PERSON_COLORS) as PersonColor[];

export const STOP_KINDS = {
  origin: { label: 'Origem', icon: 'house' },
  transit: { label: 'Deslocamento', icon: 'route' },
  nature: { label: 'Natureza', icon: 'trees' },
  winery: { label: 'Vinícola', icon: 'grape' },
  hotel: { label: 'Hotel', icon: 'bed-double' },
  food: { label: 'Comida', icon: 'utensils-crossed' },
  event: { label: 'Evento', icon: 'star' },
  city: { label: 'Cidade', icon: 'building-2' },
  other: { label: 'Outro', icon: 'map-pin' },
} as const;
export type StopKind = keyof typeof STOP_KINDS;
export const STOP_KIND_KEYS = Object.keys(STOP_KINDS) as StopKind[];

export const CAR_MODELS = {
  hatch: { label: 'Hatch', level: 1 },
  sedan: { label: 'Sedã', level: 2 },
  suv: { label: 'SUV', level: 3 },
  pickup: { label: 'Picape', level: 4 },
  kombi: { label: 'Kombi', level: 5 },
} as const;
export type CarModel = keyof typeof CAR_MODELS;

export const CAR_COLORS = {
  sunset: { label: 'Pôr do sol', hex: '#E96A3B', level: 1 },
  sky: { label: 'Céu', hex: '#3B8BD6', level: 1 },
  leaf: { label: 'Folha', hex: '#3E9D5A', level: 1 },
  grape: { label: 'Uva', hex: '#6D4BA3', level: 1 },
  sand: { label: 'Areia', hex: '#D9C39A', level: 1 },
  mist: { label: 'Névoa', hex: '#C9CED6', level: 1 },
  night: { label: 'Noite', hex: '#1E2433', level: 1 },
  gold: { label: 'Dourado', hex: '#D4A53A', level: 5 },
} as const;
export type CarColor = keyof typeof CAR_COLORS;

export const TRIP_ROLES = ['owner', 'member'] as const;
export type TripRole = (typeof TRIP_ROLES)[number];
export const MEMBER_STATUSES = ['pending', 'accepted'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Níveis de XP: limiar e nome. */
export const LEVELS = [
  { level: 1, xp: 0, name: 'Turista' },
  { level: 2, xp: 150, name: 'Viajante' },
  { level: 3, xp: 400, name: 'Explorador' },
  { level: 4, xp: 900, name: 'Estradeiro' },
  { level: 5, xp: 2000, name: 'Lenda da Estrada' },
] as const;

/** Limites compartilhados com o banco e as Edge Functions. */
export const LIMITS = {
  profileNameMax: 60,
  tripNameMax: 80,
  tripMaxDays: 60,
  passwordMin: 8,
} as const;

/** Origem e deslocamento são nós de saída: "Partiu!" é a ação deles, nunca "Chegamos!". */
export const DEPARTURE_NODE_KINDS: readonly StopKind[] = ['origin', 'transit'];
export function isDepartureKind(kind: string): boolean {
  return (DEPARTURE_NODE_KINDS as readonly string[]).includes(kind);
}

/**
 * Tipos de aviso push. Os códigos são os do `check` de `notifications_sent` e as chaves de
 * `notification_prefs.kinds`; `on` é o padrão da preferência; `available` diz se alguma fase já
 * produz o tipo (os reservados ficam fora da tela de avisos até a fase deles).
 */
export const NOTIFICATION_KINDS = {
  departure_soon: {
    label: 'Sair em N min',
    description: 'Hora de ir, com o tempo de estrada',
    on: true,
    phase: 4,
    available: true,
  },
  departure_now: {
    label: 'Hora de sair',
    description: 'No minuto de partir',
    on: true,
    phase: 4,
    available: true,
  },
  closes_soon: {
    label: 'Parada fechando',
    description: '60 min antes de uma parada fechar',
    on: true,
    phase: 4,
    available: true,
  },
  morning_briefing: {
    label: 'Briefing da manhã',
    description: 'As paradas do dia e a primeira saída',
    on: true,
    phase: 4,
    available: true,
  },
  eve_checklist: {
    label: 'Véspera',
    description: 'Amanhã começa a viagem',
    on: true,
    phase: 4,
    available: true,
  },
  cancel_deadline: {
    label: 'Prazo de cancelamento',
    description: 'Véspera do prazo de uma reserva',
    on: true,
    phase: 7,
    available: false,
  },
  team_arrived: {
    label: 'Time',
    description: 'Quando alguém do time marca Chegamos!',
    on: false,
    phase: 4,
    available: true,
  },
  retro_ready: {
    label: 'Retrospectiva pronta',
    description: 'Quando o filme da viagem está pronto',
    on: true,
    phase: 9,
    available: false,
  },
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;
export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as [
  NotificationKind,
  ...NotificationKind[],
];
export function isNotificationKind(value: string): value is NotificationKind {
  return Object.hasOwn(NOTIFICATION_KINDS, value);
}

/** Padrões de `notification_prefs`, iguais aos defaults das colunas no banco. */
export const NOTIFICATION_DEFAULTS = {
  enabled: true,
  lead_minutes: 15,
  morning_time: '07:00',
  kinds: Object.fromEntries(
    NOTIFICATION_KIND_KEYS.map((k) => [k, NOTIFICATION_KINDS[k].on]),
  ) as Record<NotificationKind, boolean>,
} as const;
/** Antecedências oferecidas na tela de avisos (o banco aceita de 5 a 120). */
export const LEAD_MINUTE_OPTIONS = [5, 10, 15, 30, 60] as const;
/** Formato do payload declarativo (WebKit): o valor mágico que liga a leitura sem JavaScript. */
export const DECLARATIVE_WEB_PUSH = 8030;
