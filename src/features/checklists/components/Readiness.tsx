import { useLiveQuery } from 'dexie-react-hooks';
import { CircleCheckBig } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CarSide } from '@/art/cars/CarSide.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Ring } from '@/components/ui/Ring.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { saveCar } from '@/features/garage/actions.ts';
import { decide, normalizeCar } from '@/features/garage/rules.ts';
import { useTeamProgress } from '@/features/progression/useTeamProgress.ts';
import { audio } from '@/lib/audio/index.ts';
import { confettiBurst, vibrate } from '@/lib/celebrate.ts';
import { db, type ChecklistItem, type Trip } from '@/lib/db/schema.ts';
import {
  daysUntil,
  fraction,
  isReady,
  listsProgress,
  readinessPhrase,
  readyKey,
  shouldCelebrate,
  showsReadiness,
  type Progress,
} from '../rules.ts';

const PACK_COLOR = '#6A62C9';

function MiniRing({ label, p, color }: { label: string; p: Progress; color: string }) {
  return (
    <div className="grid justify-items-center gap-1 text-[13px] font-semibold text-ink-2">
      <Ring
        value={fraction(p)}
        color={color}
        className="size-[54px]"
        label={`${label}: ${p.done} de ${p.total}`}
      >
        <b className="font-num text-[16px] font-bold text-ink">
          {p.done}/{p.total}
        </b>
      </Ring>
      {label}
    </div>
  );
}

/**
 * Na visão geral, antes da viagem: os anéis "Antes" e "Mala" e a frase do style tile enquanto falta
 * algo; o selo "Pronto para partir" depois. Na viagem e depois dela, o cartão some.
 */
export function ReadinessCard({
  trip,
  items,
  today,
  teamSize,
}: {
  trip: Trip;
  items: readonly ChecklistItem[];
  today: string;
  teamSize: number;
}) {
  if (!showsReadiness(today, trip.start_date)) return null;
  const p = listsProgress(items);
  const ready = isReady(p);
  return (
    <Link
      to={`/viagens/${trip.id}/checklists`}
      aria-label={ready ? 'Pronto para partir: ver as listas' : 'Pronto para partir? Ver as listas'}
      className="flex items-center gap-4 rounded-card bg-card p-4 shadow-card"
    >
      <MiniRing label="Antes" p={p.before} color="var(--color-accent)" />
      <MiniRing label="Mala" p={p.pack} color={PACK_COLOR} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {ready ? (
          <>
            <strong className="flex items-center gap-1.5 font-num text-[19px] font-semibold text-on-time-ink">
              <CircleCheckBig className="size-5" aria-hidden="true" />
              Pronto para partir
            </strong>
            <span className="text-[14px] text-ink-2">As duas listas estão fechadas.</span>
          </>
        ) : (
          <>
            <strong className="font-num text-[19px] font-semibold">Pronto para partir?</strong>
            <span className="text-[14px] text-ink-2">
              {readinessPhrase(trip.start_date, teamSize)}
            </span>
          </>
        )}
      </div>
    </Link>
  );
}

/**
 * O cartão da festa: quando antes e mala chegam a 100% antes do início, uma vez por viagem e
 * aparelho (`sync_state`), com confete, sino e vibração (nada disso sob reduzir movimento). Quem
 * abre depois, em outro aparelho, também vê uma vez: a conquista é do time.
 */
export function ReadyCelebration({
  trip,
  items,
  today,
}: {
  trip: Trip;
  items: readonly ChecklistItem[] | undefined;
  today: string;
}) {
  const key = readyKey(trip.id);
  const row = useLiveQuery(async () => (await db.sync_state.get(key)) ?? null, [key]);
  // a folha abre quando a marca nasce nesta tela (e não para quem já viu, em outra abertura)
  const [since] = useState(() => new Date().toISOString());
  const [closed, setClosed] = useState(false);
  const due =
    items !== undefined &&
    row === null &&
    shouldCelebrate({
      progress: listsProgress(items),
      today,
      startDate: trip.start_date,
      alreadyShown: false,
    });
  useEffect(() => {
    if (!due) return;
    void db.sync_state.put({ key, value: new Date().toISOString() });
    vibrate([30, 40, 30]);
    audio.bell();
    void confettiBurst(0.6).catch(() => undefined);
  }, [due, key]);
  const open = !closed && row != null && row.value >= since;
  const close = () => setClosed(true);

  const team = useTeamProgress(trip.id);
  const toast = useToast();
  const days = daysUntil(today, trip.start_date);
  const when = days <= 1 ? 'na véspera da estrada' : `a ${days} dias da estrada`;
  const car = normalizeCar(trip);
  const preview = normalizeCar({
    ...trip,
    car_accessories: [...car.accessories, 'rack', 'box'],
  });
  // esta festa é a da conquista "Pronto para partir" (fase 9): a mala já vale, mesmo antes de a
  // derivação gravá-la; ela vai no rack, que chega com a primeira parada concluída
  const ready = { ...team, achievements: new Set([...team.achievements, 'ready_to_go' as const]) };
  const outcome = car.accessories.includes('box')
    ? null
    : decide(car, car, { kind: 'accessory', key: 'box' }, ready);
  const use = () => {
    if (outcome?.kind !== 'trip') return;
    void saveCar(trip.id, outcome.patch)
      .then(() => toast.show({ title: 'Mala de teto no carro da viagem', kind: 'ok' }))
      .catch(() => toast.show({ title: 'Não deu para pôr no carro', kind: 'late' }));
    close();
  };
  return (
    <Sheet open={open} onClose={close} title="Pronto para partir">
      <div className="grid gap-4">
        <CarSide
          car={preview}
          className="mx-auto w-full max-w-[320px]"
          label="O carro da viagem com a mala de teto"
        />
        <p className="text-[17px] leading-snug">
          Antes e Mala completas, {when}. A mala de teto é a recompensa.
          {outcome?.kind === 'preview'
            ? ' Ela vai no rack, que chega com a primeira parada concluída.'
            : ''}
        </p>
        <div className="grid gap-2">
          {outcome?.kind === 'trip' ? (
            <Button size="lg" onClick={use}>
              Usar no carro
            </Button>
          ) : null}
          <ButtonLink to={`/viagens/${trip.id}/garagem`} variant="secondary" size="md">
            Ver a garagem
          </ButtonLink>
          {/* "Fechar" sempre: a mala continua liberada na garagem */}
          <Button
            variant={outcome?.kind === 'trip' ? 'secondary' : 'primary'}
            size="lg"
            onClick={close}
          >
            Fechar
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
