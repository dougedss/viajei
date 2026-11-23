import { describe, expect, it } from 'vitest';
import { driveKey, type DriveTime } from '@shared/drive-schema.ts';
import type { LngLat } from '@shared/geo.ts';
import type { Place } from '@shared/places-schema.ts';
import type { PlanWrite } from '@shared/plan-protocol.ts';
import type { Outing, PlanStep } from '@shared/plan-search-protocol.ts';
import { reviewOf } from '@/features/import/plan.ts';
import { setStopIncluded } from '@/features/import/review-edit.ts';
import { assemble } from './assemble.ts';
import {
  destinationIsStop,
  measureStage,
  neededPairs,
  optionDrive,
  picksOf,
  prepare,
  setDwell,
  stageAccount,
  stageFromOuting,
  summaryOf,
  toggleChoice,
  type FlowDeps,
  type MapStage,
} from './flow.ts';
import { startText, totalText } from './outing-time.ts';
import { reschedule, unmeasuredLegs } from './reschedule.ts';

/**
 * A regressão do teste do Douglas de 22/11/2026 (a viagem 0ee5b4f4 na produção): "ir buscar sushi em
 * Canoinhas e voltar para casa", querendo estar no Sushi Yume às 18:00, saindo de Major Vieira. O app
 * respondeu "4 h 10: 1 h 25 de estrada e 2 h 45 nos lugares, chegada em casa às 22:10" nas opções e, na
 * revisão, Saída 17:15 → Canoinhas 17:40 → Sushi 19:15 → Chegada 20:55. Nada disso foi dito por ele:
 *
 * - os 40 min de estrada eram a linha reta (21,66 km × 1,3, a 35 e a 55 km/h); a estrada leva uns 25;
 * - "Canoinhas" entrou como parada marcada, de 1 h 30, antes do sushi (D304);
 * - "buscar" valeu 1 h 15, como um jantar;
 * - as 18:00 viraram "à noite", e a conta saiu de casa às 18:00.
 *
 * O que tem de sair: sem a parada "Canoinhas"; a estrada medida (25 min cada trecho); 15 min no lugar;
 * a saída às 17:35 para estar lá às 18:00; em casa por volta das 18:40. E nenhum tempo de chute: sem
 * a medição, não há conta.
 */
const HOME: LngLat = [-50.33, -26.37];
const ORIGIN = { label: 'Major Vieira, SC', at: HOME };
const SUSHI: Place = {
  id: 'g-sushi-yume',
  name: 'SUSHI YUME | RESTAURANTE DE SUSHI EM CANOINHAS',
  lat: -26.1825104,
  lng: -50.3889548,
  categories: ['restaurant'],
  city: 'Canoinhas',
  address: 'R. Barão do Rio Branco, 1217, Canoinhas - SC',
  opening_hours: null,
  website: null,
  osm: null,
  distance_m: null,
  provider: 'google',
  google_place_id: 'ChIJ-teste',
  hours: [{ day: 1, open: '18:00', close: '23:00' }],
};
const SUSHI_AT: LngLat = [SUSHI.lng, SUSHI.lat];
/** O que a estrada leva de verdade: uns 25 min cada trecho (o Google mede em segundos). */
const GO = 1480;
const BACK = 1510;

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
  ordem: 1,
  o_que: 'buscar sushi',
  relacao: 'na_cidade',
  cidade: 'Canoinhas',
  hora_do_dia: 'noite',
  candidatos: ['p1'],
  achou: true,
  fora_da_cidade: false,
  buscado: true,
  centro: { lat: -26.177, lng: -50.39 },
  busca: { palavras: 'sushi', tipo_google: '', aberto_agora: false, nota_minima: 0 },
  descartados: 0,
  hora: '18:00',
  permanencia_min: 15,
  ...over,
});
const outing = (over: Partial<Outing> = {}): Outing => ({
  passos: [step()],
  pendentes: [],
  perguntas: [],
  // a IA disse o destino (foi o que aconteceu em 22/11): quem decide se ele vira parada é o app
  destino: 'Canoinhas',
  destino_centro: { lat: -26.177, lng: -50.39 },
  origem: '',
  tempo_min: 0,
  saida: '',
  ...over,
});
const staged = (passeio: Outing = outing()): MapStage =>
  stageFromOuting({ lugares: [{ ref: 'p1', place: SUSHI }], passeio }, ORIGIN, HOME).stage;
const measured = (stage: MapStage): MapStage => ({
  ...stage,
  drive: { [driveKey(HOME, SUSHI_AT)]: GO, [driveKey(SUSHI_AT, HOME)]: BACK },
});
/** A hora de sair que a tela das opções supõe para "à noite" (o começo da janela), sem dia. */
const TIME = { start: '18:00', date: null };

const deps = (over: Partial<FlowDeps> = {}): FlowDeps => ({
  findPlaces: () => Promise.resolve([]),
  geocode: () => Promise.resolve([]),
  searchNear: () => Promise.resolve([]),
  // a rota traçada diz outro tempo (40 min): o que vale nos horários é o medido pelo Google
  route: (waypoints) =>
    Promise.resolve({
      geometry: waypoints,
      legs: waypoints.slice(1).map(() => ({ distance_m: 26_000, duration_s: 2400 })),
    }),
  drive: (pairs) =>
    Promise.resolve(
      pairs.map(([from]): DriveTime => ({
        duration_s: from[0] === HOME[0] && from[1] === HOME[1] ? GO : BACK,
        distance_m: 26_000,
      })),
    ),
  ...over,
});

const WRITE: PlanWrite = {
  trip: { name: 'Sushi em Canoinhas', start_date: '2026-11-23', end_date: '2026-11-23' },
  // a IA escreveu 17:15 em 22/11: a hora dita pela pessoa vale acima dela
  days: [
    {
      date: '2026-11-23',
      title: 'Noite de sushi',
      start: '17:15',
      stops: [{ ref: 'e1', note: null }],
    },
  ],
  suggestions: [],
  quests: [],
  checklist_before: [],
  checklist_pack: [],
};

describe('"buscar sushi em Canoinhas e voltar para casa, estar lá às 18:00" (o teste de 22/11/2026)', () => {
  it('a cidade onde o lugar fica não vira parada: o passeio é o sushi, e nada mais', () => {
    const stage = staged();
    // a hora exata dita aparece no passo, e a hora de sair dita não existe
    expect(stage.groups[0]?.step?.hora).toBe('18:00');
    expect(stage.groups[0]?.step?.permanencia).toBe(15);
    expect(stage.departure ?? null).toBeNull();
    const chosen = toggleChoice(stage, SUSHI.id);
    expect(destinationIsStop(chosen)).toBe(false);
    expect(picksOf(chosen).map((p) => [p.place.name, p.kind])).toEqual([[SUSHI.name, 'food']]);
    // o resumo não diz "destino: Canoinhas", e "Traçar o caminho" conta um lugar
    expect(summaryOf(chosen)).toMatchObject({ chosen: 1, destination: null });
    // o lugar leva o que a pessoa disse: 15 min ("buscar") e a hora de estar lá
    expect(picksOf(chosen)[0]).toMatchObject({ dwell: 15, atTime: '18:00' });
  });

  it('a cidade de destino continua parada quando nenhum lugar escolhido fica nela ("vou pra Joinville")', () => {
    const passeio = outing({
      passos: [step({ relacao: 'no_caminho', cidade: '', hora: '', permanencia_min: 0 })],
      destino: 'Joinville',
      destino_centro: { lat: -26.3045, lng: -48.8487 },
    });
    // o lugar do caminho fica em Canoinhas, não em Joinville
    const chosen = toggleChoice(staged(passeio), SUSHI.id);
    expect(destinationIsStop(chosen)).toBe(true);
    expect(picksOf(chosen).map((p) => [p.place.name, p.kind])).toEqual([
      [SUSHI.name, 'food'],
      ['Joinville', 'city'],
    ]);
    expect(summaryOf(chosen).destination).toBe('Joinville');
  });

  it('sem a estrada medida não há conta: nenhum total de chute', () => {
    const chosen = toggleChoice(staged(), SUSHI.id);
    expect(stageAccount(chosen, TIME)).toBeNull();
    // o cartão também fica sem tempo (a tela mostra a distância em linha reta)
    const option = chosen.groups[0]?.options[0];
    expect(option && optionDrive(chosen, option)).toEqual({
      minutes: null,
      fromPrevious: null,
      detour: null,
    });
    // o que a tela pede à medição: a ida e a volta
    const keys = neededPairs(chosen).map(([a, b]) => driveKey(a, b));
    expect(keys).toEqual(
      expect.arrayContaining([driveKey(HOME, SUSHI_AT), driveKey(SUSHI_AT, HOME)]),
    );
  });

  it('com a estrada medida: 50 min de estrada, 15 no lugar, saída às 17:35 para estar lá às 18:00, casa às 18:40', () => {
    const chosen = measured(toggleChoice(staged(), SUSHI.id));
    const acc = stageAccount(chosen, TIME);
    expect(acc).toMatchObject({
      road: 50,
      dwell: 15,
      wait: 0,
      total: 65,
      start: '17:35',
      back: '18:40',
      anchor: { name: SUSHI.name, at: '18:00' },
    });
    expect(acc?.arrivals.map((a) => [a.at, a.late, a.outsideWindow])).toEqual([
      ['18:00', null, null],
    ]);
    expect(acc && totalText(acc)).toBe(
      'O passeio dá cerca de 1 h 05: 50 min de estrada e 15 min nos lugares',
    );
    expect(acc && startText(acc)).toBe(`Saída às 17:35, para estar em ${SUSHI.name} às 18:00`);
    // o cartão diz o tempo medido: "cerca de 25 min de carro", não os 40 da linha reta
    const option = chosen.groups[0]?.options[0];
    expect(option && optionDrive(chosen, option).minutes).toBe(25);
  });

  it('o tempo no lugar que a pessoa muda na tela vale acima do que o pedido disse', () => {
    const chosen = setDwell(measured(toggleChoice(staged(), SUSHI.id)), SUSHI.id, 60);
    expect(picksOf(chosen)[0]?.dwell).toBe(60);
    expect(stageAccount(chosen, TIME)).toMatchObject({
      dwell: 60,
      total: 110,
      start: '17:35',
      back: '19:25',
    });
  });

  it('sem hora dita nem tempo dito, o app supõe e diz: o padrão do tipo e a hora de sair da tela', () => {
    const passeio = outing({ passos: [step({ hora: '', permanencia_min: 0 })] });
    const chosen = measured(toggleChoice(staged(passeio), SUSHI.id));
    // o lugar não leva tempo dito: a tela mostra "1 h 15 · o app supôs", com "mudar"
    expect(picksOf(chosen)[0]?.dwell).toBeUndefined();
    expect(stageAccount(chosen, TIME)).toMatchObject({
      dwell: 75,
      start: '18:00',
      anchor: null,
      back: '20:05',
    });
  });

  it('a hora de sair dita fica: chegar antes da hora de estar lá é esperar por ela', () => {
    const chosen = measured(toggleChoice(staged(outing({ saida: '17:00' })), SUSHI.id));
    expect(chosen.departure).toBe('17:00');
    const acc = stageAccount(chosen, TIME);
    expect(acc).toMatchObject({ start: '17:00', anchor: null, wait: 35, back: '18:40' });
    expect(acc?.arrivals[0]).toMatchObject({ at: '17:25', early: 35, late: null });
  });

  it('na saída de hoje não se sai antes de agora: a hora dita que já não dá vira o aviso de atraso', () => {
    const chosen = measured(toggleChoice(staged(), SUSHI.id));
    // são 17:50: saindo agora, chega às 18:15
    const acc = stageAccount(chosen, { start: '17:50', date: null, earliest: true });
    expect(acc).toMatchObject({ start: '17:50', anchor: null });
    expect(acc?.arrivals[0]?.late).toBe('Chega às 18:15, e vocês queriam às 18:00');
    // ainda dá: a saída espera a hora certa
    const early = stageAccount(chosen, { start: '16:00', date: null, earliest: true });
    expect(early).toMatchObject({ start: '17:35', anchor: { at: '18:00' } });
  });

  it('a medição entra na tabela da tela; sem resposta, a tela guarda por quê e não mostra tempo', async () => {
    const chosen = toggleChoice(staged(), SUSHI.id);
    const ok = await measureStage(chosen, deps());
    expect(ok.driveStatus ?? null).toBeNull();
    expect(stageAccount(ok, TIME)).toMatchObject({ total: 65, start: '17:35' });
    // medido uma vez: a segunda volta não pede nada
    let asked = 0;
    const again = await measureStage(
      ok,
      deps({
        drive: () => {
          asked += 1;
          return Promise.resolve([]);
        },
      }),
    );
    expect(asked).toBe(0);
    expect(again).toBe(ok);
    const off = await measureStage(
      chosen,
      deps({ drive: () => Promise.reject(Object.assign(new Error('x'), { code: 'no_source' })) }),
    );
    expect(off.driveStatus).toBe('no_source');
    expect(stageAccount(off, TIME)).toBeNull();
  });

  it('o roteiro montado: Saída 17:35, Sushi 18:00, Chegada 18:40, com o tempo medido e sem a parada da cidade', async () => {
    const chosen = measured(toggleChoice(staged(), SUSHI.id));
    const prepared = await prepare(chosen, { interests: [], learned: [] }, deps());
    // a escrita recebe o tempo medido (25 min), não o da rota traçada (40) nem a linha reta
    expect(prepared.places.chosen.map((c) => [c.name, c.kind, c.minutes])).toEqual([
      [SUSHI.name, 'food', 25],
    ]);
    expect(prepared.places.home_minutes).toBe(25);
    const built = assemble({
      origin: chosen.origin,
      chosen: prepared.picks,
      chosenFractions: prepared.chosenFractions,
      suggestions: prepared.suggestions,
      nights: [],
      ...(prepared.drive ? { drive: prepared.drive } : {}),
      saidStart: chosen.departure ?? null,
      write: WRITE,
      firstDate: '2026-11-23',
      defaultStart: '08:00',
    });
    expect(
      built.data.days[0]?.stops.map((s) => [s.name, s.time, s.travel_minutes_to_next]),
    ).toEqual([
      ['Saída de Major Vieira, SC', '17:35', 25],
      [SUSHI.name, '18:00', 25],
      ['Chegada em Major Vieira, SC', '18:40', null],
    ]);
    expect(built.schedule.fixed).toEqual({ d0s1: '18:00' });
    expect(built.schedule.dwell).toEqual({ d0s1: 15 });
  });

  it('desmarcar uma parada na revisão refaz os horários; o trecho novo espera a medição, sem chute', async () => {
    // "vou pra Joinville" com o sushi no caminho: a saída, o sushi, Joinville (a cidade), a chegada
    const passeio = outing({
      passos: [step({ relacao: 'no_caminho', cidade: '', hora: '', permanencia_min: 0 })],
      destino: 'Joinville',
      destino_centro: { lat: -26.3045, lng: -48.8487 },
    });
    const chosen = toggleChoice(staged(passeio), SUSHI.id);
    const JOINVILLE: LngLat = [-48.8487, -26.3045];
    const seconds = new Map([
      [driveKey(HOME, SUSHI_AT), 1500],
      [driveKey(SUSHI_AT, JOINVILLE), 6000],
      [driveKey(JOINVILLE, HOME), 7200],
    ]);
    const prepared = await prepare(
      chosen,
      { interests: [], learned: [] },
      deps({
        route: () => Promise.resolve(null),
        drive: (pairs) =>
          Promise.resolve(
            pairs.map(([a, b]): DriveTime | null => {
              const s = seconds.get(driveKey(a, b));
              return s === undefined ? null : { duration_s: s, distance_m: 1 };
            }),
          ),
      }),
    );
    const built = assemble({
      origin: chosen.origin,
      chosen: prepared.picks,
      chosenFractions: prepared.chosenFractions,
      suggestions: prepared.suggestions,
      nights: [],
      ...(prepared.drive ? { drive: prepared.drive } : {}),
      write: { ...WRITE, days: [{ date: '2026-11-23', title: null, start: '08:00', stops: [] }] },
      firstDate: '2026-11-23',
      defaultStart: '08:00',
    });
    const times = (stops: readonly { name: string; time: string | null }[]) =>
      stops.map((s) => [s.name, s.time]);
    // 08:00 → +25 → 08:25 sushi (1 h 15) → +100 → 11:20 Joinville (1 h 30) → +120 → 14:50
    expect(times(built.data.days[0]?.stops ?? [])).toEqual([
      ['Saída de Major Vieira, SC', '08:00'],
      [SUSHI.name, '08:25'],
      ['Joinville', '11:20'],
      ['Chegada em Major Vieira, SC', '14:50'],
    ]);
    const review = reviewOf(built.data, {
      trip: { id: 'nova', start_date: '2026-11-23', end_date: '2026-11-23' },
      days: [],
      stops: [],
      reservations: [],
      contacts: [],
      items: [],
    });
    // a pessoa desmarca Joinville: o dia é refeito, e o trecho sushi → casa ainda não foi medido
    const without = reschedule(
      setStopIncluded(review, 'd0s2', false),
      built.schedule,
      '2026-11-23',
    );
    expect(times(without.days[0]?.stops ?? [])).toEqual([
      ['Saída de Major Vieira, SC', '08:00'],
      [SUSHI.name, '08:25'],
      ['Joinville', null],
      // sem a medida do trecho novo, a chegada fica sem hora: nunca a hora de quando Joinville existia
      ['Chegada em Major Vieira, SC', null],
    ]);
    expect(unmeasuredLegs(without, built.schedule).map((l) => driveKey(...l.pair))).toEqual([
      driveKey(SUSHI_AT, HOME),
    ]);
    // a tela mede o trecho e refaz: 08:25 + 1 h 15 + 25 min
    const schedule = {
      ...built.schedule,
      drive: { ...built.schedule.drive, [driveKey(SUSHI_AT, HOME)]: 1500 },
    };
    const done = reschedule(without, schedule, '2026-11-23');
    expect(times(done.days[0]?.stops ?? []).at(-1)).toEqual([
      'Chegada em Major Vieira, SC',
      '10:05',
    ]);
    expect(unmeasuredLegs(done, schedule)).toEqual([]);
  });
});
