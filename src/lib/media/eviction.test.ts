import { describe, expect, it } from 'vitest';
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_UNKNOWN,
  budgetFor,
  isProtectedTrip,
  MB,
  needsTouch,
  planEviction,
  type CachedBlobMeta,
} from './eviction.ts';

const blob = (
  id: string,
  trip: string,
  kind: 'photo' | 'document',
  sizeMb: number,
  used: string,
): CachedBlobMeta => ({
  attachment_id: id,
  trip_id: trip,
  kind,
  size: sizeMb * MB,
  last_used_at: used,
});

describe('orçamento por aparelho', () => {
  it('o menor entre 1 GB e 40% da cota, com piso de 200 MB', () => {
    expect(budgetFor(10 * 1024 * MB)).toBe(BUDGET_MAX);
    expect(budgetFor(1000 * MB)).toBe(400 * MB);
    expect(budgetFor(300 * MB)).toBe(BUDGET_MIN);
    expect(budgetFor(null)).toBe(BUDGET_UNKNOWN);
    expect(budgetFor(0)).toBe(BUDGET_UNKNOWN);
  });
});

describe('despejo', () => {
  const passada = 'trip-passada';
  const futura = 'trip-futura';
  const protegidas = new Set([futura]);

  it('dentro do orçamento, nada sai', () => {
    expect(
      planEviction([blob('a', passada, 'photo', 10, '2026-01-01')], protegidas, 100 * MB),
    ).toEqual([]);
  });

  it('nunca tira anexo de viagem em andamento ou futura, nem acima do orçamento', () => {
    const blobs = [
      blob('f1', futura, 'photo', 300, '2025-01-01'),
      blob('f2', futura, 'document', 300, '2025-01-01'),
    ];
    expect(planEviction(blobs, protegidas, 200 * MB)).toEqual([]);
  });

  it('das passadas, fotos menos usadas primeiro, depois documentos, até caber', () => {
    const blobs = [
      blob('doc-velho', passada, 'document', 50, '2026-01-01'),
      blob('foto-recente', passada, 'photo', 50, '2026-10-01'),
      blob('foto-velha', passada, 'photo', 50, '2026-02-01'),
      blob('futura', futura, 'photo', 100, '2026-01-01'),
    ];
    // total 250; orçamento 150 → saem 100: as duas fotos, a mais velha primeiro
    expect(planEviction(blobs, protegidas, 150 * MB)).toEqual(['foto-velha', 'foto-recente']);
    // orçamento 110 → as fotos e ainda o documento
    expect(planEviction(blobs, protegidas, 110 * MB)).toEqual([
      'foto-velha',
      'foto-recente',
      'doc-velho',
    ]);
  });

  it('protegida é a viagem que ainda não acabou', () => {
    expect(isProtectedTrip({ end_date: '2026-12-14' }, '2026-12-14')).toBe(true);
    expect(isProtectedTrip({ end_date: '2026-12-14' }, '2026-12-15')).toBe(false);
  });

  it('o uso se regrava no máximo uma vez por dia', () => {
    const now = Date.parse('2026-12-11T12:00:00Z');
    expect(needsTouch('2026-12-11T06:00:00Z', now)).toBe(false);
    expect(needsTouch('2026-12-10T11:00:00Z', now)).toBe(true);
  });
});
