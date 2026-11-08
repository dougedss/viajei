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
  fuel: { label: 'Posto', icon: 'fuel' },
  other: { label: 'Outro', icon: 'map-pin' },
} as const;
export type StopKind = keyof typeof STOP_KINDS;
export const STOP_KIND_KEYS = Object.keys(STOP_KINDS) as StopKind[];

/**
 * Tipos de reserva (o `check` de `reservations.type`), com rótulo e ícone do lucide.
 */
export const RESERVATION_TYPES = {
  hotel: { label: 'Hotel', icon: 'bed-double' },
  ticket: { label: 'Ingresso', icon: 'ticket' },
  restaurant: { label: 'Restaurante', icon: 'utensils-crossed' },
  other: { label: 'Outro', icon: 'bookmark' },
} as const;
export type ReservationType = keyof typeof RESERVATION_TYPES;
export const RESERVATION_TYPE_KEYS = Object.keys(RESERVATION_TYPES) as [
  ReservationType,
  ...ReservationType[],
];

/**
 * As três listas da viagem (o `check` de `checklist_items.kind`): o nome da aba, o nome curto do
 * anel e o slug da URL (`/checklists?aba=`).
 */
export const CHECKLIST_KINDS = {
  before: { label: 'Antes de viajar', short: 'Antes', slug: 'antes' },
  pack: { label: 'Mala', short: 'Mala', slug: 'mala' },
  quest: { label: 'Missões', short: 'Missões', slug: 'missoes' },
} as const;
export type ChecklistKind = keyof typeof CHECKLIST_KINDS;
export const CHECKLIST_KIND_KEYS = Object.keys(CHECKLIST_KINDS) as [
  ChecklistKind,
  ...ChecklistKind[],
];
/** Pontos de uma missão (o `check` do banco aceita de 10 a 30); a pessoa escolhe um destes. */
export const QUEST_POINT_OPTIONS = [10, 20, 30] as const;
export const QUEST_POINTS_DEFAULT = 10;

/**
 * Tipos de contato (o `check` de `contacts.type` e o schema de importação), com o rótulo, o título
 * do grupo na lista e o ícone do lucide.
 */
export const CONTACT_TYPES = {
  hotel: { label: 'Hotel', group: 'Hotéis', icon: 'bed-double' },
  attraction: { label: 'Atração', group: 'Atrações', icon: 'ticket' },
  restaurant: { label: 'Restaurante', group: 'Restaurantes', icon: 'utensils-crossed' },
  emergency: { label: 'Emergência', group: 'Emergência', icon: 'siren' },
  other: { label: 'Outro', group: 'Outros', icon: 'phone' },
} as const;
export type ContactType = keyof typeof CONTACT_TYPES;
export const CONTACT_TYPE_KEYS = Object.keys(CONTACT_TYPES) as [ContactType, ...ContactType[]];

/**
 * Emergência, sempre e sem sinal: constantes, não linhas do banco. Ligar só precisa do número; não
 * há WhatsApp para estes serviços.
 */
export const EMERGENCY_NUMBERS = [
  { number: '192', name: 'SAMU' },
  { number: '193', name: 'Bombeiros' },
  { number: '190', name: 'Polícia Militar' },
  { number: '191', name: 'Polícia Rodoviária Federal' },
] as const;

/** Categorias de gasto (o `check` de `expenses.category`), com rótulo, ícone e cor da barra. */
export const EXPENSE_CATEGORIES = {
  lodging: { label: 'Hospedagem', icon: 'bed-double', color: '#6A62C9' },
  fuel: { label: 'Combustível', icon: 'fuel', color: '#D9922F' },
  food: { label: 'Comida', icon: 'utensils-crossed', color: '#E8653A' },
  attractions: { label: 'Atrações', icon: 'ticket', color: '#1F9A66' },
  other: { label: 'Outro', icon: 'receipt', color: '#5B6474' },
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;
export const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as [
  ExpenseCategory,
  ...ExpenseCategory[],
];

/**
 * Fotos e anexos: os mesmos números dos `check` de `attachments` e do bucket `attachments`. A foto
 * sempre vira JPEG no client (C8); os prints de reserva também.
 */
export const MEDIA = {
  /** limite do bucket e de `attachments.size_bytes` */
  maxBytes: 10 * 1024 * 1024,
  /** fotos de memória por pessoa e parada (limite do client) */
  photosPerStop: 3,
  /** caracteres da memória (`stop_memories.memo`) */
  memoMax: 500,
  /** tipos aceitos pelo bucket */
  mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
} as const;
export type AttachmentMime = (typeof MEDIA.mimes)[number];

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

/**
 * As conquistas da tabela 10.2 (o `check` de `achievements.key`): nome, o que foi feito (`done`, a
 * frase do cartão e do perfil), o ícone do lucide e a cor do selo. As regras de cada uma estão em
 * `features/progression/rules.ts`; a frase do que falta é a do acessório que ela libera.
 */
export const ACHIEVEMENTS = {
  first_stop: {
    name: 'Primeiro pé na estrada',
    done: 'A primeira parada da viagem foi concluída.',
    icon: 'flag',
    color: '#E8653A',
  },
  early_bird: {
    name: 'Madrugador',
    done: 'Um Partiu! antes das 7h.',
    icon: 'sunrise',
    color: '#D9922F',
  },
  on_time_3: {
    name: 'Relógio suíço',
    done: 'Três saídas no horário, seguidas.',
    icon: 'alarm-clock-check',
    color: '#3B8BD6',
  },
  nature_3: {
    name: 'Caçador de cascatas',
    done: 'Três paradas de natureza concluídas.',
    icon: 'waves',
    color: '#4A9A5B',
  },
  winery_2: {
    name: 'Enólogo',
    done: 'Duas vinícolas no mesmo dia.',
    icon: 'grape',
    color: '#8A4F8E',
  },
  offline_hero: {
    name: 'Sem sinal, sem problema',
    done: 'Algo marcado sem sinal chegou ao time.',
    icon: 'signal-zero',
    color: '#5B6474',
  },
  ready_to_go: {
    name: 'Pronto para partir',
    done: 'Antes e Mala completas antes da partida.',
    icon: 'luggage',
    color: '#6A62C9',
  },
  on_budget: {
    name: 'Dentro do orçamento',
    done: 'A viagem terminou dentro do orçamento.',
    icon: 'piggy-bank',
    color: '#1F9A66',
  },
  photographer: {
    name: 'Fotógrafo de estrada',
    done: 'Fotos guardadas em cinco paradas.',
    icon: 'camera',
    color: '#D6567C',
  },
  chronicler: {
    name: 'Cronista',
    done: 'Todas as paradas de um dia avaliadas.',
    icon: 'star',
    color: '#E9A23B',
  },
  trip_done: {
    name: 'Viajei!',
    done: 'Nenhuma parada da viagem ficou para trás.',
    icon: 'party-popper',
    color: '#E8653A',
  },
  team: {
    name: 'Equipe formada',
    done: 'Alguém aceitou o convite para viajar junto.',
    icon: 'users',
    color: '#2F8FC9',
  },
  planner: {
    name: 'Planejador',
    done: 'Um roteiro importado com a IA.',
    icon: 'map',
    color: '#3A8089',
  },
  coast: {
    name: 'Pé na areia',
    done: 'O carro chegou perto do mar.',
    icon: 'umbrella',
    color: '#2E9CB8',
  },
  downhill: {
    name: 'Serra abaixo',
    done: 'Uma descida de 500 m num dia.',
    icon: 'mountain',
    color: '#7A6A58',
  },
} as const;
export type AchievementKey = keyof typeof ACHIEVEMENTS;
export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[];

/**
 * Os cosméticos do carro, todos da tabela 10.2. `type` diz onde o item mora no carro; no teto, o
 * rack é a base (`roof: 'base'`) e mala, prancha e bicicleta ocupam uma faixa do trilho cada
 * (`roof: 'lane'`) e exigem o rack. `hint` é o que falta, em português de gente, e aparece depois
 * do rótulo ("Bicicleta: quando alguém aceitar seu convite"). `short` serve ao rótulo acessível do
 * carro ("Hatch Pôr do sol com rack e bicicleta"). A ordem é a da linha de acessórios da garagem.
 * As chaves antigas (`rack`, `bike`, `board`, `box`) são as que já estão gravadas em
 * `trips.car_accessories`, que não tem `check` de valores: quem lê descarta o que não conhece.
 */
export type CarAccessoryType = 'roof' | 'front' | 'wheels' | 'antenna' | 'plate' | 'sticker';
type CarAccessoryDef = {
  label: string;
  short: string;
  type: CarAccessoryType;
  roof?: 'base' | 'lane';
  achievement: AchievementKey;
  requires: readonly string[];
  hint: string;
};

export const CAR_ACCESSORIES = {
  rack: {
    label: 'Rack de teto',
    short: 'rack',
    type: 'roof',
    roof: 'base',
    achievement: 'first_stop',
    requires: [],
    hint: 'quando o time concluir a primeira parada',
  },
  bike: {
    label: 'Bicicleta',
    short: 'bicicleta',
    type: 'roof',
    roof: 'lane',
    achievement: 'team',
    requires: ['rack'],
    hint: 'quando alguém aceitar seu convite',
  },
  board: {
    label: 'Prancha',
    short: 'prancha',
    type: 'roof',
    roof: 'lane',
    achievement: 'coast',
    requires: ['rack'],
    hint: 'chegando a menos de 3 km do mar',
  },
  box: {
    label: 'Mala de teto',
    short: 'mala de teto',
    type: 'roof',
    roof: 'lane',
    achievement: 'ready_to_go',
    requires: ['rack'],
    hint: 'com as listas Antes e Mala completas antes da partida',
  },
  fog_lights: {
    label: 'Faróis de milha',
    short: 'faróis de milha',
    type: 'front',
    achievement: 'early_bird',
    requires: [],
    hint: 'com um Partiu! antes das 7h',
  },
  hubcaps: {
    label: 'Calotas cromadas',
    short: 'calotas cromadas',
    type: 'wheels',
    achievement: 'on_budget',
    requires: [],
    hint: 'terminando a viagem dentro do orçamento',
  },
  antenna: {
    label: 'Antena com bandeirinha',
    short: 'antena com bandeirinha',
    type: 'antenna',
    achievement: 'offline_hero',
    requires: [],
    hint: 'quando algo marcado sem sinal chegar ao time',
  },
  plate: {
    label: 'Placa com o nome da viagem',
    short: 'placa da viagem',
    type: 'plate',
    achievement: 'trip_done',
    requires: [],
    hint: 'concluindo todas as paradas da viagem',
  },
  sticker_clock: {
    label: 'Adesivo de relógio',
    short: 'adesivo de relógio',
    type: 'sticker',
    achievement: 'on_time_3',
    requires: [],
    hint: 'saindo no horário 3 vezes seguidas',
  },
  sticker_waterfall: {
    label: 'Adesivo de cascata',
    short: 'adesivo de cascata',
    type: 'sticker',
    achievement: 'nature_3',
    requires: [],
    hint: 'concluindo 3 paradas de natureza',
  },
  sticker_grapes: {
    label: 'Adesivo de uva',
    short: 'adesivo de uva',
    type: 'sticker',
    achievement: 'winery_2',
    requires: [],
    hint: 'visitando 2 vinícolas no mesmo dia',
  },
  sticker_camera: {
    label: 'Adesivo de câmera',
    short: 'adesivo de câmera',
    type: 'sticker',
    achievement: 'photographer',
    requires: [],
    hint: 'guardando 5 memórias com foto',
  },
  sticker_star: {
    label: 'Adesivo de estrela',
    short: 'adesivo de estrela',
    type: 'sticker',
    achievement: 'chronicler',
    requires: [],
    hint: 'avaliando todas as paradas de um dia',
  },
  sticker_map: {
    label: 'Adesivo de mapa',
    short: 'adesivo de mapa',
    type: 'sticker',
    achievement: 'planner',
    requires: [],
    hint: 'importando um roteiro com a IA',
  },
  sticker_mountains: {
    label: 'Adesivo de serra',
    short: 'adesivo de serra',
    type: 'sticker',
    achievement: 'downhill',
    requires: [],
    hint: 'descendo 500 m num dia',
  },
} as const satisfies Record<string, CarAccessoryDef>;
export type CarAccessoryKey = keyof typeof CAR_ACCESSORIES;
export const CAR_ACCESSORY_KEYS = Object.keys(CAR_ACCESSORIES) as CarAccessoryKey[];
export function isCarAccessoryKey(value: string): value is CarAccessoryKey {
  return Object.hasOwn(CAR_ACCESSORIES, value);
}
/** Cabem até 3 adesivos, cada um num espaço fixo do modelo, na ordem em que foram escolhidos. */
export const CAR_STICKER_MAX = 3;

export const TRIP_ROLES = ['owner', 'member'] as const;
export type TripRole = (typeof TRIP_ROLES)[number];
export const MEMBER_STATUSES = ['pending', 'accepted'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Os tipos de XP da tabela 10.1 e os pontos de cada um (o `check` de `xp_events.points` espelha esta
 * tabela). A missão vale os pontos do item, de 10 a 30; os outros tipos têm valor fixo.
 */
export const XP_POINTS = {
  stop_done: 10,
  departure_on_time: 15,
  memory_rating: 5,
  memory_photo: 10,
  checklist_item: 2,
  checklist_complete: 20,
  quest_done: { min: 10, max: 30 },
  expense_logged: 2,
  reservation_added: 5,
  trip_completed: 100,
} as const;
export type XpKind = keyof typeof XP_POINTS;
export const XP_KINDS = Object.keys(XP_POINTS) as [XpKind, ...XpKind[]];

/** Os pontos válidos de um evento: o fixo do tipo, ou o intervalo da missão. */
export function isValidXp(kind: XpKind, points: number): boolean {
  const rule = XP_POINTS[kind];
  return typeof rule === 'number' ? points === rule : points >= rule.min && points <= rule.max;
}

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
    description: 'Às 19h da véspera, com o que falta nas listas Antes e Mala',
    on: true,
    phase: 4,
    available: true,
  },
  cancel_deadline: {
    label: 'Prazo de cancelamento',
    description: 'Na véspera do último dia para cancelar sem custo, às 10h',
    on: true,
    phase: 7,
    available: true,
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
    description: 'No dia seguinte ao fim da viagem, às 9h, com o filme',
    on: true,
    phase: 9,
    available: true,
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
/** O tipo já tem dados no servidor (aparece na tela de avisos). Desde a fase 9, todos têm. */
export function isAvailableKind(kind: NotificationKind): boolean {
  return NOTIFICATION_KINDS[kind].available;
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
