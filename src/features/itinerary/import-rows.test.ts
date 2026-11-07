import { describe, expect, it } from 'vitest';
import { validateImport } from '@shared/import-schema.ts';
import raw from '../../../supabase/seed/viagem-rs.json';
import { comparePosition } from '@/lib/ids/position.ts';
import { contactsFromImport, listItemsFromImport } from './import-rows.ts';

const data = validateImport(raw);
const stops = data.days.flatMap((d) =>
  d.stops.map((s, i) => ({ id: `${d.date}-${i}`, name: s.name, kind: s.kind, deleted_at: null })),
);

describe('contatos, listas e missões do exemplo', () => {
  it('os 6 contatos em E.164, com o tipo e as observações', () => {
    const rows = contactsFromImport(data.contacts);
    expect(rows).toHaveLength(6);
    expect(rows[1]).toEqual({
      name: 'Hotel Niro (plano B)',
      phone: '+5551998552808',
      type: 'hotel',
      notes: 'Montenegro.',
    });
    expect(rows.every((r) => /^\+[1-9][0-9]{7,14}$/.test(r.phone))).toBe(true);
  });

  it('contato sem telefone válido fica de fora (a tabela exige o número)', () => {
    expect(
      contactsFromImport([
        { name: 'Sem DDD', phone: '99752-7596', type: 'other', notes: null },
        { name: 'Sem número', phone: null, type: 'other', notes: null },
      ]),
    ).toEqual([]);
  });

  it('5 de antes, 6 da mala e 4 missões, cada lista em ordem, depois do que já existe', () => {
    const rows = listItemsFromImport(data, stops, { pack: 'a5' });
    const before = rows.filter((r) => r.kind === 'before');
    const pack = rows.filter((r) => r.kind === 'pack');
    const quests = rows.filter((r) => r.kind === 'quest');
    expect([before.length, pack.length, quests.length]).toEqual([5, 6, 4]);
    expect(before[0]?.text).toBe('Confirmar o horário do café no Steffen');
    const sorted = (xs: typeof rows) =>
      xs
        .map((r) => r.position)
        .every((p, i, all) => i === 0 || comparePosition(all[i - 1] ?? '', p) < 0);
    expect(sorted(before) && sorted(pack) && sorted(quests)).toBe(true);
    expect(pack.every((r) => comparePosition('a5', r.position) < 0)).toBe(true);
    expect(rows.every((r) => r.source === 'user' && r.status === 'active')).toBe(true);
    expect(before.every((r) => r.points === 0 && r.stop_id === null)).toBe(true);
  });

  it('missões ligadas à parada pelo nome, com os pontos da regra do tipo; sem parada, 10', () => {
    const quests = listItemsFromImport(data, stops).filter((r) => r.kind === 'quest');
    expect(quests.map((q) => [q.text, q.stop_id, q.points])).toEqual([
      ['Foto na Cascata do Caracol', '2026-12-14-0', 20],
      ['Registrar o rótulo preferido na Casa Valduga', '2026-12-13-3', 20],
      ['Tomar um mate em Gramado', '2026-12-14-1', 15],
      ['Lançar o gasto do almoço de domingo', null, 10],
    ]);
  });
});
