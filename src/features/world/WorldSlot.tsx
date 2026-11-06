import { Box, List } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import type { Catchup } from '@/features/travel-mode/catchup.ts';
import type { DayState } from '@/features/travel-mode/rules.ts';
import type { RouteStatus } from '@/features/itinerary/route.ts';
import type { DayRoute, Profile, RouteLeg, Trip } from '@/lib/db/schema.ts';
import { WorldBoundary } from './components/Boundary.tsx';
import { DayList } from './components/DayList.tsx';
import { readUrlFlags, useRenderPref, writeRenderPref } from './prefs.ts';

/**
 * O lugar da maquete no Modo Viagem, sem nada do 3D no chunk principal: decide entre a lista (por
 * preferência do aparelho ou `?render=list`) e a maquete, que entra por `lazy()` só quando vai
 * desenhar. Se o chunk não carregar, a lista aparece. O "Agora" nunca espera por nada disto.
 */
export type EventsOwner = 'world' | 'card';

export type WorldSlotProps = {
  trip: Pick<Trip, 'id' | 'car_model' | 'car_color' | 'car_accessories'>;
  day: { id: string; date: string };
  state: DayState;
  legs: Map<string, RouteLeg>;
  route: DayRoute | null;
  routeStatus: RouteStatus;
  /** o cache de rota já respondeu: a maquete não decide replay antes disso */
  routeLoaded: boolean;
  profiles: Map<string, Profile>;
  catchup: Catchup;
  panelOn: boolean;
  uid: string;
  night: boolean;
  /** quem mostra "o que aconteceu": a maquete (replay) ou o card "Desde a última vez" */
  onEventsOwner: (owner: EventsOwner) => void;
};

const WorldSection = lazy(() => import('./components/WorldSection.tsx'));

export function WorldSlot(props: WorldSlotProps) {
  const pref = useRenderPref();
  const { search } = useLocation();
  const flags = readUrlFlags(search);
  const listOnly = flags.forceList || pref === 'list';
  const { onEventsOwner } = props;

  useEffect(() => {
    if (listOnly) onEventsOwner('card');
  }, [listOnly, onEventsOwner]);

  if (listOnly) {
    return (
      <ListView
        {...props}
        action={
          flags.forceList ? null : (
            <Button variant="ghost" size="sm" onClick={() => writeRenderPref('auto')}>
              <Box className="size-4" aria-hidden="true" />
              Ver a maquete
            </Button>
          )
        }
      />
    );
  }

  return (
    <WorldBoundary
      fallback={<ListView {...props} notice="Maquete indisponível agora." action={null} />}
      onError={() => onEventsOwner('card')}
    >
      <Suspense fallback={<WorldSkeleton />}>
        <WorldSection {...props} />
      </Suspense>
    </WorldBoundary>
  );
}

/** A lista sozinha, com um aviso discreto quando a maquete não pôde ser desenhada. */
export function ListView({
  state,
  legs,
  profiles,
  route,
  notice,
  action,
}: Pick<WorldSlotProps, 'state' | 'legs' | 'profiles' | 'route'> & {
  notice?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="grid gap-3">
      {notice ? (
        <p className="flex items-center gap-2 text-[14px] text-ink-2">
          <List className="size-4" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      <DayList
        state={state}
        legs={legs}
        profiles={profiles}
        route={route}
        defaultOpen
        footer={action}
      />
    </div>
  );
}

export function WorldSkeleton() {
  return (
    <div
      className="grid h-[clamp(380px,58svh,620px)] place-items-center rounded-card bg-stage text-[14px] text-ink-2"
      role="status"
      aria-live="polite"
    >
      Montando a maquete…
    </div>
  );
}
