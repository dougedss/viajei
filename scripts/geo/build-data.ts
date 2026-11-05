/**
 * Gera os dados geográficos embutidos em src/lib/geo/data a partir das fontes públicas:
 *   - linha de costa: Natural Earth 1:10m (domínio público), recortada e simplificada
 *   - biomas: IBGE 1:250.000 (uso livre com atribuição), simplificados
 *   - municípios: kelvins/municipios-brasileiros (MIT) para nome, UF e centroide,
 *     mais a estimativa de população do IBGE pela API SIDRA (tabela 6579, variável 9324)
 * Os brutos ficam em scripts/geo/raw (fora do git). Rode com `pnpm geo:build` (Node 22, .ts direto).
 * O dado nunca é editado à mão: para mudar, muda-se aqui e regenera-se. Veja docs/dados-geo.md.
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type * as Shapefile from 'shapefile';
import { simplify } from '../../supabase/functions/_shared/geo.ts';
import {
  bboxOf,
  encodeInts,
  encodeLine,
  type BiomeCode,
  type BiomesData,
  type CoastData,
  type MunicipalitiesData,
} from '../../src/lib/geo/codec.ts';

const require = createRequire(import.meta.url);
const shapefile = require('shapefile') as typeof Shapefile;

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const RAW = join(ROOT, 'scripts/geo/raw');
const OUT = join(ROOT, 'src/lib/geo/data');
const run = promisify(execFile);

/** Brasil com margem: pega a costa vizinha (Uruguai, Guianas) para a distância ao mar não mentir na fronteira. */
const BBOX: [number, number, number, number] = [-75, -36, -28, 7];
const COAST_TOLERANCE_M = 500;
const BIOME_TOLERANCE_M = 2000;

const SOURCES = {
  coast: 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_coastline.zip',
  biomes:
    'https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip',
  municipalities:
    'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv',
  states: 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/estados.csv',
  population: 'https://apisidra.ibge.gov.br/values/t/6579/n6/all/v/9324/p/last',
};

async function download(url: string, file: string): Promise<string> {
  const path = join(RAW, file);
  try {
    await stat(path);
    console.log(`· ${file} já baixado`);
    return path;
  } catch {
    // baixa
  }
  console.log(`↓ ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': 'Viajei geo:build (Node)' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

async function unzip(zip: string, dir: string): Promise<string> {
  const out = join(RAW, dir);
  try {
    await stat(out);
    return out;
  } catch {
    await mkdir(out, { recursive: true });
    await run('unzip', ['-o', '-q', zip, '-d', out]);
    return out;
  }
}

async function findFile(dir: string, ext: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const hit = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(ext));
  if (!hit) throw new Error(`nenhum ${ext} em ${dir}`);
  return join(hit.parentPath, hit.name);
}

type Ring = [number, number][];
const inBbox = (c: readonly number[]) =>
  (c[0] ?? 0) >= BBOX[0] &&
  (c[0] ?? 0) <= BBOX[2] &&
  (c[1] ?? 0) >= BBOX[1] &&
  (c[1] ?? 0) <= BBOX[3];

const kb = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;

// ------------------------------------------------------------------------------------ costa
async function buildCoast(): Promise<void> {
  const zip = await download(SOURCES.coast, 'ne_10m_coastline.zip');
  const dir = await unzip(zip, 'ne_10m_coastline');
  const shp = await findFile(dir, '.shp');
  const source = await shapefile.open(shp);
  const lines: string[] = [];
  let points = 0;
  let kept = 0;
  for (;;) {
    const { done, value } = await source.read();
    if (done) break;
    const g = value.geometry;
    const parts: Ring[] =
      g.type === 'LineString'
        ? [g.coordinates as Ring]
        : g.type === 'MultiLineString'
          ? (g.coordinates as Ring[])
          : [];
    for (const part of parts) {
      // runs de pontos dentro da caixa; uma linha cortada vira várias
      let run: Ring = [];
      const flush = () => {
        if (run.length >= 2) {
          const s = simplify(run, COAST_TOLERANCE_M);
          kept += s.length;
          lines.push(encodeLine(s));
        }
        run = [];
      };
      for (const c of part) {
        points += 1;
        if (inBbox(c)) run.push(c);
        else flush();
      }
      flush();
    }
  }
  const data: CoastData = {
    source: 'Natural Earth 1:10m coastline v5.1.1 (naturalearthdata.com)',
    license: 'domínio público',
    generated_at: new Date().toISOString().slice(0, 10),
    bbox: BBOX,
    lines,
  };
  const json = JSON.stringify(data);
  await writeFile(join(OUT, 'coast.json'), json);
  console.log(
    `costa: ${points} vértices lidos, ${kept} mantidos em ${lines.length} linhas → ${kb(json)}`,
  );
}

// ----------------------------------------------------------------------------------- biomas
const BIOME_CODES: Record<string, BiomeCode> = {
  amazonia: 'amazonia',
  caatinga: 'caatinga',
  cerrado: 'cerrado',
  'mata atlantica': 'mata_atlantica',
  pampa: 'pampa',
  pantanal: 'pantanal',
};
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function buildBiomes(): Promise<void> {
  const zip = await download(SOURCES.biomes, 'Biomas_250mil.zip');
  const dir = await unzip(zip, 'Biomas_250mil');
  const shp = await findFile(dir, '.shp');
  const dbf = shp.replace(/\.shp$/i, '.dbf');
  const source = await shapefile.open(shp, dbf, { encoding: 'utf-8' });
  const byCode = new Map<BiomeCode, { name: string; rings: string[]; vertices: number }>();
  let read = 0;
  for (;;) {
    const { done, value } = await source.read();
    if (done) break;
    const props = value.properties as Record<string, unknown>;
    const nameRaw = String(
      props.Bioma ?? props.bioma ?? props.NOME ?? props.nome ?? Object.values(props)[0],
    );
    const code = BIOME_CODES[normalize(nameRaw)];
    if (!code) {
      console.warn(`bioma desconhecido: ${nameRaw}`);
      continue;
    }
    const g = value.geometry;
    const polys: Ring[][] =
      g.type === 'Polygon'
        ? [g.coordinates as Ring[]]
        : g.type === 'MultiPolygon'
          ? (g.coordinates as Ring[][])
          : [];
    const entry = byCode.get(code) ?? { name: nameRaw.trim(), rings: [], vertices: 0 };
    for (const poly of polys) {
      for (const ring of poly) {
        read += ring.length;
        const first = ring[0];
        if (!first) continue;
        const last = ring.at(-1);
        const closed = last ? last[0] === first[0] && last[1] === first[1] : false;
        const open = closed ? ring.slice(0, -1) : ring;
        const s = simplify([...open, first], BIOME_TOLERANCE_M).slice(0, -1);
        if (s.length < 3) continue;
        entry.vertices += s.length;
        entry.rings.push(encodeLine(s));
      }
    }
    byCode.set(code, entry);
  }
  const data: BiomesData = {
    source: 'IBGE, Biomas do Brasil 1:250.000 (geoftp.ibge.gov.br)',
    license: 'uso livre com atribuição ao IBGE',
    generated_at: new Date().toISOString().slice(0, 10),
    biomes: [...byCode.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, e]) => ({ code, name: e.name, rings: e.rings })),
  };
  const json = JSON.stringify(data);
  await writeFile(join(OUT, 'biomes.json'), json);
  for (const [code, e] of byCode)
    console.log(`  ${code}: ${e.rings.length} anéis, ${e.vertices} vértices`);
  console.log(`biomas: ${read} vértices lidos → ${kb(json)}`);
}

// ------------------------------------------------------------------------------- municípios
function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
  const header = (lines[0] ?? '').split(',');
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

async function buildMunicipalities(): Promise<void> {
  const csv = await readFile(await download(SOURCES.municipalities, 'municipios.csv'), 'utf8');
  const states = parseCsv(await readFile(await download(SOURCES.states, 'estados.csv'), 'utf8'));
  const ufByCode = new Map(states.map((s) => [s.codigo_uf ?? '', s.uf ?? '']));
  const sidra = JSON.parse(
    await readFile(await download(SOURCES.population, 'sidra-6579.json'), 'utf8'),
  ) as Record<string, string>[];
  const popByCode = new Map<string, number>();
  let year = '';
  for (const row of sidra.slice(1)) {
    const code = row.D1C ?? '';
    const v = Number(row.V);
    if (code && Number.isFinite(v)) popByCode.set(code, v);
    year = row.D3N ?? year;
  }
  type M = { name: string; uf: string; lat: number; lng: number; pop: number };
  const rows: M[] = [];
  let missing = 0;
  for (const r of parseCsv(csv)) {
    const code = r.codigo_ibge ?? '';
    const pop = popByCode.get(code);
    if (pop === undefined) missing += 1;
    rows.push({
      name: r.nome ?? '',
      uf: ufByCode.get(r.codigo_uf ?? '') ?? '??',
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      pop: pop ?? 0,
    });
  }
  // ordenados por latitude: deltas pequenos nas coordenadas
  rows.sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const data: MunicipalitiesData = {
    source: `kelvins/municipios-brasileiros (centroides) + IBGE SIDRA tabela 6579, estimativa ${year}`,
    license: 'MIT (centroides); IBGE, uso livre com atribuição (população)',
    generated_at: new Date().toISOString().slice(0, 10),
    count: rows.length,
    names: rows.map((r) => r.name).join('|'),
    uf: rows.map((r) => r.uf).join(''),
    coords: encodeLine(rows.map((r) => [r.lng, r.lat])),
    pop: encodeInts(rows.map((r) => r.pop)),
  };
  const json = JSON.stringify(data);
  await writeFile(join(OUT, 'municipalities.json'), json);
  console.log(
    `municípios: ${rows.length}, ${missing} sem população no SIDRA, estimativa ${year} → ${kb(json)}`,
  );
}

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });
const only = process.argv[2];
if (!only || only === 'coast') await buildCoast();
if (!only || only === 'biomes') await buildBiomes();
if (!only || only === 'municipalities') await buildMunicipalities();
console.log(
  `bbox usada: ${bboxOf([
    [BBOX[0], BBOX[1]],
    [BBOX[2], BBOX[3]],
  ]).join(', ')}`,
);
