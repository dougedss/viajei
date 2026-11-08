import { Check, Flag, History, LocateFixed, MapPinOff, SkipForward, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import type { Profile, Stop } from '@/lib/db/schema.ts';
import type { CatchupPosition } from '@/lib/geo/catchup.ts';
import { formatClock, formatStamp, wallTime } from '@/lib/time/index.ts';
import type { TravelEvent } from '../events.ts';

/** A pergunta de posição, em contexto: uma frase, dentro do Modo Viagem, só durante a viagem. */
export function PositionAsk({
  onAllow,
  onDecline,
}: {
  onAllow: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      aria-label="Usar a posição do celular"
      className="grid gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
    >
      <p className="flex items-start gap-3 mv-text-16">
        <LocateFixed className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden="true" />
        Posso usar a posição do celular para acertar onde vocês estão? Uma leitura ao abrir, nada em
        segundo plano.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="md" onClick={onAllow}>
          Usar posição
        </Button>
        <Button variant="ghost" size="md" onClick={onDecline}>
          Agora não
        </Button>
      </div>
    </section>
  );
}

type PassedProps = {
  stop: Stop;
  date: string;
  now: Date;
  onConfirm: (when: Date) => void;
  onDismiss: () => void;
};

/** "Vocês passaram por X. Marcar como concluída?", com a hora de agora ajustável. Nunca inventa horário. */
export function PassedQuestion({ stop, date, now, onConfirm, onDismiss }: PassedProps) {
  const [time, setTime] = useState(() => formatClock(now));
  return (
    <section
      aria-label={`Vocês passaram por ${stop.name}`}
      className="grid gap-3 rounded-card bg-tight/15 p-4 text-ink"
    >
      <p className="mv-text-17 font-semibold">
        Vocês passaram por {stop.name}. Marcar como concluída?
      </p>
      <label className="flex items-center justify-between gap-3 mv-text-15 text-ink-2">
        Chegaram às
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="min-h-12 rounded-field bg-card px-3 font-num mv-text-20 font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button size="md" onClick={() => onConfirm(wallTime(date, time || formatClock(now)))}>
          <Check className="size-5" aria-hidden="true" />
          Marcar
        </Button>
        <Button variant="ghost" size="md" onClick={onDismiss}>
          Não passamos
        </Button>
      </div>
    </section>
  );
}

const EVENT_ICON = {
  arrived: Check,
  departed: Flag,
  skipped: SkipForward,
  team_arrived: Users,
  passed: MapPinOff,
} as const;

function describe(e: TravelEvent, profiles: Map<string, Profile>): string {
  const who = e.by ? profiles.get(e.by)?.name : undefined;
  const when = e.at ? formatStamp(e.at) : null;
  switch (e.kind) {
    case 'arrived':
      return `Chegamos: ${e.stop_name}${when ? ` · ${when}` : ''}`;
    case 'departed':
      return `Saímos: ${e.stop_name}${when ? ` · ${when}` : ''}`;
    case 'skipped':
      return `Pulamos ${e.stop_name}`;
    case 'team_arrived':
      return `${who ?? 'Alguém do time'} chegou: ${e.stop_name}${when ? ` · ${when}` : ''}`;
    case 'passed':
      return `Passamos por ${e.stop_name} sem marcar`;
  }
}

/** "Desde a última vez": a lista que a fase 5 vai animar; aqui, e sempre em prefers-reduced-motion, um card. */
export function SinceLastTime({
  events,
  profiles,
  onDismiss,
}: {
  events: TravelEvent[];
  profiles: Map<string, Profile>;
  onDismiss: () => void;
}) {
  if (events.length === 0) return null;
  return (
    <section
      aria-labelledby="h-desde"
      className="relative grid gap-3 rounded-card bg-night px-5 py-4 text-hud-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onDismiss}
        className="absolute top-1 right-1 grid size-12 place-items-center rounded-full text-hud-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <h2
        id="h-desde"
        className="flex items-center gap-2 pr-8 font-num mv-text-20 leading-tight font-semibold"
      >
        <History className="size-5 text-lane" aria-hidden="true" />
        Desde a última vez
      </h2>
      <ul className="grid gap-2">
        {events.map((e) => {
          const Icon = EVENT_ICON[e.kind];
          return (
            <li key={e.id} className="flex items-center gap-3 mv-text-16">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-lane">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {describe(e, profiles)}
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" size="md" onClick={onDismiss}>
        Ok
      </Button>
    </section>
  );
}

const SOURCE_LABEL = {
  gps: 'pela posição do celular',
  'team-track': 'pela trilha do time',
  'last-done': 'pela última parada marcada',
} as const;

/**
 * Uma linha discreta sobre a posição, na barra do "Agora": o ponto "GPS" enquanto a posição está
 * sendo acompanhada (e "econômico" parado), fora da rota com a distância, ou a fração do dia.
 */
export function PositionLine({
  position,
  tracking = false,
  lowPower = false,
}: {
  position: CatchupPosition | null;
  tracking?: boolean;
  lowPower?: boolean;
}) {
  const gps = tracking ? (
    <span className="inline-flex items-center gap-1 font-semibold text-on-time-ink" data-gps>
      <span className="size-2 rounded-full bg-on-time" aria-hidden="true" />
      GPS{lowPower ? ' econômico' : ''}
    </span>
  ) : null;
  if (!position) {
    return gps ? (
      <p className="mt-0.5 flex items-center gap-2 mv-text-13 text-ink-2">{gps}</p>
    ) : null;
  }
  if (position.offRoute && position.distanceM !== null) {
    return (
      <p className="mt-0.5 flex items-center gap-2 mv-text-13 text-ink-2">
        {gps}
        <Chip kind="warn" className="min-h-6 px-2">
          <MapPinOff className="size-4" aria-hidden="true" />
          Fora da rota ·{' '}
          {position.distanceM >= 1000
            ? `${(position.distanceM / 1000).toFixed(position.distanceM >= 10_000 ? 0 : 1)} km`
            : `${Math.round(position.distanceM)} m`}
        </Chip>
      </p>
    );
  }
  if (position.fraction === null) {
    return gps ? (
      <p className="mt-0.5 flex items-center gap-2 mv-text-13 text-ink-2">{gps}</p>
    ) : null;
  }
  return (
    <p className="mt-0.5 flex items-center gap-2 mv-text-13 text-ink-2">
      {gps}
      <span className="inline-flex items-center gap-1">
        <LocateFixed className="size-4 shrink-0" aria-hidden="true" />
        {Math.round(position.fraction * 100)}% do caminho do dia, {SOURCE_LABEL[position.source]}
      </span>
    </p>
  );
}
