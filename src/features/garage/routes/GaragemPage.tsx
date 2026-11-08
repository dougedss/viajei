import { Award, Eye } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { CarSide } from '@/art/cars/CarSide.tsx';
import type { CarSpec } from '@/art/cars/types.ts';
import { Button } from '@/components/ui/Button.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { FULL_PROGRESS, levelName, type TeamProgress } from '@/features/progression/team.ts';
import { CelebrationHost } from '@/features/progression/components/CelebrationHost.tsx';
import { useTeamProgress } from '@/features/progression/useTeamProgress.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { audio } from '@/lib/audio/index.ts';
import { vibrate } from '@/lib/celebrate.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import type { Backend } from '@/lib/three/renderer.ts';
import { ThreeBoundary } from '@/lib/three/ThreeBoundary.tsx';
import { useSupport } from '@/lib/three/useSupport.ts';
import { useThemeOverride } from '@/lib/theme.ts';
import { CAR_MODELS } from '@shared/constants.ts';
import { saveCar } from '../actions.ts';
import { OptionRows } from '../components/OptionRows.tsx';
import { decide, droppedMessage, modelState, normalizeCar, type Tap } from '../rules.ts';
import { STUDIO_BACKGROUND } from '../scene/studio-colors.ts';

const GarageStage = lazy(() => import('../components/GarageStage.tsx'));

/**
 * A garagem da viagem (`/viagens/:tripId/garagem`): o showroom 3D com o carro da viagem no disco e
 * as linhas de Modelo, Pintura e Acessórios. O carro é da viagem e qualquer membro muda; o que está
 * liberado vem do progresso do time. Tocar em algo bloqueado mostra a prévia, que nunca grava. Sem
 * WebGL2, com `?render=list` ou se o 3D falhar, a mesma tela com a vista lateral grande.
 */
export default function GaragemPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const team = useTeamProgress(tripId);
  const { search } = useLocation();
  // conferência visual em dev: tudo liberado; no build de produção esta linha nem existe
  const devAll = import.meta.env.DEV && new URLSearchParams(search).get('garagem') === 'tudo';
  const progress = devAll ? FULL_PROGRESS : team;
  useThemeOverride('dark');

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;
  return <Garage trip={trip} progress={progress} search={search} />;
}

type Preview = { car: CarSpec; hints: string[] };

function Garage({
  trip,
  progress,
  search,
}: {
  trip: Trip;
  progress: TeamProgress;
  search: string;
}) {
  const tripCar = useMemo(() => normalizeCar(trip), [trip]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const shown = preview?.car ?? tripCar;
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const support = useSupport();
  const flags = readUrlFlags(search);
  const diag = import.meta.env.DEV || flags.diag;
  const [failed, setFailed] = useState(false);
  const [backend, setBackend] = useState<Backend | null>(null);
  const sideOnly = flags.forceList || support === 'none' || failed;

  const onSeat = useCallback(() => {
    audio.snap();
    vibrate(12);
  }, []);
  const onSwapSide = () => {
    const stop = audio.engineStart();
    setTimeout(stop, 900);
  };

  const onTap = (tap: Tap) => {
    const out = decide(tripCar, shown, tap, progress);
    if (out.kind === 'refuse') {
      toast.show({ title: out.reason, kind: 'info' });
      return;
    }
    if (out.dropped.length > 0) {
      toast.show({ title: droppedMessage(out.dropped, out.car.model), kind: 'info' });
    }
    // sem palco 3D não há o instante do encaixe nem a troca rodando: o som sai no toque
    if (sideOnly && tap.kind === 'accessory' && out.car.accessories.includes(tap.key)) onSeat();
    if (sideOnly && out.car.model !== shown.model) onSwapSide();
    if (out.kind === 'preview') {
      setPreview({ car: out.car, hints: out.hints });
      return;
    }
    setPreview(null);
    void saveCar(trip.id, out.patch).catch(() =>
      toast.show({ title: 'Não deu para salvar a escolha', kind: 'late' }),
    );
  };

  const model = CAR_MODELS[shown.model];
  const state = modelState(shown.model, progress, tripCar);
  const status = preview ? 'prévia' : model.level === 1 ? 'livre' : `nv ${model.level}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}/detalhes`}
        title="Garagem"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
        actions={
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-card px-3 font-num text-[15px] font-semibold text-accent-ink shadow-[inset_0_0_0_1px_var(--color-line)]">
            <Award className="size-4" aria-hidden="true" />
            Nv {progress.level} · {levelName(progress.level)}
          </span>
        }
      />

      {/* abrir a garagem é um momento calmo: o resumo ou o cartão de desbloqueio sai aqui */}
      <CelebrationHost active tripId={trip.id} />

      <div
        className="relative isolate -mx-4 h-[clamp(320px,52svh,560px)] overflow-hidden sm:mx-0 sm:rounded-card"
        style={{ background: STUDIO_BACKGROUND }}
        data-garage={sideOnly ? 'svg' : (backend ?? undefined)}
      >
        {sideOnly ? (
          <SideStage car={shown} />
        ) : support === 'pending' ? (
          <StageSkeleton />
        ) : (
          <ThreeBoundary fallback={<SideStage car={shown} />} onError={() => setFailed(true)}>
            <Suspense fallback={<StageSkeleton />}>
              <GarageStage
                car={shown}
                reducedMotion={reducedMotion}
                support={support === 'webgpu' ? 'webgpu' : 'webgl2'}
                diag={diag}
                onBackend={setBackend}
                onFail={() => setFailed(true)}
                onSeat={onSeat}
              />
            </Suspense>
          </ThreeBoundary>
        )}
        <div className="pointer-events-none absolute inset-x-4 top-3 flex items-baseline justify-between gap-3 text-[14px] text-hud-muted">
          <p>
            <b className="font-num text-[19px] font-semibold text-hud-ink">{model.label}</b> ·{' '}
            {status}
          </p>
          {sideOnly ? null : <p>arraste para girar</p>}
        </div>
        {preview ? (
          <span className="pointer-events-none absolute top-11 right-4 inline-flex items-center gap-1.5 rounded-full bg-sunset-deep px-3 py-1 font-num text-[15px] font-bold tracking-wide text-white">
            <Eye className="size-4" aria-hidden="true" />
            Prévia
          </span>
        ) : null}
      </div>

      {preview ? (
        <section
          className="grid gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
          aria-live="polite"
          aria-label="Prévia"
        >
          <p className="label-caps text-accent-ink">Prévia · nada é gravado</p>
          <ul className="grid gap-1 text-[16px]">
            {preview.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setPreview(null)}>
            Voltar ao carro da viagem
          </Button>
        </section>
      ) : state.status === 'kept' ? (
        <p className="text-[14px] text-ink-2">
          Este modelo continua na viagem. Se trocar, ele só volta no nível {model.level} (
          {levelName(model.level)}).
        </p>
      ) : null}

      <OptionRows trip={tripCar} shown={shown} progress={progress} onTap={onTap} />
    </div>
  );
}

/** A vista lateral grande no lugar do palco: sem 3D, a mesma garagem. */
function SideStage({ car }: { car: CarSpec }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(70%_55%_at_50%_45%,#3b4150_0%,#1c2029_55%,#14171c_100%)] px-4 pt-12 pb-6">
      <CarSide
        key={`${car.model}-${car.color}`}
        car={car}
        className="h-auto max-h-full w-full max-w-[560px] drop-shadow-[0_18px_24px_rgb(0_0_0/.45)] motion-safe:animate-[garage-hop_.45s_ease-out]"
      />
    </div>
  );
}

function StageSkeleton() {
  return (
    <p className="grid h-full place-items-center text-[14px] text-hud-muted" role="status">
      Abrindo a garagem…
    </p>
  );
}
