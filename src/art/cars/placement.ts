import {
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  CAR_STICKER_MAX,
  isCarAccessoryKey,
  type CarAccessoryKey,
} from '@shared/constants.ts';
import type { CarProfile } from './profile.ts';

/**
 * Onde cada acessório encaixa num perfil, puro: o rack (que aparece sempre que há algo no teto),
 * o item de cada faixa do trilho, o adesivo de cada espaço e os itens de lugar único. A ordem de
 * `car_accessories` decide: o primeiro item de teto escolhido vai para a faixa mais próxima (a que
 * a vista lateral mostra), o primeiro adesivo para o primeiro espaço. Com o encaixe anterior
 * (`prev`), quem continua fica onde estava e os novos ocupam o que sobrou: nada pula de faixa
 * quando outro item entra ou sai. O que não cabe sobra em `overflow` (dado velho, ou duas colunas
 * gravadas por aparelhos diferentes): a cena desenha o que cabe e as regras da garagem recusam
 * antes de gravar.
 */
export type LaneItem = 'box' | 'board' | 'bike';
export type StickerKey = Extract<CarAccessoryKey, `sticker_${string}`>;

export type Placement = {
  rack: boolean;
  lanes: (LaneItem | null)[];
  /** o adesivo de cada um dos três espaços */
  stickers: (StickerKey | null)[];
  fogLights: boolean;
  hubcaps: boolean;
  antenna: boolean;
  plate: boolean;
  overflow: CarAccessoryKey[];
};

export function isLaneItem(key: string): key is LaneItem {
  return key === 'box' || key === 'board' || key === 'bike';
}

export function isStickerKey(key: string): key is StickerKey {
  return isCarAccessoryKey(key) && CAR_ACCESSORIES[key].type === 'sticker';
}

export const STICKER_KEYS = CAR_ACCESSORY_KEYS.filter(isStickerKey);

/** As chaves conhecidas, sem repetição, na ordem gravada. */
export function knownKeys(keys: readonly string[]): CarAccessoryKey[] {
  const out: CarAccessoryKey[] = [];
  for (const k of keys) if (isCarAccessoryKey(k) && !out.includes(k)) out.push(k);
  return out;
}

export function placeAccessories(
  profile: CarProfile,
  keys: readonly string[],
  prev?: Pick<Placement, 'lanes' | 'stickers'>,
): Placement {
  const known = knownKeys(keys);
  const overflow: CarAccessoryKey[] = [];
  const fill = <T extends CarAccessoryKey>(
    slots: (T | null)[],
    wanted: T[],
    before?: readonly (T | null)[],
  ) => {
    before?.forEach((item, i) => {
      if (item !== null && i < slots.length && wanted.includes(item)) slots[i] = item;
    });
    for (const k of wanted) {
      if (slots.includes(k)) continue;
      const free = slots.indexOf(null);
      if (free >= 0) slots[free] = k;
      else overflow.push(k);
    }
    return slots;
  };
  const lanes = fill<LaneItem>(
    profile.anchors.roof.lanes.map(() => null),
    known.filter(isLaneItem),
    prev?.lanes,
  );
  const stickers = fill<StickerKey>(
    Array.from({ length: CAR_STICKER_MAX }, () => null),
    known.filter(isStickerKey),
    prev?.stickers,
  );
  return {
    rack: known.includes('rack') || lanes.some((l) => l !== null),
    lanes,
    stickers,
    fogLights: known.includes('fog_lights'),
    hubcaps: known.includes('hubcaps'),
    antenna: known.includes('antenna'),
    plate: known.includes('plate'),
    overflow,
  };
}

/** As chaves que a cena desenha, na ordem gravada (o rack entra quando há algo no teto). */
export function placedKeys(placement: Placement, keys: readonly string[]): CarAccessoryKey[] {
  const out = knownKeys(keys).filter((k) => !placement.overflow.includes(k));
  if (placement.rack && !out.includes('rack')) out.unshift('rack');
  return out;
}
