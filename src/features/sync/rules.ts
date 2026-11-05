import type { OutboxOp } from '@/lib/db/schema.ts';

/** Rótulos pt-BR das colunas, para os avisos e a lista de pendências. */
export const COLUMN_LABELS: Record<string, string> = {
  name: 'nome',
  notes: 'observações',
  origin: 'origem',
  budget: 'orçamento',
  start_date: 'início',
  end_date: 'fim',
  deleted_at: 'exclusão',
  car_model: 'carro',
  car_color: 'cor do carro',
  car_accessories: 'acessórios',
  invited_email: 'convite',
  title: 'título',
  time: 'horário',
  closes_at: 'fechamento',
  address: 'endereço',
  position: 'ordem',
  kind: 'tipo',
  travel_minutes_to_next: 'deslocamento',
  departed_at: 'saída',
  done_at: 'chegada',
  done_by: 'quem marcou',
  skipped: 'pulada',
  points: 'trilha',
  enabled: 'avisos',
  lead_minutes: 'antecedência',
  kinds: 'tipos de aviso',
  morning_time: 'hora do briefing',
  share_position: 'compartilhar posição',
};

export function describeColumns(columns: readonly string[]): string {
  return columns.map((c) => COLUMN_LABELS[c] ?? c).join(', ');
}

export type OpDescription = { title: string; detail: string };
export type OpContext = { tripName: string | null; memberName: string | null };

/** O que uma operação pendente significa para a pessoa: "Viagem nova · RS", "Convite · ana@…". */
export function describeOp(op: OutboxOp, ctx: OpContext): OpDescription {
  const trip = ctx.tripName ?? 'viagem removida';
  if (op.table === 'trips') {
    if (op.op === 'upsert') return { title: 'Viagem nova', detail: trip };
    if (op.values.deleted_at != null) return { title: 'Exclusão da viagem', detail: trip };
    return { title: `Viagem · ${trip}`, detail: describeColumns(Object.keys(op.values)) };
  }
  if (op.table === 'trip_days') {
    if (op.op === 'upsert') return { title: 'Dia novo', detail: trip };
    return { title: `Dia · ${trip}`, detail: describeColumns(Object.keys(op.values)) };
  }
  if (op.table === 'stops') {
    const name = typeof op.values.name === 'string' ? op.values.name : 'parada';
    if (op.op === 'upsert') return { title: 'Parada nova', detail: `${name} · ${trip}` };
    if (op.values.deleted_at != null) return { title: 'Exclusão de parada', detail: trip };
    if ('done_at' in op.values) {
      return { title: op.values.done_at == null ? 'Chegada desfeita' : 'Chegamos!', detail: trip };
    }
    if ('departed_at' in op.values) {
      return { title: op.values.departed_at == null ? 'Saída desfeita' : 'Partiu!', detail: trip };
    }
    return { title: `Parada · ${trip}`, detail: describeColumns(Object.keys(op.values)) };
  }
  if (op.table === 'trip_tracks') return { title: 'Trilha gravada', detail: trip };
  if (op.table === 'notification_prefs') {
    return { title: `Avisos · ${trip}`, detail: describeColumns(Object.keys(op.values)) };
  }
  const who =
    ctx.memberName ??
    (typeof op.values.invited_email === 'string' ? op.values.invited_email : 'membro');
  if (op.op === 'upsert') return { title: 'Convite', detail: `${who} · ${trip}` };
  if (op.values.deleted_at != null) return { title: 'Remoção do time', detail: `${who} · ${trip}` };
  if ('deleted_at' in op.values) return { title: 'Reconvite', detail: `${who} · ${trip}` };
  return { title: `Membro · ${who}`, detail: describeColumns(Object.keys(op.values)) };
}

export function stateLabel(op: Pick<OutboxOp, 'state' | 'last_error' | 'attempts'>): string {
  if (op.state === 'failed') return op.last_error ?? 'Recusada pelo servidor.';
  if (op.attempts > 0) return `Tentando de novo (${op.attempts}ª tentativa)`;
  return 'Aguardando envio';
}
