import { describe, expect, it } from 'vitest';
import type { SearchResult } from './named.ts';
import { placeKey, resolvePlace } from './locate.ts';

/** As respostas que o balcão colheu do Nominatim em 20/11 (uma chamada cada), fixas. */
const city = (name: string, address: string, lat: number, lng: number): SearchResult => ({
  name,
  address,
  lat,
  lng,
  category: 'place',
  type: 'town',
});
const MAFRA_PT = city('Mafra', 'Mafra, Lisboa, Portugal', 38.9369, -9.3312);
const MAFRA_SC = city('Mafra', 'Mafra, Santa Catarina, Brasil', -26.1116, -49.8054);
const MAFRA_MT = city('Mafra', 'Mafra, Nova Mutum, Mato Grosso, Brasil', -13.83, -56.08);
const JOINVILLE_FR = city('Joinville', 'Joinville, Haute-Marne, França', 48.4433, 5.1396);
const JOINVILLE_SC = city('Joinville', 'Joinville, Santa Catarina, Brasil', -26.3045, -48.8487);
const LITORAL_CM = city('Litoral', 'Litoral, Camarões', 4.2, 10.06);
// a referência: Papanduva/SC (a bateria de 20/11), em [lng, lat]
const PAPANDUVA: [number, number] = [-50.144, -26.37];

describe('a cidade conferida (fase 25, D276): plausível a até 400 km de onde a pessoa está', () => {
  it('"mafra" com Mafra/Lisboa em 1º e Mafra/SC em 2º: a de SC, sem pergunta', () => {
    const r = resolvePlace([MAFRA_PT, MAFRA_SC], PAPANDUVA);
    expect(r.kind).toBe('found');
    expect(r.kind === 'found' ? r.hit.address : null).toBe('Mafra, Santa Catarina, Brasil');
    expect(r.kind === 'found' ? r.hit.km : null).toBeCloseTo(44, 0);
  });

  it('"joinville" com a França em 1º: a de SC', () => {
    const r = resolvePlace([JOINVILLE_FR, JOINVILLE_SC], PAPANDUVA);
    expect(r.kind === 'found' ? r.hit.address : null).toBe('Joinville, Santa Catarina, Brasil');
  });

  it('a Mafra de Nova Mutum/MT, a uns 2.000 km, não é plausível: só a de SC fica', () => {
    const r = resolvePlace([MAFRA_MT, MAFRA_SC], PAPANDUVA);
    expect(r.kind).toBe('found');
    expect(r.kind === 'found' ? r.hit.address : null).toBe('Mafra, Santa Catarina, Brasil');
  });

  it('só candidatos longe ("litoral" em Camarões; só a Mafra de Portugal): a pergunta, com a distância, nunca a busca em silêncio', () => {
    const litoral = resolvePlace([LITORAL_CM], PAPANDUVA);
    expect(litoral.kind).toBe('far');
    const mafra = resolvePlace([MAFRA_PT], PAPANDUVA);
    expect(mafra.kind).toBe('far');
    const pt = mafra.kind === 'far' ? mafra.options[0] : null;
    expect(pt?.address).toBe('Mafra, Lisboa, Portugal');
    // a distância em linha reta, um fato (a tela de 20/11 dizia "a cerca de 146 h" de carro, que
    // ninguém mediu: D310)
    expect(pt?.km).toBeGreaterThan(7_000);
    expect(pt).not.toHaveProperty('minutes');
  });

  it('mais de um plausível, longe um do outro: a escolha (o molde da D229); perto um do outro: o mesmo lugar', () => {
    const a = city('Bom Jardim', 'Bom Jardim da Serra, SC', -28.34, -49.62);
    const b = city('Bom Jardim', 'Bom Jardim, RS', -29.5, -50.3);
    const r = resolvePlace([a, b], PAPANDUVA);
    expect(r.kind).toBe('choice');
    expect(r.kind === 'choice' ? r.options.map((o) => o.address) : []).toEqual([
      'Bom Jardim da Serra, SC',
      'Bom Jardim, RS',
    ]);
    // o município e a cidade, a 1 km: um lugar só
    const town = city('Mafra', 'Mafra, SC', -26.1116, -49.8054);
    const boundary = { ...town, lat: -26.12, category: 'boundary', type: 'administrative' };
    expect(resolvePlace([boundary, town], PAPANDUVA).kind).toBe('found');
  });

  it('a sede e o contorno do município, a mais de 2 km: a mesma cidade, a sede vale (a medição de 21/11, D282)', () => {
    const sede = city('Papanduva', 'Papanduva, Santa Catarina, Brasil', -26.3702, -50.1438);
    const contorno = {
      ...city(
        'Papanduva',
        'Papanduva, Região Geográfica Imediata de Mafra, Santa Catarina, Brasil',
        -26.45,
        -50.07,
      ),
      category: 'boundary',
      type: 'administrative',
    };
    // sem referência nenhuma (a origem dita, sem posição): nenhuma pergunta
    const r = resolvePlace([contorno, sede], null);
    expect(r.kind).toBe('found');
    expect(r.kind === 'found' ? r.hit.lat : null).toBe(-26.3702);
    // com a rua e o rio do mesmo nome: com alguma cidade entre os resultados, só elas contam
    const rua = {
      ...city('Rua Papanduva', 'Rua Papanduva, Joinville, Brasil', -26.3, -48.85),
      category: 'highway',
      type: 'residential',
    };
    const rio = {
      ...city('Rio Papanduva', 'Rio Papanduva, Santa Catarina, Brasil', -26.6, -50.3),
      category: 'waterway',
      type: 'river',
    };
    expect(resolvePlace([sede, rua, rio, contorno], null).kind).toBe('found');
    // duas cidades com o mesmo nome longe uma da outra continuam duas (Mafra/SC e Mafra/MT)
    expect(resolvePlace([MAFRA_SC, MAFRA_MT], null).kind).toBe('choice');
    // e, sem nenhuma cidade entre os resultados, a pessoa diz qual é (D283)
    expect(resolvePlace([rua], null).kind).toBe('unknown');
  });

  it('homônimos de verdade: o município vale sozinho diante das localidades pequenas; os do mesmo peso ficam em dúvida (D283)', () => {
    // a forma do que o Nominatim devolveu para "Papanduva" na medição de 21/11 (as importâncias aqui são
    // do teste: o que a regra cobra é a folga de 2 vezes)
    const municipio = {
      ...city('Papanduva', 'Papanduva, Santa Catarina, Região Sul, Brasil', -26.43, -50.15),
      category: 'boundary',
      type: 'administrative',
      importance: 0.41,
    };
    const distritoPr = {
      ...city('Papanduva', 'Papanduva, Rio Branco do Sul, Paraná, Brasil', -25.12, -49.4),
      category: 'boundary',
      type: 'administrative',
      importance: 0.12,
    };
    const localidade1 = {
      ...city('Papanduva', 'Papanduva, Presidente Getúlio, Santa Catarina, Brasil', -27.0, -49.66),
      type: 'hamlet',
      importance: 0.1,
    };
    const localidade2 = {
      ...city('Papanduva', 'Papanduva, Campo Alegre, Santa Catarina, Brasil', -26.15, -49.3),
      type: 'hamlet',
      importance: 0.1,
    };
    const all = [municipio, distritoPr, localidade1, localidade2];
    // sem referência (a origem dita, sem posição), e com a posição em Major Vieira: o município
    for (const ref of [null, [-50.3268, -26.3712] as [number, number]]) {
      const r = resolvePlace(all, ref);
      expect(r.kind).toBe('found');
      expect(r.kind === 'found' ? r.hit.address : null).toBe(municipio.address);
    }
    // Mafra/SC e Mafra/Lisboa com a mesma importância, sem referência: a dúvida, e a pergunta
    const pt = { ...MAFRA_PT, importance: 0.49 };
    const sc = { ...MAFRA_SC, importance: 0.49 };
    expect(resolvePlace([pt, sc], null).kind).toBe('choice');
    // sem a importância (o cache de antes, as respostas de mentira): nada se decide por ela
    expect(resolvePlace([MAFRA_PT, MAFRA_SC], null).kind).toBe('choice');
  });

  it('nenhuma cidade com o nome dito: "Serra Gaúcha" são postos; nada volta (D283)', () => {
    const posto = (rua: string, lat: number) => ({
      name: 'Serra Gaúcha',
      address: `Serra Gaúcha, ${rua}, Bento Gonçalves, Rio Grande do Sul, Brasil`,
      lat,
      lng: -51.5,
      category: 'amenity',
      type: 'fuel',
    });
    expect(resolvePlace([posto('Rua A', -29.16), posto('Rua B', -29.18)], PAPANDUVA)).toEqual({
      kind: 'unknown',
    });
    expect(resolvePlace([], PAPANDUVA)).toEqual({ kind: 'unknown' });
  });

  it('sem referência (nem posição, nem origem): um resultado vale; dois longe um do outro pedem a escolha', () => {
    expect(resolvePlace([MAFRA_SC], null).kind).toBe('found');
    const r = resolvePlace([JOINVILLE_FR, JOINVILLE_SC], null);
    expect(r.kind).toBe('choice');
    expect(r.kind === 'choice' ? r.options.map((o) => o.km) : []).toEqual([null, null]);
  });

  it('a chave da escolha guardada é o que foi dito, sem acento nem caixa', () => {
    expect(placeKey('  São  Bento do SUL ')).toBe('sao bento do sul');
  });
});
