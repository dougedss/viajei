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
import { startOf, type IntakeBack } from '../start.ts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const BACK: IntakeBack = { focusIntake: true };

/**
 * As leituras que esta tela já começou, por entrada do histórico: o StrictMode do desenvolvimento
 * roda o efeito duas vezes, e a mesma entrada nunca lê de novo (uma leitura gasta cota).
 */
const started = new Set<string>();

/**
 * `/viagens/nova` (fase 17): o que acontece depois do campo da lista. A leitura do roteiro chegando,
 * e a revisão da fase 10 com "A viagem" no topo, que cria a viagem só ao salvar. Abrir sem nada a
 * fazer (sem revisão guardada nem leitura pedida) volta à lista, com o campo em foco: o formulário de
 * antes não existe mais.
 */
export default function CriarViagemPage() {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const imp = useImport({ kind: 'new' }, uid);
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const start = startOf(location.state);

  // ficar ou voltar é decidido uma vez, ao abrir; depois, só um gesto sai daqui (criar, descartar,
  // voltar ao texto), para o instante entre gravar e navegar não mandar a pessoa à lista
  const [entry, setEntry] = useState<'stay' | 'leave' | null>(null);
  if (imp.loaded && entry === null) setEntry(imp.stored || start ? 'stay' : 'leave');

  useEffect(() => {
    if (!imp.loaded || !start || started.has(location.key)) return;
    started.add(location.key);
    // o sinal sai da entrada do histórico: recarregar a tela no meio não lê de novo
    void navigate(location.pathname, { replace: true, state: null });
    // até a conversa (3.3), a descrição também vai para a leitura do roteiro
    void imp.read({ ai: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por entrada, quando o rascunho carregou
  }, [imp.loaded, start, location.key]);

  const phase = imp.session.phase;
  const targets = imp.stored ? geoTargets(imp.stored.review) : previewTargets(imp.preview);
  const geo = useGeocoding(targets);

  if (!imp.loaded || entry === null) return <Splash />;
  if (entry === 'leave') return <Navigate to="/viagens" replace state={BACK} />;

  const toList = async () => {
    imp.dismiss();
    await navigate('/viagens', { replace: true, state: BACK });
  };
  const onSaved = async ({ tripId, plan, range }: SaveResult) => {
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
      title={imp.stored ? 'Revisar a viagem' : 'Lendo o roteiro'}
      eyebrow={
        <span className="label-caps text-accent-ink">
          {name ? `Nova viagem · ${name}` : 'Nova viagem'}
        </span>
      }
    />
  );

  if (imp.stored?.newTrip) {
    const draft = imp.stored.newTrip;
    return (
      <ReviewFlow
        imp={imp}
        geo={geo}
        trip={draft.header}
        header={header}
        creating={{
          top: <NewTripCard draft={draft} onChange={imp.update} />,
          blocked: headerProblems(draft.header).length > 0,
        }}
        onSaved={onSaved}
        onDiscarded={() => void toList()}
      />
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
