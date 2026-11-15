import { useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { ArrivingStep } from '../components/ArrivingStep.tsx';
import { ComposeStep } from '../components/ComposeStep.tsx';
import { ReviewFlow } from '../components/ReviewFlow.tsx';
import { geoTargets, previewTargets } from '../geocode.ts';
import { errorCopy } from '../messages.ts';
import { planCounts } from '../plan.ts';
import { lastStopOf, partialImport } from '../preview.ts';
import { useGeocoding } from '../useGeocoding.ts';
import { useImport } from '../useImport.ts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Importar roteiro (`/viagens/:tripId/importar`): colar, ler com a IA vendo o roteiro chegar, revisar
 * tudo e salvar na viagem. O formato do Viajei colado é lido aqui mesmo, sem IA (fase 17). A
 * importação acrescenta e nunca apaga, e nada entra sem a revisão.
 */
export default function ImportarPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const { session: auth } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const imp = useImport(trip ? { kind: 'trip', trip } : null, auth?.user.id ?? null);

  const phase = imp.session.phase;
  const targets = imp.stored ? geoTargets(imp.stored.review) : previewTargets(imp.preview);
  const geo = useGeocoding(targets);

  if (trip === undefined || !imp.loaded) return <Splash />;
  if (trip === null) return <NotFound />;

  const back = `/viagens/${trip.id}/detalhes`;
  const existingByDate = Object.fromEntries(
    (days ?? []).map((d) => [d.date, stops.filter((s) => s.trip_day_id === d.id).length]),
  );

  // do `done` até a revisão ficar guardada no aparelho (um instante), o preview continua na tela
  const reading = phase.kind === 'reading' || phase.kind === 'arriving' || phase.kind === 'review';
  const title = imp.stored ? 'Revisar o roteiro' : reading ? 'Lendo o roteiro' : 'Colar roteiro';
  const header = (
    <PageHeader
      back={back}
      title={title}
      eyebrow={<span className="text-[15px] text-ink-2">{trip.name}</span>}
    />
  );

  if (imp.stored) {
    return (
      <ReviewFlow
        imp={imp}
        geo={geo}
        trip={trip}
        header={header}
        existingByDate={existingByDate}
        onSaved={async ({ plan }) => {
          const c = planCounts(plan);
          toast.show({
            title: 'Roteiro na viagem',
            description: `${plural(c.stops, 'parada', 'paradas')} em ${plural(c.days, 'dia', 'dias')}. Já está guardado neste celular.`,
            kind: 'ok',
          });
          await navigate(back, { replace: true });
        }}
      />
    );
  }

  const lastStop = lastStopOf(imp.preview);
  const partial =
    phase.kind === 'error' && (phase.code === 'truncated' || phase.code === 'failed')
      ? partialImport(imp.session.raw)
      : null;

  return (
    <div className="grid gap-5">
      {header}
      {reading ? (
        <ArrivingStep
          reading={phase.kind === 'reading'}
          preview={imp.preview}
          geo={geo}
          onCancel={imp.cancel}
        />
      ) : (
        <ComposeStep
          text={imp.text}
          onText={imp.setText}
          online={imp.online}
          remaining={imp.remaining}
          error={phase.kind === 'error' ? errorCopy(phase, { now: new Date(), lastStop }) : null}
          formatErrors={imp.formatErrors}
          canReviewPartial={partial?.days.some((d) => d.stops.length > 0) === true}
          onRead={() => void imp.read()}
          onReadWithAi={() => void imp.read({ ai: true })}
          onReviewPartial={() => void imp.reviewPartial()}
          onDismiss={imp.dismiss}
        />
      )}
    </div>
  );
}
