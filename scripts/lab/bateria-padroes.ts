import { readFileSync } from 'node:fs';
import { haversineM } from '../../supabase/functions/_shared/geo.ts';
import { inCity } from '../../supabase/functions/_shared/google-places.ts';
import type { FoundPlace, Outing } from '../../supabase/functions/_shared/plan-search-protocol.ts';
import type { PlanWrite } from '../../supabase/functions/_shared/plan-protocol.ts';
import { decodeInts, decodeLine } from '../../src/lib/geo/codec.ts';

/**
 * A bateria de pedidos de leigo (fase 27, a 3.3), a parte pura: os padrões de pedido que rodam a cada
 * rodada (a decisão do Douglas de 22/11: os dez pedidos são novos a cada rodada e os padrões mudam),
 * a semente que os escolhe, as cidades reais do Sul de onde a pessoa inventada sai (do dado embutido
 * do app: o IBGE e os centroides; inventa-se a pessoa, não a cidade), e as cobranças objetivas sobre o
 * que saiu. Nada de pessoa de verdade: nem nome, nem telefone, nem endereço.
 */

/** Os padrões: cada rodada cobre dez deles, girando pela semente, e a IA escreve um pedido por padrão. */
export const PADROES: readonly string[] = [
  'uma cidade dita com dois ou três tipos de lugar ("café, feirinha e salão em X")',
  'o tempo dito de um jeito que um leigo escreve ("1:30 no maximo", "umas 3 horas", "a tarde")',
  'a ordem dita ("primeiro X, depois Y") entre dois lugares de tipos diferentes',
  'dois lugares sem a ordem dita ("uma cachoeira e um café")',
  'um lugar público nomeado da região (um parque, um museu, uma cachoeira conhecida) mais um tipo',
  'um lugar que só a pessoa conhece ("a casa da minha mãe em X", "a feirinha") mais um tipo',
  '"o melhor" ou "bem avaliado" de um tipo ("o melhor café que tiver")',
  'uma região que não é cidade ("Serra", "Litoral", "Vale") como destino, com um tipo',
  'a saída de hoje ("quero sair hoje", "agora à tarde") com um tipo e sem cidade',
  'erros de digitação e sem acento ("caxoeira", "almosar", "cafe")',
  '"aqui perto", "na cidade", "pertinho" como alcance, sem cidade dita',
  'um pedido vago, sem tipo de lugar ("quero sair pra algum lugar legal no domingo")',
  'ir para uma cidade de destino com uma parada no caminho ("vou pra X, parar pra almoçar no caminho")',
  'um pedido para a família com horário do dia ("de manhã", "à noite") e dois tipos',
];
export const PEDIDOS_POR_RODADA = 10;

/** A semente de uma rodada: a data e o número da rodada no dia. */
export const semente = (date: string, rodada: number): string => `${date}#${String(rodada)}`;

/** Um número de 32 bits a partir de um texto (FNV-1a): o mesmo texto, a mesma sequência. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Um embaralhamento determinístico pela semente (Fisher–Yates com um gerador simples). */
export function embaralhar<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  let state = hash32(seed) || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/**
 * Os padrões de uma rodada: dez dos quatorze, girando pela semente (a rodada seguinte deixa outros
 * de fora e muda a ordem), para os pedidos não repetirem a forma.
 */
export function padroesDaRodada(seed: string, n = PEDIDOS_POR_RODADA): string[] {
  return embaralhar(PADROES, seed).slice(0, n);
}

export type Cidade = { nome: string; uf: string; lat: number; lng: number; pop: number };

/**
 * As cidades reais do Sul (SC, PR e RS) com mais de 20 mil habitantes, do dado embutido do app (o
 * IBGE e os centroides), lidas do arquivo como o app as lê. A pessoa é inventada; a cidade, não.
 */
export function cidadesDoSul(
  file = 'src/lib/geo/data/municipalities.json',
  minPop = 20_000,
): Cidade[] {
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    names: string;
    uf: string;
    coords: string;
    pop: string;
  };
  const names = data.names.split('|');
  const coords = decodeLine(data.coords);
  const pop = decodeInts(data.pop);
  return names
    .map((nome, i) => ({
      nome,
      uf: data.uf.slice(i * 2, i * 2 + 2),
      lng: coords[i]?.[0] ?? 0,
      lat: coords[i]?.[1] ?? 0,
      pop: pop[i] ?? 0,
    }))
    .filter((c) => ['SC', 'PR', 'RS'].includes(c.uf) && c.pop >= minPop);
}

/** As cidades de saída oferecidas à IA numa rodada: até 30, variadas pela semente. */
export function cidadesDaRodada(cidades: readonly Cidade[], seed: string, n = 30): Cidade[] {
  return embaralhar(cidades, `cidades:${seed}`).slice(0, n);
}

export const rotuloDaCidade = (c: Pick<Cidade, 'nome' | 'uf'>): string => `${c.nome}, ${c.uf}`;

/** A cidade da lista pelo rótulo que a IA devolveu ("Canoinhas, SC"), sem acento nem caixa. */
export function cidadePeloRotulo(cidades: readonly Cidade[], rotulo: string): Cidade | null {
  const plain = (s: string) =>
    s
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const wanted = plain(rotulo);
  return (
    cidades.find((c) => plain(rotuloDaCidade(c)) === wanted) ??
    cidades.find((c) => plain(c.nome) === wanted.split(',')[0]?.trim()) ??
    null
  );
}

// -------------------------------------------------------------------------- as cobranças
export type Cobranca = { nome: string; ok: boolean; detalhe: string };

/** O que saiu de um pedido, o que as cobranças olham. */
export type Saida = {
  /** de onde a pessoa saiu (a cidade da lista) */
  origem: { lat: number; lng: number };
  lugares: readonly FoundPlace[];
  passeio: Outing;
  /** as perguntas que a IA fez (as duas rodadas somadas) */
  perguntas: number;
  /** a escrita, quando houve */
  write: PlanWrite | null;
  /** o que ficou pendente e foi para a escrita (os nomes) */
  pendentes: readonly string[];
};

/** O Brasil, grosso modo, pela coordenada. */
const inBrazil = (p: { lat: number; lng: number }) =>
  p.lat >= -34 && p.lat <= 6 && p.lng >= -74.5 && p.lng <= -34;
/** Até onde um lugar ainda é "ao alcance" de um passeio de carro: o teto da D228. */
const ALCANCE_KM = 400;

const plainWords = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
const STOP = new Set([
  'para',
  'onde',
  'fica',
  'minha',
  'casa',
  'quero',
  'cortar',
  'tomar',
  'levar',
]);

/**
 * As cobranças objetivas (a sugestão do balcão, adotada e registrada): valem para qualquer pedido. A
 * rodada fica vermelha quando uma falha; a nota do juiz é número, não portão.
 */
export function cobrar(saida: Saida): Cobranca[] {
  const places = saida.passeio.passos.flatMap((p) =>
    p.candidatos.flatMap((ref) => {
      const f = saida.lugares.find((x) => x.ref === ref);
      return f ? [{ passo: p, place: f.place }] : [];
    }),
  );
  const out: Cobranca[] = [];

  // 1. nada fora do alcance dito: todo candidato a até 400 km de onde se sai
  const longe = places.filter(
    ({ place }) =>
      haversineM([saida.origem.lng, saida.origem.lat], [place.lng, place.lat]) / 1000 > ALCANCE_KM,
  );
  out.push({
    nome: 'alcance',
    ok: longe.length === 0,
    detalhe:
      longe.length === 0
        ? `todos os ${String(places.length)} candidatos a até ${String(ALCANCE_KM)} km de onde se sai`
        : `${String(longe.length)} candidato(s) a mais de ${String(ALCANCE_KM)} km: ${longe
            .slice(0, 3)
            .map((x) => x.place.name)
            .join(', ')}`,
  });

  // 2. nada some em silêncio: cada passo tem candidatos ou está dito como não achado; algo saiu
  const mudo = saida.passeio.passos.filter((p) => p.achou && p.candidatos.length === 0);
  const nada = saida.passeio.passos.length + saida.passeio.pendentes.length === 0;
  out.push({
    nome: 'nada_some',
    ok: mudo.length === 0 && (!nada || saida.perguntas > 0),
    detalhe: nada
      ? saida.perguntas > 0
        ? 'nenhum passo, mas a IA perguntou'
        : 'nenhum passo, nenhum pendente, nenhuma pergunta'
      : mudo.length === 0
        ? `${String(saida.passeio.passos.length)} passo(s) e ${String(saida.passeio.pendentes.length)} pendente(s), cada um com desfecho`
        : `passo dito como achado sem candidato: ${mudo.map((p) => p.o_que).join(', ')}`,
  });

  // 3. a ordem dita mantida: os passos numerados de 1 a n, sem buraco
  const ordens = [...saida.passeio.passos].sort((a, b) => a.ordem - b.ordem).map((p) => p.ordem);
  const emOrdem = ordens.every((o, i) => o === i + 1);
  out.push({
    nome: 'ordem',
    ok: emOrdem,
    detalhe: emOrdem
      ? `ordem ${ordens.join(' → ') || '—'}`
      : `ordem com buraco ou repetida: ${ordens.join(', ')}`,
  });

  // 4. a cidade certa: num passo com cidade, os candidatos são da cidade (ou vêm ditos como vizinhos)
  const foraDaCidade = places.filter(
    ({ passo, place }) =>
      passo.cidade !== '' &&
      !passo.fora_da_cidade &&
      place.city !== null &&
      !inCity(place, passo.cidade),
  );
  out.push({
    nome: 'cidade',
    ok: foraDaCidade.length === 0,
    detalhe:
      foraDaCidade.length === 0
        ? 'os candidatos de cada passo com cidade são da cidade (ou ditos como vizinhos)'
        : `fora da cidade do passo: ${foraDaCidade
            .slice(0, 3)
            .map((x) => `${x.place.name} (${x.place.city ?? '?'} ≠ ${x.passo.cidade})`)
            .join(', ')}`,
  });

  // 5. nenhuma opção fora do Brasil
  const fora = places.filter(({ place }) => !inBrazil(place));
  out.push({
    nome: 'brasil',
    ok: fora.length === 0,
    detalhe:
      fora.length === 0
        ? 'nenhum candidato fora do Brasil'
        : `fora do Brasil: ${fora
            .slice(0, 3)
            .map((x) => x.place.name)
            .join(', ')}`,
  });

  // 6. a escrita só fala do que entrou: nenhuma palavra do pendente no nome, nos títulos, nas notas,
  //    nas missões e na mala (na lista "antes de viajar", só o que ajuda a resolver)
  if (saida.write && saida.pendentes.length > 0) {
    const words = new Set(saida.pendentes.flatMap(plainWords).filter((w) => !STOP.has(w)));
    const w = saida.write;
    const textos = [
      ['nome da viagem', w.trip.name ?? ''],
      ...w.days.map((d) => ['título do dia', d.title ?? ''] as const),
      ...w.days.flatMap((d) => d.stops.map((s) => ['nota', s.note ?? ''] as const)),
      ...w.quests.map((q) => ['missão', q.text] as const),
      ...w.checklist_pack.map((t) => ['mala', t] as const),
      ...w.checklist_before
        .filter((t) => !/escolher|marcar|onde fica|confirmar onde|achar onde|localizar/i.test(t))
        .map((t) => ['antes de viajar', t] as const),
    ];
    const falhas = textos.filter(([, texto]) => plainWords(texto).some((x) => words.has(x)));
    out.push({
      nome: 'escrita',
      ok: falhas.length === 0,
      detalhe:
        falhas.length === 0
          ? 'a escrita não fala do que ficou pendente'
          : `fala do pendente em ${falhas.map(([onde, texto]) => `${onde}: "${texto}"`).join('; ')}`,
    });
  } else {
    out.push({
      nome: 'escrita',
      ok: true,
      detalhe: saida.write ? 'sem pendente: nada a conferir' : 'a escrita não rodou',
    });
  }
  return out;
}

/** O que saiu, em texto, para o juiz ler contra o pedido (só nomes públicos de lugares). */
export function roteiroParaJuiz(saida: Saida, escolhidos: readonly string[]): string {
  const lines: string[] = [];
  for (const p of [...saida.passeio.passos].sort((a, b) => a.ordem - b.ordem)) {
    const nomes = p.candidatos
      .map((ref) => saida.lugares.find((x) => x.ref === ref)?.place)
      .filter((x): x is FoundPlace['place'] => x !== undefined)
      .map((x) => `${x.name}${x.city ? ` (${x.city})` : ''}`);
    lines.push(
      `passo ${String(p.ordem)}: ${p.o_que} · ${p.relacao}${p.cidade ? ` · ${p.cidade}` : ''}${p.hora_do_dia ? ` · ${p.hora_do_dia}` : ''} · ${
        p.achou
          ? `candidatos: ${nomes.join('; ')}${p.fora_da_cidade ? ' (dos vizinhos)' : ''}`
          : 'não achou'
      }`,
    );
  }
  for (const p of saida.passeio.pendentes) {
    lines.push(`pendente: ${p.o_que}${p.pergunta ? ` · pergunta: ${p.pergunta}` : ''}`);
  }
  for (const q of saida.passeio.perguntas) {
    lines.push(
      `pergunta feita: ${q.text}${q.options.length > 0 ? ` (${q.options.join(' / ')})` : ''}`,
    );
  }
  if (saida.passeio.destino) lines.push(`destino: ${saida.passeio.destino}`);
  lines.push(
    `escolhidos (o primeiro candidato de cada passo): ${escolhidos.join('; ') || 'nenhum'}`,
  );
  const w = saida.write;
  if (w) {
    lines.push(
      `viagem escrita: "${w.trip.name ?? ''}"; dias: ${w.days.map((d) => `${d.title ?? ''} (saída ${d.start ?? '?'}; ${String(d.stops.length)} paradas)`).join('; ')}`,
    );
    if (w.checklist_before.length > 0)
      lines.push(`antes de viajar: ${w.checklist_before.join(' / ')}`);
    if (w.quests.length > 0) lines.push(`missões: ${w.quests.map((q) => q.text).join(' / ')}`);
  } else {
    lines.push('viagem escrita: não houve (nada escolhido)');
  }
  return lines.join('\n').slice(0, 8_000);
}
