import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { StopForm } from '@/features/itinerary/components/StopForm.tsx';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { ArrivingStep } from '../components/ArrivingStep.tsx';
import { ComposeStep } from '../components/ComposeStep.tsx';
import { GeoChoiceSheet } from '../components/GeoChoiceSheet.tsx';
import { ReviewStep } from '../components/ReviewStep.tsx';
import { applyGeo, geoTargets, previewTargets } from '../geocode.ts';
import { errorCopy } from '../messages.ts';
import { planCounts } from '../plan.ts';
import { partialImport, type Preview } from '../preview.ts';
import { chooseGeo, updateStop } from '../review-edit.ts';
import { useGeocoding } from '../useGeocoding.ts';
import { useImport } from '../useImport.ts';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** O nome da última parada que chegou inteira: "o texto foi lido até…". */
function lastStopOf(preview: Preview): string | null {
  for (const day of [...preview.days].reverse()) {
    const stop = [...day.stops].reverse().find((s) => s.complete && s.name.trim() !== '');
    if (stop) return stop.name;
  }
  return null;
}

/**
 * Importar roteiro (`/viagens/:tripId/importar`): colar, ler com a IA vendo o roteiro chegar, revisar
 * tudo e salvar na viagem. A importação acrescenta e nunca apaga, e nada entra sem a revisão.
 */
export default function ImportarPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const { session: auth } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const imp = useImport(trip ?? null, auth?.user.id ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const phase = imp.session.phase;
  const targets = imp.stored ? geoTargets(imp.stored.review) : previewTargets(imp.preview);
  const geo = useGeocoding(targets);

  if (trip === undefined || !imp.loaded) return <Splash />;
  if (trip === null) return <NotFound />;

  const review = imp.stored ? applyGeo(imp.stored.review, geo) : null;
  const back = `/viagens/${trip.id}/detalhes`;

  // a parada aberta no formulário, dentro da própria tela: a revisão continua onde estava
  const editingStop = review?.days.flatMap((d) => d.stops).find((s) => s.key === editing);
  if (review && editingStop && editing) {
    return (
      <div className="grid gap-5">
        <header className="grid gap-2">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="inline-flex min-h-12 w-fit items-center gap-1 text-[15px] font-semibold text-ink-2"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Voltar à revisão
          </button>
          <h1 className="font-num text-[30px] leading-none font-semibold">Editar parada</h1>
        </header>
        <StopForm
          stop={editingStop}
          submitLabel="Guardar na revisão"
          onSubmit={(values) => {
            imp.edit((r) => updateStop(r, editing, values));
            setEditing(null);
            return Promise.resolve();
          }}
        />
      </div>
    );
  }

  const choice = choosing && Object.hasOwn(geo, choosing) ? geo[choosing] : undefined;
  const choosingStop = review?.days.flatMap((d) => d.stops).find((s) => s.key === choosing);
  const existingByDate = Object.fromEntries(
    (days ?? []).map((d) => [d.date, stops.filter((s) => s.trip_day_id === d.id).length]),
  );

  // do `done` até a revisão ficar guardada no aparelho (um instante), o preview continua na tela
  const reading = phase.kind === 'reading' || phase.kind === 'arriving' || phase.kind === 'review';
  const title = review ? 'Revisar o roteiro' : reading ? 'Lendo o roteiro' : 'Colar roteiro';
  const lastStop = lastStopOf(imp.preview);
  const partial =
    phase.kind === 'error' && (phase.code === 'truncated' || phase.code === 'failed')
      ? partialImport(imp.session.raw)
      : null;

  return (
    <div className="grid gap-5">
      <PageHeader
        back={back}
        title={title}
        eyebrow={<span className="text-[15px] text-ink-2">{trip.name}</span>}
      />

      {review && imp.stored ? (
        <ReviewStep
          trip={trip}
          review={review}
          partial={imp.stored.partial}
          targets={geoTargets(imp.stored.review)}
          geo={geo}
          existingByDate={existingByDate}
          saving={saving}
          onChange={imp.edit}
          onEditStop={setEditing}
          onChoose={setChoosing}
          onDiscard={() => void imp.discard()}
          onSave={() => {
            setSaving(true);
            void imp
              .save(geo)
              .then(async (plan) => {
                if (!plan) return;
                const c = planCounts(plan);
                toast.show({
                  title: 'Roteiro na viagem',
                  description: `${plural(c.stops, 'parada', 'paradas')} em ${plural(c.days, 'dia', 'dias')}. Já está guardado neste celular.`,
                  kind: 'ok',
                });
                await navigate(back, { replace: true });
              })
              .catch((err: unknown) =>
                toast.show({
                  title: 'Não deu para salvar',
                  description:
                    err instanceof Error ? err.message : 'Tente de novo; a revisão continua aqui.',
                  kind: 'late',
                }),
              )
              .finally(() => setSaving(false));
          }}
        />
      ) : reading ? (
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
          canReviewPartial={partial?.days.some((d) => d.stops.length > 0) === true}
          onRead={() => void imp.read()}
          onReviewPartial={() => void imp.reviewPartial()}
          onDismiss={imp.dismiss}
        />
      )}

      <GeoChoiceSheet
        open={choice?.kind === 'choice' && choosingStop !== undefined}
        name={choosingStop?.name ?? ''}
        options={choice?.kind === 'choice' ? choice.options : []}
        onClose={() => setChoosing(null)}
        onPick={(option) => {
          const key = choosing;
          if (key) imp.edit((r) => chooseGeo(r, key, option));
          setChoosing(null);
        }}
      />
    </div>
  );
}
