import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateImport, type ImportData } from '@shared/import-schema.ts';
import {
  EMPTY_HEADER,
  looksLikeViajei,
  parseDate,
  parseTime,
  readViajei,
  writeViajei,
  type ReadResult,
  type ViajeiDoc,
} from './format.ts';

const TODAY = '2026-11-15';
const seed = validateImport(JSON.parse(readFileSync('supabase/seed/viagem-rs.json', 'utf8')));
const golden = readFileSync('supabase/seed/viagem-rs.viajei', 'utf8');
const SEED_TRIP = {
  name: 'RS — concurso em Montenegro',
  start_date: '2026-12-11',
  end_date: '2026-12-14',
  origin: 'Papanduva/SC',
  budget: 3000,
};

function ok(result: ReadResult): ViajeiDoc {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.doc;
}
function errors(result: ReadResult) {
  if (result.ok) throw new Error('era para dar erro');
  return result.errors;
}
const EMPTY_DATA: ImportData = {
  days: [],
  reservations: [],
  contacts: [],
  checklist_before: [],
  checklist_pack: [],
  quests: [],
  unclassified: [],
};

describe('o formato do Viajei: o seed', () => {
  it('o escritor escreve o seed como o arquivo de referência', () => {
    expect(writeViajei({ trip: SEED_TRIP, data: seed })).toBe(golden);
  });

  it('o leitor lê o arquivo de referência de volta no seed, com o cabeçalho', () => {
    const doc = ok(readViajei(golden, TODAY));
    expect(doc.trip).toEqual(SEED_TRIP);
    expect(doc.data).toEqual(seed);
    expect(doc.data.days.flatMap((d) => d.stops)).toHaveLength(18);
  });

  it('ler(escrever(x)) é x', () => {
    const doc = { trip: SEED_TRIP, data: seed };
    expect(ok(readViajei(writeViajei(doc), TODAY))).toEqual(doc);
  });
});

describe('o formato do Viajei: a viagem do laboratório e os casos de borda', () => {
  // como a viagem do `app_importar` (D139): dois dias, uma parada sem horário, um hotel com código e
  // telefone, um link, uma nota em duas linhas, mais de 8 missões e um não classificado
  const lab: ViajeiDoc = {
    trip: {
      name: 'Laboratório · importação',
      start_date: '2026-12-15',
      end_date: '2026-12-16',
      origin: null,
      budget: null,
    },
    data: {
      ...EMPTY_DATA,
      days: [
        {
          date: '2026-12-15',
          title: null,
          stops: [
            {
              time: '08:00',
              kind: 'origin',
              name: 'Saída de Lages',
              address: 'Lages, SC',
              closes_at: null,
              travel_minutes_to_next: 75,
              notes: null,
              url: null,
              lat: null,
              lng: null,
            },
            {
              time: null,
              kind: 'nature',
              name: 'Cânion Fortaleza',
              address: null,
              closes_at: '17:00',
              travel_minutes_to_next: null,
              notes: 'De manhã.\nLevar casaco.',
              url: 'https://maps.app.goo.gl/abc123',
              lat: null,
              lng: null,
            },
          ],
        },
        {
          date: '2026-12-16',
          title: 'Volta',
          stops: [
            {
              time: '14:00',
              kind: 'fuel',
              name: 'Posto da serra',
              address: null,
              closes_at: null,
              travel_minutes_to_next: null,
              notes: null,
              url: null,
              lat: -28.1,
              lng: -49.9,
            },
          ],
        },
      ],
      reservations: [
        {
          type: 'hotel',
          name: 'Pousada do Cânion',
          stop_ref: null,
          day_ref: '2026-12-15',
          start_at: '2026-12-15T15:00',
          end_at: null,
          confirmation_code: 'PX-7781',
          amount: 1234.5,
          cancel_policy: null,
          cancel_until: null,
          phone: '+5548999990000',
          address: null,
          booked_via: null,
          notes: null,
        },
      ],
      contacts: [{ name: 'Pousada do Cânion', phone: null, type: 'hotel', notes: null }],
      quests: Array.from({ length: 10 }, (_, i) => ({
        text: `Missão ${String(i + 1)}`,
        stop_ref: i === 0 ? 'Cânion Fortaleza' : null,
      })),
      unclassified: ['Ver se a estrada de chão está seca'],
    },
  };

  it('ler(escrever(x)) é x, com a parada sem horário, o link, o código, as 10 missões', () => {
    const text = writeViajei(lab);
    expect(text).toContain('- natureza Cânion Fortaleza · https://maps.app.goo.gl/abc123');
    expect(text).toContain('  obs: De manhã.\n  obs: Levar casaco.');
    expect(ok(readViajei(text, TODAY))).toEqual(lab);
  });

  it('uma viagem sem nada além do cabeçalho', () => {
    const doc = { trip: { ...EMPTY_HEADER, name: 'Só o nome' }, data: EMPTY_DATA };
    expect(writeViajei(doc)).toBe('viajei/1\n# Só o nome\n');
    expect(ok(readViajei(writeViajei(doc), TODAY))).toEqual(doc);
  });
});

describe('o formato do Viajei: o que outra IA escreve', () => {
  it('aceita um prefácio, a cerca de código e a conversa depois dela', () => {
    const text = [
      'Claro! Aqui está o roteiro no formato do Viajei:',
      '',
      '```',
      'viajei/1',
      '# Serra em dezembro',
      'datas: 11 a 14/12/2026',
      '',
      '## sex 11/12 Papanduva → Gramado',
      '- 7h origem Saída de Papanduva',
      '- 13h30 cidade Gramado · Gramado, RS',
      '  até a próxima: 1h15',
      '```',
      '',
      'Boa viagem!',
    ].join('\n');
    const doc = ok(readViajei(text, TODAY));
    expect(doc.trip).toMatchObject({ start_date: '2026-12-11', end_date: '2026-12-14' });
    expect(doc.data.days[0]).toMatchObject({ date: '2026-12-11', title: 'Papanduva → Gramado' });
    expect(doc.data.days[0]?.stops.map((s) => [s.time, s.kind, s.name, s.address])).toEqual([
      ['07:00', 'origin', 'Saída de Papanduva', null],
      ['13:30', 'city', 'Gramado', 'Gramado, RS'],
    ]);
    expect(doc.data.days[0]?.stops[1]?.travel_minutes_to_next).toBe(75);
  });

  it('o tipo pela chave ou pelo rótulo, com acento ou não; o Posto também', () => {
    const doc = ok(
      readViajei(
        'viajei/1\n## 2026-12-11\n- 09:00 winery Casa\n- 10:00 Vinicola Outra\n- posto Abastecer\n',
        TODAY,
      ),
    );
    expect(doc.data.days[0]?.stops.map((s) => [s.time, s.kind])).toEqual([
      ['09:00', 'winery'],
      ['10:00', 'winery'],
      [null, 'fuel'],
    ]);
  });

  it('o JSON do schema, numa cerca ou não, com o cabeçalho e sem as chaves opcionais', () => {
    const json = {
      trip: { name: 'Do JSON', start_date: '2026-12-11', end_date: '2026-12-12', origin: null },
      days: [{ date: '2026-12-11', stops: [{ kind: 'city', name: 'Gramado', time: '11:00' }] }],
      quests: [{ text: 'Foto' }],
    };
    for (const text of [
      JSON.stringify(json),
      `Segue:\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\``,
    ]) {
      const doc = ok(readViajei(text, TODAY));
      expect(doc.trip).toEqual({ ...EMPTY_HEADER, ...json.trip, origin: null, budget: null });
      expect(doc.data.days[0]?.stops[0]).toMatchObject({ name: 'Gramado', lat: null, url: null });
      expect(doc.data.quests).toEqual([{ text: 'Foto', stop_ref: null }]);
    }
    expect(looksLikeViajei(JSON.stringify(json))).toBe(true);
    // o JSON do seed, como está no repositório
    expect(
      ok(readViajei(readFileSync('supabase/seed/viagem-rs.json', 'utf8'), TODAY)).data,
    ).toEqual(seed);
  });

  it('um JSON fora do formato diz onde', () => {
    const [e] = errors(readViajei('{"days":[{"date":"11/12","stops":[]}]}', TODAY));
    expect(e?.line).toBeNull();
    expect(e?.message).toMatch(/days\.0\.date/);
    expect(errors(readViajei('{"days": [', TODAY))[0]?.message).toBe('O JSON não deu para ler.');
  });
});

describe('o formato do Viajei: os erros, com a linha', () => {
  it('o tipo que não existe, o horário errado e a parada sem dia', () => {
    const text = [
      'viajei/1',
      '- 09:00 cidade Antes do dia',
      '## 11/12/2026',
      '- 09:00 pousada Hotel X',
      '- 25:00 cidade Gramado',
      '- 9 cidade Canela',
      '- 10:00 cidade',
    ].join('\n');
    expect(errors(readViajei(text, TODAY)).map((e) => e.line)).toEqual([2, 4, 5, 6, 7]);
    const [first, second] = errors(readViajei(text, TODAY));
    expect(first?.message).toMatch(/Antes do primeiro dia/);
    expect(second?.message).toMatch(
      /"pousada" não é um tipo de parada\. Os tipos: origem, deslocamento/,
    );
  });

  it('o cabeçalho, as datas, o dia repetido e o detalhe que não existe', () => {
    const text = [
      'viajei/1',
      'carro: SUV',
      'datas: semana que vem',
      '## 11/12/2026',
      '- cidade Gramado',
      '  cor: azul',
      '  fecha: tarde',
      '## 11/12/2026',
      '## Hospedagem',
      '- texto solto sem seção conhecida',
    ].join('\n');
    const all = errors(readViajei(text, TODAY));
    // depois de um cabeçalho que não se entende, o item de baixo fica sem dia (linha 10)
    expect(all.map((e) => e.line)).toEqual([2, 3, 6, 7, 8, 9, 10]);
    expect(all[0]?.message).toMatch(/nome, datas, origem ou orçamento/);
    expect(all[4]?.message).toMatch(/aparece duas vezes/);
    expect(all[5]?.message).toMatch(/Não entendi "## Hospedagem"/);
  });

  it('o texto sem a marca nem JSON', () => {
    expect(errors(readViajei('Serra Gaúcha em dezembro', TODAY))[0]).toEqual({
      line: 1,
      message: 'O texto não começa com "viajei/1" nem é um JSON.',
    });
    expect(looksLikeViajei('Serra Gaúcha em dezembro')).toBe(false);
  });
});

describe('o formato do Viajei: datas e horas', () => {
  it('a data sem ano: a próxima a partir de hoje; com ano, a do texto', () => {
    expect(parseDate('11/12', TODAY)).toBe('2026-12-11');
    expect(parseDate('10/11', TODAY)).toBe('2027-11-10');
    expect(parseDate('15/11', TODAY)).toBe('2026-11-15');
    expect(parseDate('11/12/27', TODAY)).toBe('2027-12-11');
    expect(parseDate('2026-12-11', TODAY)).toBe('2026-12-11');
    expect(parseDate('31/02/2027', TODAY)).toBeNull();
  });

  it('os dias sem ano caem dentro da viagem, também quando ela vira o ano', () => {
    const doc = ok(
      readViajei(
        'viajei/1\ndatas: 28/12 a 03/01\n## 30/12\n- cidade A\n## 02/01\n- cidade B\n',
        TODAY,
      ),
    );
    expect(doc.trip).toMatchObject({ start_date: '2026-12-28', end_date: '2027-01-03' });
    expect(doc.data.days.map((d) => d.date)).toEqual(['2026-12-30', '2027-01-02']);
  });

  it('as horas', () => {
    expect(['07:00', '7:00', '7h', '13h30', '7H05'].map(parseTime)).toEqual([
      '07:00',
      '07:00',
      '07:00',
      '13:30',
      '07:05',
    ]);
    expect(['24:00', '7', '7:6', 'manhã'].map(parseTime)).toEqual([null, null, null, null]);
  });
});
