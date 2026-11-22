import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Place } from '@shared/places-schema.ts';
import type { MapStage, OptionGroup } from '../flow.ts';
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
  options: places.map((place) => ({ place, km: 12, minutes: 20, kind: 'food' as const })),
  shown: 6,
});
const stage = (groups: OptionGroup[]): MapStage => ({
  origin: { label: 'Major Vieira, SC', at: [-50.33, -26.37] },
  groups,
  named: [],
  chosen: [],
  nowhere: false,
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
    render(<OptionsStep {...props(stage([group([google()])]))} />);
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
