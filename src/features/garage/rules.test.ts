import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_KEYS,
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_COLORS,
  CAR_FINISHES,
  CAR_MODELS,
  CAR_WHEELS,
  type AchievementKey,
  type CarAccessoryKey,
  type CarColor,
  type CarFinish,
  type CarModel,
  type CarWheels,
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
  carOf,
  colorState,
  decide,
  decideAll,
  droppedMessage,
  finishHint,
  finishState,
  fitToModel,
  keptNames,
  lockedHints,
  modelState,
  normalizeCar,
  patchFor,
  toggleAccessory,
  wheelsHint,
  wheelsState,
} from './rules.ts';

const car = (over: Partial<CarSpec> = {}): CarSpec => ({
  model: 'hatch',
  color: 'sunset',
  finish: 'solid',
  wheels: 'classic',
  accessories: [],
  plate: 'Serra Gaúcha',
  ...over,
});

/** O progresso de uma pessoa (fase 16: quem libera o carro é ela). */
const me = (level: number, achievements: AchievementKey[] = []): TeamProgress =>
  combineTeam([{ level, achievements }]);

describe('a escada nova (fase 16)', () => {
  it('os cinco modelos são livres desde o nível 1: escolha o seu carro', () => {
    for (const m of Object.keys(CAR_MODELS) as CarModel[]) {
      expect(CAR_MODELS[m].level).toBe(1);
      expect(modelState(m, NO_PROGRESS, car()).status).toBe('available');
    }
  });

  it('o dourado só no nível 5; as outras sete cores livres', () => {
    const mine = car();
    for (const c of Object.keys(CAR_COLORS) as CarColor[]) {
      const state = colorState(c, NO_PROGRESS, mine);
      expect(state.status).toBe(c === 'gold' ? 'locked' : 'available');
    }
    expect(colorState('gold', me(4), mine).status).toBe('locked');
    expect(colorState('gold', me(5), mine).status).toBe('available');
    const gold = colorState('gold', NO_PROGRESS, mine);
    expect(gold.status === 'locked' && gold.hint).toBe('Dourado: no nível 5 (Lenda da Estrada)');
  });

  it('cada nível libera um acabamento e um estilo de roda; o nível 1 tem a lisa e a clássica', () => {
    const levels = { solid: 1, metallic: 2, pearl: 3, matte: 4 } as const;
    for (const f of Object.keys(CAR_FINISHES) as CarFinish[]) {
      expect(CAR_FINISHES[f].level).toBe(levels[f]);
      expect(finishState(f, me(levels[f]), car()).status).toBe('available');
      if (levels[f] > 1) {
        expect(finishState(f, me(levels[f] - 1), car())).toEqual({
          status: 'locked',
          need: { level: levels[f] },
          hint: finishHint(f),
        });
      }
    }
    const wheels = { classic: 1, five: 2, wire: 3, steel: 4 } as const;
    for (const w of Object.keys(CAR_WHEELS) as CarWheels[]) {
      expect(CAR_WHEELS[w].level).toBe(wheels[w]);
      expect(wheelsState(w, me(wheels[w]), car()).status).toBe('available');
      if (wheels[w] > 1) expect(wheelsState(w, me(wheels[w] - 1), car()).status).toBe('locked');
    }
    expect(finishHint('pearl')).toBe('Tinta perolada: no nível 3 (Explorador)');
    expect(wheelsHint('steel')).toBe('Roda de aço: no nível 4 (Estradeiro)');
    expect(wheelsHint('five')).toBe('Roda de cinco raios: no nível 2 (Viajante)');
  });

  it('acessórios liberam pela conquista do item', () => {
    const mine = car();
    for (const k of CAR_ACCESSORY_KEYS) {
      const achievement = CAR_ACCESSORIES[k].achievement;
      expect(accessoryState(k, NO_PROGRESS, mine).status).toBe('locked');
      expect(accessoryState(k, me(1, [achievement]), mine).status).toBe('available');
    }
  });
});

describe('o progresso que libera é o da pessoa', () => {
  it('um membro de nível alto não libera nada no carro de outro: cada um pelo próprio', () => {
    // o time (a barra da viagem) continua sendo o maior nível e a união das conquistas
    const t = combineTeam([
      { level: 2, achievements: ['first_stop'] },
      { level: 4, achievements: ['team', 'coast'] },
    ]);
    expect(t.level).toBe(4);
    // mas a garagem de quem está no nível 2 usa o progresso dele
    const mine = me(2, ['first_stop']);
    expect(finishState('matte', mine, car()).status).toBe('locked');
    expect(accessoryState('board', mine, car()).status).toBe('locked');
    expect(finishState('metallic', mine, car()).status).toBe('available');
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

describe('normalizeCar: dado velho nunca quebra a cena (agora sobre o perfil)', () => {
  const profile = (over: Record<string, unknown>) => ({
    car_model: 'hatch',
    car_color: 'sunset',
    car_accessories: [] as string[],
    ...over,
  });

  it('modelo e cor inválidos voltam ao hatch Pôr do sol; chaves desconhecidas saem', () => {
    const n = normalizeCar(
      profile({ car_model: 'limousine', car_color: 'pink', car_accessories: ['turbo', 'antenna'] }),
      'Serra',
    );
    expect(n).toEqual({
      model: 'hatch',
      color: 'sunset',
      finish: 'solid',
      wheels: 'classic',
      accessories: ['antenna'],
      plate: 'Serra',
    });
  });

  it('item de teto sem rack ganha o rack; o que passa das faixas e dos 3 adesivos sai', () => {
    const n = normalizeCar(
      profile({
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
      'Serra',
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

  it('o perfil que ainda não chegou, ou puxado antes da 0014, vale o carro padrão', () => {
    const padrao = {
      model: 'hatch',
      color: 'sunset',
      finish: 'solid',
      wheels: 'classic',
      accessories: [],
      plate: 'Ana',
    };
    expect(normalizeCar(undefined, 'Ana')).toEqual(padrao);
    expect(normalizeCar(null, 'Ana')).toEqual(padrao);
    expect(normalizeCar({}, 'Ana')).toEqual(padrao);
    expect(carOf({ car_model: 'suv', car_color: 'sky' }, null)).toEqual({
      model: 'suv',
      color: 'sky',
      finish: 'solid',
      wheels: 'classic',
      accessories: [],
      plate: null,
    });
    // acabamento e roda desconhecidos (um aparelho de uma versão futura) voltam aos de sempre
    expect(normalizeCar({ car_finish: 'cromado', car_wheels: 'aro 22' }, null)).toMatchObject({
      finish: 'solid',
      wheels: 'classic',
    });
    expect(normalizeCar({ car_finish: 'pearl', car_wheels: 'wire' }, null)).toMatchObject({
      finish: 'pearl',
      wheels: 'wire',
    });
  });
});

describe('a decisão de um toque', () => {
  it('liberado grava só a coluna tocada', () => {
    const mine = car();
    const out = decide(mine, mine, { kind: 'color', color: 'sky' }, NO_PROGRESS);
    expect(out).toEqual({
      kind: 'save',
      car: { ...mine, color: 'sky' },
      patch: { car_color: 'sky' },
      dropped: [],
      swapped: null,
    });
    expect(patchFor(mine, mine)).toEqual({});
    const wheels = decide(mine, mine, { kind: 'wheels', wheels: 'five' }, me(2));
    expect(wheels.kind === 'save' && wheels.patch).toEqual({ car_wheels: 'five' });
    const finish = decide(mine, mine, { kind: 'finish', finish: 'metallic' }, me(2));
    expect(finish.kind === 'save' && finish.patch).toEqual({ car_finish: 'metallic' });
  });

  it('trocar de modelo é livre e grava; o que falta, só para o que vai no carro', () => {
    const mine = car();
    const kombi = decide(mine, mine, { kind: 'model', model: 'kombi' }, NO_PROGRESS);
    expect(kombi.kind === 'save' && kombi.patch).toEqual({ car_model: 'kombi' });
  });

  it('bloqueado vira prévia com a frase do que falta, e a prévia nunca tem o que gravar', () => {
    const mine = car();
    const out = decide(mine, mine, { kind: 'finish', finish: 'pearl' }, NO_PROGRESS);
    expect(out.kind).toBe('preview');
    expect(out.kind === 'preview' && out.hints).toEqual([
      'Tinta perolada: no nível 3 (Explorador)',
    ]);
    expect('patch' in out).toBe(false);
    // na prévia, mais coisas bloqueadas se somam; nada se grava
    const shown = out.kind === 'preview' ? out.car : mine;
    const more = decide(mine, shown, { kind: 'accessory', key: 'bike' }, NO_PROGRESS);
    expect(more.kind === 'preview' && more.hints).toEqual([
      'Tinta perolada: no nível 3 (Explorador)',
      'Rack de teto: quando o time concluir a primeira parada',
      'Bicicleta: quando alguém aceitar seu convite',
    ]);
  });

  it('tirar o que estava bloqueado volta ao carro gravado e grava o que se vê', () => {
    const mine = car();
    const preview = decide(mine, mine, { kind: 'wheels', wheels: 'steel' }, NO_PROGRESS);
    const shown = preview.kind === 'preview' ? preview.car : mine;
    const colored = decide(mine, shown, { kind: 'color', color: 'leaf' }, NO_PROGRESS);
    expect(colored.kind).toBe('preview');
    const back = decide(
      mine,
      colored.kind === 'preview' ? colored.car : mine,
      { kind: 'wheels', wheels: 'classic' },
      NO_PROGRESS,
    );
    expect(back).toEqual({
      kind: 'save',
      car: { ...mine, color: 'leaf' },
      patch: { car_color: 'leaf' },
      dropped: [],
      swapped: null,
    });
  });

  it('nada liberado é retirado: o que o carro usa continua; trocado, só volta com o progresso', () => {
    // a cópia da 0014: o dourado metálico com a bicicleta, de quando o nível era o do time
    const mine = car({ color: 'gold', finish: 'metallic', accessories: ['rack', 'bike'] });
    expect(colorState('gold', NO_PROGRESS, mine).status).toBe('kept');
    expect(finishState('metallic', NO_PROGRESS, mine).status).toBe('kept');
    expect(accessoryState('bike', NO_PROGRESS, mine).status).toBe('kept');
    expect(lockedHints(mine, mine, NO_PROGRESS)).toEqual([]);
    expect(keptNames(mine, NO_PROGRESS)).toEqual([
      'dourado',
      'tinta metálica',
      'rack de teto',
      'bicicleta',
    ]);
    // mudar o modelo de um carro com o que foi mantido grava normalmente
    const suv = decide(mine, mine, { kind: 'model', model: 'suv' }, NO_PROGRESS);
    expect(suv.kind).toBe('save');
    // trocada pela lisa, a metálica deixa de estar no carro e volta a ser bloqueada
    const solid = decide(mine, mine, { kind: 'finish', finish: 'solid' }, NO_PROGRESS);
    expect(solid.kind).toBe('save');
    const after = solid.kind === 'save' ? solid.car : mine;
    expect(finishState('metallic', NO_PROGRESS, after).status).toBe('locked');
    expect(keptNames(car(), NO_PROGRESS)).toEqual([]);
  });

  it('as calotas cobrem o aro: uma roda tira as calotas, e as calotas voltam a roda à clássica', () => {
    const progress = me(4, ['on_budget']);
    const capped = car({ accessories: ['hubcaps'] });
    const five = decide(capped, capped, { kind: 'wheels', wheels: 'five' }, progress);
    expect(five).toMatchObject({
      kind: 'save',
      car: { wheels: 'five', accessories: [] },
      patch: { car_wheels: 'five', car_accessories: [] },
      swapped: 'As calotas saíram: elas cobrem o aro.',
    });
    const steel = car({ wheels: 'steel' });
    const caps = decide(steel, steel, { kind: 'accessory', key: 'hubcaps' }, progress);
    expect(caps).toMatchObject({
      kind: 'save',
      car: { wheels: 'classic', accessories: ['hubcaps'] },
      swapped: 'A roda voltou à clássica: as calotas cobrem o aro.',
    });
    // a clássica com as calotas não troca nada
    const plain = decide(car(), car(), { kind: 'accessory', key: 'hubcaps' }, progress);
    expect(plain.kind === 'save' && plain.swapped).toBeNull();
  });

  it('vários toques como um só (o cartão do nível novo): param no primeiro que não grava', () => {
    const mine = car();
    const both = decideAll(
      mine,
      [
        { kind: 'finish', finish: 'metallic' },
        { kind: 'wheels', wheels: 'five' },
      ],
      me(2),
    );
    expect(both).toMatchObject({
      kind: 'save',
      patch: { car_finish: 'metallic', car_wheels: 'five' },
    });
    const early = decideAll(mine, [{ kind: 'finish', finish: 'pearl' }], me(2));
    expect(early?.kind).toBe('preview');
    expect(decideAll(mine, [], me(2))).toBeNull();
  });

  it('não cabe: recusa sem prévia e sem gravar', () => {
    const mine = car({ accessories: ['rack', 'bike', 'board'] });
    const out = decide(mine, mine, { kind: 'accessory', key: 'box' }, FULL_PROGRESS);
    expect(out.kind).toBe('refuse');
  });
});
