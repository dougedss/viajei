import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { Catchup } from '@/features/travel-mode/catchup.ts';
import type { DayState } from '@/features/travel-mode/rules.ts';
import type { RouteStatus } from '@/features/itinerary/route.ts';
import type { DaySummary } from '@/features/weather/rules.ts';
import type { ConvoyCar } from './convoy.ts';
import type { DayRoute, Profile, RouteLeg, Stop, Trip, WeatherEntry } from '@/lib/db/schema.ts';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import { ThreeBoundary } from '@/lib/three/ThreeBoundary.tsx';
import { DayList } from './components/DayList.tsx';
import type { ReviewPhoto } from './replay.ts';
import { useRenderPref } from './prefs.ts';

/**
 * O lugar da maquete na tela da viagem, sem nada do 3D no chunk principal: decide entre a lista (por
 * preferência do aparelho ou `?render=list`) e a maquete, que entra por `lazy()` só quando vai
 * desenhar. Se o chunk não carregar, a lista aparece. Preenche a caixa que o recebe (fase 14: a
 * tela inteira, menos a barra do dia); o "Agora" nunca espera por nada disto.
 */
export type EventsOwner = 'world' | 'card';

export type { ReviewPhoto } from './replay.ts';

/** O espaço, em px, que a barra do "Agora" costuma cobrir embaixo: a conta do quadro largo da maquete. */
export const NOW_BAR_INSET = 136;

export type WorldSlotProps = {
  trip: Pick<Trip, 'id' | 'name' | 'car_model' | 'car_color' | 'car_accessories'>;
  day: { id: string; date: string };
  state: DayState;
  legs: Map<string, RouteLeg>;
  route: DayRoute | null;
  routeStatus: RouteStatus;
  /** o cache de rota já respondeu: a maquete não decide replay antes disso */
  routeLoaded: boolean;
  profiles: Map<string, Profile>;
  catchup: Catchup;
  uid: string;
  night: boolean;
  /** quem mostra "o que aconteceu": a maquete (replay) ou o card "Desde a última vez" */
  onEventsOwner: (owner: EventsOwner) => void;
  /** notas, "Ver reserva" e "Como foi?" de cada parada na lista do dia */
  stopExtras?: ((stop: Stop) => ReactNode) | undefined;
  /** as fotos de memória com arquivo no aparelho, para o "Rever o dia" */
  reviewPhotos?: readonly ReviewPhoto[] | undefined;
  /** tocar numa parada (a miniatura, a pílula, a linha da lista) abre a folha dela (fase 14) */
  onOpenStop?: ((stopId: string) => void) | undefined;
  /** quem do time está em outro carro: um carro pequeno na estrada por pessoa (D179) */
  convoy?: readonly ConvoyCar[] | undefined;
  /** a altura medida do que fica sobre o pé da tela: a lista do dia termina acima disso */
  bottomInset: number;
  /**
   * A previsão do dia guardada no aparelho (funciona sem rede): o chip do clima na abertura e na faixa
   * de cima, e a chuva nas pílulas. Só HTML: nada do tempo entra na cena 3D.
   */
  weather?: WorldWeather | undefined;
};

export type WorldWeather = {
  summary: DaySummary | null;
  stops: Readonly<WeatherEntry['stops']>;
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

  if (listOnly) return <ListView {...props} />;

  return (
    <ThreeBoundary
      fallback={<ListView {...props} notice="Maquete indisponível agora." />}
      onError={() => onEventsOwner('card')}
    >
      <Suspense fallback={<WorldSkeleton />}>
        <WorldSection {...props} />
      </Suspense>
    </ThreeBoundary>
  );
}

/** A lista sozinha, com um aviso discreto quando a maquete não pôde ser desenhada. */
export function ListView({
  state,
  legs,
  profiles,
  route,
  notice,
  stopExtras,
  onOpenStop,
  bottomInset,
}: Pick<
  WorldSlotProps,
  'state' | 'legs' | 'profiles' | 'route' | 'stopExtras' | 'onOpenStop' | 'bottomInset'
> & {
  notice?: string;
}) {
  return (
    <DayList
      state={state}
      legs={legs}
      profiles={profiles}
      route={route}
      notice={notice}
      stopExtras={stopExtras}
      onOpenStop={onOpenStop}
      bottomInset={bottomInset}
    />
  );
}

export function WorldSkeleton() {
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-stage mv-text-14 text-ink-2"
      role="status"
      aria-live="polite"
    >
      Montando a maquete…
    </div>
  );
}
