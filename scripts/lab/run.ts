/**
 * `pnpm lab` (produção) · `pnpm lab:local`
 *
 * O laboratório de testes automáticos da tela apagada. Faz o papel de dois aparelhos: entra como os
 * usuários de laboratório, monta quatro viagens de hoje com horários a poucos minutos, assina o push
 * com chaves geradas na hora (endpoints no receptor de mentira), espera o cron de verdade chamar o
 * send-notifications de verdade, decifra o que chegou (RFC 8291) e confere texto, tag, ações, selo,
 * ordem, repetição, VAPID e a assinatura morta. Grava o resultado em lab_runs/lab_checks, que o
 * painel /lab mostra, e sai com código 1 se algo falhou (o GitHub avisa por e-mail).
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NOTIFICATION_KIND_KEYS } from '../../supabase/functions/_shared/constants.ts';
import { pushPayloadSchema } from '../../supabase/functions/_shared/notifications.ts';
import { fromBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { LAB_SCENARIOS, LAB_SCENARIO_KEYS } from '../../src/features/lab/scenarios.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import type { Json } from '../../src/lib/supabase/database.types.ts';
import { must, ok, signIn, syncPush, type Op } from './client.ts';
import {
  closeApp,
  appAvisos,
  appExtras,
  appMaquete,
  appNotificacao,
  appReabrir,
  openApp,
  type App,
} from './app.ts';
import { derivePassword, LAB_USERS, loadConfig, parseTarget, type LabConfig } from './env.ts';
import {
  evaluate,
  formatMs,
  LAB_DESTINATION,
  LAB_LEAD_MINUTES,
  LAB_STOPS,
  LAB_TRIP_NAMES,
  planRun,
  summarize,
  TRIP_KEYS,
  wall,
  type Check,
  type InboxRow,
  type LabPlan,
  type Received,
  type TripKey,
} from './evaluate.ts';
import { roadScenarios, ROAD_SCENARIOS } from './app-road.ts';
import { NOT_ARMED, runArmed } from './armed.ts';
import { prepareRoad } from './road.ts';
import { ensureTeamMember, kindsOnly, log, sleep, type Session } from './session.ts';
import { ensureLocalLab, probeReceiver } from './setup-lib.ts';
import {
  decryptWebPush,
  generateSubscriptionKeys,
  subscriptionJson,
  type SubscriptionKeys,
} from './webpush-decrypt.ts';

function subscriptionJsonFor(endpoint: string, keys: SubscriptionKeys) {
  const json = subscriptionJson(endpoint, keys);
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

type Ids = {
  trips: Record<TripKey, string>;
  days: Record<TripKey, string>;
  stops: Record<TripKey, string>;
  /** o destino depois da saída, na viagem de saída */
  destination: string;
};
type Sub = { id: string; inbox: string; keys: SubscriptionKeys };
type Subs = {
  main: Sub;
  gone: Sub;
  actor: Sub;
  /** a assinatura que o navegador cria pela folha de avisos (sem id: nasce pelo app) */
  app: Omit<Sub, 'id'> | null;
};

const STOP_TIME: Record<TripKey, (p: LabPlan) => string> = {
  departure: (p) => p.times.departure,
  closes: (p) => p.times.closes,
  team: (p) => p.times.team,
  disabled: (p) => p.times.disabled,
};

async function idsFor(aUid: string, today: string): Promise<Ids> {
  const trips = {} as Record<TripKey, string>;
  const days = {} as Record<TripKey, string>;
  const stops = {} as Record<TripKey, string>;
  for (const k of TRIP_KEYS) {
    // viagens fixas (não se acumulam); paradas novas a cada execução (o "time" avisa uma vez por parada)
    trips[k] = await uuidV5(aUid, `lab:${k}`);
    days[k] = await uuidV5(trips[k], today);
    stops[k] = randomUUID();
  }
  return { trips, days, stops, destination: randomUUID() };
}

async function newSub(): Promise<Omit<Sub, 'id'>> {
  return { inbox: randomUUID(), keys: await generateSubscriptionKeys() };
}

async function subscribe(
  s: Session,
  cfg: LabConfig,
  items: { sub: Omit<Sub, 'id'>; gone: boolean }[],
): Promise<Sub[]> {
  const rows = items.map(({ sub, gone }) => {
    const json = subscriptionJson(
      `${cfg.receiverBase}/${sub.inbox}${gone ? '/gone' : ''}`,
      sub.keys,
    );
    return {
      user_id: s.uid,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      platform: 'desktop',
      origin: cfg.appOrigin,
      user_agent: 'viajei-lab/1',
    };
  });
  const inserted = must(
    await s.client.from('push_subscriptions').insert(rows).select('id, endpoint'),
    'assinaturas',
  );
  return items.map(({ sub }) => {
    const row = inserted.find((r) => r.endpoint.includes(sub.inbox));
    if (!row) throw new Error('assinatura não voltou do insert');
    return { ...sub, id: row.id };
  });
}

/** Monta as quatro viagens de hoje, as preferências e as assinaturas, pelas RPCs do app. */
async function prepare(
  cfg: LabConfig,
  a: Session,
  b: Session,
  ids: Ids,
  plan: LabPlan,
  withApp: boolean,
): Promise<{ subs: Subs; teamDoneAt: Date; readyAt: Date; writes: number }> {
  const today = plan.today;
  let writes = 0;
  const push = async (s: Session, ops: Op[]) => {
    await syncPush(s.client, ops);
    writes += ops.length;
  };

  await push(
    a,
    TRIP_KEYS.map((k) => ({
      table: 'trips',
      id: ids.trips[k],
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: LAB_TRIP_NAMES[k],
        start_date: today,
        end_date: today,
        deleted_at: null,
      },
    })),
  );
  await ensureTeamMember(a, b, ids.trips.team);

  // o que sobrou de execuções anteriores: paradas e dias de outras datas
  const tripIds = Object.values(ids.trips);
  const oldStops = must(
    await a.client.from('stops').select('id').in('trip_id', tripIds).is('deleted_at', null),
    'paradas antigas',
  );
  const oldDays = must(
    await a.client
      .from('trip_days')
      .select('id')
      .in('trip_id', tripIds)
      .is('deleted_at', null)
      .neq('date', today),
    'dias antigos',
  );
  const removedAt = new Date().toISOString();
  await push(a, [
    ...oldStops.map((s): Op => ({
      table: 'stops',
      id: s.id,
      op: 'patch',
      values: { deleted_at: removedAt },
    })),
    ...oldDays.map((d): Op => ({
      table: 'trip_days',
      id: d.id,
      op: 'patch',
      values: { deleted_at: removedAt },
    })),
  ]);

  await push(a, [
    ...TRIP_KEYS.map((k): Op => ({
      table: 'trip_days',
      id: ids.days[k],
      op: 'upsert',
      values: { trip_id: ids.trips[k], date: today, title: 'Laboratório', deleted_at: null },
    })),
    ...TRIP_KEYS.map((k): Op => ({
      table: 'stops',
      id: ids.stops[k],
      op: 'upsert',
      values: {
        trip_id: ids.trips[k],
        trip_day_id: ids.days[k],
        position: 'a0',
        kind: LAB_STOPS[k].kind,
        name: LAB_STOPS[k].name,
        time: STOP_TIME[k](plan),
        closes_at: k === 'closes' ? plan.times.closesAt : null,
        travel_minutes_to_next: k === 'departure' ? 30 : null,
        departed_at: null,
        done_at: null,
        done_by: null,
        skipped: false,
        deleted_at: null,
      },
    })),
    {
      table: 'stops',
      id: ids.destination,
      op: 'upsert',
      values: {
        trip_id: ids.trips.departure,
        trip_day_id: ids.days.departure,
        position: 'a1',
        kind: LAB_DESTINATION.kind,
        name: LAB_DESTINATION.name,
        time: plan.times.destination,
        lat: LAB_DESTINATION.latitude,
        lng: LAB_DESTINATION.longitude,
        done_at: null,
        done_by: null,
        departed_at: null,
        skipped: false,
        deleted_at: null,
      },
    },
  ]);

  const prefs: Record<TripKey, Record<string, unknown>> = {
    departure: {
      enabled: true,
      lead_minutes: LAB_LEAD_MINUTES,
      morning_time: '07:00',
      kinds: kindsOnly('departure_soon', 'departure_now'),
    },
    closes: {
      enabled: true,
      lead_minutes: 15,
      morning_time: plan.times.morning,
      kinds: kindsOnly('closes_soon', 'morning_briefing'),
    },
    team: {
      enabled: true,
      lead_minutes: 15,
      morning_time: '07:00',
      kinds: kindsOnly('team_arrived'),
    },
    // o geral desligado vence todos os tipos ligados
    disabled: {
      enabled: false,
      lead_minutes: 15,
      morning_time: '07:00',
      kinds: kindsOnly(...NOTIFICATION_KIND_KEYS),
    },
  };
  await push(
    a,
    await Promise.all(
      TRIP_KEYS.map(async (k): Promise<Op> => ({
        table: 'notification_prefs',
        id: await uuidV5(a.uid, ids.trips[k]),
        op: 'upsert',
        values: { user_id: a.uid, trip_id: ids.trips[k], ...prefs[k] },
      })),
    ),
  );
  await push(b, [
    {
      table: 'notification_prefs',
      id: await uuidV5(b.uid, ids.trips.team),
      op: 'upsert',
      values: {
        user_id: b.uid,
        trip_id: ids.trips.team,
        enabled: true,
        lead_minutes: 15,
        morning_time: '07:00',
        kinds: kindsOnly('team_arrived'),
      },
    },
  ]);

  // assinaturas novas; as de execuções anteriores saem
  ok(
    // as armadas (véspera e prazo) ficam: elas esperam o aviso de amanhã
    await a.client.from('push_subscriptions').delete().eq('user_id', a.uid).or(NOT_ARMED),
    'limpar assinaturas A',
  );
  ok(
    await b.client.from('push_subscriptions').delete().eq('user_id', b.uid),
    'limpar assinaturas B',
  );
  const [main, gone] = await subscribe(a, cfg, [
    { sub: await newSub(), gone: false },
    { sub: await newSub(), gone: true },
  ]);
  const [actor] = await subscribe(b, cfg, [{ sub: await newSub(), gone: false }]);
  if (!main || !gone || !actor) throw new Error('assinaturas incompletas');

  // B marca Chegamos! na vinícola: A, com o aviso do time ligado, deve receber; B não
  const teamDoneAt = new Date();
  await push(b, [
    {
      table: 'stops',
      id: ids.stops.team,
      op: 'patch',
      values: { done_at: teamDoneAt.toISOString(), done_by: b.uid },
    },
  ]);
  const app = withApp ? await newSub() : null;
  return { subs: { main, gone, actor, app }, teamDoneAt, readyAt: new Date(), writes };
}

async function fetchInbox(a: Session, b: Session, subs: Subs): Promise<InboxRow[]> {
  const mine = must(
    await a.client
      .from('lab_inbox')
      .select('*')
      .in('inbox', [subs.main.inbox, subs.gone.inbox, ...(subs.app ? [subs.app.inbox] : [])])
      .order('received_at'),
    'caixa de entrada A',
  );
  const theirs = must(
    await b.client.from('lab_inbox').select('*').eq('inbox', subs.actor.inbox).order('received_at'),
    'caixa de entrada B',
  );
  return [...mine, ...theirs];
}

async function decode(row: InboxRow, keys: SubscriptionKeys | undefined): Promise<Received> {
  if (!row.body_b64 || !keys) {
    return {
      ...row,
      payload: null,
      decodeError: row.body_b64 ? 'assinatura desconhecida' : 'sem corpo',
    };
  }
  try {
    const plaintext = new TextDecoder().decode(
      await decryptWebPush(fromBase64Url(row.body_b64), keys),
    );
    const parsed = pushPayloadSchema.safeParse(JSON.parse(plaintext));
    return parsed.success
      ? { ...row, payload: parsed.data, decodeError: null, plaintext }
      : {
          ...row,
          payload: null,
          decodeError: `payload fora do formato: ${parsed.error.issues[0]?.message ?? ''}`,
        };
  } catch (err) {
    return { ...row, payload: null, decodeError: err instanceof Error ? err.message : String(err) };
  }
}

/** Espera o cron de tick + 2 passar e a caixa de entrada encher (ou o prazo vencer). */
async function waitAndCollect(
  a: Session,
  b: Session,
  subs: Subs,
  plan: LabPlan,
): Promise<Received[]> {
  log(
    `esperando o cron: quase tudo vence às ${wall(plan.tick).hhmm}, o "hora de sair" às ${plan.times.departure}`,
  );
  while (Date.now() < plan.settleAt.getTime()) {
    await sleep(Math.min(15_000, plan.settleAt.getTime() - Date.now()));
  }
  const keys = new Map(
    [subs.main, subs.gone, subs.actor, ...(subs.app ? [subs.app] : [])].map((s) => [
      s.inbox,
      s.keys,
    ]),
  );
  const collect = async () => {
    const rows = await fetchInbox(a, b, subs);
    return Promise.all(rows.map((r) => decode(r, keys.get(r.inbox))));
  };
  // pronto quando a assinatura principal recebeu os cinco e a do app recebeu o "hora de sair"
  const ready = (rs: Received[]) =>
    rs.filter((r) => r.inbox === subs.main.inbox).length >= 5 &&
    (!subs.app ||
      rs.some(
        (r) => r.inbox === subs.app?.inbox && r.payload?.notification.data.kind === 'departure_now',
      ));
  let received = await collect();
  while (!ready(received) && Date.now() < plan.deadline.getTime()) {
    await sleep(3_000);
    received = await collect();
  }
  return received;
}

/** Volta tudo ao repouso: preferências desligadas (nada dispara entre execuções) e assinaturas fora. */
async function finalize(a: Session, b: Session, ids: Ids | null): Promise<void> {
  const step = async (what: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      log(`aviso: ${what}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  if (ids) {
    await step('desligar preferências de A', async () =>
      syncPush(
        a.client,
        await Promise.all(
          TRIP_KEYS.map(async (k): Promise<Op> => ({
            table: 'notification_prefs',
            id: await uuidV5(a.uid, ids.trips[k]),
            op: 'patch',
            values: { enabled: false },
          })),
        ),
      ),
    );
    await step('desligar preferências de B', async () =>
      syncPush(b.client, [
        {
          table: 'notification_prefs',
          id: await uuidV5(b.uid, ids.trips.team),
          op: 'patch',
          values: { enabled: false },
        },
      ]),
    );
  }
  await step('apagar assinaturas', async () => {
    ok(await a.client.from('push_subscriptions').delete().eq('user_id', a.uid).or(NOT_ARMED), 'A');
    ok(await b.client.from('push_subscriptions').delete().eq('user_id', b.uid), 'B');
  });
}

type StopState = { done_at: string | null; departed_at: string | null; done_by: string | null };

/** Espera o servidor mostrar o que o app marcou (o envio da fila é assíncrono). */
async function serverStop(
  a: Session,
  id: string,
  okWhen: (s: StopState) => boolean,
  what: string,
): Promise<void> {
  const end = Date.now() + 20_000;
  for (;;) {
    const rows = must(
      await a.client.from('stops').select('done_at, departed_at, done_by').eq('id', id),
      what,
    );
    if (rows[0] && okWhen(rows[0])) return;
    if (Date.now() > end) throw new Error(`${what} não chegou ao servidor`);
    await sleep(1_000);
  }
}

const APP_SCENARIOS = [
  'app_avisos',
  'app_notificacao',
  'app_reabrir',
  'app_extras',
  'app_maquete',
] as const;
const skipped = (scenario: Check['scenario'], detail: string): Check => ({
  scenario,
  status: 'skip',
  latency_ms: null,
  detail,
  data: {},
});

function commitSha(): string | null {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const ICON = { pass: '✓', fail: '✗', skip: '–' } as const;

async function report(cfg: LabConfig, checks: readonly Check[], status: string, summary: string) {
  console.log(`\nLaboratório · ${cfg.target} · ${summary}`);
  for (const c of checks) {
    const latency = c.latency_ms === null ? '' : ` (${formatMs(c.latency_ms)})`;
    console.log(
      `  ${ICON[c.status]} ${LAB_SCENARIOS[c.scenario].label.padEnd(18)} ${c.detail}${latency}`,
    );
  }
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const head = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  const lines = [
    `## ${head} Laboratório · ${cfg.target}`,
    '',
    summary,
    '',
    '| | Cenário | Atraso | Detalhe |',
    '|---|---|---|---|',
    ...checks.map(
      (c) =>
        `| ${ICON[c.status]} | ${LAB_SCENARIOS[c.scenario].label} | ${c.latency_ms === null ? '' : formatMs(c.latency_ms)} | ${c.detail.replaceAll('|', '/')} |`,
    ),
    '',
  ];
  await appendFile(file, lines.join('\n'));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const target = parseTarget(argv);
  // o navegador roda contra o app publicado; no local, só com --app (precisa do pnpm preview)
  const withApp = target === 'production' ? !argv.includes('--sem-app') : argv.includes('--app');
  const cfg = await loadConfig(target);
  if (target === 'local') for (const l of await ensureLocalLab(cfg)) log(l);
  await probeReceiver(cfg);

  const runId = randomUUID();
  const startedAt = new Date();
  const a = await signIn(cfg, LAB_USERS.a);
  const b = await signIn(cfg, LAB_USERS.b);
  log(`entrou como ${LAB_USERS.a.email} e ${LAB_USERS.b.email} em ${cfg.url}`);

  const checks: Check[] = [];
  let ids: Ids | null = null;
  let app: App | null = null;
  // os avisos de dois dias primeiro: conferir o que a execução anterior armou e armar o próximo
  const armed = await runArmed(cfg, a);
  checks.push(...armed.checks);
  log(`armados: ${armed.checks.map((c) => `${c.scenario} ${c.status}`).join(', ')}`);
  const pending = (keys: readonly Check['scenario'][]) =>
    keys.filter((k) => !checks.some((c) => c.scenario === k));
  const planned = planRun(new Date());
  try {
    if ('skip' in planned) {
      checks.push(
        ...pending(LAB_SCENARIO_KEYS).map((scenario) => ({
          scenario,
          status: 'skip' as const,
          latency_ms: null,
          detail: planned.skip,
          data: {},
        })),
      );
    } else {
      const plan = planned;
      ids = await idsFor(a.uid, plan.today);
      const t0 = Date.now();
      let prepared: Awaited<ReturnType<typeof prepare>> | null = null;
      try {
        prepared = await prepare(cfg, a, b, ids, plan, withApp);
        const ms = Date.now() - t0;
        checks.push({
          scenario: 'preparo',
          status: 'pass',
          latency_ms: ms,
          detail: `${prepared.writes} escritas pelo sync_push, convite e assinaturas em ${formatMs(ms)}`,
          data: { writes: prepared.writes, slow: Date.now() > plan.tick.getTime() - 1000 },
        });
        log(`preparo pronto em ${formatMs(ms)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        checks.push({
          scenario: 'preparo',
          status: 'fail',
          latency_ms: null,
          detail: message.slice(0, 900),
          data: {},
        });
        checks.push(
          ...pending(LAB_SCENARIO_KEYS.filter((s) => s !== 'preparo')).map((scenario) => ({
            scenario,
            status: 'skip' as const,
            latency_ms: null,
            detail: 'O preparo falhou.',
            data: {},
          })),
        );
      }
      if (prepared) {
        const subs = prepared.subs;
        const tripIds = ids;
        const appChecks: Check[] = [];
        if (subs.app) {
          // o navegador entra antes do "hora de sair" (tick + 2) para a assinatura dele já existir
          app = await openApp({
            appUrl: cfg.appOrigin,
            email: LAB_USERS.a.email,
            password: await derivePassword(cfg.secret, LAB_USERS.a.email),
            tripId: tripIds.trips.departure,
            originName: LAB_STOPS.departure.name,
            destinationName: LAB_DESTINATION.name,
            departureTime: plan.times.departure,
            destination: {
              latitude: LAB_DESTINATION.latitude,
              longitude: LAB_DESTINATION.longitude,
            },
            subscription: subscriptionJsonFor(
              `${cfg.receiverBase}/${subs.app.inbox}`,
              subs.app.keys,
            ),
            artifactsDir: join(process.cwd(), 'lab-artifacts'),
          });
          appChecks.push(await appAvisos(app));
          log(
            `app: ${appChecks[0]?.status === 'pass' ? 'avisos ativados pelo navegador' : (appChecks[0]?.detail ?? '')}`,
          );
        }
        // um aviso armado que vencer no meio desta execução não é desta execução
        const received = (await waitAndCollect(a, b, subs, plan)).filter(
          (r) => !armed.tripIds.has(r.payload?.notification.data.tripId ?? ''),
        );
        const after = must(
          await a.client
            .from('push_subscriptions')
            .select('id, failed_at')
            .eq('id', prepared.subs.gone.id),
          'assinatura morta',
        );
        checks.push(
          ...evaluate({
            plan,
            trips: ids.trips,
            stops: ids.stops,
            inboxes: {
              main: prepared.subs.main.inbox,
              gone: prepared.subs.gone.inbox,
              actor: prepared.subs.actor.inbox,
            },
            appOrigin: cfg.appOrigin,
            receiverOrigin: cfg.receiverOrigin,
            actorName: LAB_USERS.b.name,
            teamDoneAt: prepared.teamDoneAt,
            readyAt: prepared.readyAt,
            goneFailed: after[0]?.failed_at != null,
            received,
          }),
        );

        if (app && appChecks[0]?.status === 'pass') {
          const departureNow = received.find(
            (r) =>
              r.inbox === subs.app?.inbox && r.payload?.notification.data.kind === 'departure_now',
          );
          const origin = tripIds.stops.departure;
          const notificacao = await appNotificacao(
            app,
            departureNow?.plaintext ?? null,
            `stop:${origin}`,
            () =>
              serverStop(
                a,
                origin,
                (s) => s.departed_at !== null && s.done_at !== null && s.done_by === a.uid,
                'a saída marcada pela notificação',
              ),
          );
          appChecks.push(notificacao);
          appChecks.push(
            notificacao.status === 'pass'
              ? await appReabrir(app, () =>
                  serverStop(
                    a,
                    tripIds.destination,
                    (s) => s.done_at !== null && s.done_by === a.uid,
                    'a chegada marcada pela posição',
                  ),
                )
              : skipped('app_reabrir', 'Depende do Partiu! na notificação.'),
          );
          appChecks.push(await appExtras(app));
          appChecks.push(await appMaquete(app));
          log(`app: ${appChecks.map((c) => `${c.scenario} ${c.status}`).join(', ')}`);
        } else if (app) {
          appChecks.push(
            ...APP_SCENARIOS.slice(1).map((s) => skipped(s, 'Depende de ativar os avisos no app.')),
          );
        } else {
          appChecks.push(...APP_SCENARIOS.map((s) => skipped(s, 'Sem navegador nesta execução.')));
        }
        // o roteiro das fases 7 e 8: as viagens "listas" e "estrada" e os dois aparelhos
        if (app) {
          try {
            const road = await prepareRoad(a, b, plan);
            log('preparo das listas e da estrada pronto');
            appChecks.push(
              ...(await roadScenarios({
                app,
                a,
                road,
                peer: {
                  email: LAB_USERS.b.email,
                  password: await derivePassword(cfg.secret, LAB_USERS.b.email),
                },
              })),
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const [first, ...rest] = ROAD_SCENARIOS;
            appChecks.push(
              {
                scenario: first,
                status: 'fail',
                latency_ms: null,
                detail: `Preparo das listas e da estrada: ${message}`.slice(0, 900),
                data: {},
              },
              ...rest.map((s) => skipped(s, 'O preparo das listas e da estrada falhou.')),
            );
          }
          log(
            `roteiro: ${appChecks
              .slice(-ROAD_SCENARIOS.length)
              .map((c) => `${c.scenario} ${c.status}`)
              .join(', ')}`,
          );
        } else {
          appChecks.push(...ROAD_SCENARIOS.map((s) => skipped(s, 'Sem navegador nesta execução.')));
        }
        checks.push(...appChecks);
      }
    }
  } finally {
    if (app) await closeApp(app);
    await finalize(a, b, ids);
  }

  const { status, summary } = summarize(checks);
  const diagnostics = await a.client.rpc('lab_diagnostics', {
    p_since: new Date(startedAt.getTime() - 60_000).toISOString(),
  });
  const finishedAt = new Date();
  ok(
    await a.client.from('lab_runs').insert({
      id: runId,
      target,
      source: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
      commit_sha: commitSha(),
      status,
      summary: summary.slice(0, 500),
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      diagnostics: (diagnostics.data ?? {
        erro: diagnostics.error?.message ?? null,
      }) as NonNullable<Json>,
    }),
    'gravar a execução',
  );
  ok(
    await a.client.from('lab_checks').insert(
      checks.map((c) => ({
        run_id: runId,
        scenario: c.scenario,
        status: c.status,
        latency_ms: c.latency_ms,
        detail: c.detail.slice(0, 1000),
        data: c.data as NonNullable<Json>,
      })),
    ),
    'gravar os cenários',
  );
  await report(cfg, checks, status, summary);
  return status === 'fail' ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (err) {
  console.error(`[lab] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
