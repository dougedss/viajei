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
