import { createECDH, createHmac } from 'node:crypto';
import type { NotificationKind } from '../../supabase/functions/_shared/constants.ts';
import { dayMonth } from '../../supabase/functions/_shared/notifications.ts';
import { toBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { wallToInstant } from '../../src/lib/time/zone.ts';
import { wall } from './evaluate.ts';
import { importSubscriptionKeys, type SubscriptionKeys } from './webpush-decrypt.ts';

/**
 * Os avisos que só se conferem de verdade em dois dias (exceção à D53): a véspera (19:00 da véspera
 * do início, com o que falta nas listas), o prazo de cancelamento (10:00 da véspera do último dia) e
 * a retrospectiva pronta (9:00 do dia seguinte ao fim da viagem, fase 9).
 * Uma execução arma: deixa uma viagem e uma assinatura de laboratório vivas, só com aquele tipo
 * ligado; o cron de verdade manda na hora; a execução seguinte confere o que chegou, desarma e arma
 * o próximo ciclo. Puro: os horários, o rótulo e as chaves da assinatura, derivadas do LAB_SECRET
 * (nenhum segredo guardado em lugar nenhum).
 */
export const ARM_KINDS = ['vespera', 'prazo', 'retro'] as const;
export type ArmKind = (typeof ARM_KINDS)[number];

/**
 * `offset`: quantos dias a data guardada na linha (o início, o último dia para cancelar, o fim da
 * viagem) fica depois do dia do aviso. A véspera e o prazo avisam no dia anterior (+1); a
 * retrospectiva avisa no dia seguinte ao fim (−1). `owner`: de quem é a viagem armada. A da
 * retrospectiva é do lab-b, porque o lab-a começa cada execução sem parada concluída nenhuma (o
 * cenário da progressão precisa do primeiro desbloqueio).
 */
export const ARM = {
  vespera: { notification: 'eve_checklist', time: '19:00', offset: 1, owner: 'a' },
  prazo: { notification: 'cancel_deadline', time: '10:00', offset: 1, owner: 'a' },
  retro: { notification: 'retro_ready', time: '09:00', offset: -1, owner: 'b' },
} as const satisfies Record<
  ArmKind,
  { notification: NotificationKind; time: string; offset: number; owner: 'a' | 'b' }
>;

/** O user-agent das assinaturas armadas: é por ele que o preparo e o fim da execução as poupam. */
export const ARM_USER_AGENT = 'viajei-lab/arm';
/** Margem entre armar e o aviso: um cron atrasado ainda pega a janela de 10 min (D36). */
export const ARM_MARGIN_MS = 15 * 60_000;
/** O aviso conta como no horário até 2 min depois do minuto agendado. */
export const ARM_MAX_LATENCY_MS = 120_000;

/** 'YYYY-MM-DD' + n dias, sem fuso. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`data inválida: ${date}`);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** O instante do aviso, a partir da data do evento (a véspera): 19:00 ou 10:00 em São Paulo. */
export function eventMoment(kind: ArmKind, eventDate: string): Date {
  return new Date(wallToInstant(eventDate, ARM[kind].time));
}

/**
 * A data que a linha guarda (início da viagem ou último dia para cancelar) é o dia seguinte ao do
 * aviso; na retrospectiva, o fim da viagem é o dia anterior ao do aviso.
 */
export const anchorOf = (eventDate: string, kind: ArmKind = 'vespera') =>
  addDays(eventDate, ARM[kind].offset);
export const eventDateOf = (anchor: string, kind: ArmKind = 'vespera') =>
  addDays(anchor, -ARM[kind].offset);

/**
 * O próximo dia em que dá para armar: hoje, se o aviso de hoje ainda está a 15 min ou mais; senão,
 * amanhã. O agendamento do GitHub atrasa (até 8 h visto): uma execução das 11h já não pega o prazo
 * das 10h de hoje e arma o de amanhã.
 */
export function nextEventDate(kind: ArmKind, now: Date): string {
  const today = wall(now).date;
  return eventMoment(kind, today).getTime() - now.getTime() >= ARM_MARGIN_MS
    ? today
    : addDays(today, 1);
}

export const armLabel = (kind: ArmKind, eventDate: string) => `${kind}:${eventDate}`;

/** "07/11 às 19:00", em São Paulo. */
export function formatMoment(d: Date): string {
  const w = wall(d);
  return `${dayMonth(w.date)} às ${w.hhmm}`;
}

// ordem do grupo da P-256: o escalar privado tem de estar em [1, n − 1]
const P256_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

function hmac(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message).digest();
}

export type ArmKeyMaterial = { d: Uint8Array; publicRaw: Uint8Array; auth: Uint8Array };

/**
 * As chaves da assinatura armada, derivadas: d = HMAC(LAB_SECRET, 'arm-key:<rótulo>[:n]') como
 * escalar da P-256 (o contador só entra no caso astronômico de cair fora do intervalo), o ponto
 * público pelo ECDH do Node e o segredo de autenticação = 16 bytes de HMAC(LAB_SECRET,
 * 'arm-auth:<rótulo>'). A execução seguinte refaz as mesmas chaves e decifra o que chegou.
 */
export function deriveArmKeyMaterial(secret: string, label: string): ArmKeyMaterial {
  for (let counter = 0; counter < 16; counter++) {
    const d = hmac(secret, counter === 0 ? `arm-key:${label}` : `arm-key:${label}:${counter}`);
    const scalar = BigInt(`0x${d.toString('hex')}`);
    if (scalar === 0n || scalar >= P256_N) continue;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    return {
      d: new Uint8Array(d),
      publicRaw: new Uint8Array(ecdh.getPublicKey()),
      auth: new Uint8Array(hmac(secret, `arm-auth:${label}`).subarray(0, 16)),
    };
  }
  throw new Error('não deu para derivar a chave da assinatura armada');
}

export function deriveArmKeys(secret: string, label: string): Promise<SubscriptionKeys> {
  const m = deriveArmKeyMaterial(secret, label);
  return importSubscriptionKeys(toBase64Url(m.d), toBase64Url(m.publicRaw), toBase64Url(m.auth));
}

/** O que o aviso tem de dizer, escrito aqui de forma independente do `notificationText`. */
export function armExpected(
  kind: ArmKind,
  facts: { tripId: string; anchor: string; reservationId?: string; reservationName?: string },
): { title: string; body: string; navigate: string } {
  if (kind === 'retro') {
    // a viagem armada tem um dia e uma parada concluída
    return {
      title: 'A retrospectiva da viagem está pronta',
      body: '1 dia, 1 parada',
      navigate: `/viagens/${facts.tripId}/retrospectiva`,
    };
  }
  if (kind === 'vespera') {
    return {
      title: 'Amanhã é dia de viajar',
      body: '2 itens de antes e 1 da mala faltando',
      navigate: `/viagens/${facts.tripId}/checklists?aba=antes`,
    };
  }
  return {
    title: 'Amanhã é o último dia para cancelar sem custo',
    body: `${facts.reservationName ?? ''} · até ${dayMonth(facts.anchor)}`,
    navigate: `/viagens/${facts.tripId}/reservas?abrir=${facts.reservationId ?? ''}`,
  };
}
