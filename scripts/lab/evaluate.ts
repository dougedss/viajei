import type { NotificationKind } from '../../supabase/functions/_shared/constants.ts';
import { weekdayName, type PushPayload } from '../../supabase/functions/_shared/notifications.ts';
import type { LabScenario, LabStatus } from '../../src/features/lab/scenarios.ts';
import { briefingWeatherSchema } from '../../supabase/functions/_shared/briefing-weather.ts';
import { WEATHER_CODES } from '../../supabase/functions/_shared/weather.ts';

/**
 * A parte pura do laboratório: o plano de horários de uma execução e a avaliação do que chegou na
 * caixa de entrada. Os textos esperados são escritos aqui de forma independente (não chamam
 * `notificationText`): assim o laboratório confere ao mesmo tempo os fatos que o SQL calculou e o
 * texto que o TypeScript escreveu.
 */
export const LAB_TZ = 'America/Sao_Paulo';
export const LAB_LEAD_MINUTES = 5;
export const MAX_LATENCY_MS = 90_000;
const MIN = 60_000;

export const TRIP_KEYS = ['departure', 'closes', 'team', 'disabled'] as const;
export type TripKey = (typeof TRIP_KEYS)[number];

export const LAB_STOPS = {
  departure: { name: 'Saída do laboratório', kind: 'origin' },
  closes: { name: 'Parque do laboratório', kind: 'nature' },
  team: { name: 'Vinícola do laboratório', kind: 'winery' },
  disabled: { name: 'Saída desligada', kind: 'origin' },
} as const satisfies Record<TripKey, { name: string; kind: string }>;

/**
 * O destino da viagem de saída, com coordenada: é onde o navegador do laboratório "chega" (a posição
 * simulada) para o catch-up marcar Chegamos!. A origem fica sem coordenada: com um só ponto não há
 * rota a calcular, então o laboratório nunca gasta a cota do OpenRouteService.
 */
export const LAB_DESTINATION = {
  name: 'Mirante do laboratório',
  kind: 'nature',
  latitude: -29.28522,
  longitude: -51.41185,
} as const;

/**
 * O lugar da parada da viagem do briefing (fase 11): com coordenada, a `send-notifications` busca o
 * clima de verdade no Open-Meteo para o aviso da manhã do laboratório, todo dia.
 */
export const LAB_BRIEFING_POINT = { latitude: -29.31295, longitude: -50.85197 } as const;

export const LAB_TRIP_NAMES: Record<TripKey, string> = {
  departure: 'Laboratório · hora de sair',
  closes: 'Laboratório · fechamento e briefing',
  team: 'Laboratório · time',
  disabled: 'Laboratório · avisos desligados',
};

const wallFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: LAB_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Data e hora de parede em São Paulo. */
export function wall(d: Date): { date: string; hhmm: string } {
  const p = Object.fromEntries(wallFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year ?? ''}-${p.month ?? ''}-${p.day ?? ''}`,
    hhmm: `${p.hour ?? ''}:${p.minute ?? ''}`,
  };
}

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN);
export const ceilMinute = (d: Date) => new Date(Math.ceil(d.getTime() / MIN) * MIN);

export type LabPlan = {
  /** o primeiro minuto do cron depois do preparo: quase tudo vence nele */
  tick: Date;
  /** depois do cron de tick + 2 min: hora de avaliar */
  settleAt: Date;
  /** desiste de esperar */
  deadline: Date;
  /** a data de hoje em São Paulo */
  today: string;
  times: {
    /** origem: "sair às" = tick + 2 (o "sair em 5 min" venceu às tick − 3: sai no primeiro cron) */
    departure: string;
    closes: string;
    /** fecha às tick + 59: o aviso de 60 min venceu às tick − 1 */
    closesAt: string;
    /** a hora do briefing desta viagem é o próprio tick */
    morning: string;
    team: string;
    /** origem da viagem com avisos desligados: venceria às tick + 1 */
    disabled: string;
    /** o destino depois da saída (o navegador chega nele pela posição) */
    destination: string;
  };
};

/** O plano a partir de agora, ou o motivo para pular (o dia do teste não pode virar no meio). */
export function planRun(now: Date): LabPlan | { skip: string } {
  const tick = ceilMinute(new Date(now.getTime() + 20_000));
  const today = wall(tick).date;
  if (wall(addMinutes(tick, 60)).date !== today) {
    return { skip: 'Perto da meia-noite em São Paulo: o dia do teste viraria no meio.' };
  }
  const at = (m: number) => wall(addMinutes(tick, m)).hhmm;
  return {
    tick,
    settleAt: new Date(tick.getTime() + 2 * MIN + 20_000),
    deadline: new Date(tick.getTime() + 2 * MIN + 45_000),
    today,
    times: {
      departure: at(2),
      closes: at(30),
      closesAt: at(59),
      morning: at(0),
      team: at(20),
      disabled: at(1),
      destination: at(40),
    },
  };
}

export type Expected = {
  kind: NotificationKind;
  trip: TripKey;
  title: string;
  body: string;
  /** o primeiro cron depois de vencer e de os dados existirem: é dele que se mede o atraso */
  dueAt: Date;
};

const floorMinute = (d: Date) => new Date(Math.floor(d.getTime() / MIN) * MIN);

export function expectedMessages(
  plan: LabPlan,
  ctx: { actorName: string; teamDoneAt: Date; readyAt: Date; briefingFacts?: BriefingFacts },
): Expected[] {
  const { tick, times } = plan;
  // o briefing da manhã ganha a linha do clima quando a função grava o clima (fase 11)
  const briefingLine = ctx.briefingFacts ? briefingWeatherLine(ctx.briefingFacts).line : null;
  // vence em `scheduled`, mas só sai no primeiro cron em que os dados já existiam
  const firstCron = ceilMinute(ctx.readyAt);
  const due = (scheduled: Date) => new Date(Math.max(scheduled.getTime(), firstCron.getTime()));
  const departureBody = `${LAB_STOPS.departure.name} · ${times.departure}`;
  return [
    {
      kind: 'departure_soon',
      trip: 'departure',
      title: `Sair em ${LAB_LEAD_MINUTES} min`,
      body: departureBody,
      dueAt: due(addMinutes(tick, 2 - LAB_LEAD_MINUTES)),
    },
    {
      kind: 'departure_now',
      trip: 'departure',
      title: 'Hora de sair',
      body: departureBody,
      dueAt: due(addMinutes(tick, 2)),
    },
    {
      kind: 'closes_soon',
      trip: 'closes',
      title: `${LAB_STOPS.closes.name} fecha às ${times.closesAt}`,
      body: 'faltam 60 min',
      dueAt: due(addMinutes(tick, -1)),
    },
    {
      kind: 'morning_briefing',
      trip: 'closes',
      title: `Dia 1 de 1 · ${weekdayName(plan.today)}`,
      body: `1 parada · primeira parada às ${times.closes}${briefingLine ? `\n${briefingLine}` : ''}`,
      dueAt: due(tick),
    },
    {
      kind: 'team_arrived',
      trip: 'team',
      title: `${ctx.actorName} chegou`,
      body: `${LAB_STOPS.team.name} · ${wall(ctx.teamDoneAt).hhmm}`,
      // o servidor agenda pelo minuto de synced_at, que é o da marcação
      dueAt: due(floorMinute(ctx.teamDoneAt)),
    },
  ];
}

/** Uma linha de `lab_inbox`, como o PostgREST devolve. */
export type InboxRow = {
  inbox: string;
  gone: boolean;
  status_code: number;
  received_at: string;
  vapid_ok: boolean;
  vapid_error: string | null;
  vapid_sub: string | null;
  vapid_aud: string | null;
  vapid_exp: string | null;
  ttl: number | null;
  urgency: string | null;
  topic: string | null;
  content_encoding: string | null;
  size_bytes: number;
  body_b64: string | null;
};

/** A linha com o payload já decifrado (ou o motivo de não ter decifrado). */
export type Received = InboxRow & {
  payload: PushPayload | null;
  decodeError: string | null;
  /** o JSON exatamente como o servidor mandou, para entregar ao service worker do navegador */
  plaintext?: string;
};

export type Check = {
  scenario: LabScenario;
  status: LabStatus;
  latency_ms: number | null;
  detail: string;
  data: Record<string, unknown>;
};

export type EvalContext = {
  plan: LabPlan;
  trips: Record<TripKey, string>;
  stops: Record<TripKey, string>;
  inboxes: { main: string; gone: string; actor: string };
  appOrigin: string;
  receiverOrigin: string;
  actorName: string;
  teamDoneAt: Date;
  /** quando o preparo terminou: antes disso nenhum cron tinha o que mandar */
  readyAt: Date;
  /** a assinatura que respondeu 410 ganhou failed_at */
  goneFailed: boolean;
  received: Received[];
  /** o clima que a função gravou no briefing (`lab_diagnostics`), para montar o texto esperado */
  briefingFacts?: BriefingFacts;
};

/**
 * O que o servidor diz do clima do briefing do laboratório: `weather` como a `send-notifications`
 * gravou em `notifications_sent.data` (lido pelo `lab_diagnostics`), e se a função publicada já é a
 * que grava o clima (a resposta dela traz o resumo `weather`). Antes da função da fase 11 estar no
 * hospedado (o preview da branch usa as funções da produção), o briefing é conferido sem clima.
 */
export type BriefingFacts = { weather: unknown; functionWrites: boolean };

export function briefingFactsOf(diagnostics: unknown, dayId: string): BriefingFacts {
  const d = (diagnostics ?? {}) as {
    sent?: { kind?: string; ref?: string; weather?: unknown }[];
    http?: { body?: unknown }[];
  };
  const row = (d.sent ?? []).find((x) => x.kind === 'morning_briefing' && x.ref === dayId);
  return {
    weather: row?.weather ?? null,
    functionWrites: (d.http ?? []).some(
      (h) => typeof h.body === 'string' && h.body.includes('"weather"'),
    ),
  };
}

const NO_WEATHER = /^(no_point|no_data|timeout|network|invalid|http_\d{3})$/;

/**
 * A segunda linha do briefing a partir dos fatos, escrita aqui por conta própria (como os outros
 * textos do laboratório): a menor mínima, a maior máxima, a maior chuva (dita a partir de 20%) e o
 * rótulo do código mais grave. Sem clima, null. Devolve também o que estiver errado nos fatos.
 */
export function briefingWeatherLine(facts: BriefingFacts): {
  line: string | null;
  problems: string[];
} {
  if (!facts.functionWrites) return { line: null, problems: [] };
  const parsed = briefingWeatherSchema.safeParse(facts.weather);
  if (!parsed.success) return { line: null, problems: ['a função não gravou o clima do briefing'] };
  const w = parsed.data;
  if (w.status === 'none') {
    return {
      line: null,
      problems: NO_WEATHER.test(w.reason) ? [] : [`motivo sem clima desconhecido: ${w.reason}`],
    };
  }
  const problems: string[] = [];
  if (w.places[0]?.role !== 'start') problems.push('o clima não começa por onde o dia começa');
  for (const p of w.places) {
    if (!(p.min <= p.max) || p.min < -30 || p.max > 50)
      problems.push(`temperaturas ${p.min}/${p.max}`);
    if (p.rain !== null && (p.rain < 0 || p.rain > 100)) problems.push(`chuva ${p.rain}`);
  }
  const min = Math.min(...w.places.map((p) => p.min));
  const max = Math.max(...w.places.map((p) => p.max));
  const rains = w.places.map((p) => p.rain).filter((r): r is number => r !== null);
  const rain = rains.length > 0 ? Math.max(...rains) : null;
  const known = w.places
    .map((p) => p.code)
    .filter((c): c is number => c !== null && Object.hasOwn(WEATHER_CODES, c));
  const worst = known.sort(
    (a, b) => (WEATHER_CODES[b]?.severity ?? 0) - (WEATHER_CODES[a]?.severity ?? 0),
  )[0];
  const deg = (t: number) => `${String(Math.round(t) || 0)}°`;
  const line = [
    worst === undefined ? null : (WEATHER_CODES[worst]?.label ?? null),
    `${deg(min)} a ${deg(max)}`,
    rain !== null && rain >= 20 ? `chuva ${String(Math.round(rain))}%` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(', ');
  return { line, problems };
}

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

const kindOf = (r: Received) => r.payload?.notification.data.kind ?? null;
const tripOf = (r: Received) => r.payload?.notification.data.tripId ?? null;
const at = (r: Received) => Date.parse(r.received_at);

function result(
  scenario: LabScenario,
  problems: string[],
  ok: string,
  extra: Partial<Pick<Check, 'latency_ms' | 'data'>> = {},
): Check {
  return {
    scenario,
    status: problems.length === 0 ? 'pass' : 'fail',
    latency_ms: extra.latency_ms ?? null,
    detail: problems.length === 0 ? ok : problems.join(' · '),
    data: extra.data ?? {},
  };
}

/** Os dez cenários sobre o que chegou. O "preparo" é avaliado por quem executa. */
export function evaluate(ctx: EvalContext): Check[] {
  const { plan, trips, inboxes } = ctx;
  const main = ctx.received.filter((r) => r.inbox === inboxes.main && r.payload);
  const gone = ctx.received.filter((r) => r.inbox === inboxes.gone);
  const actor = ctx.received.filter((r) => r.inbox === inboxes.actor);
  const expected = expectedMessages(plan, ctx);
  const find = (kind: NotificationKind, trip: TripKey) =>
    main.find((r) => kindOf(r) === kind && tripOf(r) === trips[trip]);
  const latencyOf = (e: Expected | undefined, r: Received | undefined) =>
    e && r ? Math.max(0, at(r) - e.dueAt.getTime()) : null;

  // ---------------------------------------------------------------- entrega
  const hits = expected.map((e) => ({ e, r: find(e.kind, e.trip) }));
  const missing = hits.filter((h) => !h.r);
  const latencies = hits.map((h) => latencyOf(h.e, h.r)).filter((x): x is number => x !== null);
  const worst = latencies.length > 0 ? Math.max(...latencies) : null;
  const entrega: Check = result(
    'entrega',
    [
      ...(missing.length > 0 ? [`faltou: ${missing.map((h) => h.e.kind).join(', ')}`] : []),
      ...(worst !== null && worst > MAX_LATENCY_MS ? [`atraso de ${formatMs(worst)}`] : []),
    ],
    `${hits.length} de ${hits.length} avisos chegaram · pior atraso ${formatMs(worst ?? 0)}`,
    {
      latency_ms: worst,
      data: {
        avisos: hits.map((h) => ({
          kind: h.e.kind,
          trip: h.e.trip,
          chegou: h.r !== undefined,
          latency_ms: latencyOf(h.e, h.r),
        })),
      },
    },
  );

  // a comparação de texto, tag e ações de um aviso esperado
  const textProblems = (e: Expected | undefined, r: Received | undefined): string[] => {
    if (!e) return [];
    if (!r?.payload) return [`${e.kind} não chegou`];
    const n = r.payload.notification;
    const out: string[] = [];
    if (n.title !== e.title) out.push(`título "${n.title}" (esperado "${e.title}")`);
    if (n.body !== e.body) out.push(`corpo "${n.body}" (esperado "${e.body}")`);
    return out;
  };
  const exp = (kind: NotificationKind) => expected.find((e) => e.kind === kind);

  // ---------------------------------------------------------------- saida
  const soon = find('departure_soon', 'departure');
  const now = find('departure_now', 'departure');
  const stopTag = `stop:${ctx.stops.departure}`;
  const stopTopic = ctx.stops.departure.replaceAll('-', '');
  const saidaProblems = [
    ...textProblems(exp('departure_soon'), soon),
    ...textProblems(exp('departure_now'), now),
  ];
  for (const r of [soon, now]) {
    if (!r?.payload) continue;
    const k = kindOf(r) ?? '';
    if (r.payload.notification.tag !== stopTag)
      saidaProblems.push(`${k}: tag ${r.payload.notification.tag}`);
    if (r.topic !== stopTopic) saidaProblems.push(`${k}: Topic ${r.topic ?? '(vazio)'}`);
    if (r.payload.notification.app_badge !== '1') saidaProblems.push(`${k}: sem selo "1"`);
    if (
      JSON.stringify(r.payload.actions) !==
      JSON.stringify([{ action: 'departed', title: 'Partiu!' }])
    ) {
      saidaProblems.push(`${k}: ações ${JSON.stringify(r.payload.actions)}`);
    }
    if (r.ttl !== 600) saidaProblems.push(`${k}: TTL ${r.ttl ?? '?'}`);
    if (r.urgency !== 'high') saidaProblems.push(`${k}: Urgency ${r.urgency ?? '?'}`);
  }
  if (soon && now && at(soon) >= at(now))
    saidaProblems.push('"hora de sair" chegou antes do "sair em"');
  const saida = result(
    'saida',
    saidaProblems,
    `"${soon?.payload?.notification.title ?? ''}" e depois "${now?.payload?.notification.title ?? ''}", mesma tag e Topic, Partiu! e selo`,
    { latency_ms: latencyOf(exp('departure_now'), now) },
  );

  // ---------------------------------------------------------------- fechamento
  const closes = find('closes_soon', 'closes');
  const fechamentoProblems = textProblems(exp('closes_soon'), closes);
  if (closes?.payload) {
    if (
      JSON.stringify(closes.payload.actions) !==
      JSON.stringify([{ action: 'arrived', title: 'Chegamos!' }])
    ) {
      fechamentoProblems.push(`ações ${JSON.stringify(closes.payload.actions)}`);
    }
    if (closes.payload.notification.app_badge !== undefined)
      fechamentoProblems.push('selo indevido');
    if (closes.ttl !== 1800) fechamentoProblems.push(`TTL ${closes.ttl ?? '?'}`);
  }
  const fechamento = result(
    'fechamento',
    fechamentoProblems,
    `"${closes?.payload?.notification.title ?? ''}", com Chegamos!`,
    { latency_ms: latencyOf(exp('closes_soon'), closes) },
  );

  // ---------------------------------------------------------------- briefing
  const briefing = find('morning_briefing', 'closes');
  const briefingProblems = textProblems(exp('morning_briefing'), briefing);
  if (briefing?.payload && briefing.payload.actions.length > 0)
    briefingProblems.push('ações indevidas');
  const facts = ctx.briefingFacts ?? { weather: null, functionWrites: false };
  briefingProblems.push(...briefingWeatherLine(facts).problems);
  const recorded = briefingWeatherSchema.safeParse(facts.weather);
  const sky = !facts.functionWrites
    ? ' · a função publicada ainda não grava o clima'
    : recorded.success && recorded.data.status === 'none'
      ? ` · sem clima (${recorded.data.reason})`
      : '';
  const briefingCheck = result(
    'briefing',
    briefingProblems,
    `"${briefing?.payload?.notification.title ?? ''}" · "${(briefing?.payload?.notification.body ?? '').replace('\n', ' / ')}"${sky}`,
    {
      latency_ms: latencyOf(exp('morning_briefing'), briefing),
      data: { clima: facts.weather, funcao_grava_clima: facts.functionWrites },
    },
  );

  // ---------------------------------------------------------------- time
  const team = find('team_arrived', 'team');
  const timeProblems = textProblems(exp('team_arrived'), team);
  if (actor.length > 0) timeProblems.push(`foi também para quem marcou (${actor.length})`);
  const time = result(
    'time',
    timeProblems,
    `"${team?.payload?.notification.title ?? ''}" para quem ligou o aviso; nada para quem marcou`,
    { latency_ms: latencyOf(exp('team_arrived'), team) },
  );

  // ---------------------------------------------------------------- desligado
  const disabled = ctx.received.filter((r) => tripOf(r) === trips.disabled);
  const desligado = result(
    'desligado',
    disabled.length > 0 ? [`${disabled.length} aviso(s) da viagem desligada chegaram`] : [],
    'Nada chegou da viagem com os avisos desligados',
  );

  // ---------------------------------------------------------------- dedupe
  const counts = new Map<string, number>();
  for (const r of [...main, ...gone.filter((g) => g.payload)]) {
    const key = `${r.inbox}|${kindOf(r) ?? ''}|${tripOf(r) ?? ''}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  const unexpected = main.filter(
    (r) => !expected.some((e) => e.kind === kindOf(r) && trips[e.trip] === tripOf(r)),
  );
  const dedupe = result(
    'dedupe',
    [
      ...dups.map(([k, n]) => `${k.split('|')[1] ?? ''} chegou ${n} vezes`),
      ...unexpected.map((r) => `inesperado: ${kindOf(r) ?? '?'}`),
    ],
    `Cada aviso uma vez, em ${main.length} entregas`,
    { data: { entregas: main.length } },
  );

  // ---------------------------------------------------------------- assinatura_morta
  const goneProblems: string[] = [];
  if (gone.length === 0) goneProblems.push('o servidor nunca tentou a assinatura morta');
  if (gone.some((r) => r.status_code !== 410)) goneProblems.push('o receptor não respondeu 410');
  if (!ctx.goneFailed) goneProblems.push('failed_at não foi gravado');
  if (gone.some((r) => kindOf(r) === 'departure_now')) {
    goneProblems.push('continuou recebendo depois do 410');
  }
  const assinaturaMorta = result(
    'assinatura_morta',
    goneProblems,
    `${gone.length} tentativa(s) com 410, failed_at gravado, nada depois`,
    { data: { tentativas: gone.length } },
  );

  // ---------------------------------------------------------------- vapid
  const all = ctx.received;
  const vapidProblems: string[] = [];
  for (const r of all) {
    if (!r.vapid_ok) vapidProblems.push(r.vapid_error ?? 'VAPID recusado');
    else if (r.vapid_aud !== ctx.receiverOrigin) vapidProblems.push(`aud ${r.vapid_aud ?? '?'}`);
  }
  const vapid = result(
    'vapid',
    [...new Set(vapidProblems)],
    // só o tipo do sub: o contato em si não precisa ir para logs nem para o painel
    `${all.length} requisição(ões) com ES256 da nossa chave · sub ${/^[a-z]+:/.exec(all[0]?.vapid_sub ?? '')?.[0] ?? '?'}`,
  );

  // ---------------------------------------------------------------- payload
  const payloadProblems: string[] = [];
  for (const r of ctx.received.filter((x) => x.inbox === inboxes.main)) {
    if (!r.payload) {
      payloadProblems.push(r.decodeError ?? 'não decifrou');
      continue;
    }
    const n = r.payload.notification;
    const want = `${ctx.appOrigin}/viagens/${n.data.tripId ?? ''}/viagem`;
    if (n.navigate !== want) payloadProblems.push(`navigate ${n.navigate}`);
    if (r.content_encoding !== 'aes128gcm')
      payloadProblems.push(`Content-Encoding ${r.content_encoding ?? '?'}`);
    if (r.size_bytes > 4096) payloadProblems.push(`${r.size_bytes} bytes`);
    if (r.status_code !== 201) payloadProblems.push(`receptor respondeu ${r.status_code}`);
  }
  const biggest = Math.max(0, ...ctx.received.map((r) => r.size_bytes));
  const payload = result(
    'payload',
    [...new Set(payloadProblems)],
    `Decifrou tudo · maior mensagem ${biggest} bytes de 4096 · navigate absoluto`,
    { data: { maior_bytes: biggest } },
  );

  return [
    entrega,
    saida,
    fechamento,
    briefingCheck,
    time,
    desligado,
    dedupe,
    assinaturaMorta,
    vapid,
    payload,
  ];
}

/** O resumo de uma execução: verde, ou quais cenários falharam. */
export function summarize(checks: readonly Check[]): { status: LabStatus; summary: string } {
  const failed = checks.filter((c) => c.status === 'fail');
  if (failed.length > 0) {
    return {
      status: 'fail',
      summary: `${failed.length} de ${checks.length} falharam: ${failed.map((c) => c.scenario).join(', ')}`,
    };
  }
  if (checks.every((c) => c.status === 'skip'))
    return { status: 'skip', summary: checks[0]?.detail ?? 'pulado' };
  return {
    status: 'pass',
    summary: `${checks.filter((c) => c.status === 'pass').length} cenários verdes`,
  };
}
