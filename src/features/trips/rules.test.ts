import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatPeriod,
  memberLabel,
  parseMoney,
  sortMembers,
  sortTrips,
  statusLabel,
  tripLength,
  tripStatus,
} from './rules.ts';

const trip = { start_date: '2026-12-11', end_date: '2026-12-14' };

describe('regras de viagem', () => {
  it('status pela data de hoje', () => {
    expect(tripStatus(trip, '2026-12-10')).toBe('upcoming');
    expect(tripStatus(trip, '2026-12-11')).toBe('ongoing');
    expect(tripStatus(trip, '2026-12-14')).toBe('ongoing');
    expect(tripStatus(trip, '2026-12-15')).toBe('past');
  });

  it('tamanho conta o primeiro e o último dia', () => {
    expect(tripLength(trip)).toBe(4);
    expect(tripLength({ start_date: '2026-12-11', end_date: '2026-12-11' })).toBe(1);
  });

  it('rótulo do chip', () => {
    expect(statusLabel(trip, '2026-11-04')).toBe('Em 37 dias');
    expect(statusLabel(trip, '2026-12-10')).toBe('Amanhã');
    expect(statusLabel(trip, '2026-12-12')).toBe('Hoje · dia 2 de 4');
    expect(statusLabel(trip, '2027-01-01')).toBe('Encerrada');
  });

  it('período em português, com e sem troca de mês', () => {
    expect(formatPeriod('2026-12-11', '2026-12-14')).toBe('11 a 14 de dezembro');
    expect(formatPeriod('2026-11-28', '2026-12-02')).toBe('28 de nov a 2 de dez');
    expect(formatPeriod('2026-12-11', '2026-12-11')).toBe('11 de dezembro');
  });

  it('ordem: em andamento, próximas (mais perto primeiro), passadas (mais recente primeiro)', () => {
    const trips = [
      { id: 'passada-velha', start_date: '2025-01-01', end_date: '2025-01-03' },
      { id: 'proxima-longe', start_date: '2027-03-01', end_date: '2027-03-05' },
      { id: 'agora', start_date: '2026-11-03', end_date: '2026-11-05' },
      { id: 'passada-recente', start_date: '2026-10-01', end_date: '2026-10-03' },
      { id: 'proxima-perto', start_date: '2026-12-11', end_date: '2026-12-14' },
    ];
    expect(sortTrips(trips, '2026-11-04').map((t) => t.id)).toEqual([
      'agora',
      'proxima-perto',
      'proxima-longe',
      'passada-recente',
      'passada-velha',
    ]);
  });

  it('dinheiro: formata em BRL e lê o que a pessoa digita', () => {
    expect(formatMoney(3000)).toMatch(/R\$\s3\.000,00/);
    expect(formatMoney(null)).toBe('');
    expect(parseMoney('3000')).toBe(3000);
    expect(parseMoney('3.000')).toBe(3000);
    expect(parseMoney('3.000,50')).toBe(3000.5);
    expect(parseMoney('3000.50')).toBe(3000.5);
    expect(parseMoney('R$ 1.250,00')).toBe(1250);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNaN();
  });

  it('membros: rótulo e ordem', () => {
    expect(memberLabel({ role: 'owner', status: 'accepted' })).toBe('Dono');
    expect(memberLabel({ role: 'member', status: 'accepted' })).toBe('Membro');
    expect(memberLabel({ role: 'member', status: 'pending' })).toBe('Convite pendente');
    const sorted = sortMembers([
      { id: 'p', role: 'member', status: 'pending', created_at: '1' },
      { id: 'm', role: 'member', status: 'accepted', created_at: '2' },
      { id: 'o', role: 'owner', status: 'accepted', created_at: '3' },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['o', 'm', 'p']);
  });
});
