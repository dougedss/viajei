// o caminho relativo, e não `@shared`: o laboratório e os e2e importam esta receita pelo Node
import type {
  LandmarkRecipe,
  LandmarkShape,
} from '../../../../supabase/functions/_shared/landmark-recipe.ts';

/**
 * A régua da fase 23: a estufa do Jardim Botânico de Curitiba **escrita à mão na receita**, a partir
 * das fotos de referência do balcão (`img/m-jardim.jpg`, `img/m-jardim2.jpg` do artifact da ideia) e
 * da `modelScene` dos esboços em three.js: a base larga com 24 vãos em arco com o leque de cada um, a
 * abóbada de vidro, os três tambores com as cúpulas de nervuras, o terraço com a fonte e as duas
 * escadas, os canteiros em zigue-zague, o canteiro central de amores-perfeitos, os postes de globos e
 * as araucárias ao fundo. As medidas são as dos esboços (a proporção é o que vale: o construtor ajusta
 * a peça à caixa). Se a receita não consegue dizer a estufa, o vocabulário está curto.
 */
const S = (partial: Partial<LandmarkShape> & Pick<LandmarkShape, 'k' | 'm'>): LandmarkShape => ({
  m2: 'none',
  x: 0,
  y: 0,
  z: 0,
  w: 0,
  h: 0,
  d: 0,
  ry: 0,
  p: 0,
  q: 0,
  rep: 'one',
  n: 1,
  sx: 0,
  sz: 0,
  mir: 'none',
  pts: [],
  ...partial,
});

// a estufa (os números dos esboços): a meia distância entre os tambores, o raio das pontas, a altura
// da parede, o recuo e a subida da abóbada, o raio e a altura dos tambores, o patamar gramado
const HS = 4.95;
const RO = 4.65;
const WH = 3.5;
const VR = 2.2;
const RD = 2.45;
const HD = 2.35;
const BH = 1.3;
const YT = BH + WH + VR;

/** O contorno em planta: 5 vãos retos na frente, 7 em cada ponta, 5 atrás (24 vãos). */
function contour(): number[] {
  const pts: number[] = [];
  const push = (x: number, z: number) =>
    pts.push(Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000);
  for (let i = 0; i < 5; i++) push(HS - i * ((2 * HS) / 5), RO);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i / 7) * Math.PI;
    push(-HS + Math.cos(a) * RO, Math.sin(a) * RO);
  }
  for (let i = 0; i < 5; i++) push(-HS + i * ((2 * HS) / 5), -RO);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * Math.PI;
    push(HS + Math.cos(a) * RO, Math.sin(a) * RO);
  }
  return pts;
}

/** Um canteiro em zigue-zague (a sebe), o k-ésimo a partir do caminho, do lado direito. */
function zigzag(k: number): number[] {
  const x0 = 8.3 + k * 1.75;
  const pts: number[] = [];
  for (let j = 0; j <= 4; j++) {
    pts.push(x0 + ((j + k) % 2 ? 0.85 : -0.85), 12.8 + j * 2.5);
  }
  return pts;
}

const outline = contour();

export const ESTUFA_CURITIBA: LandmarkRecipe = {
  v: 1,
  shapes: [
    // o gramado da base e o patamar onde a estufa assenta
    S({ k: 'bed', m: 'grass', w: 33, h: 0.08, d: 36, z: 5.5 }),
    S({ k: 'extrude', m: 'grass', w: 29.5, h: BH, d: 17.6, z: -0.2, q: 14 }),
    // o piso escuro de dentro
    S({ k: 'extrude', m: 'soil', y: BH, h: 0.12, pts: outline }),
    // a base larga: 24 vãos em arco com o leque, a armação branca e o vidro atrás
    S({ k: 'arcade', m: 'white', m2: 'glass', y: BH, h: WH, d: 0.12, pts: outline }),
    // a abóbada de vidro que sobe da parede curvando para dentro, com as nervuras e o terraço em cima
    S({ k: 'vault', m: 'glass', m2: 'white', y: BH + WH, w: VR, h: VR, pts: outline }),
    // a porta da frente, no vão do meio
    S({ k: 'panel', m: 'dark', y: BH + 0.02, z: RO + 0.08, w: 1.15, h: 2.25, d: 0.1 }),
    // os três tambores com as cúpulas de nervuras
    S({
      k: 'drum',
      m: 'glass',
      m2: 'white',
      x: -HS,
      y: YT,
      w: 2 * RD,
      h: HD,
      p: 16,
      q: 1,
      rep: 'line',
      n: 3,
      sx: HS,
    }),
    S({
      k: 'dome',
      m: 'glass',
      m2: 'white',
      x: -HS,
      y: YT + HD,
      w: 2 * RD,
      h: RD * 0.9,
      d: 2 * RD,
      p: 16,
      q: 3,
      rep: 'line',
      n: 3,
      sx: HS,
    }),
    // as plantas lá dentro: as copas baixas e as palmeiras que sobem pelos tambores
    S({
      k: 'tree',
      m: 'leaf2',
      x: -6.5,
      y: BH,
      z: 0.8,
      w: 1.8,
      h: 2.6,
      rep: 'line',
      n: 6,
      sx: 2.6,
    }),
    S({
      k: 'tree',
      m: 'leaf3',
      x: -5.2,
      y: BH,
      z: -1.4,
      w: 1.6,
      h: 2.2,
      rep: 'line',
      n: 5,
      sx: 2.6,
    }),
    S({ k: 'palm', m: 'leaf', x: -HS, y: BH, w: 2.4, h: 6.2, rep: 'line', n: 3, sx: HS }),

    // o terraço com a fonte: o patamar de pedra, o piso, a água que cai e a bacia
    S({ k: 'box', m: 'stone', z: 7.6, w: 5.4, h: BH, d: 3.0 }),
    S({ k: 'bed', m: 'paving', y: BH, z: 7.6, w: 5.4, h: 0.02, d: 3.0 }),
    S({ k: 'bed', m: 'paving', y: BH, z: 5.7, w: 1.8, h: 0.03, d: 1.0 }),
    S({ k: 'panel', m: 'water', y: 0.2, z: 9.13, w: 2.5, h: 1.0, d: 0.06 }),
    S({ k: 'basin', m: 'stone', m2: 'water', z: 9.9, w: 3.6, h: 0.34, d: 1.5 }),
    // as duas escadas, do terraço para o jardim, abertas em leque (uma de cada lado)
    S({
      k: 'stairs',
      m: 'stone',
      x: 4.2,
      z: 8.6,
      w: 1.7,
      h: BH,
      d: 3.75,
      p: 8,
      ry: 54.5,
      mir: 'x',
    }),
    // os guarda-corpos do terraço
    S({ k: 'railing', m: 'steel', y: BH, h: 0.75, pts: [-2.6, 6.2, -2.6, 7.4], mir: 'x' }),
    S({ k: 'railing', m: 'steel', y: BH, h: 0.75, pts: [-2.6, 9.05, 2.6, 9.05] }),

    // o jardim francês: o caminho de pedra em volta e os dois caminhos que abrem
    S({ k: 'bed', m: 'paving', z: 10.8, w: 16, h: 0.02, d: 3 }),
    S({
      k: 'bed',
      m: 'paving',
      h: 0.02,
      pts: [0.6, 12.3, 3.4, 12.3, 6.6, 23.6, 3.8, 23.6],
      mir: 'x',
    }),
    // o canteiro central de amores-perfeitos: amarelo, com a mancha roxa
    S({ k: 'bed', m: 'soil', h: 0.05, pts: [0, 12.9, 3.2, 23.6, -3.2, 23.6] }),
    S({
      k: 'flowers',
      m: 'flowerB',
      h: 0.05,
      p: 11,
      q: 2.3,
      pts: [0, 13.4, 3.0, 23.4, -3.0, 23.4],
    }),
    S({
      k: 'flowers',
      m: 'violet',
      h: 0.08,
      p: 30,
      q: 2.3,
      pts: [-0.9, 16.2, 0.2, 17.2, 0.2, 19.6, -0.9, 20.8, -2.0, 19.6, -2.0, 17.2],
    }),
    // os canteiros em zigue-zague, quatro de cada lado, com as flores ao longo deles
    S({ k: 'wall', m: 'leaf3', w: 0.6, h: 0.55, pts: zigzag(0), mir: 'x' }),
    S({ k: 'wall', m: 'leaf3', w: 0.6, h: 0.55, pts: zigzag(1), mir: 'x' }),
    S({ k: 'wall', m: 'leaf3', w: 0.6, h: 0.55, pts: zigzag(2), mir: 'x' }),
    S({ k: 'wall', m: 'leaf3', w: 0.6, h: 0.55, pts: zigzag(3), mir: 'x' }),
    S({
      k: 'flowers',
      m: 'flowerB',
      h: 0,
      p: 1.6,
      q: 2.2,
      pts: [7.2, 12.8, 9.4, 12.8, 9.4, 22.8, 7.2, 22.8],
      mir: 'x',
    }),
    S({
      k: 'flowers',
      m: 'flowerA',
      h: 0,
      p: 1.6,
      q: 2.2,
      pts: [9.0, 12.8, 11.2, 12.8, 11.2, 22.8, 9.0, 22.8],
      mir: 'x',
    }),
    S({
      k: 'flowers',
      m: 'flowerC',
      h: 0,
      p: 1.4,
      q: 2.2,
      pts: [10.7, 12.8, 12.9, 12.8, 12.9, 22.8, 10.7, 22.8],
      mir: 'x',
    }),
    S({
      k: 'flowers',
      m: 'flowerB',
      h: 0,
      p: 1.6,
      q: 2.2,
      pts: [12.5, 12.8, 14.7, 12.8, 14.7, 22.8, 12.5, 22.8],
      mir: 'x',
    }),
    // a sebe de fora, em L, e a faixa vermelha na frente
    S({
      k: 'wall',
      m: 'leaf3',
      w: 0.6,
      h: 0.7,
      pts: [7.6, 12.2, 15.6, 12.2, 15.6, 24, 7.4, 24],
      mir: 'x',
    }),
    S({
      k: 'flowers',
      m: 'flowerA',
      h: 0,
      p: 14,
      q: 2.0,
      pts: [4.6, 12.45, 7.0, 12.45, 7.0, 12.85, 4.6, 12.85],
      mir: 'x',
    }),
    // os postes de globos (cinco globos cada): três ao longo do jardim e um ao pé de cada escada
    S({
      k: 'lamp',
      m: 'steel',
      x: 7.2,
      z: 12.5,
      w: 1.0,
      h: 3.0,
      p: 5,
      rep: 'line',
      n: 3,
      sx: 0.12,
      sz: 5.5,
      mir: 'x',
    }),
    S({ k: 'lamp', m: 'steel', x: 4.6, z: 10.4, w: 1.0, h: 3.0, p: 5, mir: 'x' }),

    // as árvores ao fundo e dos lados, e as araucárias
    S({
      k: 'tree',
      m: 'leaf',
      x: -13.5,
      z: -10,
      w: 4.2,
      h: 7,
      rep: 'line',
      n: 7,
      sx: 4.6,
      sz: 0.1,
    }),
    S({ k: 'tree', m: 'leaf2', x: 14.6, z: -4.5, w: 3.6, h: 5.8, mir: 'x' }),
    S({ k: 'tree', m: 'leaf2', x: 15, z: 2.8, w: 3.2, h: 5, mir: 'x' }),
    S({ k: 'araucaria', m: 'leaf3', x: -11.8, z: -7.2, w: 5.7, h: 10.5 }),
    S({ k: 'araucaria', m: 'leaf3', x: 12.6, z: -7.4, w: 5.7, h: 11.4 }),
    S({ k: 'araucaria', m: 'leaf3', x: 7.8, z: -11.2, w: 5.2, h: 9.6 }),
  ],
};

/** O lugar da régua, na fonte pública: o parque é o lugar; a estufa é a peça. */
export const ESTUFA_SOURCE = {
  wikidata: 'Q94923',
  place: { osm_type: 'way', osm_id: 607776738 },
  modeled: { osm_type: 'way', osm_id: 261127581, name: 'Estufa Jardim Botânico' },
} as const;
