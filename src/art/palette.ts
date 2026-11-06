/**
 * As cores da cena 3D vêm dos mesmos tokens do CSS (style tile v2): a maquete e o HTML por cima
 * dela não divergem. Lidas do `:root` quando há documento; os valores de `app.css` servem de
 * reserva (testes, primeira pintura).
 */
export type Palette = {
  zone: { city: string; interior: string; field: string; serra: string; beach: string };
  road: string;
  lane: string;
  accent: string;
  onTime: string;
  late: string;
  skyDayTop: string;
  skyDayBottom: string;
  skyNightTop: string;
  skyNightBottom: string;
};

const FALLBACK: Palette = {
  zone: {
    city: '#9a9c94',
    interior: '#86b25a',
    field: '#d2a94a',
    serra: '#3e6a33',
    beach: '#e8d7a8',
  },
  road: '#3b4250',
  lane: '#e9c24a',
  accent: '#e8653a',
  onTime: '#1f9a66',
  late: '#d94b4b',
  skyDayTop: '#f6dcc5',
  skyDayBottom: '#f2eee6',
  skyNightTop: '#0f1627',
  skyNightBottom: '#26304a',
};

function token(style: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const v = style?.getPropertyValue(name).trim();
  return v && v.length > 0 ? v : fallback;
}

export function readPalette(): Palette {
  const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  return {
    zone: {
      city: token(style, '--color-zone-city', FALLBACK.zone.city),
      interior: token(style, '--color-zone-interior', FALLBACK.zone.interior),
      field: token(style, '--color-zone-field', FALLBACK.zone.field),
      serra: token(style, '--color-zone-serra', FALLBACK.zone.serra),
      beach: token(style, '--color-zone-beach', FALLBACK.zone.beach),
    },
    road: token(style, '--color-road', FALLBACK.road),
    lane: token(style, '--color-lane', FALLBACK.lane),
    accent: token(style, '--color-sunset', FALLBACK.accent),
    onTime: token(style, '--color-on-time', FALLBACK.onTime),
    late: token(style, '--color-late', FALLBACK.late),
    // os tokens do céu mudam com o tema; a cena quer os dois presets de uma vez
    skyDayTop: FALLBACK.skyDayTop,
    skyDayBottom: FALLBACK.skyDayBottom,
    skyNightTop: FALLBACK.skyNightTop,
    skyNightBottom: FALLBACK.skyNightBottom,
  };
}
