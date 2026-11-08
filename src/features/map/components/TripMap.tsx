import 'leaflet/dist/leaflet.css';
import '../map.css';
import L from 'leaflet';
import { Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, Marker, Polyline, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import { CarSide } from '@/art/cars/CarSide.tsx';
import type { CarSpec } from '@/art/cars/types.ts';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import type { LngLat } from '@/lib/db/schema.ts';
import {
  LEAFLET_PREFIX_HTML,
  OSM_ATTRIBUTION_HTML,
  OSM_MAX_ZOOM,
  OSM_TILE_URL,
} from '@/lib/map/tiles.ts';
import type { Bounds, LastSeen, MapDay, MapLine, MapPin } from '../rules.ts';

/**
 * O mapa da viagem com o Leaflet (pelo react-leaflet 5), num chunk só desta rota, com o CSS dele.
 * Tiles do OSM com CORS (o service worker só guarda o 200; D141), a rota real de cada dia, o traço
 * reto onde não há rota, os pinos com a arte do app (o `divIcon` recebe um elemento onde o React
 * desenha por portal: nenhum PNG) e o carro da viagem no último ponto da trilha. As props do
 * `MapContainer` não mudam depois de montar: o enquadramento vai num filho com `useMap()`.
 */
export type TrackLine = { user_id: string; color: string; points: LngLat[] };

type Props = {
  days: readonly MapDay[];
  /** a viagem inteira: pinos menores, sem número (a numeração recomeça a cada dia) */
  compact: boolean;
  tracks: readonly TrackLine[];
  lastSeen: (LastSeen & { label: string }) | null;
  car: CarSpec;
  bounds: Bounds | null;
  /** muda quando muda o que está escolhido (os chips): é quando o mapa voa */
  selectionKey: string;
  /** espaço que o aviso de sem internet ocupa no topo */
  topInset: number;
  reducedMotion: boolean;
  onSelect: (stopId: string, dayId: string) => void;
  onReady?: () => void;
};

const toLatLng = (points: readonly LngLat[]): [number, number][] =>
  points.map(([lng, lat]) => [lat, lng]);

function toBounds(b: Bounds): L.LatLngBounds {
  return L.latLngBounds([b.south, b.west], [b.north, b.east]);
}

/** O enquadramento do que está visível, com margem para os pinos, o aviso e a atribuição. */
function FitView(props: Pick<Props, 'bounds' | 'selectionKey' | 'topInset' | 'reducedMotion'>) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  const { bounds, selectionKey, topInset, reducedMotion } = props;
  useEffect(() => {
    if (!bounds || fitted.current === selectionKey) return;
    const first = fitted.current === null;
    fitted.current = selectionKey;
    const options: L.FitBoundsOptions = {
      paddingTopLeft: L.point(28, 56 + topInset),
      paddingBottomRight: L.point(28, 40),
      maxZoom: 15,
    };
    if (first || reducedMotion) map.fitBounds(toBounds(bounds), { ...options, animate: false });
    else map.flyToBounds(toBounds(bounds), { ...options, duration: 0.9 });
  }, [map, bounds, selectionKey, topInset, reducedMotion]);
  return null;
}

/** "Leaflet" no prefixo, sem a bandeira do padrão; o "© OpenStreetMap" vem da camada de tiles. */
function Prefix() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix(LEAFLET_PREFIX_HTML);
  }, [map]);
  return null;
}

/** O primeiro quadro: o mapa montado com os tiles do primeiro enquadramento carregados (ou falhos). */
function ReadySignal({ onReady }: { onReady: (() => void) | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!onReady) return;
    const done = () => onReady();
    map.whenReady(() => requestAnimationFrame(done));
  }, [map, onReady]);
  return null;
}

function RouteLine({ line, compact }: { line: MapLine; compact: boolean }) {
  const ref = useRef<L.Polyline>(null);
  const positions = useMemo(() => toLatLng(line.points), [line.points]);
  const weight = line.kind === 'straight' ? 3 : line.driven ? 6 : compact ? 3.5 : 4;
  const classes = [
    'map-line',
    `map-line--${line.kind}`,
    line.driven ? 'map-line--driven' : null,
  ].filter(Boolean);
  useEffect(() => {
    ref.current
      ?.getElement()
      ?.setAttribute('data-map-route', `${line.kind}${line.driven ? ' driven' : ''}`);
  }, [line.kind, line.driven]);
  return (
    <>
      {line.kind === 'route' ? (
        <Polyline
          positions={positions}
          interactive={false}
          pathOptions={{ className: 'map-line map-line--casing', weight: weight + 3.5 }}
        />
      ) : null}
      <Polyline
        ref={ref}
        positions={positions}
        interactive={false}
        pathOptions={{ className: classes.join(' '), weight }}
      />
    </>
  );
}

/** A arte do pino: o ícone do tipo na cor dele, o número da ordem do dia e o estado da lista do dia. */
function PinArt({ pin, compact }: { pin: MapPin; compact: boolean }) {
  return (
    <span
      className="map-pin"
      data-status={pin.status}
      data-map-pin={pin.stop.id}
      aria-hidden="true"
    >
      <span className="map-pin__disc">
        {pin.status === 'next' ? <span className="map-pin__pulse" /> : null}
        <StopKindIcon kind={pin.stop.kind} filled className={compact ? 'size-7' : 'size-9'} />
        {compact ? null : (
          <span className="map-pin__n">
            {pin.status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : pin.number}
          </span>
        )}
      </span>
      {compact ? null : <span className="map-pin__tail" />}
    </span>
  );
}

function PinMarker(props: {
  pin: MapPin;
  dayId: string;
  compact: boolean;
  onSelect: Props['onSelect'];
}) {
  const { pin, dayId, compact, onSelect } = props;
  const [host] = useState(() => document.createElement('div'));
  const icon = useMemo(
    () =>
      L.divIcon({
        html: host,
        // o desenho tem 28 ou 40 px; o alvo do toque, 48 (fase 12)
        className: compact ? 'map-pin-host map-pin-host--compact' : 'map-pin-host',
        iconSize: [48, 48],
        iconAnchor: compact ? [24, 24] : [24, 47],
      }),
    [host, compact],
  );
  const label = `${compact ? '' : `${String(pin.number)}. `}${pin.stop.name}`;
  const ref = useRef<L.Marker>(null);
  // o nome do pino muda com a vista (com número no dia, sem número na viagem): o elemento continua o
  // mesmo, então o rótulo é regravado a cada mudança, e não só quando o pino entra no mapa
  useEffect(() => {
    ref.current?.getElement()?.setAttribute('aria-label', label);
  }, [label, icon]);
  return (
    <>
      <Marker
        ref={ref}
        position={[pin.stop.lat, pin.stop.lng]}
        icon={icon}
        keyboard
        riseOnHover
        zIndexOffset={pin.status === 'next' ? 500 : 0}
        eventHandlers={{
          click: () => onSelect(pin.stop.id, dayId),
          add: (e) => (e.target as L.Marker).getElement()?.setAttribute('aria-label', label),
        }}
      />
      {createPortal(<PinArt pin={pin} compact={compact} />, host)}
    </>
  );
}

/** O carro da viagem no último ponto da trilha: não é posição ao vivo, muda quando a trilha sincroniza. */
function CarMarker({ seen, car }: { seen: LastSeen & { label: string }; car: CarSpec }) {
  const [host] = useState(() => document.createElement('div'));
  const icon = useMemo(
    () =>
      L.divIcon({
        html: host,
        className: 'map-pin-host',
        iconSize: [96, 52],
        iconAnchor: [48, 48],
      }),
    [host],
  );
  return (
    <>
      <Marker position={[seen.lat, seen.lng]} icon={icon} interactive={false} zIndexOffset={800} />
      {createPortal(
        <span className="map-car" data-map-car>
          <CarSide car={car} className="h-[30px] w-auto drop-shadow-[0_4px_4px_rgb(0_0_0/.3)]" />
          <span className="map-car__label">{seen.label}</span>
        </span>,
        host,
      )}
    </>
  );
}

export default function TripMap(props: Props) {
  const { days, compact, tracks, lastSeen, car, onSelect } = props;
  // o primeiro enquadramento vai já na montagem (as props do MapContainer não mudam depois)
  const [initial] = useState(() => (props.bounds ? toBounds(props.bounds) : null));
  return (
    <MapContainer
      className="size-full"
      {...(initial
        ? { bounds: initial, boundsOptions: { padding: [28, 48] as [number, number], maxZoom: 15 } }
        : { center: [-15.8, -47.9] as [number, number], zoom: 4 })}
      maxZoom={OSM_MAX_ZOOM}
      minZoom={3}
      zoomControl={false}
      worldCopyJump={false}
    >
      <TileLayer
        url={OSM_TILE_URL}
        attribution={OSM_ATTRIBUTION_HTML}
        maxZoom={OSM_MAX_ZOOM}
        crossOrigin
        className="map-tiles"
      />
      <Prefix />
      <ZoomControl position="bottomleft" zoomInTitle="Aproximar" zoomOutTitle="Afastar" />
      {days.flatMap((d) =>
        d.lines.map((line) => (
          <RouteLine
            key={`${d.day_id}:${line.from_id}:${line.to_id}:${line.kind}:${String(line.driven)}`}
            line={line}
            compact={compact}
          />
        )),
      )}
      {tracks.map((t) => (
        <Polyline
          key={t.user_id}
          positions={toLatLng(t.points)}
          interactive={false}
          pathOptions={{ className: 'map-line map-line--track', color: t.color, weight: 2.5 }}
        />
      ))}
      {days.flatMap((d) =>
        d.pins.map((pin) => (
          <PinMarker
            key={pin.stop.id}
            pin={pin}
            dayId={d.day_id}
            compact={compact}
            onSelect={onSelect}
          />
        )),
      )}
      {lastSeen ? <CarMarker seen={lastSeen} car={car} /> : null}
      <FitView
        bounds={props.bounds}
        selectionKey={props.selectionKey}
        topInset={props.topInset}
        reducedMotion={props.reducedMotion}
      />
      <ReadySignal onReady={props.onReady} />
    </MapContainer>
  );
}
