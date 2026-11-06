import { describe, expect, it, vi } from 'vitest';
import { Box3, Group, Vector3 } from 'three/webgpu';
import {
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_COLORS,
  CAR_MODELS,
  type CarAccessoryKey,
  type CarModel,
} from '@shared/constants.ts';
import { buildCar, type CarSpec } from './index.ts';
import { DROP, OUT_MS, PAINT_MS, POP_MS } from './motion.ts';
import { dimensions } from './profile.ts';
import { PROFILES } from './profiles/index.ts';
import type { DebugRig } from './rig.ts';

const MODELS = Object.keys(CAR_MODELS) as CarModel[];

function spec(model: CarModel, accessories: CarAccessoryKey[] = []): CarSpec {
  return { model, color: 'sunset', accessories, plate: 'RS — concurso em Montenegro' };
}

function build(s: CarSpec, wake?: () => void): DebugRig {
  return buildCar(s, wake ? { wake } : {}) as DebugRig;
}

/** Avança as animações do carro como o laço da cena faria, de 16 em 16 ms. */
function run(rig: DebugRig, ms: number, start = 1000): number {
  let t = start;
  let busy = true;
  while (t <= start + ms && busy) {
    busy = rig.update(t);
    t += 16;
  }
  return t;
}

describe.each(MODELS)('o %s montado', (model) => {
  it('constrói sem renderer, olhando para +z, nas medidas do perfil', () => {
    const rig = build(spec(model));
    expect(rig.model).toBe(model);
    const box = new Box3().setFromObject(rig.group);
    const size = box.getSize(new Vector3());
    const d = dimensions(PROFILES[model]);
    // o grupo olha para +z: o comprimento do carro está em z
    expect(size.z).toBeGreaterThan(d.length - 0.05);
    expect(size.z).toBeLessThan(d.length + 0.5);
    expect(size.y).toBeGreaterThan(d.height - 0.05);
    expect(size.y).toBeLessThan(d.height + 0.1);
    expect(size.x).toBeGreaterThan(PROFILES[model].width - 0.05);
    expect(size.x).toBeLessThan(PROFILES[model].width + 0.35);
    expect(box.min.y).toBeGreaterThan(-0.01);
    expect(rig.wheels).toHaveLength(4);
    expect(rig.anchors.lanes).toHaveLength(PROFILES[model].anchors.roof.lanes.length);
    expect(rig.anchors.stickers).toHaveLength(3);
    rig.dispose();
  });

  it('expõe todas as chaves de acessório, uma a uma', () => {
    const rig = build(spec(model));
    for (const key of CAR_ACCESSORY_KEYS) {
      rig.setAccessories([key]);
      expect(rig.debug.visible, key).toContain(key);
      if (CAR_ACCESSORIES[key].type === 'roof') expect(rig.debug.visible).toContain('rack');
    }
    rig.setAccessories([]);
    expect(rig.debug.visible).toEqual([]);
    rig.dispose();
  });

  it('o teto leva só o que cabe nas faixas e no máximo 3 adesivos', () => {
    const rig = build(spec(model, [...CAR_ACCESSORY_KEYS]));
    const lanes = PROFILES[model].anchors.roof.lanes.length;
    const roofItems = rig.debug.visible.filter((k) => ['box', 'board', 'bike'].includes(k));
    expect(roofItems).toHaveLength(lanes);
    expect(rig.debug.visible.filter((k) => k.startsWith('sticker_'))).toHaveLength(3);
    expect(rig.debug.plate).toBe('RS — CONCURSO EM MONTENEGRO');
    rig.dispose();
  });

  it('dispose descarta uma vez só e tira o carro da cena', () => {
    const rig = build(spec(model, ['rack', 'bike', 'sticker_star']));
    const scene = new Group();
    scene.add(rig.group);
    const disposeSpy = vi.spyOn(rig.paint, 'dispose');
    rig.dispose();
    rig.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(rig.debug.resources).toBe(0);
    expect(rig.group.parent).toBeNull();
    // depois de descartado, nada mais muda nem anima
    expect(rig.update(5000)).toBe(false);
  });
});

describe('acessórios encaixando', () => {
  it('a bicicleta desce, assenta aos 300 ms com o encaixe e traz o rack junto', async () => {
    const wake = vi.fn();
    const rig = build(spec('hatch'), wake);
    const onSeat = vi.fn();
    const done = rig.attach('bike', { animate: true, onSeat });
    expect(wake).toHaveBeenCalled();
    expect(rig.debug.visible).toEqual(expect.arrayContaining(['rack', 'bike']));
    expect(rig.update(0)).toBe(true);
    expect(rig.update(DROP.fallMs - 20)).toBe(true);
    expect(onSeat).not.toHaveBeenCalled();
    rig.update(DROP.fallMs + 5);
    expect(onSeat).toHaveBeenCalledTimes(1);
    run(rig, 2000, DROP.fallMs + 20);
    await done;
    expect(rig.update(9000)).toBe(false);
    expect(onSeat).toHaveBeenCalledTimes(1);
    rig.dispose();
  });

  it('sem animação, encaixa na hora e chama o encaixe', async () => {
    const rig = build(spec('suv'));
    const onSeat = vi.fn();
    await rig.attach('sticker_map', { animate: false, onSeat });
    expect(onSeat).toHaveBeenCalledTimes(1);
    expect(rig.update(0)).toBe(false);
    expect(rig.debug.visible).toContain('sticker_map');
    rig.dispose();
  });

  it('adesivos e calotas crescem; tirar o rack leva o que depende dele', async () => {
    const rig = build(spec('kombi', ['rack', 'bike', 'box']));
    const pop = rig.attach('hubcaps', { animate: true });
    run(rig, POP_MS + 100);
    await pop;
    expect(rig.debug.visible).toContain('hubcaps');
    const out = rig.detach('rack', { animate: true });
    expect(rig.update(0)).toBe(true);
    run(rig, OUT_MS + 100);
    await out;
    expect(rig.debug.visible).not.toContain('rack');
    expect(rig.debug.visible).not.toContain('bike');
    expect(rig.debug.visible).not.toContain('box');
    rig.dispose();
  });

  it('quem continua no teto não muda de faixa quando outro sai ou entra', () => {
    const rig = build(spec('kombi', ['bike', 'box', 'board']));
    expect(rig.debug.placement.lanes).toEqual(['bike', 'box', 'board']);
    rig.setAccessories(['box', 'board']);
    expect(rig.debug.placement.lanes).toEqual([null, 'box', 'board']);
    rig.setAccessories(['box', 'board', 'bike']);
    expect(rig.debug.placement.lanes).toEqual(['bike', 'box', 'board']);
    rig.dispose();
  });

  it('a placa troca para o nome da viagem e volta', async () => {
    const rig = build(spec('sedan'));
    expect(rig.debug.plate).toBe('VIAJEI');
    await rig.attach('plate', { animate: false });
    expect(rig.debug.plate).toBe('RS — CONCURSO EM MONTENEGRO');
    rig.setPlate('Serra Gaúcha');
    expect(rig.debug.plate).toBe('SERRA GAÚCHA');
    await rig.detach('plate', { animate: false });
    expect(rig.debug.plate).toBe('VIAJEI');
    rig.dispose();
  });
});

describe('tinta', () => {
  it('troca de cor em 400 ms e para', () => {
    const wake = vi.fn();
    const rig = build(spec('hatch'), wake);
    expect(rig.debug.color).toBe(CAR_COLORS.sunset.hex.toLowerCase());
    rig.setColor('sky', { animate: true });
    expect(wake).toHaveBeenCalled();
    rig.update(0);
    rig.update(PAINT_MS / 2);
    expect(rig.debug.color).not.toBe(CAR_COLORS.sky.hex.toLowerCase());
    expect(rig.update(PAINT_MS + 1)).toBe(false);
    expect(rig.debug.color).toBe(CAR_COLORS.sky.hex.toLowerCase());
    rig.setColor('gold');
    expect(rig.debug.color).toBe(CAR_COLORS.gold.hex.toLowerCase());
    rig.dispose();
  });

  it('faróis, lanternas e faróis de milha acendem à noite', () => {
    const rig = build(spec('pickup', ['fog_lights']));
    rig.setNight(0);
    expect(rig.headMat.emissiveIntensity).toBe(0);
    rig.setNight(1);
    expect(rig.headMat.emissiveIntensity).toBeGreaterThan(2);
    expect(rig.tailMat.emissiveIntensity).toBeGreaterThan(1.5);
    rig.dispose();
  });
});
