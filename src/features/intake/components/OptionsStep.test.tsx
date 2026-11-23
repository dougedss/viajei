import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { driveKey } from '@shared/drive-schema.ts';
import type { LngLat } from '@shared/geo.ts';
import type { Place } from '@shared/places-schema.ts';
import { neededPairs, type MapStage, type OptionGroup } from '../flow.ts';
import { ratingText, statusText } from '../option-text.ts';
import { MapAttribution, OptionsStep } from './OptionsStep.tsx';

afterEach(cleanup);

/**
 * Os cartões com a fonte do Google (fase 27): a nota com o número de avaliações, o "aberto agora" ou
 * "fechado agora", o fechado de vez marcado, o horário em texto, e "Dados do Google Maps" ao lado da
 * atribuição do OpenStreetMap e da Geoapify só quando há lugar do Google na tela.
 */
const google = (over: Partial<Place> = {}): Place => ({
  id: 'ChIJ-cafe',
  name: 'Café da Praça',
  lat: -26.18,
  lng: -50.39,
  categories: ['cafe'],
  city: 'Canoinhas',
  address: 'R. Vidal Ramos, 100, Canoinhas - SC',
  opening_hours: 'segunda-feira: 08:00 – 19:00 · terça-feira: 08:00 – 19:00',
  website: null,
  osm: null,
  distance_m: null,
  provider: 'google',
  google_place_id: 'ChIJ-cafe',
  rating: 4.6,
  user_rating_count: 212,
  open_now: true,
  business_status: 'operational',
  maps_url: null,
  hours: [{ day: 1, open: '08:00', close: '19:00' }],
  ...over,
});
const osm = (over: Partial<Place> = {}): Place => ({
  id: 'p-osm',
  name: 'Café do Mapa',
  lat: -26.18,
  lng: -50.39,
  categories: ['catering.cafe'],
  city: 'Canoinhas',
  address: null,
  opening_hours: 'Tu-Su 13:00-19:00',
  website: null,
  osm: { type: 'node', id: 1 },
  distance_m: null,
  ...over,
});
const group = (places: Place[]): OptionGroup => ({
  label: 'café',
  search: { label: 'café', kind: 'food', categories: [], names: [] },
  status: 'ok',
  center: [-50.39, -26.18],
  centerLabel: 'Canoinhas',
  radiusKm: 30,
  options: places.map((place) => ({ place, km: 12, kind: 'food' as const })),
  shown: 6,
});
const HOME: LngLat = [-50.33, -26.37];
const stage = (groups: OptionGroup[]): MapStage => ({
  origin: { label: 'Major Vieira, SC', at: HOME },
  groups,
  named: [],
  chosen: [],
  nowhere: false,
});
const at = (p: Place): LngLat => [p.lng, p.lat];
/**
 * A tela com o tempo de carro já medido (D310): cada par que ela precisa, com os minutos de `minutes`
 * (pelos pontos), ou 20 min quando `minutes` não diz.
 */
const measured = (
  map: MapStage,
  minutes: (a: LngLat, b: LngLat) => number | undefined = () => undefined,
): MapStage => ({
  ...map,
  drive: Object.fromEntries(
    neededPairs(map).map(([a, b]) => [driveKey(a, b), (minutes(a, b) ?? 20) * 60]),
  ),
});
const noop = () => undefined;
const props = (map: MapStage) => ({
  map,
  onPlace: noop,
  onRename: noop,
  onToggle: noop,
  onPick: noop,
  onRemove: noop,
  onMore: noop,
  onWider: noop,
  onByType: noop,
  onByName: noop,
  onBuild: noop,
  onBack: noop,
});

describe('OptionsStep: os cartões do Google (fase 27)', () => {
  it('a nota com as avaliações, "Aberto agora", o horário em texto e a fonte no pé', () => {
    render(<OptionsStep {...props(measured(stage([group([google()])])))} />);
    const card = screen.getByRole('button', { name: /^Café da Praça/ });
    expect(card.getAttribute('data-source')).toBe('google');
    expect(card.textContent).toContain('4,6 · 212 avaliações');
    expect(card.textContent).toContain('Aberto agora');
    expect(card.textContent).toContain('Horário: segunda-feira: 08:00 – 19:00');
    expect(card.textContent).toContain('cerca de 20 min de carro');
    const foot = screen.getByText(/Dados do Google Maps/);
    expect(foot.textContent).toContain(
      'Dados do Google Maps · Dados © colaboradores do OpenStreetMap',
    );
    expect(foot.textContent).toContain('Powered by Geoapify');
  });

  it('sem o tempo medido, o cartão diz a distância em linha reta e nenhum tempo de carro (D310)', () => {
    render(<OptionsStep {...props(stage([group([google()])]))} />);
    const card = screen.getByRole('button', { name: /^Café da Praça/ });
    expect(card.textContent).toContain('a 12 km em linha reta');
    expect(card.textContent).not.toContain('min de carro');
    expect(card.getAttribute('data-drive')).toBe('unmeasured');
  });

  it('"Fechado agora" e o fechado de vez, marcados; sem nota, nada se inventa', () => {
    render(
      <OptionsStep
        {...props(
          stage([
            group([
              google({ id: 'a', name: 'Café Fechado', open_now: false }),
              google({
                id: 'b',
                name: 'Café Antigo',
                business_status: 'closed_permanently',
                rating: null,
                user_rating_count: null,
                open_now: null,
              }),
            ]),
          ]),
        )}
      />,
    );
    const closed = screen.getByRole('button', { name: /^Café Fechado/ });
    expect(closed.querySelector('[data-status]')?.getAttribute('data-status')).toBe('warn');
    expect(closed.textContent).toContain('Fechado agora');
    const gone = screen.getByRole('button', { name: /^Café Antigo/ });
    expect(gone.querySelector('[data-status]')?.getAttribute('data-status')).toBe('off');
    expect(gone.textContent).toContain('Fechado de vez');
    expect(gone.querySelector('[data-rating]')).toBeNull();
  });

  it('o grupo com opções e sem escolha tem "Tirar da viagem"; o escolhido, não (D278)', () => {
    render(<OptionsStep {...props(stage([group([google()])]))} />);
    expect(screen.getByRole('button', { name: 'Tirar da viagem' })).toBeTruthy();
    cleanup();
    render(<OptionsStep {...props({ ...stage([group([google()])]), chosen: ['ChIJ-cafe'] })} />);
    expect(screen.queryByRole('button', { name: 'Tirar da viagem' })).toBeNull();
  });

  it('um lugar do mapa de antes (a Geoapify) continua como era: o horário traduzido e sem o Google no pé', () => {
    render(<OptionsStep {...props(stage([group([osm()])]))} />);
    const card = screen.getByRole('button', { name: /^Café do Mapa/ });
    expect(card.getAttribute('data-source')).toBe('geoapify');
    expect(card.textContent).toContain('Horário no mapa: ter a dom, 13:00–19:00');
    expect(card.querySelector('[data-rating]')).toBeNull();
    expect(screen.queryByText(/Dados do Google Maps/)).toBeNull();
    expect(screen.getByText(/Powered by Geoapify/)).toBeTruthy();
  });

  it('os textos puros: a nota com uma casa e a palavra no singular; o status pela ordem do que importa', () => {
    expect(ratingText({ rating: 4, user_rating_count: 1 })).toBe('4,0 · 1 avaliação');
    expect(ratingText({ rating: 4.65, user_rating_count: 0 })).toBe('4,7');
    expect(ratingText({ rating: null, user_rating_count: 10 })).toBeNull();
    expect(ratingText({})).toBeNull();
    expect(statusText({ open_now: true, business_status: 'closed_permanently' })).toEqual({
      text: 'Fechado de vez',
      tone: 'off',
    });
    expect(statusText({ open_now: true, business_status: 'closed_temporarily' })?.text).toBe(
      'Fechado por um tempo',
    );
    expect(statusText({ open_now: false, business_status: 'future_opening' })?.text).toBe(
      'Ainda não abriu',
    );
    expect(statusText({ open_now: true, business_status: 'operational' })?.text).toBe(
      'Aberto agora',
    );
    expect(statusText({ open_now: null, business_status: null })).toBeNull();
    expect(statusText({})).toBeNull();
  });

  it('a atribuição sozinha, com e sem o Google', () => {
    const { unmount } = render(<MapAttribution google />);
    expect(screen.getByText(/Dados do Google Maps/)).toBeTruthy();
    unmount();
    render(<MapAttribution />);
    expect(screen.queryByText(/Dados do Google Maps/)).toBeNull();
  });
});

/**
 * Um passo de cada vez (fase 26): só o passo da vez aparece; os feitos numa linha com "mudar"; o aviso
 * de "Voltar um passo"; "Continuar" só com o passo decidido; o rótulo da nota; o pendente na posição; a
 * conta do tempo com o que estoura marcado; "Mais tempo" quando nada cabe.
 */
const stepGroup = (
  label: string,
  ordem: number,
  places: Place[],
  over: Partial<OptionGroup> = {},
  step: Partial<NonNullable<OptionGroup['step']>> = {},
): OptionGroup => ({
  ...group(places),
  label,
  status: places.length > 0 ? 'ok' : 'unsearched',
  step: {
    ordem,
    relacao: 'perto_do_anterior',
    cidade: '',
    hora_do_dia: '',
    fora_da_cidade: false,
    busca: { palavras: label, tipo_google: '', aberto_agora: false, nota_minima: 0 },
    ...step,
  },
  where: ordem === 1 ? 'perto de onde vocês saem' : 'perto de Cachoeira Alta',
  ...over,
});
const CACHOEIRA = google({
  id: 'g-cach',
  name: 'Cachoeira Alta',
  lat: -26.2,
  lng: -50.05,
  categories: ['tourist_attraction'],
  hours: null,
});
const CAFE_PERTO = google({
  id: 'g-perto',
  name: 'Café da Serra',
  lat: -26.15,
  lng: -50.0,
  hours: null,
});
const CAFE_LONGE = google({
  id: 'g-longe',
  name: 'Café do Vale',
  lat: -27.5,
  lng: -48.5,
  hours: null,
});
const stepwise = (over: Partial<MapStage> = {}): MapStage => ({
  ...stage([
    stepGroup('cachoeira', 1, [CACHOEIRA], {}, { relacao: 'perto_de_casa' }),
    stepGroup('café', 2, [], {}),
  ]),
  step: 0,
  ...over,
});
const TIME = {
  start: '08:00',
  date: '2026-12-05',
  budget: { minutes: 300, label: 'a tarde' },
  unread: false,
};

describe('OptionsStep: um passo de cada vez (fase 26)', () => {
  it('só o passo da vez aparece; os candidatos do seguinte não; "Continuar" só com a escolha, e "Traçar" só no fim', () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <OptionsStep {...props(stepwise())} onContinue={onContinue} onStepBack={vi.fn()} />,
    );
    expect(screen.getByRole('region', { name: 'Cachoeira' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Café' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Traçar o caminho/ })).toBeNull();
    const continuar = screen.getByRole('button', { name: 'Continuar' });
    expect(continuar.hasAttribute('disabled')).toBe(true);
    // sem passo anterior, não há "Voltar um passo"
    expect(screen.queryByRole('button', { name: 'Voltar um passo' })).toBeNull();
    rerender(
      <OptionsStep
        {...props(stepwise({ chosen: ['g-cach'] }))}
        onContinue={onContinue}
        onStepBack={vi.fn()}
      />,
    );
    const ok = screen.getByRole('button', { name: 'Continuar' });
    expect(ok.hasAttribute('disabled')).toBe(false);
    fireEvent.click(ok);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('o passo feito vira uma linha com "mudar"; o aviso de voltar aparece; o último passo mostra o resumo e "Traçar"', () => {
    const onBackTo = vi.fn();
    const onStepBack = vi.fn();
    render(
      <OptionsStep
        {...props(
          stepwise({
            step: 1,
            chosen: ['g-cach', 'g-perto'],
            groups: [
              stepGroup('cachoeira', 1, [CACHOEIRA], {}, { relacao: 'perto_de_casa' }),
              stepGroup('café', 2, [CAFE_PERTO, CAFE_LONGE]),
            ],
            notice: 'As opções de café vão ser procuradas de novo depois da sua escolha.',
          }),
        )}
        onBackTo={onBackTo}
        onStepBack={onStepBack}
      />,
    );
    const done = screen.getByRole('list', { name: 'Passos feitos' });
    expect(done.textContent).toContain('1');
    expect(done.textContent).toContain('Cachoeira Alta');
    fireEvent.click(screen.getByRole('button', { name: 'Mudar o passo 1' }));
    expect(onBackTo).toHaveBeenCalledWith(0);
    expect(screen.getByRole('status').textContent).toContain('vão ser procuradas de novo');
    expect(screen.getByRole('region', { name: 'Café' }).textContent).toContain('2 de 2 · Café');
    expect(screen.queryByRole('region', { name: 'Cachoeira' })).toBeNull();
    // no último passo não há "Continuar": o resumo e "Traçar o caminho"
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText(/1 escolhido|2 escolhidos/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Traçar o caminho/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar um passo' }));
    expect(onStepBack).toHaveBeenCalledTimes(1);
  });

  it('"o melhor café": o critério à vista quando a busca tem nota mínima; o pendente fica na posição dele, sem busca', () => {
    render(
      <OptionsStep
        {...props(
          stepwise({
            groups: [
              stepGroup(
                'café',
                1,
                [CAFE_PERTO],
                {},
                {
                  relacao: 'perto_de_casa',
                  busca: {
                    palavras: 'café',
                    tipo_google: 'cafe',
                    aberto_agora: false,
                    nota_minima: 4,
                  },
                  descartados: 2,
                },
              ),
              {
                ...group([]),
                label: 'a feirinha',
                status: 'none',
                question: 'Onde fica a feirinha?',
              },
            ],
          }),
        )}
      />,
    );
    expect(screen.getByText('Os melhores primeiro, pela nota do Google.')).toBeTruthy();
    expect(screen.getByText(/2 lugares que não eram café ficaram de fora/)).toBeTruthy();
    expect(screen.getByText('Onde fica a feirinha?')).toBeTruthy();
  });

  it('o total à vista com o que a pessoa tem; cada candidato diz o total se for escolhido e o que estoura fica marcado; nada cabe oferece mais tempo', () => {
    const onTime = vi.fn();
    // a estrada medida (D310): casa ↔ cachoeira 40; cachoeira → café perto 15, dele a casa 35 (o
    // desvio: 15 + 35 − 40 = 10); cachoeira → café longe 170, dele a casa 210
    const road = (a: LngLat, b: LngLat) => {
      const pair = driveKey(a, b);
      const table: Record<string, number> = {
        [driveKey(HOME, at(CACHOEIRA))]: 40,
        [driveKey(at(CACHOEIRA), HOME)]: 40,
        [driveKey(at(CACHOEIRA), at(CAFE_PERTO))]: 15,
        [driveKey(at(CAFE_PERTO), HOME)]: 35,
        [driveKey(at(CACHOEIRA), at(CAFE_LONGE))]: 170,
        [driveKey(at(CAFE_LONGE), HOME)]: 210,
      };
      return table[pair];
    };
    const around = { name: 'Cachoeira Alta', at: at(CACHOEIRA) };
    const { rerender } = render(
      <OptionsStep
        {...props(
          measured(
            stepwise({
              step: 1,
              chosen: ['g-cach'],
              groups: [
                stepGroup('cachoeira', 1, [CACHOEIRA], {}, { relacao: 'perto_de_casa' }),
                {
                  ...stepGroup('café', 2, [CAFE_PERTO, CAFE_LONGE]),
                  // como a busca do passo seguinte entrega: de onde se vem e para onde se vai depois
                  options: [
                    {
                      place: CAFE_PERTO,
                      km: 30,
                      kind: 'food' as const,
                      fromPrevious: { ...around, km: 7 },
                      next: HOME,
                    },
                    {
                      place: CAFE_LONGE,
                      km: 200,
                      kind: 'food' as const,
                      fromPrevious: { ...around, km: 190 },
                      next: HOME,
                    },
                  ],
                },
              ],
            }),
            road,
          ),
        )}
        time={TIME}
        onTime={onTime}
        onDwell={vi.fn()}
        onStepBack={vi.fn()}
      />,
    );
    // a cachoeira e a volta: 80 min de estrada e 75 no lugar (o tipo do cartão)
    const total = screen.getByText(/^O passeio dá cerca de/);
    expect(total.textContent).toBe(
      'O passeio dá cerca de 2 h 35: 1 h 20 de estrada e 1 h 15 nos lugares',
    );
    expect(total.parentElement?.textContent).toContain('vocês têm a tarde, cerca de 5 h');
    expect(total.parentElement?.textContent).toContain('Saída às 08:00');
    // o tempo em cada lugar, dito como suposição do app, com "mudar" (D312)
    expect(
      screen.getByText(/1 h 15/, { selector: '[data-stays] span.font-semibold' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mudar o tempo em Cachoeira Alta' })).toBeTruthy();
    const perto = screen.getByRole('button', { name: /^Café da Serra/ });
    expect(perto.getAttribute('data-over')).toBeNull();
    // 40 + 15 + 35 de estrada e 75 + 75 nos lugares
    expect(perto.textContent).toContain('Daria 4 h no total');
    expect(perto.textContent).toContain('a cerca de 15 min de Cachoeira Alta · +10 min de estrada');
    const longe = screen.getByRole('button', { name: /^Café do Vale/ });
    expect(longe.getAttribute('data-over')).toBe('true');
    expect(longe.textContent).toMatch(/Não cabe no tempo: daria/);
    // ainda escolhível: o botão não está desligado
    expect(longe.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/Nenhuma opção de café cabe/)).toBeNull();
    // só o café longe: nada cabe → mais tempo
    rerender(
      <OptionsStep
        {...props(
          measured(
            stepwise({
              step: 1,
              chosen: ['g-cach'],
              groups: [
                stepGroup('cachoeira', 1, [CACHOEIRA], {}, { relacao: 'perto_de_casa' }),
                stepGroup('café', 2, [CAFE_LONGE]),
              ],
            }),
            road,
          ),
        )}
        time={TIME}
        onTime={onTime}
        onStepBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nenhuma opção de café cabe no tempo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mais tempo' }));
    fireEvent.click(screen.getByRole('button', { name: 'O dia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar este tempo' }));
    expect(onTime).toHaveBeenCalledWith('O dia');
  });
});
