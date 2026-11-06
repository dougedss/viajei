/**
 * As poses das animações dos acessórios, puras (tempo em ms → transformação):
 * - `drop`: o item de teto cai de 0,9 acima do encaixe, acelerando, assenta aos 300 ms com um leve
 *   achatamento e volta ao normal com mola até 600 ms;
 * - `pop`: adesivos, calotas, faróis de milha, antena e placa crescem de 0 com um leve exagero e
 *   assentam quando passam do tamanho final pela primeira vez;
 * - `out`: sobe 0,5 e encolhe em 250 ms.
 * O som de encaixe e a vibração entram em `seated`.
 */
export const DROP = { height: 0.9, fallMs: 300, settleMs: 300 } as const;
export const POP_MS = 420;
export const OUT_MS = 250;
export const PAINT_MS = 400;

export type Pose = { dy: number; scale: number; squash: number; seated: boolean; done: boolean };

const REST: Pose = { dy: 0, scale: 1, squash: 1, seated: true, done: true };

export function dropPose(t: number): Pose {
  if (t >= DROP.fallMs + DROP.settleMs) return REST;
  if (t < DROP.fallMs) {
    const k = Math.max(0, t) / DROP.fallMs;
    return { dy: DROP.height * (1 - k * k), scale: 1, squash: 1, seated: false, done: false };
  }
  const tau = (t - DROP.fallMs) / DROP.settleMs;
  const squash = 1 - 0.12 * Math.exp(-3 * tau) * Math.cos(2.4 * Math.PI * tau);
  const dy = 0.035 * Math.sin(Math.PI * tau) * (1 - tau);
  return { dy, scale: 1, squash, seated: true, done: false };
}

/** easeOutBack: passa de 1 por volta de 55% e volta. */
function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

export const POP_SEAT = 0.55;

export function popPose(t: number): Pose {
  if (t >= POP_MS) return REST;
  const k = Math.max(0, t) / POP_MS;
  return {
    dy: 0,
    scale: Math.max(0, easeOutBack(k)),
    squash: 1,
    seated: k >= POP_SEAT,
    done: false,
  };
}

export function outPose(t: number): Pose {
  if (t >= OUT_MS) return { dy: 0.5, scale: 0, squash: 1, seated: false, done: true };
  const k = Math.max(0, t) / OUT_MS;
  const e = k * k;
  return { dy: 0.5 * e, scale: 1 - e, squash: 1, seated: false, done: false };
}

/** A interpolação da tinta: suave nas pontas. */
export function paintProgress(t: number): number {
  const k = Math.max(0, Math.min(1, t / PAINT_MS));
  return k * k * (3 - 2 * k);
}
