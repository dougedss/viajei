import { useId } from 'react';
import { CAR_COLORS } from '@shared/constants.ts';
import { darken, lighten } from '../color.ts';
import { describeCar } from './describe.ts';
import { placeAccessories, type LaneItem, type Placement } from './placement.ts';
import {
  archOf,
  archRadius,
  bodyBounds,
  outline,
  polygonPath,
  toSvgPath,
  wheelCenters,
  type CarProfile,
  type Pt,
  type StickerSpot,
} from './profile.ts';
import { PROFILES } from './profiles/index.ts';
import {
  ANTENNA,
  BIKE,
  BIKE_TUBES,
  BOARD,
  BOX,
  boxLength,
  FOG_LIGHT,
  PAINT_TOP_HEX,
  RACK,
} from './shapes.ts';
import { viewBoxOf } from './side.ts';
import { STICKER_ART, STICKER_RING, STICKER_STROKE, type StickerArt } from './stickers.ts';
import type { CarSpec } from './types.ts';

/**
 * O carro de lado, em SVG, a partir do mesmo `CarProfile` do 3D: carroceria na cor da viagem (a
 * kombi em saia e blusa), vidros, rodas (com calota cromada quando houver), luzes e os cosméticos
 * de teto e de lado. Sem three, no chunk principal, nítido em qualquer tamanho e offline. O
 * `viewBox` de cada modelo já reserva o espaço do acessório mais alto, para o carro não mudar de
 * tamanho quando ganha um rack. Nariz para a direita.
 */
type Props = {
  car: CarSpec;
  className?: string;
  /** rótulo próprio; por padrão, a descrição do carro ("Hatch Pôr do sol com rack") */
  label?: string;
};

const GLASS = ['#3A4E6A', '#1B2535'] as const;
const TRIM = '#1F2228';
const TIRE = '#15171A';
const RIM = '#9AA2AD';
const CHROME = ['#F4F6F8', '#A9B0BA'] as const;
const WELL = '#101216';

function f(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function Wheel({ at, r, hubcaps, id }: { at: Pt; r: number; hubcaps: boolean; id: string }) {
  const [x, y] = at;
  return (
    <g>
      <circle cx={f(x)} cy={f(y)} r={f(r)} fill={TIRE} />
      {hubcaps ? (
        <>
          <circle cx={f(x)} cy={f(y)} r={f(r * 0.7)} fill={`url(#${id}-chrome)`} />
          <circle
            cx={f(x)}
            cy={f(y)}
            r={f(r * 0.7)}
            fill="none"
            stroke="#7D858F"
            strokeWidth={f(r * 0.04)}
          />
          <circle cx={f(x)} cy={f(y)} r={f(r * 0.16)} fill="#C9CED6" />
        </>
      ) : (
        <>
          <circle cx={f(x)} cy={f(y)} r={f(r * 0.6)} fill={RIM} />
          <path
            d={`M${f(x)} ${f(y - r * 0.5)}V${f(y + r * 0.5)}M${f(x - r * 0.5)} ${f(y)}H${f(x + r * 0.5)}M${f(x - r * 0.35)} ${f(y - r * 0.35)}L${f(x + r * 0.35)} ${f(y + r * 0.35)}M${f(x - r * 0.35)} ${f(y + r * 0.35)}L${f(x + r * 0.35)} ${f(y - r * 0.35)}`}
            stroke="#6C747F"
            strokeWidth={f(r * 0.07)}
          />
          <circle cx={f(x)} cy={f(y)} r={f(r * 0.18)} fill="#3B4250" />
        </>
      )}
    </g>
  );
}

function Rack({ p }: { p: CarProfile }) {
  const { y, x0, x1 } = p.anchors.roof;
  const len = x1 - x0;
  const bars = [x0 + len * RACK.inset, x1 - len * RACK.inset];
  return (
    <g fill={TRIM}>
      <rect x={f(x0)} y={f(y)} width={f(len)} height={f(RACK.rail)} rx={f(RACK.rail / 2)} />
      {bars.map((bx) => (
        <rect
          key={bx}
          x={f(bx - RACK.bar.w / 2)}
          y={f(y + RACK.deck - RACK.bar.h)}
          width={f(RACK.bar.w)}
          height={f(RACK.bar.h)}
          rx={0.015}
        />
      ))}
    </g>
  );
}

function RoofItem({ item, p, id }: { item: LaneItem; p: CarProfile; id: string }) {
  const { y, x0, x1 } = p.anchors.roof;
  const cx = (x0 + x1) / 2;
  const deck = y + RACK.deck;
  if (item === 'box') {
    const len = boxLength(x1 - x0);
    return (
      <g>
        <rect
          x={f(cx - len / 2)}
          y={f(deck)}
          width={f(len)}
          height={f(BOX.height)}
          rx={f(BOX.radius)}
          fill={`url(#${id}-box)`}
        />
        <path
          d={`M${f(cx - len / 2 + 0.12)} ${f(deck + BOX.height - 0.08)}H${f(cx + len / 2 - 0.12)}`}
          stroke="rgb(255 255 255 / .22)"
          strokeWidth={0.03}
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (item === 'board') {
    return (
      <g>
        <rect
          x={f(cx - BOARD.length / 2)}
          y={f(deck)}
          width={f(BOARD.length)}
          height={f(BOARD.thickness)}
          rx={f(BOARD.thickness / 2)}
          fill="#DAF0EC"
          stroke="#9CCFC6"
          strokeWidth={0.02}
        />
        <path
          d={`M${f(cx - BOARD.length / 2 + 0.2)} ${f(deck + BOARD.thickness / 2)}H${f(cx + BOARD.length / 2 - 0.2)}`}
          stroke="#E8653A"
          strokeWidth={0.025}
        />
      </g>
    );
  }
  const at = (pt: Pt): Pt => [cx + pt[0], deck + pt[1]];
  const tubes = BIKE_TUBES.map(([a, b]) => {
    const [ax, ay] = at(a);
    const [bx, by] = at(b);
    return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}`;
  }).join('');
  const [sx, sy] = at(BIKE.seat);
  const [hx, hy] = at(BIKE.head);
  return (
    <g fill="none" strokeLinecap="round">
      {[BIKE.rear, BIKE.front].map((w) => {
        const [wx, wy] = at(w);
        return (
          <circle
            key={w[0]}
            cx={f(wx)}
            cy={f(wy)}
            r={f(BIKE.wheelR)}
            stroke={TIRE}
            strokeWidth={0.04}
          />
        );
      })}
      <path d={tubes} stroke="#8A2B2B" strokeWidth={f(BIKE.tube * 1.6)} />
      <path
        d={`M${f(sx - 0.09)} ${f(sy + 0.03)}H${f(sx + 0.07)}M${f(hx - 0.02)} ${f(hy)}l0.06 0.08h0.08`}
        stroke={TRIM}
        strokeWidth={0.035}
      />
    </g>
  );
}

function Sticker({ spot, art }: { spot: StickerSpot; art: StickerArt }) {
  const s = spot.size / 24;
  // a arte é desenhada com y para baixo, como num SVG comum: desvira dentro do grupo virado
  const t = `translate(${f(spot.at[0])} ${f(spot.at[1])}) scale(${f(s)} ${f(-s)}) translate(-12 -12)`;
  return (
    <g transform={t}>
      <circle cx={12} cy={12} r={11.2} fill={art.bg} stroke={art.ring} strokeWidth={STICKER_RING} />
      {art.strokes.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={art.ink}
          strokeWidth={STICKER_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {art.fills.map((d) => (
        <path key={d} d={d} fill={art.ink} />
      ))}
      {art.highlights.map((d) => (
        <path key={d} d={d} fill="#FFFFFF" />
      ))}
    </g>
  );
}

function Lights({ p, placement }: { p: CarProfile; placement: Placement }) {
  const { lights, grille, bevel, anchors } = p;
  const [hx, hy] = lights.head;
  const [tx, ty] = lights.tail;
  return (
    <g>
      {grille ? (
        <rect
          x={f(grille.at[0] + bevel - 0.05)}
          y={f(grille.at[1] - grille.size[0] / 2)}
          width={0.07}
          height={f(grille.size[0])}
          rx={0.02}
          fill={TRIM}
        />
      ) : null}
      <ellipse
        cx={f(hx + bevel - 0.02)}
        cy={f(hy)}
        rx={lights.headRound ? 0.06 : 0.07}
        ry={f(lights.headSize[0] / 2)}
        fill="#F6F1E2"
        stroke="#C9C2AE"
        strokeWidth={0.015}
      />
      <rect
        x={f(tx - bevel - 0.02)}
        y={f(ty - lights.tailSize[0] / 2)}
        width={0.09}
        height={f(lights.tailSize[0])}
        rx={0.025}
        fill="#C23B2E"
      />
      {placement.fogLights ? (
        <circle
          cx={f(anchors.frontBumper.at[0] + bevel - 0.04)}
          cy={f(anchors.frontBumper.at[1])}
          r={FOG_LIGHT.radius}
          fill="#FFF1C0"
          stroke={CHROME[1]}
          strokeWidth={0.02}
        />
      ) : null}
    </g>
  );
}

export function CarSide({ car, className, label }: Props) {
  const raw = useId();
  const id = `car${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const p = PROFILES[car.model];
  const placement = placeAccessories(p, car.accessories);
  const color = CAR_COLORS[car.color].hex;
  const gold = car.color === 'gold';
  const top = p.twoTone && !gold ? PAINT_TOP_HEX : color;
  const view = viewBoxOf(p);
  const body = toSvgPath(outline(p));
  const { front, rear } = wheelCenters(p);
  const R = archRadius(p);
  const b = bodyBounds(p);
  const near = placement.lanes[0] ?? null;
  const far = placement.lanes
    .slice(1)
    .filter((l): l is LaneItem => l !== null)
    .reverse();
  const bed = p.bed;
  const strokeW = f(p.bevel * 2);

  const paintFill = (c: string, key: string) => (
    <linearGradient id={`${id}-${key}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={darken(c, 0.26)} />
      <stop offset="0.45" stopColor={c} />
      <stop offset="1" stopColor={lighten(c, gold ? 0.32 : 0.2)} />
    </linearGradient>
  );

  const bodyShape = (fill: string, stroke: string) => (
    <>
      <path d={body} fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
      {bed ? (
        <rect
          x={f(bed.x0 - p.bevel)}
          y={f(bed.floor - 0.02)}
          width={f(bed.x1 - bed.x0 + p.bevel)}
          height={f(bed.top - bed.floor + 0.02)}
          rx={0.04}
          fill={fill}
          stroke={stroke}
          strokeWidth={f(p.bevel)}
          strokeLinejoin="round"
        />
      ) : null}
    </>
  );

  return (
    <svg
      viewBox={`${f(view.minX)} ${f(-view.top)} ${f(view.width)} ${f(view.top + 0.14)}`}
      className={className}
      role="img"
      aria-label={label ?? describeCar(car)}
      data-car-model={car.model}
      data-car-color={car.color}
    >
      <defs>
        {paintFill(color, 'paint')}
        {p.twoTone ? paintFill(top, 'top') : null}
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GLASS[1]} />
          <stop offset="1" stopColor={GLASS[0]} />
        </linearGradient>
        <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={CHROME[1]} />
          <stop offset="1" stopColor={CHROME[0]} />
        </linearGradient>
        <linearGradient id={`${id}-box`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E1014" />
          <stop offset="1" stopColor="#2A2F38" />
        </linearGradient>
        {p.twoTone ? (
          <>
            <clipPath id={`${id}-skirt`}>
              <rect x={f(view.minX)} y={-1} width={f(view.width)} height={f(p.twoTone.split + 1)} />
            </clipPath>
            <clipPath id={`${id}-blouse`}>
              <rect x={f(view.minX)} y={f(p.twoTone.split)} width={f(view.width)} height={4} />
            </clipPath>
          </>
        ) : null}
      </defs>
      <g transform="scale(1 -1)">
        <ellipse
          cx={f((b.minX + b.maxX) / 2)}
          cy={0.01}
          rx={f((b.maxX - b.minX) * 0.48)}
          ry={0.07}
          fill="rgb(0 0 0 / .26)"
        />
        <circle cx={f(front[0])} cy={f(front[1])} r={f(R)} fill={WELL} />
        <circle cx={f(rear[0])} cy={f(rear[1])} r={f(R)} fill={WELL} />
        {p.spare ? (
          <g>
            <rect
              x={f(p.spare[0] - p.bevel - 0.3)}
              y={f(p.spare[1] - p.wheels.radius * 0.82)}
              width={0.3}
              height={f(p.wheels.radius * 1.64)}
              rx={0.1}
              fill={TIRE}
            />
          </g>
        ) : null}

        {p.twoTone ? (
          <>
            <g clipPath={`url(#${id}-skirt)`}>{bodyShape(`url(#${id}-paint)`, color)}</g>
            <g clipPath={`url(#${id}-blouse)`}>{bodyShape(`url(#${id}-top)`, top)}</g>
          </>
        ) : (
          bodyShape(`url(#${id}-paint)`, color)
        )}
        {bed ? (
          <path
            d={`M${f(bed.x0 - p.bevel)} ${f(bed.top)}H${f(bed.x1)}`}
            stroke={darken(color, 0.3)}
            strokeWidth={0.04}
            strokeLinecap="round"
          />
        ) : null}
        <path
          d={`M${f(b.minX + 0.25)} ${f(p.sill + 0.12)}H${f(b.maxX - 0.25)}`}
          stroke={darken(color, 0.35)}
          strokeOpacity={0.35}
          strokeWidth={0.03}
        />

        {p.wheels.flare > 0
          ? [front, rear].map(([cx]) => {
              const arc = archOf(p, cx);
              const r = R + p.wheels.flare / 2;
              const sx = cx + r * Math.cos(arc.from);
              const sy = p.wheels.radius + r * Math.sin(arc.from);
              const ex = cx + r * Math.cos(arc.to);
              const ey = p.wheels.radius + r * Math.sin(arc.to);
              const large = arc.to - arc.from > Math.PI ? 1 : 0;
              return (
                <path
                  key={cx}
                  d={`M${f(sx)} ${f(sy)}A${f(r)} ${f(r)} 0 ${large} 1 ${f(ex)} ${f(ey)}`}
                  fill="none"
                  stroke={TRIM}
                  strokeWidth={f(p.wheels.flare + p.bevel)}
                />
              );
            })
          : null}

        {p.glass.side.map((win) => (
          <path key={win.join()} d={polygonPath(win)} fill={`url(#${id}-glass)`} />
        ))}
        {p.handles.map(([hx, hy]) => (
          <rect
            key={hx}
            x={f(hx - 0.08)}
            y={f(hy - 0.02)}
            width={0.16}
            height={0.04}
            rx={0.02}
            fill={darken(color, 0.45)}
          />
        ))}
        <rect
          x={f(p.mirror[0] - 0.1)}
          y={f(p.mirror[1] - 0.05)}
          width={0.16}
          height={0.11}
          rx={0.04}
          fill={darken(p.twoTone && p.mirror[1] > p.twoTone.split ? top : color, 0.12)}
        />
        <Lights p={p} placement={placement} />
        {placement.stickers.map((key, i) => {
          const spot = p.anchors.stickers[i];
          return key && spot ? <Sticker key={key} spot={spot} art={STICKER_ART[key]} /> : null;
        })}

        <Wheel at={front} r={p.wheels.radius} hubcaps={placement.hubcaps} id={id} />
        <Wheel at={rear} r={p.wheels.radius} hubcaps={placement.hubcaps} id={id} />

        {placement.rack ? <Rack p={p} /> : null}
        {far.map((item) => (
          <RoofItem key={item} item={item} p={p} id={id} />
        ))}
        {near ? <RoofItem item={near} p={p} id={id} /> : null}

        {placement.antenna ? (
          <g>
            <path
              d={`M${f(p.anchors.antenna[0])} ${f(p.anchors.antenna[1])}l0.04 ${f(ANTENNA.height)}`}
              stroke={TRIM}
              strokeWidth={0.025}
              strokeLinecap="round"
            />
            <path
              d={`M${f(p.anchors.antenna[0] + 0.04)} ${f(p.anchors.antenna[1] + ANTENNA.height)}l${f(-ANTENNA.flag.w)} ${f(-ANTENNA.flag.h / 2)}l${f(ANTENNA.flag.w)} ${f(-ANTENNA.flag.h / 2)}Z`}
              fill="#E8653A"
            />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
