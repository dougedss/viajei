import { CAR_MODELS, type CarModel } from '@shared/constants.ts';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarSide } from '@/art/cars/CarSide.tsx';
import type { CarSpec } from '@/art/cars/types.ts';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useAnySheetOpen } from '@/components/ui/sheet-stack.ts';
import { useToast } from '@/components/ui/toast-context.ts';
import { saveCar } from '@/features/garage/actions.ts';
import { decide, normalizeCar, type Tap } from '@/features/garage/rules.ts';
import { STUDIO_BACKGROUND } from '@/features/garage/scene/studio-colors.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { audio } from '@/lib/audio/index.ts';
import { confettiBurst, vibrate } from '@/lib/celebrate.ts';
import { db } from '@/lib/db/schema.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { ThreeBoundary } from '@/lib/three/ThreeBoundary.tsx';
import { useSupport } from '@/lib/three/useSupport.ts';
import { parseQueue, parseSummary, progressKeys } from '../engine.ts';
import { useCelebrationsPref } from '../prefs.ts';
import { unlocksAt } from '../level.ts';
import {
  accessoryFor,
  celebrationId,
  celebrationText,
  dueAt,
  summaryPhrase,
  type Celebration,
  type Summary,
} from '../moments.ts';
import { useTeamProgress } from '../useTeamProgress.ts';
import { AchievementBadge } from './AchievementBadge.tsx';

const GarageStage = lazy(() => import('@/features/garage/components/GarageStage.tsx'));

/**
 * Onde as comemorações aparecem: a fila por aparelho, um cartão por vez, com "mais N". Só num
 * momento calmo, que quem usa decide (`active`): ao abrir a visão geral, a garagem ou o perfil, ou
 * ao fechar a folha "Como foi?" sem o modo painel. O momento mostra só o que já esperava na fila
 * quando começou (`since`; por padrão, quando a tela abriu): nada salta no meio do que a pessoa está
 * fazendo, e o que chegar depois espera o próximo momento. Nunca por cima de outra folha.
 *
 * O resumo da primeira derivação não é folha: é um cartão na própria página, calmo, que a pessoa
 * fecha quando quiser.
 */
export function CelebrationHost({
  active,
  tripId,
  since,
  showSummary = true,
}: {
  active: boolean;
  tripId?: string | undefined;
  /** o começo do momento calmo, em ms (padrão: a montagem) */
  since?: number | undefined;
  /** o resumo da primeira derivação aparece aqui (no Modo Viagem, não: fica para as outras telas) */
  showSummary?: boolean;
}) {
  // nunca por cima de outra folha: espera ela fechar
  const otherSheet = useAnySheetOpen();
  const cards = useCelebrationsPref();
  const [mountedAt] = useState(() => Date.now());
  const state = useLiveQuery(async () => {
    const [queue, summary] = await Promise.all([
      db.sync_state.get(progressKeys.queue),
      db.sync_state.get(progressKeys.summary),
    ]);
    return { queue: parseQueue(queue?.value), summary: parseSummary(summary?.value) };
  }, []);
  if (!active || !state) return null;
  const summary =
    showSummary && state.summary ? <SummaryCard summary={state.summary} tripId={tripId} /> : null;
  const due = dueAt(state.queue, since ?? mountedAt);
  const current = due[0];
  if (!current || otherSheet || !cards) return summary;
  return (
    <>
      {summary}
      <UnlockSheet
        key={celebrationId(current)}
        celebration={current}
        more={due.length - 1}
        tripId={tripId ?? (current.kind === 'achievement' ? current.trip_id : null)}
      />
    </>
  );
}

async function dropFirst(id: string): Promise<void> {
  await db.transaction('rw', db.sync_state, async () => {
    const row = await db.sync_state.get(progressKeys.queue);
    const queue = parseQueue(row?.value).filter((c) => celebrationId(c) !== id);
    await db.sync_state.put({ key: progressKeys.queue, value: JSON.stringify(queue) });
  });
}

// ------------------------------------------------------------------ o resumo calmo
function SummaryCard({ summary, tripId }: { summary: Summary; tripId: string | undefined }) {
  const members = useTripMembers(tripId ?? '');
  const solo = members.filter((m) => m.member.status === 'accepted').length <= 1;
  const close = useCallback(() => void db.sync_state.delete(progressKeys.summary), []);
  return (
    <section
      className="grid gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
      aria-labelledby="h-progress-summary"
      data-progress-summary
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="h-progress-summary" className="font-num text-[20px] leading-tight font-semibold">
            Nível {summary.level} e as conquistas até aqui
          </h2>
          <p className="text-[16px] leading-snug text-ink-2">{summaryPhrase(summary, solo)}</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2"
          aria-label="Fechar o resumo"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      {summary.keys.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {summary.keys.map((k) => (
            <li key={k}>
              <AchievementBadge name={k} unlocked />
            </li>
          ))}
        </ul>
      ) : null}
      {tripId ? (
        <ButtonLink to={`/viagens/${tripId}/garagem`} variant="secondary" size="md" onClick={close}>
          Ver na garagem
        </ButtonLink>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ o cartão de desbloqueio
/** O que "Usar no carro" faz neste carro: o toque da garagem que liga o acessório ou troca o modelo. */
function tapFor(c: Celebration): Tap | null {
  if (c.kind === 'achievement') {
    const key = accessoryFor(c.key);
    return key ? { kind: 'accessory', key } : null;
  }
  const model: CarModel | undefined = unlocksAt(c.level).models[0];
  return model ? { kind: 'model', model } : null;
}

function UnlockSheet({
  celebration,
  more,
  tripId,
}: {
  celebration: Celebration;
  more: number;
  tripId: string | null;
}) {
  const id = celebrationId(celebration);
  const text = celebrationText(celebration);
  const trip = useTrip(tripId ?? '');
  const progress = useTeamProgress(tripId ?? '');
  const toast = useToast();
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const party = useRef(false);

  // a festa: uma vez por cartão, nada sob reduzir movimento (o sino segue o toggle de som)
  useEffect(() => {
    if (party.current) return;
    party.current = true;
    if (reduced) return;
    vibrate([30, 40, 30]);
    audio.bell();
    void confettiBurst(0.55).catch(() => undefined);
  }, [reduced]);

  const tap = tapFor(celebration);
  const car = trip ? normalizeCar(trip) : null;
  const outcome = car && tap ? decide(car, car, tap, progress) : null;
  const already =
    car !== null &&
    tap !== null &&
    (tap.kind === 'accessory'
      ? car.accessories.includes(tap.key)
      : tap.kind === 'model' && car.model === tap.model);
  const after: CarSpec | null = outcome?.kind === 'trip' ? outcome.car : null;

  const close = useCallback(() => {
    setClosing(true);
    void dropFirst(id);
  }, [id]);

  const use = () => {
    if (!trip || outcome?.kind !== 'trip') return;
    void saveCar(trip.id, outcome.patch)
      .then(() => toast.show({ title: `${text.unlock} no carro da viagem`, kind: 'ok' }))
      .catch(() => toast.show({ title: 'Não deu para pôr no carro', kind: 'late' }));
    close();
  };

  return (
    <Sheet open={!closing} celebration onClose={close} title={text.title}>
      <div className="grid gap-4" data-unlock={id}>
        <p className="-mt-3 label-caps text-accent-ink">
          {text.eyebrow}
          {more > 0 ? ` · mais ${more}` : ''}
        </p>
        {car ? <UnlockStage before={car} after={after ?? car} /> : null}
        <p className="text-[17px] leading-snug">{text.body}</p>
        {text.unlock ? (
          <p className="rounded-card bg-paper px-4 py-3 text-[16px]">
            <span className="text-ink-2">Desbloqueou: </span>
            <b>{text.unlock}</b>
          </p>
        ) : null}
        {outcome?.kind === 'refuse' ? (
          <p className="text-[15px] text-ink-2">{outcome.reason}</p>
        ) : null}
        <div className="grid gap-2">
          {after && !already ? (
            <Button size="lg" onClick={use}>
              Usar no carro
            </Button>
          ) : trip ? (
            <ButtonLink
              to={`/viagens/${trip.id}/garagem`}
              variant="secondary"
              size="md"
              onClick={close}
            >
              Abrir a garagem
            </ButtonLink>
          ) : null}
          <Button variant="secondary" size="md" onClick={close}>
            {after && !already ? 'Agora não' : 'Fechar'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * O carro da viagem com o desbloqueio: em 3D, o acessório encaixa (ou o modelo novo entra) no palco
 * da garagem, com as luzes que ele já tem; sem WebGL ou com reduzir movimento, a vista lateral já
 * com o acessório.
 */
function UnlockStage({ before, after }: { before: CarSpec; after: CarSpec }) {
  const reduced = useReducedMotion();
  const support = useSupport();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const onSeat = useCallback(() => {
    audio.snap();
    vibrate(12);
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const reveal = useMemo(() => before, [before]);
  const side = reduced || support === 'none' || failed;
  return (
    <div
      className="relative -mx-4 h-[220px] overflow-hidden"
      style={{ background: STUDIO_BACKGROUND }}
      data-unlock-stage={side ? 'svg' : ready ? 'ready' : 'pending'}
    >
      {side || support === 'pending' ? (
        <div className="absolute inset-0 grid place-items-center px-6">
          <CarSide car={after} className="h-auto max-h-full w-full max-w-[360px]" />
        </div>
      ) : (
        <ThreeBoundary fallback={null} onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div
              className={
                ready
                  ? 'absolute inset-0 opacity-100 transition-opacity duration-300'
                  : 'absolute inset-0 opacity-0'
              }
            >
              <GarageStage
                car={after}
                reveal={reveal}
                onReady={onReady}
                reducedMotion={reduced}
                support={support === 'webgpu' ? 'webgpu' : 'webgl2'}
                diag={false}
                onBackend={() => undefined}
                onFail={() => setFailed(true)}
                onSeat={onSeat}
              />
            </div>
          </Suspense>
        </ThreeBoundary>
      )}
      <span className="sr-only">{CAR_MODELS[after.model].label} da viagem</span>
    </div>
  );
}
