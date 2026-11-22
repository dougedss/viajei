import { format } from 'date-fns';
import { CircleCheck, CircleMinus, CircleX, Gavel } from 'lucide-react';
import { z } from 'zod';
import { minutesText } from '@shared/day-span.ts';
import { Card } from '@/components/ui/Card.tsx';
import { cx } from '@/lib/cx.ts';
import type { BateriaRunRow } from '../queries.ts';
import { asStatus } from '../rules.ts';

/**
 * As rodadas da bateria de pedidos de leigo (fase 27, a 3.3) no painel do laboratório: cada rodada com
 * os dez pedidos, o texto de cada um, o que o planejador leu (os passos, as relações, as perguntas), o
 * que o Google achou, o que ficou pendente, a nota do juiz e as cobranças, para o Douglas ler o
 * histórico "e ir melhorando". Só nomes públicos de lugares: os pedidos são inventados pela IA.
 */
const checkSchema = z.looseObject({
  texto: z.string().optional(),
  padrao: z.string().optional(),
  cidade_saida: z.string().optional(),
  tipo: z.string().optional(),
  respostas: z.array(z.string()).optional(),
  planejador: z
    .looseObject({
      numeros: z
        .looseObject({ fonte: z.string().optional(), buscas: z.number().optional() })
        .optional(),
      passos: z
        .array(
          z.looseObject({
            ordem: z.number(),
            o_que: z.string(),
            relacao: z.string(),
            cidade: z.string().optional(),
            achou: z.boolean(),
            fora_da_cidade: z.boolean().optional(),
            candidatos: z.array(z.string()),
          }),
        )
        .optional(),
      pendentes: z.array(z.looseObject({ o_que: z.string(), pergunta: z.string() })).optional(),
      perguntas: z.array(z.string()).optional(),
    })
    .optional(),
  escolhidos: z.array(z.string()).optional(),
  // o passo a passo (fase 26): os passos que o app procurou em volta da escolha anterior e a conta do tempo
  passo_a_passo: z
    .array(
      z.looseObject({
        ordem: z.number(),
        o_que: z.string(),
        relacao: z.string(),
        em_volta_de: z.string().nullable().optional(),
        candidatos: z.array(z.string()),
        achou: z.number().optional(),
      }),
    )
    .optional(),
  conta: z
    .looseObject({
      total_min: z.number(),
      tempo_min: z.number().nullable(),
      estoura: z.boolean(),
    })
    .nullable()
    .optional(),
  roteiro: z
    .union([
      z.string(),
      z.looseObject({
        nome: z.string().nullable(),
        dias: z.array(z.looseObject({ titulo: z.string().nullable(), paradas: z.number() })),
      }),
    ])
    .optional(),
  cobrancas: z
    .array(z.looseObject({ nome: z.string(), ok: z.boolean(), detalhe: z.string() }))
    .optional(),
  juiz: z
    .union([
      z.string(),
      z.looseObject({
        nota: z.number(),
        motivos: z.array(z.string()),
        problemas: z.array(z.string()),
      }),
    ])
    .optional(),
  custo: z.looseObject({ total_usd: z.number().optional() }).optional(),
});
const diagnosticsSchema = z.looseObject({
  rodada: z.number().optional(),
  semente: z.string().optional(),
  custo_total_usd: z.number().optional(),
  juiz_media: z.number().nullable().optional(),
  buscas_google: z.number().optional(),
});

const ICON = { pass: CircleCheck, fail: CircleX, skip: CircleMinus } as const;
const TONE = { pass: 'text-on-time-ink', fail: 'text-late-ink', skip: 'text-ink-2' } as const;
const usd = (v: number | undefined) => (v === undefined ? '—' : `US$ ${v.toFixed(2)}`);

function Pedido({ check }: { check: BateriaRunRow['lab_checks'][number] }) {
  const status = asStatus(check.status);
  const Icon = ICON[status];
  const d = checkSchema.safeParse(check.data);
  const data = d.success ? d.data : null;
  const juiz = data?.juiz && typeof data.juiz !== 'string' ? data.juiz : null;
  return (
    <li
      className="grid gap-1.5 rounded-field bg-paper p-3 text-[14px]"
      data-pedido={check.scenario}
    >
      <p className="flex items-start gap-2">
        <Icon className={cx('mt-0.5 size-4 shrink-0', TONE[status])} aria-label={status} />
        <span className="min-w-0">
          <b className="font-semibold">“{data?.texto ?? check.scenario}”</b>
          {data?.cidade_saida ? (
            <span className="text-ink-2"> · saindo de {data.cidade_saida}</span>
          ) : null}
          {data?.padrao ? (
            <span className="block text-[13px] text-ink-2">padrão: {data.padrao}</span>
          ) : null}
        </span>
        {juiz ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 font-num text-[15px] font-semibold"
            title="a nota do juiz (uma leitura da IA sobre o roteiro contra o pedido): número, não portão"
          >
            <Gavel className="size-4" aria-hidden="true" />
            {juiz.nota}/10
          </span>
        ) : null}
      </p>
      {data?.respostas && data.respostas.length > 0 ? (
        <p className="text-[13px] text-ink-2">respondido: {data.respostas.join(' · ')}</p>
      ) : null}
      {data?.planejador?.passos ? (
        <ul className="grid gap-0.5 text-[13px]">
          {data.planejador.passos.map((p) => (
            <li key={p.ordem}>
              <span className="font-semibold">
                {p.ordem}. {p.o_que}
              </span>{' '}
              <span className="text-ink-2">
                ({p.relacao}
                {p.cidade ? `, ${p.cidade}` : ''}
                {p.fora_da_cidade ? ', nos vizinhos' : ''}){' '}
                {p.achou
                  ? `· ${p.candidatos.slice(0, 4).join('; ')}${p.candidatos.length > 4 ? ` (+${String(p.candidatos.length - 4)})` : ''}`
                  : '· não achou'}
              </span>
            </li>
          ))}
          {(data.planejador.pendentes ?? []).map((p) => (
            <li key={`pend-${p.o_que}`} className="text-ink-2">
              pendente: {p.o_que}
              {p.pergunta ? ` · “${p.pergunta}”` : ''}
            </li>
          ))}
          {(data.planejador.perguntas ?? []).map((q) => (
            <li key={`perg-${q}`} className="text-ink-2">
              perguntou: “{q}”
            </li>
          ))}
        </ul>
      ) : null}
      {data?.passo_a_passo && data.passo_a_passo.length > 0 ? (
        <ul className="grid gap-0.5 text-[13px]" data-passo-a-passo>
          {data.passo_a_passo.map((p) => (
            <li key={`app-${String(p.ordem)}`} className="text-ink-2">
              <span className="font-semibold text-ink">
                {p.ordem}. {p.o_que}
              </span>{' '}
              procurado pelo app{' '}
              {p.em_volta_de ? `em volta de ${p.em_volta_de}` : 'perto de onde sai'} ({p.relacao}){' '}
              {p.candidatos.length > 0
                ? `· ${p.candidatos.slice(0, 4).join('; ')}${(p.achou ?? p.candidatos.length) > 4 ? ` (+${String((p.achou ?? p.candidatos.length) - 4)})` : ''}`
                : '· não achou'}
            </li>
          ))}
        </ul>
      ) : null}
      {data?.conta ? (
        <p className="text-[13px] text-ink-2" data-conta>
          o passeio dá {minutesText(data.conta.total_min)}
          {data.conta.tempo_min === null
            ? ' (sem tempo dito)'
            : `; a pessoa tem ${minutesText(data.conta.tempo_min)}${data.conta.estoura ? ': estoura, marcado' : ': cabe'}`}
        </p>
      ) : null}
      {data?.roteiro ? (
        <p className="text-[13px] text-ink-2">
          {typeof data.roteiro === 'string'
            ? data.roteiro
            : `viagem “${data.roteiro.nome ?? ''}”: ${data.roteiro.dias.map((x) => `${x.titulo ?? '(sem título)'} (${String(x.paradas)} paradas)`).join('; ')}`}
        </p>
      ) : null}
      {data?.cobrancas ? (
        <ul className="flex flex-wrap gap-1.5">
          {data.cobrancas.map((c) => (
            <li
              key={c.nome}
              title={c.detalhe}
              className={cx(
                'rounded-full px-2 py-0.5 text-[12px] font-semibold',
                c.ok ? 'bg-on-time/15 text-on-time-ink' : 'bg-late/15 text-late-ink',
              )}
            >
              {c.ok ? '✓' : '✗'} {c.nome}
            </li>
          ))}
        </ul>
      ) : null}
      {juiz && (juiz.problemas.length > 0 || juiz.motivos.length > 0) ? (
        <p className="text-[13px] text-ink-2">
          {juiz.problemas.length > 0
            ? `juiz: ${juiz.problemas.join('; ')}`
            : `juiz: ${juiz.motivos.join('; ')}`}
        </p>
      ) : null}
      {status === 'fail' || status === 'skip' ? (
        <p className="text-[13px] break-words text-ink-2">{check.detail}</p>
      ) : null}
      {data?.custo?.total_usd !== undefined ? (
        <p className="text-[12px] text-ink-2">{usd(data.custo.total_usd)}</p>
      ) : null}
    </li>
  );
}

function Rodada({ run }: { run: BateriaRunRow }) {
  const status = asStatus(run.status);
  const Icon = ICON[status];
  const d = diagnosticsSchema.safeParse(run.diagnostics);
  const diag = d.success ? d.data : null;
  const checks = [...run.lab_checks].sort((a, b) => a.scenario.localeCompare(b.scenario));
  return (
    <details
      className="group rounded-card bg-card shadow-[inset_0_0_0_1px_var(--color-line)]"
      data-bateria={run.id}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <Icon className={cx('size-5 shrink-0', TONE[status])} aria-label={status} />
        <span className="grid min-w-0 flex-1">
          <span className="font-num text-[17px] font-semibold">
            {format(new Date(run.started_at), 'dd/MM HH:mm')}
            {diag?.rodada !== undefined ? ` · rodada ${String(diag.rodada)}` : ''}
          </span>
          <span className="truncate text-[13px] text-ink-2">{run.summary ?? ''}</span>
        </span>
        <span className="grid shrink-0 text-right text-[13px] text-ink-2">
          <span className="font-num text-[15px] font-semibold text-ink">
            {diag?.juiz_media === null || diag?.juiz_media === undefined
              ? '—'
              : `${diag.juiz_media.toFixed(1)}/10`}
          </span>
          <span>{usd(diag?.custo_total_usd)}</span>
        </span>
      </summary>
      <ul className="grid gap-2 border-t border-line px-4 py-3">
        {checks.map((c) => (
          <Pedido key={c.scenario} check={c} />
        ))}
      </ul>
    </details>
  );
}

/** A seção da bateria no painel: as rodadas, da mais nova para a mais antiga. */
export function BateriaSection({ runs }: { runs: readonly BateriaRunRow[] }) {
  return (
    <section aria-labelledby="h-bateria" className="grid gap-3" data-bateria-section>
      <h2 id="h-bateria" className="label-caps text-accent-ink">
        Bateria de pedidos de leigo
      </h2>
      <p className="text-[13px] text-ink-2">
        Dez pedidos novos a cada rodada, pelo planejador de verdade (a IA com as ferramentas e o
        Google), sob pedido e fora do deploy: Actions → Laboratório → Run workflow → tarefa{' '}
        <b className="font-semibold">bateria</b>. A rodada fica vermelha quando uma cobrança
        objetiva falha; a nota do juiz é número, não portão.
      </p>
      {runs.length === 0 ? (
        <Card className="text-[14px] text-ink-2">Nenhuma rodada ainda.</Card>
      ) : (
        <div className="grid gap-2">
          {runs.slice(0, 20).map((r) => (
            <Rodada key={r.id} run={r} />
          ))}
        </div>
      )}
    </section>
  );
}
