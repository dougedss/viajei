import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateImport, type ImportData } from '@shared/import-schema.ts';
import { makeTrip, UID } from '@/test/factories.ts';
import { EMPTY_HEADER } from './format.ts';
import { headerProblems, lastOrigin, moveStart, proposeHeader, spanOf } from './new-trip.ts';
import { reviewOf } from './plan.ts';

const seed = validateImport(JSON.parse(readFileSync('supabase/seed/viagem-rs.json', 'utf8')));
const TODAY = '2026-11-15';
const ctx = { today: TODAY, lastOrigin: 'Joinville/SC', daysFromText: true };
const NONE: ImportData = { ...seed, days: [], reservations: [], quests: [] };

describe('o cabeçalho da viagem nova', () => {
  it('o que o texto diz vale, sem pergunta', () => {
    const draft = proposeHeader(
      {
        name: 'RS — concurso',
        start_date: '2026-12-11',
        end_date: '2026-12-14',
        origin: 'Papanduva/SC',
        budget: 3000,
      },
      seed,
      ctx,
    );
    expect(draft).toEqual({
      header: {
        name: 'RS — concurso',
        start_date: '2026-12-11',
        end_date: '2026-12-14',
        origin: 'Papanduva/SC',
        budget: 3000,
      },
      asked: { name: false, dates: false, origin: false },
      originProposal: null,
    });
  });

  it('sem cabeçalho: as datas pelos dias do texto, a origem pela parada de saída, o nome pelo primeiro dia', () => {
    const draft = proposeHeader(EMPTY_HEADER, seed, ctx);
    expect(draft.header).toMatchObject({
      name: 'Papanduva → Serra Gaúcha',
      start_date: '2026-12-11',
      end_date: '2026-12-14',
      origin: 'Papanduva, SC',
    });
    expect(draft.asked).toEqual({ name: true, dates: false, origin: false });
  });

  it('a IA leu um texto sem data: os dias contam de amanhã, e as datas viram pergunta', () => {
    const draft = proposeHeader(EMPTY_HEADER, seed, { ...ctx, daysFromText: false });
    expect(draft.asked.dates).toBe(true);
    // o formato do Viajei sempre escreve a data do dia: lá, os dias já dizem
    expect(proposeHeader(EMPTY_HEADER, seed, ctx).asked.dates).toBe(false);
  });

  it('sem nada: amanhã, a última origem da pessoa como proposta, e o nome pela data', () => {
    const draft = proposeHeader(EMPTY_HEADER, NONE, ctx);
    expect(draft).toEqual({
      header: {
        name: 'Viagem de 16/11',
        start_date: '2026-11-16',
        end_date: '2026-11-16',
        origin: 'Joinville/SC',
        budget: null,
      },
      asked: { name: true, dates: true, origin: true },
      originProposal: 'Joinville/SC',
    });
    expect(
      proposeHeader(EMPTY_HEADER, NONE, { ...ctx, lastOrigin: null }).header.origin,
    ).toBeNull();
  });

  it('a última origem é a da viagem da pessoa criada ou editada por último, não a que começa por último (fase 25)', () => {
    const at = (day: string) => `2026-11-${day}T10:00:00.000Z`;
    const trips = [
      makeTrip({
        id: 'a',
        start_date: '2026-01-10',
        updated_at: at('01'),
        origin: 'Lages',
        owner_id: UID,
      }),
      // a viagem de dezembro, criada antes: a data de início mais distante não manda mais
      makeTrip({
        id: 'b',
        start_date: '2026-12-11',
        updated_at: at('10'),
        origin: 'Papanduva/SC',
        owner_id: UID,
      }),
      // a viagem recém-criada, de amanhã, saindo de onde a pessoa está
      makeTrip({
        id: 'f',
        start_date: '2026-11-22',
        updated_at: at('21'),
        origin: 'Major Vieira, SC',
        owner_id: UID,
      }),
      makeTrip({
        id: 'c',
        start_date: '2026-09-01',
        updated_at: at('25'),
        origin: null,
        owner_id: UID,
      }),
      makeTrip({
        id: 'd',
        start_date: '2026-10-01',
        updated_at: at('26'),
        origin: 'De outra pessoa',
        owner_id: 'x',
      }),
      makeTrip({
        id: 'e',
        start_date: '2026-11-01',
        updated_at: at('27'),
        origin: 'Excluída',
        owner_id: UID,
        deleted_at: '2026-11-28T00:00:00Z',
      }),
    ];
    expect(lastOrigin(trips, UID)).toBe('Major Vieira, SC');
    expect(lastOrigin([], UID)).toBeNull();
  });

  it('mudar o começo leva tudo junto: os dias, as reservas, o prazo, o nome proposto', () => {
    const draft = proposeHeader(EMPTY_HEADER, seed, { ...ctx, daysFromText: false });
    const trip = makeTrip({ start_date: '2026-12-11', end_date: '2026-12-14' });
    const review = reviewOf(seed, {
      trip,
      days: [],
      stops: [],
      reservations: [],
      contacts: [],
      items: [],
    });
    const moved = moveStart(draft, review, '2026-12-18');
    expect(moved.draft.header).toMatchObject({ start_date: '2026-12-18', end_date: '2026-12-21' });
    expect(moved.review.days.map((d) => d.date)).toEqual([
      '2026-12-18',
      '2026-12-19',
      '2026-12-20',
      '2026-12-21',
    ]);
    expect(moved.review.reservations[1]).toMatchObject({
      day_ref: '2026-12-20',
      start_at: '2026-12-20T14:00',
      end_at: '2026-12-21T12:00',
      cancel_until: '2026-12-15',
    });
    expect(spanOf(moved.draft.header)).toBe(4);
    expect(moveStart(draft, review, '2026-12-11')).toEqual({ draft, review });
    // o nome que era só a data acompanha a data nova
    const blank = proposeHeader(EMPTY_HEADER, NONE, ctx);
    const empty = reviewOf(NONE, {
      trip,
      days: [],
      stops: [],
      reservations: [],
      contacts: [],
      items: [],
    });
    expect(moveStart(blank, empty, '2026-12-05').draft.header.name).toBe('Viagem de 05/12');
  });

  it('o que impede criar', () => {
    const ok = {
      name: 'Serra',
      start_date: '2026-12-11',
      end_date: '2026-12-14',
      origin: null,
      budget: null,
    };
    expect(headerProblems(ok)).toEqual([]);
    expect(headerProblems({ ...ok, name: '  ' })).toEqual(['Dê um nome para a viagem.']);
    expect(headerProblems({ ...ok, end_date: '2026-12-10' })).toEqual([
      'O fim precisa ser depois do começo.',
    ]);
    expect(headerProblems({ ...ok, end_date: '2027-03-01' })).toEqual([
      'Uma viagem tem no máximo 60 dias.',
    ]);
  });
});
