import { appendFile } from 'node:fs/promises';
import { validateImport, type ImportData } from '../../supabase/functions/_shared/import-schema.ts';
import {
  PLAN_FN,
  planQuestionsSchema,
  type PlanContext,
  type PlanRequest,
} from '../../supabase/functions/_shared/plan-protocol.ts';
import { matchElement, overpassQuery } from '../../src/features/intake/verify.ts';
import { overpass } from '../../src/lib/geocode/overpass.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
import { log, type Session } from './session.ts';

/**
 * A medição da conversa (fase 17, como a D133 e a D140 mediram a importação): poucas leituras reais,
 * contadas, pela função publicada e como o lab-a. Uma conversa (as perguntas e o roteiro) e uma saída
 * de hoje; de cada roteiro, quantos lugares propostos o Overpass confirma (uma consulta por roteiro,
 * dentro da política do serviço). Sai uma tabela só com números: nada do pedido nem da resposta.
 */
const GRAMADO = { lat: -29.3787, lng: -50.8737 };
const CANELA = { lat: -29.37, lng: -50.81 };

const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

function context(today: string, over: Partial<PlanContext> = {}): PlanContext {
  return {
    today,
    now: '09:00',
    origin: 'Papanduva/SC',
    position: null,
    place: null,
    interests: ['nature', 'wineries'],
    learned: [{ kind: 'nature', count: 2 }],
    history: [{ name: 'Cascata do Caracol', kind: 'nature', rating: 5, days_ago: 40 }],
    weather: null,
    reach: null,
    ...over,
  };
}

type Row = { label: string; run: TimedImport; detail: string };

/** Quantos lugares propostos (fora a saída e o deslocamento) o Overpass confirma em volta do centro. */
async function confirmed(data: ImportData, center: { lat: number; lng: number }, radiusKm: number) {
  const places = data.days.flatMap((d) =>
    d.stops.filter((st) => st.kind !== 'origin' && st.kind !== 'transit'),
  );
  const query = overpassQuery(places, center, radiusKm);
  if (!query) return `0/${String(places.length)} (sem nome que distinga)`;
  try {
    // no Node, o cliente se identifica (sem isso o Overpass responde 406): um nome genérico
    const elements = await overpass(query, { userAgent: 'viajei-laboratorio/1.0 (medicao)' });
    const ok = places.filter((p) => matchElement(p, elements, center) !== null).length;
    return `${String(ok)}/${String(places.length)} no Overpass`;
  } catch (err) {
    return `Overpass fora (${err instanceof Error ? err.message : 'erro'})`;
  }
}

export async function measureConversa(cfg: LabConfig, a: Session): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const rows: Row[] = [];

  log('medição: a conversa, as perguntas');
  const text = 'Serra Gaúcha em dezembro, 4 dias, saindo de Papanduva';
  const ask: PlanRequest = { step: 'ask', kind: 'plan', text, context: context(today) };
  const asked = await timedImport(cfg, a, ask, PLAN_FN);
  const questions = planQuestionsSchema.safeParse(asked.data);
  const qs = questions.success ? questions.data.questions : [];
  rows.push({
    label: 'conversa · perguntas',
    run: asked,
    detail: `${String(qs.length)} perguntas`,
  });

  log('medição: a conversa, o roteiro');
  const plan: PlanRequest = {
    ...ask,
    step: 'plan',
    questions: qs,
    // a primeira opção de cada pergunta, ou uma resposta livre curta
    answers: qs.map((q) => q.options[0] ?? 'tanto faz'),
  };
  const planned = await timedImport(cfg, a, plan, PLAN_FN);
  let detail: string = planned.outcome;
  if (planned.outcome === 'done') {
    try {
      const data = validateImport(planned.data);
      detail = `${String(data.days.length)} dias, ${String(data.days.flatMap((d) => d.stops).length)} paradas; ${await confirmed(data, GRAMADO, 200)}`;
    } catch {
      detail = 'fora do schema';
    }
  }
  rows.push({ label: 'conversa · roteiro', run: planned, detail });

  log('medição: a saída de hoje');
  const todayPlan: PlanRequest = {
    step: 'plan',
    kind: 'today',
    text: 'quero sair hoje',
    questions: [{ text: 'Quanto tempo vocês têm?', options: ['A manhã', 'O dia', 'Até amanhã'] }],
    answers: ['O dia'],
    context: context(today, {
      position: CANELA,
      place: 'Canela, RS',
      weather: 'Parcialmente nublado, 15° a 27°',
      reach: 'day',
    }),
  };
  const out = await timedImport(cfg, a, todayPlan, PLAN_FN);
  let todayDetail: string = out.outcome;
  if (out.outcome === 'done') {
    try {
      const data = validateImport(out.data);
      todayDetail = `${String(data.days.flatMap((d) => d.stops).length)} paradas; ${await confirmed(data, CANELA, 120)}`;
    } catch {
      todayDetail = 'fora do schema';
    }
  }
  rows.push({ label: 'saída de hoje · roteiro', run: out, detail: todayDetail });

  const head =
    '| passo | resultado | 1º caractere | fim | entrada | saída | US$ | o que veio |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(({ label, run, detail: d }) => {
    const cost = run.usage && run.model ? costUsd(run.model, run.usage) : null;
    return `| ${[
      label,
      run.outcome === 'done' ? `ok · ${run.model ?? ''}` : `${run.outcome} ${run.code ?? ''}`,
      s(run.first_char_ms),
      s(run.end_ms),
      run.usage?.input_tokens ?? '—',
      run.usage?.output_tokens ?? '—',
      cost === null ? '—' : cost.toFixed(4),
      d,
    ].join(' | ')} |`;
  });
  const total = rows.reduce((n, r) => {
    const c = r.run.usage && r.run.model ? costUsd(r.run.model, r.run.usage) : null;
    return n + (c ?? 0);
  }, 0);
  const report = `## Medição da conversa\n\n${[head, ...body].join('\n')}\n\nTotal: US$ ${total.toFixed(4)} em ${String(rows.length)} leituras.\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  return rows.some((r) => r.run.outcome === 'http' || r.run.outcome === 'cut') ? 1 : 0;
}
