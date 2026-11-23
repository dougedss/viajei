import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { ArrivingStep } from '@/features/import/components/ArrivingStep.tsx';
import { NewTripCard } from '@/features/import/components/NewTripCard.tsx';
import { ReviewFlow } from '@/features/import/components/ReviewFlow.tsx';
import { geoTargets, previewTargets } from '@/features/import/geocode.ts';
import { errorCopy } from '@/features/import/messages.ts';
import { headerProblems } from '@/features/import/new-trip.ts';
import { planCounts } from '@/features/import/plan.ts';
import { lastStopOf, partialImport } from '@/features/import/preview.ts';
import { useGeocoding } from '@/features/import/useGeocoding.ts';
import { useImport, type SaveResult } from '@/features/import/useImport.ts';
import { todayISO, tripStatus } from '@/features/trips/rules.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { CheckedNotice, NoPlaceNotice } from '../components/CheckedNotice.tsx';
import { MapAttribution, OptionsStep } from '../components/OptionsStep.tsx';
import { hasPlace } from '../assemble.ts';
import { CheckingStep } from '../components/CheckingStep.tsx';
import { OriginLine } from '../components/OriginLine.tsx';
import { PositionStep } from '../components/PositionStep.tsx';
import { QuestionsStep } from '../components/QuestionsStep.tsx';
import { originLabelOf } from '../conversation.ts';
import { planErrorCopy } from '../messages.ts';
import { startOf, type IntakeBack } from '../start.ts';
import { useConversation } from '../useConversation.ts';
import { useReviewDrive } from '../useReviewDrive.ts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const BACK: IntakeBack = { focusIntake: true };

/**
 * As leituras que esta tela já começou, por entrada do histórico: o StrictMode do desenvolvimento
 * roda o efeito duas vezes, e a mesma entrada nunca lê de novo (uma leitura gasta cota).
 */
const started = new Set<string>();

/**
 * `/viagens/nova` (fase 17): o que acontece depois do campo da lista. O roteiro colado, lido chegando;
 * a conversa (as perguntas da IA, ditas antes) e a saída de hoje (a pergunta de alcance), com o
 * roteiro conferido no mapa; e, nos três, a revisão da fase 10 com "A viagem" no topo, que cria a
 * viagem só ao salvar. Abrir sem nada a fazer (sem revisão, conversa nem leitura pedida) volta à
 * lista, com o campo em foco: o formulário de antes não existe mais.
 */
export default function CriarViagemPage() {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const imp = useImport({ kind: 'new' }, uid);
  const talk = useConversation(uid, imp.reload);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const start = startOf(location.state);

  // ficar ou voltar é decidido uma vez, ao abrir; depois, só um gesto sai daqui (criar, descartar,
  // voltar ao texto), para o instante entre gravar e navegar não mandar a pessoa à lista
  const [entry, setEntry] = useState<'stay' | 'leave' | null>(null);
  if (imp.loaded && talk.loaded && entry === null) {
    setEntry(imp.stored || talk.conv || start ? 'stay' : 'leave');
  }

  useEffect(() => {
    if (!imp.loaded || !talk.loaded || !start || started.has(location.key)) return;
    started.add(location.key);
    // o sinal sai da entrada do histórico: recarregar a tela no meio não lê de novo
    void navigate(location.pathname, { replace: true, state: null });
    if (start === 'itinerary') void imp.read({ ai: true });
    else void talk.start(start === 'today' ? 'today' : 'plan', imp.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por entrada, quando o rascunho carregou
  }, [imp.loaded, talk.loaded, start, location.key]);

  const phase = imp.session.phase;
  const targets = imp.stored ? geoTargets(imp.stored.review) : previewTargets(imp.preview);
  const geo = useGeocoding(targets);
  // o trecho que aparece quando a pessoa liga ou desliga uma parada da revisão é medido na hora (D310)
  useReviewDrive(imp);

  if (!imp.loaded || !talk.loaded || entry === null) return <Splash />;
  if (entry === 'leave') return <Navigate to="/viagens" replace state={BACK} />;

  const toList = async () => {
    imp.dismiss();
    await talk.clear();
    await navigate('/viagens', { replace: true, state: BACK });
  };
  const onSaved = async ({ tripId, plan, range }: SaveResult) => {
    await talk.clear();
    const c = planCounts(plan);
    toast.show({
      title: 'Viagem criada',
      description:
        c.stops > 0
          ? `${plural(c.stops, 'parada', 'paradas')} em ${plural(c.days, 'dia', 'dias')}. Já está guardada neste celular.`
          : 'Já está guardada neste celular. As paradas entram pelo roteiro, ou colando outro texto.',
      kind: 'ok',
    });
    // a viagem de hoje abre no mapa (D174); as outras, em Detalhes
    const today = range ? tripStatus(range, todayISO()) === 'ongoing' : false;
    await navigate(today ? `/viagens/${tripId}` : `/viagens/${tripId}/detalhes`, {
      replace: true,
    });
  };

  const reading = phase.kind === 'reading' || phase.kind === 'arriving' || phase.kind === 'review';
  const name = imp.stored?.newTrip?.header.name ?? imp.preview.tripName;
  const header = (
    <PageHeader
      back="/viagens"
      title={
        imp.stored
          ? 'Revisar a viagem'
          : talk.conv || talk.stage.kind !== 'idle'
            ? 'Montando a viagem'
            : 'Lendo o roteiro'
      }
      eyebrow={
        <span className="label-caps text-accent-ink">
          {name ? `Nova viagem · ${name}` : 'Nova viagem'}
        </span>
      }
    />
  );

  if (imp.stored?.newTrip) {
    const draft = imp.stored.newTrip;
    // a viagem que nasceu da conversa (fase 24): sem lugar além da saída e da chegada, não é sucesso
    const fromMap = imp.stored.schedule !== undefined && imp.stored.schedule !== null;
    const placed = hasPlace(imp.stored.review.days.flatMap((d) => (d.include ? d.stops : [])));
    const toOptions = talk.conv?.map
      ? () => void imp.discard().then(() => talk.toOptions())
      : undefined;
    return (
      <ReviewFlow
        imp={imp}
        geo={geo}
        trip={draft.header}
        header={header}
        creating={{
          top: (
            <>
              <NewTripCard draft={draft} onChange={imp.update} />
              {fromMap && !placed ? <NoPlaceNotice onToOptions={toOptions} /> : null}
              <CheckedNotice missing={imp.stored.checked?.missing ?? []} onToOptions={toOptions} />
            </>
          ),
          blocked: headerProblems(draft.header).length > 0 || (fromMap && !placed),
          bottom: fromMap ? (
            <MapAttribution
              google={imp.stored.review.days.some((d) => d.stops.some((s) => !!s.google_place_id))}
            />
          ) : null,
        }}
        onSaved={onSaved}
        onDiscarded={() => void toList()}
      />
    );
  }

  // a conversa e a saída de hoje, antes da revisão
  if (talk.conv || talk.stage.kind !== 'idle') {
    const stage = talk.stage;
    // "Saindo de X · mudar" (fase 25, D271), nas perguntas e nas opções; sem origem conhecida, as
    // opções perguntam "De onde vocês saem?" (fase 27)
    const origin = talk.conv ? (
      <OriginLine
        label={originLabelOf(talk.conv)}
        whenUnknown={stage.kind === 'choosing' ? 'ask' : 'hide'}
        onChange={(o) => void talk.setOrigin(o)}
      />
    ) : null;
    return (
      <div className="grid gap-5">
        {header}
        {stage.kind === 'consent' ? (
          <PositionStep
            onAllow={() => void talk.allowPosition()}
            onDecline={() => void talk.declinePosition()}
          />
        ) : stage.kind === 'error' ? (
          <ConversationError
            copy={planErrorCopy(stage.phase, stage.step, new Date())}
            onRetry={() =>
              void (stage.step !== 'ask' && talk.conv
                ? talk.retry()
                : talk.start(talk.conv?.kind ?? 'plan', talk.conv?.text ?? imp.text))
            }
            onBack={() => void toList()}
          />
        ) : stage.kind === 'answering' && talk.conv ? (
          <QuestionsStep
            questions={talk.conv.questions}
            answers={talk.conv.answers}
            misread={talk.conv.misread ?? {}}
            origin={origin}
            onAnswer={talk.answer}
            onSubmit={() => void talk.search()}
            onBack={() => void toList()}
          />
        ) : stage.kind === 'searching' ? (
          <CheckingStep done={stage.done} total={stage.total} note={stage.note ?? null} />
        ) : stage.kind === 'choosing' && talk.conv?.map ? (
          <OptionsStep
            map={talk.conv.map}
            origin={origin}
            time={talk.time}
            onPlace={(said, hit) => void talk.choosePlace(said, hit)}
            onRename={(said, city) => void talk.renamePlace(said, city)}
            onToggle={talk.toggle}
            onPick={talk.pick}
            onRemove={talk.remove}
            onMore={talk.more}
            onWider={(g) => void talk.wider(g)}
            onByType={(n) => void talk.byType(n)}
            onByName={(name, kind, group) => void talk.byName(name, kind, group)}
            onBuild={() => void talk.build()}
            onBack={() => void toList()}
            onContinue={() => void talk.continueStep()}
            onStepBack={talk.stepBack}
            onBackTo={talk.backTo}
            onTime={talk.setTime}
            onDwell={talk.setDwell}
            onMeasure={talk.measureAgain}
          />
        ) : (
          <Card className="grid gap-2" aria-live="polite" data-thinking={stage.kind}>
            <p className="font-num text-[20px] font-semibold motion-safe:animate-pulse">
              {stage.kind === 'asking'
                ? 'Lendo o que vocês querem…'
                : stage.kind === 'routing'
                  ? 'Traçando o caminho e o que há nele…'
                  : stage.kind === 'writing'
                    ? 'Escrevendo a viagem…'
                    : 'Juntando o que vocês gostam…'}
            </p>
            <p className="text-[14px] text-ink-2">
              {stage.kind === 'routing'
                ? 'Os lugares vêm do mapa; nada entra na viagem sem vocês escolherem.'
                : 'O pedido vai para a IA da Anthropic, que só escreve: os lugares vêm do mapa, e nada entra na viagem sem você revisar.'}
            </p>
            {stage.kind === 'writing' ? (
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  talk.cancel();
                  void talk.toOptions();
                }}
              >
                Voltar às opções
              </Button>
            ) : null}
          </Card>
        )}
      </div>
    );
  }

  const lastStop = lastStopOf(imp.preview);
  const partial =
    phase.kind === 'error' && (phase.code === 'truncated' || phase.code === 'failed')
      ? partialImport(imp.session.raw)
      : null;
  const error = phase.kind === 'error' ? errorCopy(phase, { now: new Date(), lastStop }) : null;

  return (
    <div className="grid gap-5">
      {header}
      {error ? (
        <Card role="alert" className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]">
          <p className="font-num text-[20px] leading-tight font-semibold">{error.title}</p>
          <p className="text-[15px] text-ink-2">{error.text}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {partial?.days.some((d) => d.stops.length > 0) ? (
              <Button size="md" onClick={() => void imp.reviewPartial()}>
                Revisar o que chegou
              </Button>
            ) : null}
            <Button variant="ghost" size="md" onClick={() => void toList()}>
              Voltar ao texto
            </Button>
          </div>
        </Card>
      ) : reading || start ? (
        <ArrivingStep
          reading={phase.kind !== 'arriving'}
          preview={imp.preview}
          geo={geo}
          onCancel={() => {
            imp.cancel();
            void toList();
          }}
        />
      ) : (
        // a leitura que a outra entrada desta tela começou (o voltar do navegador): o texto continua
        <Card className="grid gap-3">
          <p className="text-[15px] text-ink-2">A leitura parou. O texto continua guardado.</p>
          <Button variant="secondary" size="md" onClick={() => void toList()}>
            Voltar ao texto
          </Button>
        </Card>
      )}
    </div>
  );
}

/** O erro da conversa: o que aconteceu, tentar de novo (as respostas continuam) ou voltar ao texto. */
function ConversationError({
  copy,
  onRetry,
  onBack,
}: {
  copy: { title: string; text: string };
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <Card role="alert" className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]">
      <p className="font-num text-[20px] leading-tight font-semibold">{copy.title}</p>
      <p className="text-[15px] text-ink-2">{copy.text}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="md" onClick={onRetry}>
          Tentar de novo
        </Button>
        <Button variant="ghost" size="md" onClick={onBack}>
          Voltar ao texto
        </Button>
      </div>
    </Card>
  );
}
