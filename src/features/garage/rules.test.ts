import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_KEYS,
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_COLORS,
  CAR_MODELS,
  type AchievementKey,
  type CarAccessoryKey,
  type CarColor,
  type CarModel,
} from '@shared/constants.ts';
import type { CarSpec } from '@/art/cars/types.ts';
import {
  combineTeam,
  FULL_PROGRESS,
  NO_PROGRESS,
  type TeamProgress,
} from '@/features/progression/team.ts';
import {
  accessoryHint,
  accessoryState,
  colorState,
  decide,
  droppedMessage,
  fitToModel,
  lockedHints,
  modelHint,
  modelState,
  normalizeCar,
  patchFor,
  toggleAccessory,
} from './rules.ts';

const car = (over: Partial<CarSpec> = {}): CarSpec => ({
  model: 'hatch',
  color: 'sunset',
  accessories: [],
  plate: 'Serra Gaúcha',
  ...over,
});

const team = (level: number, achievements: AchievementKey[] = []): TeamProgress =>
  combineTeam([{ level, achievements }]);

describe('disponibilidade por nível', () => {
  it('cada modelo libera no nível dele; o hatch é livre', () => {
    const trip = car();
    for (const m of Object.keys(CAR_MODELS) as CarModel[]) {
      const need = CAR_MODELS[m].level;
      expect(modelState(m, team(need), trip).status).toBe('available');
      if (need > 1) {
        expect(modelState(m, team(need - 1), trip)).toEqual({
          status: 'locked',
          need: { level: need },
          hint: modelHint(m),
        });
      }
    }
  });

  it('o dourado só no nível 5; as outras sete cores livres', () => {
    const trip = car();
    for (const c of Object.keys(CAR_COLORS) as CarColor[]) {
      const state = colorState(c, NO_PROGRESS, trip);
      expect(state.status).toBe(c === 'gold' ? 'locked' : 'available');
    }
    expect(colorState('gold', team(4), trip).status).toBe('locked');
    expect(colorState('gold', team(5), trip).status).toBe('available');
    const gold = colorState('gold', NO_PROGRESS, trip);
    expect(gold.status === 'locked' && gold.hint).toBe('Dourado: no nível 5 (Lenda da Estrada)');
  });

  it('acessórios liberam pela conquista do item', () => {
    const trip = car();
    for (const k of CAR_ACCESSORY_KEYS) {
      const achievement = CAR_ACCESSORIES[k].achievement;
      expect(accessoryState(k, NO_PROGRESS, trip).status).toBe('locked');
      expect(accessoryState(k, team(1, [achievement]), trip).status).toBe('available');
    }
  });
});

describe('o time conquista junto', () => {
  it('vale o maior nível e a união das conquistas dos membros', () => {
    const t = combineTeam([
      { level: 2, achievements: ['first_stop'] },
      { level: 4, achievements: ['team', 'coast'] },
      { level: 1, achievements: ['first_stop'] },
    ]);
    expect(t.level).toBe(4);
    expect([...t.achievements].sort()).toEqual(['coast', 'first_stop', 'team']);
    expect(modelState('pickup', t, car()).status).toBe('available');
    expect(modelState('kombi', t, car()).status).toBe('locked');
    expect(accessoryState('board', t, car()).status).toBe('available');
  });

  it('sem membros, nível 1; o nível fica entre 1 e 5', () => {
    expect(combineTeam([])).toBe(NO_PROGRESS);
    expect(combineTeam([{ level: 9, achievements: [] }]).level).toBe(5);
    expect(FULL_PROGRESS.achievements.size).toBe(ACHIEVEMENT_KEYS.length);
  });
});

describe('o que falta, em português de gente', () => {
  it('as frases do prompt e uma por item', () => {
    expect(accessoryHint('bike')).toBe('Bicicleta: quando alguém aceitar seu convite');
    expect(accessoryHint('board')).toBe('Prancha: chegando a menos de 3 km do mar');
    expect(modelHint('sedan')).toBe('Sedã: no nível 2 (Viajante)');
    const hints = CAR_ACCESSORY_KEYS.map(accessoryHint);
    expect(new Set(hints).size).toBe(hints.length);
    for (const h of hints) {
      expect(h).toMatch(/^[A-ZÁ-Ú][^:]+: [a-z]/);
      // sem jargão de jogo
      expect(h).not.toMatch(/XP|desbloque|conquista|achievement|level/i);
    }
  });
});

describe('estrutura do carro', () => {
  it('ligar um item de teto liga o rack; desligar o rack leva o que depende dele', () => {
    const on = toggleAccessory(car(), 'bike');
    expect('car' in on && on.car.accessories).toEqual(['rack', 'bike']);
    const withBoard = toggleAccessory(car({ accessories: ['rack', 'bike'] }), 'board');
    expect('car' in withBoard && withBoard.car.accessories).toEqual(['rack', 'bike', 'board']);
    const off = toggleAccessory(car({ accessories: ['rack', 'bike', 'board', 'antenna'] }), 'rack');
    expect('car' in off && off.car.accessories).toEqual(['antenna']);
    const offBike = toggleAccessory(car({ accessories: ['rack', 'bike'] }), 'bike');
    expect('car' in offBike && offBike.car.accessories).toEqual(['rack']);
  });

  it('o teto tem as faixas do modelo: o hatch leva 2, a kombi 3', () => {
    const full = car({ accessories: ['rack', 'bike', 'board'] });
    const refused = toggleAccessory(full, 'box');
    expect(refused).toEqual({
      refuse: 'No teto do Hatch cabem 2 itens: tire a bicicleta ou a prancha para pôr a mala.',
    });
    const kombi = toggleAccessory({ ...full, model: 'kombi' }, 'box');
    expect('car' in kombi && kombi.car.accessories).toEqual(['rack', 'bike', 'board', 'box']);
  });

  it('no máximo 3 adesivos', () => {
    const three: CarAccessoryKey[] = ['sticker_clock', 'sticker_star', 'sticker_map'];
    expect(toggleAccessory(car({ accessories: three }), 'sticker_grapes')).toEqual({
      refuse: 'Cabem 3 adesivos: tire um para pôr este.',
    });
    const two = toggleAccessory(car({ accessories: three.slice(0, 2) }), 'sticker_grapes');
    expect('car' in two && two.car.accessories).toHaveLength(3);
  });

  it('trocar de modelo reencaixa o teto e avisa o que saiu', () => {
    const kombi = car({ model: 'kombi', accessories: ['rack', 'bike', 'board', 'box'] });
    const { car: hatch, dropped } = fitToModel(kombi, 'hatch');
    expect(hatch.model).toBe('hatch');
    expect(hatch.accessories).toEqual(['rack', 'bike', 'board']);
    expect(dropped).toEqual(['box']);
    expect(droppedMessage(dropped, 'hatch')).toBe('A mala saiu: no teto do Hatch cabem 2 itens.');
    expect(fitToModel(car({ accessories: ['rack', 'bike'] }), 'suv').dropped).toEqual([]);
  });
});

describe('normalizeCar: dado velho nunca quebra a cena', () => {
  const trip = (over: Record<string, unknown>) => ({
    name: 'Serra',
    car_model: 'hatch',
    car_color: 'sunset',
    car_accessories: [] as string[],
    ...over,
  });

  it('modelo e cor inválidos voltam ao hatch Pôr do sol; chaves desconhecidas saem', () => {
    const n = normalizeCar(
      trip({ car_model: 'limousine', car_color: 'pink', car_accessories: ['turbo', 'antenna'] }),
    );
    expect(n).toEqual({
      model: 'hatch',
      color: 'sunset',
      accessories: ['antenna'],
      plate: 'Serra',
    });
  });

  it('item de teto sem rack ganha o rack; o que passa das faixas e dos 3 adesivos sai', () => {
    const n = normalizeCar(
      trip({
        car_accessories: [
          'bike',
          'board',
          'box',
          'bike',
          'sticker_clock',
          'sticker_star',
          'sticker_map',
          'sticker_grapes',
        ],
      }),
    );
    expect(n.accessories).toEqual([
      'rack',
      'bike',
      'board',
      'sticker_clock',
      'sticker_star',
      'sticker_map',
    ]);
  });
});

describe('a decisão de um toque', () => {
  it('liberado grava só a coluna tocada', () => {
    const trip = car();
    const out = decide(trip, trip, { kind: 'color', color: 'sky' }, NO_PROGRESS);
    expect(out).toEqual({
      kind: 'trip',
      car: { ...trip, color: 'sky' },
      patch: { car_color: 'sky' },
      dropped: [],
    });
    expect(patchFor(trip, trip)).toEqual({});
  });

  it('bloqueado vira prévia com a frase do que falta, e a prévia nunca tem o que gravar', () => {
    const trip = car();
    const out = decide(trip, trip, { kind: 'model', model: 'suv' }, NO_PROGRESS);
    expect(out.kind).toBe('preview');
    expect(out.kind === 'preview' && out.hints).toEqual(['SUV: no nível 3 (Explorador)']);
    expect('patch' in out).toBe(false);
    // na prévia, mais coisas bloqueadas se somam; nada se grava
    const shown = out.kind === 'preview' ? out.car : trip;
    const more = decide(trip, shown, { kind: 'accessory', key: 'bike' }, NO_PROGRESS);
    expect(more.kind === 'preview' && more.hints).toEqual([
      'SUV: no nível 3 (Explorador)',
      'Rack de teto: quando o time concluir a primeira parada',
      'Bicicleta: quando alguém aceitar seu convite',
    ]);
  });

  it('tirar o que estava bloqueado volta ao carro da viagem e grava o que se vê', () => {
    const trip = car();
    const preview = decide(trip, trip, { kind: 'model', model: 'suv' }, NO_PROGRESS);
    const shown = preview.kind === 'preview' ? preview.car : trip;
    const colored = decide(trip, shown, { kind: 'color', color: 'leaf' }, NO_PROGRESS);
    expect(colored.kind).toBe('preview');
    const back = decide(
      trip,
      colored.kind === 'preview' ? colored.car : trip,
      { kind: 'model', model: 'hatch' },
      NO_PROGRESS,
    );
    expect(back).toEqual({
      kind: 'trip',
      car: { ...trip, color: 'leaf' },
      patch: { car_color: 'leaf' },
      dropped: [],
    });
  });

  it('nada desbloqueado é retirado: o que a viagem usa continua; trocado, só volta com o progresso', () => {
    const trip = car({ model: 'suv', accessories: ['rack', 'bike'] });
    expect(modelState('suv', NO_PROGRESS, trip).status).toBe('kept');
    expect(accessoryState('bike', NO_PROGRESS, trip).status).toBe('kept');
    expect(lockedHints(trip, trip, NO_PROGRESS)).toEqual([]);
    // mudar a cor de um carro mantido grava normalmente
    const color = decide(trip, trip, { kind: 'color', color: 'sky' }, NO_PROGRESS);
    expect(color.kind).toBe('trip');
    // trocado pelo hatch, o SUV deixa de estar na viagem e volta a ser bloqueado
    const hatch = decide(trip, trip, { kind: 'model', model: 'hatch' }, NO_PROGRESS);
    expect(hatch.kind).toBe('trip');
    const after = hatch.kind === 'trip' ? hatch.car : trip;
    expect(modelState('suv', NO_PROGRESS, after).status).toBe('locked');
  });

  it('não cabe: recusa sem prévia e sem gravar', () => {
    const trip = car({ accessories: ['rack', 'bike', 'board'] });
    const out = decide(trip, trip, { kind: 'accessory', key: 'box' }, FULL_PROGRESS);
    expect(out.kind).toBe('refuse');
  });
});
