import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import type { ImportVariant } from '../../supabase/functions/_shared/import-protocol.ts';
import { validateImport, type ImportData } from '../../supabase/functions/_shared/import-schema.ts';
import type { LabConfig } from './env.ts';
import { costUsd, longTripText, scoreImport, timedImport, type TimedImport } from './import-lab.ts';
import { log, type Session } from './session.ts';

/**
 * A medição do pensamento (D133), nas máquinas do GitHub e pela função publicada, como o lab-a
 * (a variante só vale para quem está no `lab_access`). O texto do seed em três variantes, duas vezes
 * cada, e o texto longo uma vez, para provar o prazo. Sai uma tabela só com números e nomes de campo:
 * nada do texto nem da resposta.
 */
const SEED_TRIP = {
  name: 'RS — concurso em Montenegro',
  start_date: '2026-12-11',
  end_date: '2026-12-14',
  origin: 'Papanduva/SC',
};
const LONG_TRIP = {
  name: 'Viagem longa do laboratório',
  start_date: '2027-01-04',
  end_date: '2027-01-31',
  origin: 'Papanduva/SC',
};
const VARIANTS: readonly ImportVariant[] = [
  'adaptive_medium',
  'between_tools_medium',
  'adaptive_low',
];
const RUNS = 2;

type Row = {
  label: string;
  run: TimedImport;
  quality: ReturnType<typeof scoreImport> | null;
};

const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

function table(rows: readonly Row[]): string {
  const head =
    '| variante | resultado | start | 1º caractere | 1ª parada | fim | entrada | saída | US$ | paradas | campos | inventado | errado |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map(({ label, run, quality }) => {
    const usage = run.usage;
    const cost = usage && run.model ? costUsd(run.model, usage) : null;
    return [
      label,
      run.outcome === 'done'
        ? `ok · ${run.model ?? ''}`
        : `${run.outcome} ${run.code ?? ''} ${run.reason ?? ''}`,
      s(run.start_ms),
      s(run.first_char_ms),
      s(run.first_stop_ms),
      s(run.end_ms),
      usage?.input_tokens ?? '—',
      usage?.output_tokens ?? '—',
      cost === null ? '—' : cost.toFixed(4),
      quality
        ? `${quality.stops.matched}/${quality.stops.expected} (+${quality.stops.extra})`
        : '—',
      quality ? `${quality.fields.ok}/${quality.fields.total}` : '—',
      quality ? quality.invented.join(', ') || 'nada' : '—',
      quality ? quality.wrong.join(', ') || 'nada' : '—',
    ].join(' | ');
  });
  return [head, ...body.map((b) => `| ${b} |`)].join('\n');
}

export async function measureImport(cfg: LabConfig, a: Session): Promise<number> {
  const seedText = await readFile('supabase/seed/viagem-rs.txt', 'utf8');
  const seed = validateImport(JSON.parse(await readFile('supabase/seed/viagem-rs.json', 'utf8')));
  const expected: ImportData = {
    ...seed,
    days: seed.days.map((d) => ({
      ...d,
      stops: d.stops.map((st) => ({ ...st, lat: null, lng: null })),
    })),
  };
  const rows: Row[] = [];
  for (let i = 0; i < RUNS; i++) {
    for (const variant of VARIANTS) {
      log(`medição: ${variant} (${i + 1} de ${RUNS})`);
      const run = await timedImport(cfg, a, {
        trip_id: randomUUID(),
        text: seedText,
        trip: SEED_TRIP,
        variant,
      });
      let quality: Row['quality'] = null;
      if (run.outcome === 'done') {
        try {
          quality = scoreImport(expected, validateImport(run.data));
        } catch {
          quality = null;
        }
      }
      rows.push({ label: `${variant} #${i + 1}`, run, quality });
    }
  }
  log('medição: texto longo, variante padrão');
  const long = longTripText();
  rows.push({
    label: `longo (${long.length} caracteres)`,
    run: await timedImport(cfg, a, { trip_id: randomUUID(), text: long, trip: LONG_TRIP }),
    quality: null,
  });

  const out = `## Medição da importação\n\n${table(rows)}\n`;
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, out);
  // recusa, corte por prazo e JSON inválido são respostas da IA e ficam na tabela; erro HTTP, stream
  // interrompido e `failed` (a função ou a API recusou o pedido) são defeito e reprovam a medição
  const broken = rows.filter(
    ({ run }) =>
      run.outcome === 'http' ||
      run.outcome === 'cut' ||
      (run.outcome === 'error' && run.code === 'failed'),
  );
  return broken.length > 0 ? 1 : 0;
}
