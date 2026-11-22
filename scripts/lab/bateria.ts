import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import {
  PLAN_FN,
  planWriteSchema,
  type PlanContext,
  type PlanQuestion,
  type PlanRequest,
  type PlanWrite,
} from '../../supabase/functions/_shared/plan-protocol.ts';
import {
  generatedBatchSchema,
  PLAN_SEARCH_FN,
  planSearchResultSchema,
  verdictSchema,
  type PlanSearchRequest,
  type PlanSearchResult,
  type Verdict,
} from '../../supabase/functions/_shared/plan-search-protocol.ts';
import { isToday } from '../../src/features/intake/today-rule.ts';
import { assemble } from '../../src/features/intake/assemble.ts';
import {
  advanceStep,
  currentStep,
  nextStep,
  prepare,
  searchStep,
  stageAccount,
  stageFromOuting,
  stepGroups,
  stepSearchPlan,
  toggleChoice,
  type MapStage,
} from '../../src/features/intake/flow.ts';
import { dayTimeNotice, hoursNotice } from '../../src/features/intake/hours.ts';
import { answersByTopic } from '../../src/features/intake/flow.ts';
import { overBudget, timeBudget } from '../../src/features/intake/outing-time.ts';
import { reachOf, readReach, reachQuestion } from '../../src/features/intake/reach.ts';
import type { Json } from '../../src/lib/supabase/database.types.ts';
import { comRetentativa } from './retentativa.ts';
import {
  cidadePeloRotulo,
  cidadesDaRodada,
  cidadesDoSul,
  cobrar,
  padroesDaRodada,
  PEDIDOS_POR_RODADA,
  roteiroParaJuiz,
  rotuloDaCidade,
  semente,
  type Cidade,
  type Cobranca,
  type ContaDoTempo,
  type PassoDoApp,
} from './bateria-padroes.ts';
import { ok } from './client.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
import { labDeps, type Calls } from './measure-conversa.ts';
import { log, type Session } from './session.ts';

/**
 * A bateria de pedidos de leigo (fase 27, a 3.3; a decisão 6 do Douglas de 21/11 e a de 22/11): dez
 * pedidos **novos a cada rodada**, com os padrões girando, pelo planejador de verdade (a `plan-search`
 * publicada: a IA com as ferramentas, o Google atrás da função), como o lab-b (a cota do laboratório,
 * D283), **fora do deploy** (sob pedido, nunca portão da CI). Para cada pedido: a rodada do
 * planejador (e a segunda, se a IA perguntou), **a escolha passo a passo como o app** (fase 26: o
 * primeiro candidato do passo 1, o passo seguinte procurado pela mesma função do app em volta dele, e
 * assim até o fim), a conta do tempo, o caminho com as sugestões da Geoapify de verdade, a escrita pela
 * `plan-trip`, a montagem (pura), as doze cobranças objetivas (`bateria-padroes.ts`) e a nota do juiz
 * (uma leitura da IA que lê o roteiro contra o pedido). Tudo fica em `lab_runs` (`source: bateria`) e
 * em `lab_checks` (um `pedido_NN` por pedido, com `data`), que o painel `/lab` mostra "para sempre ir
 * melhorando e analisá-los". A rodada fica vermelha quando uma cobrança objetiva falha; a nota do juiz
 * é número, não portão. Teto de custo por rodada: a rodada para quando estoura. Os pedidos são
 * inventados pela IA a partir dos padrões, saindo de cidades reais do Sul; nenhum dado de pessoa.
 */
/** O teto de uma rodada (IA mais Google): para antes do pedido que o estouraria. */
export const BATERIA_TETO_USD = 1.5;
/**
 * A busca do Google com a máscara Enterprise: US$ 35 por mil depois da faixa grátis (a página de preços,
 * 22/11/2026). A estimativa conta cada busca como paga, para o teto errar para cima.
 */
export const GOOGLE_USD_POR_BUSCA = 0.035;

const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const plusDay = (date: string) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const usd = (v: number) => v.toFixed(4);

type Pedido = { texto: string; cidade_saida: string; padrao: string };
type Leitura = { rotulo: string; run: TimedImport };

function contexto(today: string, cidade: Cidade, today_kind: boolean): PlanContext {
  return {
    today,
    now: '09:00',
    origin: rotuloDaCidade(cidade),
    position: null,
    place: null,
    interests: [],
    learned: [],
    history: [],
    weather: null,
    reach: today_kind ? 'day' : null,
  };
}

/** A primeira opção de um passo, como uma pessoa que toca no primeiro cartão. */
function chooseFirstOf(map: MapStage, group: number): MapStage {
  const first = map.groups[group]?.options[0];
  return first ? toggleChoice(map, first.place.id) : map;
}

/**
 * A escolha passo a passo, como o app (fase 26): o primeiro candidato do passo da vez; o passo seguinte
 * procurado pela mesma função do app em volta dele (a `find-places` do Google de verdade), e assim até o
 * fim. Devolve o mapa escolhido e o que cada busca do app fez, para as cobranças.
 */
async function chooseStepByStep(
  start: MapStage,
  deps: ReturnType<typeof labDeps>,
): Promise<{ map: MapStage; passos: PassoDoApp[] }> {
  let map = start;
  const passos: PassoDoApp[] = [];
  for (let guard = 0; guard < 8; guard++) {
    const current = currentStep(map);
    if (current === null) break;
    if (map.groups[current]?.status === 'unsearched') {
      const plan = stepSearchPlan(map, current);
      map = await searchStep(map, current, deps);
      const g = map.groups[current];
      if (g?.step && plan) {
        passos.push({
          ordem: g.step.ordem,
          o_que: g.label,
          relacao: g.step.relacao,
          cidade: g.step.cidade,
          anterior: plan.previous
            ? { name: plan.previous.name, lat: plan.previous.at[1], lng: plan.previous.at[0] }
            : null,
          circulos: plan.circles,
          candidatos: g.options.map((o) => o.place),
          fora_da_cidade: g.step.fora_da_cidade,
        });
      }
    }
    map = chooseFirstOf(map, current);
    const next = nextStep(map);
    if (next === null) break;
    map = advanceStep(map, next);
  }
  return { map, passos };
}

/** A resposta a uma pergunta: a primeira opção, ou "tanto faz" quando é livre. */
const firstOption = (q: PlanQuestion) => q.options[0] ?? 'tanto faz';

type ResultadoDoPedido = {
  scenario: string;
  status: 'pass' | 'fail' | 'skip';
  latency_ms: number;
  detail: string;
  data: Record<string, unknown>;
  custo: { ia: number; google: number };
  cobrancas: Cobranca[];
  nota: number | null;
};

export async function runBateria(
  cfg: LabConfig,
  b: Session,
  opts: { rodada: number | null },
): Promise<number> {
  const startedAt = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    startedAt,
  );
  // a rodada do dia: as já gravadas hoje mais uma (ou a dita)
  const earlier = await b.client
    .from('lab_runs')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'bateria')
    .gte('started_at', `${today}T00:00:00-03:00`);
  const rodada = opts.rodada ?? (earlier.count ?? 0) + 1;
  const seed = semente(today, rodada);
  const padroes = padroesDaRodada(seed);
  const todas = cidadesDoSul();
  const cidades = cidadesDaRodada(todas, seed);
  log(
    `bateria: a rodada ${String(rodada)} de ${today} (semente ${seed}), ${String(padroes.length)} padrões, ${String(cidades.length)} cidades oferecidas`,
  );

  const leituras: Leitura[] = [];
  const custoDe = (run: TimedImport) =>
    run.usage && run.model ? (costUsd(run.model, run.usage) ?? 0) : 0;
  let custoIa = 0;
  let custoGoogle = 0;
  let buscas = 0;
  const calls: Calls = { places: 0, noSource: false, geocoded: [] };
  const deps = labDeps(cfg, b, calls);

  // 1. os dez pedidos, gerados pela IA a partir dos padrões e das cidades (uma leitura)
  log('bateria: gerando os pedidos');
  const gerar: PlanSearchRequest = {
    modo: 'gerar_pedidos',
    text: `bateria ${seed}`,
    context: contexto(
      today,
      cidades[0] ?? { nome: 'Canoinhas', uf: 'SC', lat: -26.18, lng: -50.39, pop: 0 },
      false,
    ),
    gerar: { semente: seed, padroes, cidades: cidades.map(rotuloDaCidade) },
  };
  const gerado = await timedImport(cfg, b, gerar, PLAN_SEARCH_FN);
  leituras.push({ rotulo: 'gerar os pedidos', run: gerado });
  custoIa += custoDe(gerado);
  const parsedBatch =
    gerado.outcome === 'done' ? generatedBatchSchema.safeParse(gerado.data) : null;
  const pedidos: Pedido[] = parsedBatch?.success
    ? parsedBatch.data.pedidos.slice(0, PEDIDOS_POR_RODADA)
    : [];
  if (pedidos.length === 0) {
    const why = `${gerado.outcome} ${gerado.code ?? ''}`.trim();
    log(`bateria: a geração dos pedidos falhou (${why})`);
    await gravar(b, cfg, {
      id: randomUUID(),
      startedAt,
      status: 'fail',
      summary: `a geração dos dez pedidos falhou: ${why}`,
      diagnostics: { rodada, semente: seed, padroes, custo_ia_usd: custoIa, custo_google_usd: 0 },
      checks: [],
    });
    return 1;
  }

  // 2. cada pedido pelo planejador de verdade
  const resultados: ResultadoDoPedido[] = [];
  for (const [i, pedido] of pedidos.entries()) {
    const scenario = `pedido_${String(i + 1).padStart(2, '0')}`;
    const t0 = Date.now();
    if (custoIa + custoGoogle >= BATERIA_TETO_USD) {
      resultados.push({
        scenario,
        status: 'skip',
        latency_ms: 0,
        detail: `não rodou: o teto de US$ ${usd(BATERIA_TETO_USD)} da rodada chegou antes (US$ ${usd(custoIa + custoGoogle)})`,
        data: { texto: pedido.texto, padrao: pedido.padrao, cidade_saida: pedido.cidade_saida },
        custo: { ia: 0, google: 0 },
        cobrancas: [],
        nota: null,
      });
      continue;
    }
    const cidade = cidadePeloRotulo(todas, pedido.cidade_saida) ?? cidades[0];
    if (!cidade) throw new Error('sem cidade de saída');
    const kind = isToday(pedido.texto) ? 'today' : 'plan';
    log(`bateria: ${scenario} (${kind}, saindo de ${rotuloDaCidade(cidade)})`);
    const data: Record<string, unknown> = {
      texto: pedido.texto,
      padrao: pedido.padrao,
      cidade_saida: rotuloDaCidade(cidade),
      tipo: kind,
    };
    let ia = 0;
    let google = 0;
    const cobrancas: Cobranca[] = [];
    let nota: number | null = null;
    let detail: string;
    let falhou: string | null = null;
    // a chamada que quebrou no meio (a escrita que não veio): o pedido fica vermelho, não verde
    let quebrou: string | null = null;
    try {
      // a saída de hoje: a pergunta de alcance é do app; aqui, "o dia"
      const questions: PlanQuestion[] = kind === 'today' ? [reachQuestion('09:00')] : [];
      const answers: string[] = kind === 'today' ? ['O dia'] : [];
      const reference = {
        lat: Math.round(cidade.lat * 100) / 100,
        lng: Math.round(cidade.lng * 100) / 100,
      };
      const planejar = (qs: PlanQuestion[], as: string[]): PlanSearchRequest => ({
        kind,
        // o passo a passo (fase 26): a IA procura só o passo 1; a bateria procura os seguintes como o app
        passo_a_passo: true,
        text: pedido.texto,
        questions: qs,
        answers: as,
        context: {
          ...contexto(today, cidade, kind === 'today'),
          reach: kind === 'today' ? reachOf(readReach(as[0] ?? '')) : null,
        },
        reference,
      });
      // a primeira rodada do planejador
      const r1 = await timedImport(cfg, b, planejar(questions, answers), PLAN_SEARCH_FN);
      leituras.push({ rotulo: `${scenario} · planejador`, run: r1 });
      ia += custoDe(r1);
      let result: PlanSearchResult | null = null;
      const p1 = r1.outcome === 'done' ? planSearchResultSchema.safeParse(r1.data) : null;
      if (!p1?.success)
        throw new Error(`o planejador: ${r1.outcome} ${r1.code ?? ''} ${r1.reason ?? ''}`.trim());
      result = p1.data;
      google += result.numeros.buscas * GOOGLE_USD_POR_BUSCA;
      buscas += result.numeros.buscas;
      let perguntasFeitas = result.passeio.perguntas.length;
      let rodadas = 1;
      // a IA perguntou e não entregou passo com candidato: a resposta (a primeira opção) e a segunda rodada
      if (
        result.passeio.perguntas.length > 0 &&
        !result.passeio.passos.some((p) => p.candidatos.length > 0)
      ) {
        const qs = [...questions, ...result.passeio.perguntas].slice(0, 3);
        const as = qs.map((q, j) => answers[j] ?? firstOption(q));
        data.respostas = qs.map((q, j) => `${q.text} → ${as[j] ?? ''}`);
        const r2 = await timedImport(cfg, b, planejar(qs, as), PLAN_SEARCH_FN);
        leituras.push({ rotulo: `${scenario} · planejador (2ª rodada)`, run: r2 });
        ia += custoDe(r2);
        const p2 = r2.outcome === 'done' ? planSearchResultSchema.safeParse(r2.data) : null;
        if (!p2?.success)
          throw new Error(`a segunda rodada: ${r2.outcome} ${r2.code ?? ''}`.trim());
        result = p2.data;
        google += result.numeros.buscas * GOOGLE_USD_POR_BUSCA;
        buscas += result.numeros.buscas;
        perguntasFeitas += result.passeio.perguntas.length;
        rodadas = 2;
      }
      const origin = {
        label: rotuloDaCidade(cidade),
        at: [cidade.lng, cidade.lat] as [number, number],
      };
      const { stage, dropped } = stageFromOuting(result, origin, origin.at);
      data.planejador = {
        rodadas,
        numeros: result.numeros,
        passos: result.passeio.passos.map((p) => ({
          ordem: p.ordem,
          o_que: p.o_que,
          relacao: p.relacao,
          cidade: p.cidade,
          hora_do_dia: p.hora_do_dia,
          achou: p.achou,
          fora_da_cidade: p.fora_da_cidade,
          candidatos: p.candidatos
            .map((ref) => result.lugares.find((f) => f.ref === ref)?.place)
            .filter((x) => x !== undefined)
            .map(
              (x) =>
                `${x.name}${x.city ? ` (${x.city})` : ''}${x.rating ? ` ${x.rating.toFixed(1)}` : ''}`,
            ),
        })),
        pendentes: result.passeio.pendentes,
        perguntas: result.passeio.perguntas.map((q) => q.text),
        destino: result.passeio.destino,
        origem: result.passeio.origem,
        referencias_sem_lugar: dropped,
      };
      // a escolha passo a passo (fase 26): o primeiro de cada passo, o seguinte procurado em volta dele
      const googleAntes = calls.google ?? 0;
      const stepwise = await chooseStepByStep(stage, deps);
      const chosen = stepwise.map;
      const buscasDoApp = (calls.google ?? 0) - googleAntes;
      google += buscasDoApp * GOOGLE_USD_POR_BUSCA;
      buscas += buscasDoApp;
      const escolhidos = chosen.chosen.map(
        (id) =>
          chosen.groups.flatMap((g) => g.options).find((o) => o.place.id === id)?.place.name ?? id,
      );
      const escolhasPorPasso = stepGroups(chosen).map((gi) => {
        const g = chosen.groups[gi];
        return {
          ordem: g?.step?.ordem ?? 0,
          nomes: (g?.options ?? [])
            .filter((o) => chosen.chosen.includes(o.place.id))
            .map((o) => o.place.name),
        };
      });
      data.passo_a_passo = stepwise.passos.map((p) => ({
        ordem: p.ordem,
        o_que: p.o_que,
        relacao: p.relacao,
        em_volta_de: p.anterior?.name ?? null,
        circulos: p.circulos.length,
        candidatos: p.candidatos.slice(0, 6).map((c) => `${c.name}${c.city ? ` (${c.city})` : ''}`),
        achou: p.candidatos.length,
      }));
      data.buscas_do_app = buscasDoApp;
      // a conta do tempo, como a tela a mostra (a hora de sair da montagem; o dia do passeio)
      const time = {
        start: kind === 'today' ? '09:15' : '08:00',
        date: kind === 'today' ? today : plusDay(today),
      };
      const budget = timeBudget({
        answer: answersByTopic(questions, answers).reach ?? null,
        tempo_min: result.passeio.tempo_min ?? null,
      });
      const acc = chosen.chosen.length > 0 ? stageAccount(chosen, time) : null;
      let conta: ContaDoTempo | null = acc
        ? {
            total_min: acc.total,
            tempo_min: budget?.minutes ?? null,
            estoura: budget ? overBudget(acc.total, budget.minutes) : false,
            chegadas: acc.arrivals.map((a) => ({
              nome: a.name,
              hora: a.at,
              aviso: a.outsideWindow ?? (a.closed ? `fechado às ${a.at}` : null),
              fechada: a.closed,
            })),
          }
        : null;
      let write: PlanWrite | null = null;
      let pendentes: string[] = [];
      let paradas: { nome: string; sem_local: boolean }[] | undefined;
      if (chosen.chosen.length > 0 || chosen.destination) {
        const t1 = Date.now();
        const prepared = await prepare(chosen, { interests: [], learned: [] }, deps);
        pendentes = prepared.missing.map((m) => m.name);
        data.caminho = {
          ms: Date.now() - t1,
          rota: prepared.routed ? 'real' : 'reta',
          sugestoes: prepared.suggestions.map((x) => x.place.name),
          pendentes,
        };
        const escrever: PlanRequest = {
          step: 'plan',
          kind,
          text: pedido.texto,
          questions: kind === 'today' ? questions : data.respostas ? [] : [],
          answers: kind === 'today' ? answers : [],
          context: {
            ...contexto(today, cidade, kind === 'today'),
            reach: kind === 'today' ? 'day' : null,
          },
          places: prepared.places,
        };
        const w = await timedImport(cfg, b, escrever, PLAN_FN);
        leituras.push({ rotulo: `${scenario} · escrita`, run: w });
        ia += custoDe(w);
        const pw = w.outcome === 'done' ? planWriteSchema.safeParse(w.data) : null;
        write = pw?.success ? pw.data : null;
        if (!write) quebrou = `a escrita não rodou: ${w.outcome} ${w.code ?? ''}`.trim();
        if (write) {
          // a montagem, pura, como o app faz: a ordem das paradas, os pendentes sem local, os avisos
          const built = assemble({
            origin: chosen.origin,
            chosen: prepared.picks,
            chosenFractions: prepared.chosenFractions,
            suggestions: prepared.suggestions,
            nights: [],
            legs: prepared.legs,
            missing: prepared.missing,
            write,
            firstDate: time.date,
            defaultStart: time.start,
          });
          paradas = built.data.days.flatMap((d, di) =>
            d.stops.flatMap((st, si) => {
              const key = `d${String(di)}s${String(si)}`;
              if (st.kind === 'origin' || built.suggestions[key]) return [];
              return [{ nome: st.name, sem_local: st.lat === null }];
            }),
          );
          // os avisos da revisão (o horário do lugar, a hora do dia) entram na conta que o juiz lê
          const avisos = built.data.days.flatMap((d, di) =>
            d.stops.flatMap((st, si) => {
              const key = `d${String(di)}s${String(si)}`;
              const aviso =
                hoursNotice(built.hours[key], d.date, st.time) ??
                dayTimeNotice(built.dayTimes[key], st.time);
              return aviso ? [{ nome: st.name, hora: st.time ?? '', aviso }] : [];
            }),
          );
          if (conta) {
            conta = {
              ...conta,
              chegadas: conta.chegadas.map((c) => {
                const a = avisos.find((x) => x.nome === c.nome);
                return a ? { ...c, hora: a.hora || c.hora, aviso: a.aviso } : c;
              }),
            };
          }
          data.montagem = { paradas, avisos: avisos.map((a) => `${a.nome}: ${a.aviso}`) };
        }
        data.roteiro = write
          ? {
              nome: write.trip.name,
              dias: write.days.map((d) => ({
                titulo: d.title,
                saida: d.start,
                paradas: d.stops.length,
              })),
              antes: write.checklist_before,
              mala: write.checklist_pack,
              missoes: write.quests.map((q) => q.text),
            }
          : `a escrita: ${w.outcome} ${w.code ?? ''}`.trim();
      } else {
        data.roteiro = 'nada escolhido: a escrita não rodou';
      }
      data.conta = conta;
      // as cobranças objetivas e o juiz
      const saida = {
        origem: { lat: cidade.lat, lng: cidade.lng },
        lugares: result.lugares,
        passeio: result.passeio,
        perguntas: perguntasFeitas,
        respostas: Array.isArray(data.respostas) ? (data.respostas as string[]) : [],
        write,
        pendentes: [...pendentes, ...result.passeio.pendentes.map((p) => p.o_que)],
        passos_app: stepwise.passos,
        escolhas: escolhasPorPasso,
        ...(paradas ? { paradas } : {}),
        conta,
      };
      cobrancas.push(...cobrar(saida));
      const julgar: PlanSearchRequest = {
        modo: 'julgar',
        kind,
        text: pedido.texto,
        context: contexto(today, cidade, kind === 'today'),
        julgar: { roteiro: roteiroParaJuiz(saida, escolhidos) },
      };
      const j = await timedImport(cfg, b, julgar, PLAN_SEARCH_FN);
      leituras.push({ rotulo: `${scenario} · juiz`, run: j });
      ia += custoDe(j);
      const pj = j.outcome === 'done' ? verdictSchema.safeParse(j.data) : null;
      const veredito: Verdict | null = pj?.success ? pj.data : null;
      nota = veredito?.nota ?? null;
      data.juiz = veredito ?? `o juiz: ${j.outcome} ${j.code ?? ''}`.trim();
      data.escolhidos = escolhidos;
      const falhas = cobrancas.filter((c) => !c.ok);
      detail = [
        `"${pedido.texto}"`,
        `${String(result.passeio.passos.length)} passo(s), ${String(result.lugares.length)} lugar(es) (${result.numeros.fonte}), ${String(result.passeio.pendentes.length)} pendente(s), ${String(perguntasFeitas)} pergunta(s)`,
        `juiz ${nota === null ? '—' : String(nota)}/10`,
        ...(conta
          ? [
              `tempo ${String(conta.total_min)} min${conta.tempo_min === null ? '' : ` de ${String(conta.tempo_min)}${conta.estoura ? ' (estoura)' : ''}`}`,
            ]
          : []),
        ...(buscasDoApp > 0 ? [`${String(buscasDoApp)} busca(s) do app`] : []),
        falhas.length > 0
          ? `FALHOU: ${falhas.map((c) => `${c.nome} (${c.detalhe})`).join('; ')}`
          : 'cobranças verdes',
        ...(quebrou ? [`QUEBROU: ${quebrou}`] : []),
      ].join(' · ');
    } catch (err) {
      falhou = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? 'falhou';
      detail = `"${pedido.texto}" · ${falhou}`;
    }
    custoIa += ia;
    custoGoogle += google;
    data.custo = { ia_usd: ia, google_usd: google, total_usd: ia + google };
    data.cobrancas = cobrancas;
    data.tempo_ms = Date.now() - t0;
    resultados.push({
      scenario,
      status: falhou || quebrou || cobrancas.some((c) => !c.ok) ? 'fail' : 'pass',
      latency_ms: Date.now() - t0,
      detail: detail.slice(0, 1000),
      data,
      custo: { ia, google },
      cobrancas,
      nota,
    });
    log(`bateria: ${scenario} ${resultados.at(-1)?.status ?? '?'} · ${detail.slice(0, 700)}`);
  }

  // 3. a rodada gravada, e a tabela
  const notas = resultados.map((r) => r.nota).filter((n): n is number => n !== null);
  const media = notas.length > 0 ? notas.reduce((a, n) => a + n, 0) / notas.length : null;
  const failed = resultados.filter((r) => r.status === 'fail');
  const status: 'pass' | 'fail' = failed.length > 0 ? 'fail' : 'pass';
  const summary = `bateria ${String(rodada)} de ${today}: ${String(resultados.filter((r) => r.status === 'pass').length)} de ${String(pedidos.length)} pedidos verdes${failed.length > 0 ? ` (falharam: ${failed.map((r) => r.scenario).join(', ')})` : ''}; juiz ${media === null ? '—' : media.toFixed(1)}/10; US$ ${usd(custoIa + custoGoogle)} (IA ${usd(custoIa)}, Google ~${usd(custoGoogle)})`;
  const diagnostics = {
    rodada,
    semente: seed,
    padroes,
    cidades_oferecidas: cidades.map(rotuloDaCidade),
    custo_total_usd: custoIa + custoGoogle,
    custo_ia_usd: custoIa,
    custo_google_usd: custoGoogle,
    google_usd_por_busca: GOOGLE_USD_POR_BUSCA,
    buscas_google: buscas,
    buscas_geoapify: calls.places,
    leituras: leituras.length,
    teto_usd: BATERIA_TETO_USD,
    juiz_media: media,
  };
  const head =
    '| pedido | padrão | de | resultado | juiz | US$ | o que saiu |\n|---|---|---|---|---|---|---|';
  const rows = resultados.map((r, i) => {
    const p = pedidos[i];
    return `| ${r.scenario} | ${(p?.padrao ?? '').replaceAll('|', '/')} | ${(p?.cidade_saida ?? '').replaceAll('|', '/')} | ${r.status} | ${r.nota === null ? '—' : String(r.nota)} | ${usd(r.custo.ia + r.custo.google)} | ${r.detail.replaceAll('|', '/')} |`;
  });
  const leiturasHead =
    '| leitura | resultado | 1º caractere | fim | entrada | saída | US$ |\n|---|---|---|---|---|---|---|';
  const leiturasRows = leituras.map(({ rotulo, run }) => {
    const cost = run.usage && run.model ? costUsd(run.model, run.usage) : null;
    return `| ${rotulo} | ${run.outcome === 'done' ? `ok · ${run.model ?? ''}` : `${run.outcome} ${run.code ?? ''}`} | ${s(run.first_char_ms)} | ${s(run.end_ms)} | ${run.usage?.input_tokens ?? '—'} | ${run.usage?.output_tokens ?? '—'} | ${cost === null ? '—' : cost.toFixed(4)} |`;
  });
  const report = `## Bateria de pedidos de leigo · rodada ${String(rodada)} de ${today}\n\n${summary}\n\nSemente \`${seed}\`. Padrões da rodada:\n${padroes.map((p) => `- ${p}`).join('\n')}\n\n${[head, ...rows].join('\n')}\n\n### As leituras\n\n${[leiturasHead, ...leiturasRows].join('\n')}\n\nBuscas no Google (pelo planejador): ${String(buscas)} (~US$ ${usd(custoGoogle)} a US$ ${String(GOOGLE_USD_POR_BUSCA)} cada, antes da faixa grátis); buscas na Geoapify (as sugestões): ${String(calls.places)}${calls.noSource ? ' (sem fonte)' : ''}.\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);

  // a rodada gravada depois do relatório: se o banco falhar, a tabela já está no log e no resumo
  await gravar(b, cfg, {
    id: randomUUID(),
    startedAt,
    status,
    summary,
    diagnostics,
    checks: resultados.map((r) => ({
      scenario: r.scenario,
      status: r.status,
      latency_ms: r.latency_ms,
      detail: r.detail,
      data: r.data,
    })),
  });
  return status === 'fail' ? 1 : 0;
}

async function gravar(
  b: Session,
  cfg: LabConfig,
  run: {
    id: string;
    startedAt: Date;
    status: 'pass' | 'fail';
    summary: string;
    diagnostics: Record<string, unknown>;
    checks: {
      scenario: string;
      status: 'pass' | 'fail' | 'skip';
      latency_ms: number;
      detail: string;
      data: Record<string, unknown>;
    }[];
  },
): Promise<void> {
  const commit = process.env.GITHUB_SHA ?? null;
  // o banco é sempre o da produção (o preview da Vercel usa o mesmo projeto, D106): o alvo do painel
  await comRetentativa(
    async () => {
      ok(
        await b.client.from('lab_runs').insert({
          id: run.id,
          target: cfg.target,
          source: 'bateria',
          commit_sha: commit,
          status: run.status,
          summary: run.summary.slice(0, 500),
          started_at: run.startedAt.toISOString(),
          finished_at: new Date().toISOString(),
          diagnostics: run.diagnostics as NonNullable<Json>,
        }),
        'gravar a rodada da bateria',
      );
    },
    { tentativas: 3, esperaMs: (n) => n * 3_000 },
  );
  // os pedidos um a um, cada um com até três tentativas (a rede do laboratório falha de vez em
  // quando: um 522 do Cloudflare perdeu os dez pedidos da primeira rodada): um que falhe não leva
  // os outros, e a lista dos que não gravaram vai para o erro
  const perdidos: string[] = [];
  for (const c of run.checks) {
    try {
      await comRetentativa(
        async () => {
          ok(
            await b.client.from('lab_checks').insert({
              run_id: run.id,
              scenario: c.scenario,
              status: c.status,
              latency_ms: c.latency_ms,
              detail: c.detail.slice(0, 1000),
              data: c.data as NonNullable<Json>,
            }),
            `gravar ${c.scenario}`,
          );
        },
        {
          tentativas: 3,
          esperaMs: (n) => n * 3_000,
          onFalha: (n, err) =>
            log(
              `bateria: gravar ${c.scenario}, tentativa ${String(n)} falhou: ${(err instanceof Error ? err.message : String(err)).split('\n')[0]?.slice(0, 200) ?? ''}`,
            ),
        },
      );
    } catch {
      perdidos.push(c.scenario);
    }
  }
  if (perdidos.length > 0) {
    throw new Error(`gravar os pedidos da bateria: não gravou ${perdidos.join(', ')}`);
  }
}
