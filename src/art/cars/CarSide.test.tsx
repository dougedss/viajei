import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CAR_MODELS, type CarModel } from '@shared/constants.ts';
import { CarSide } from './CarSide.tsx';
import type { CarSpec } from './types.ts';

const MODELS = Object.keys(CAR_MODELS) as CarModel[];

const FULL: CarSpec['accessories'] = [
  'rack',
  'bike',
  'board',
  'box',
  'fog_lights',
  'hubcaps',
  'antenna',
  'plate',
  'sticker_waterfall',
  'sticker_star',
  'sticker_mountains',
];

const LEAF_SUV: CarSpec = {
  model: 'suv',
  color: 'leaf',
  finish: 'solid',
  wheels: 'classic',
  accessories: [],
  plate: null,
};

/** Os ids do `useId` mudam com a ordem dos testes; o desenho não. */
function stable(html: string): string {
  return html.replace(/car[a-zA-Z0-9]+-/g, 'car-');
}

describe.each(MODELS)('a vista lateral do %s', (model) => {
  it('sem cosméticos', () => {
    const { container } = render(
      <CarSide
        car={{
          model,
          color: 'sunset',
          finish: 'solid',
          wheels: 'classic',
          accessories: [],
          plate: null,
        }}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('data-car-model')).toBe(model);
    expect(svg?.getAttribute('data-car-color')).toBe('sunset');
    expect(stable(container.innerHTML)).toMatchSnapshot();
  });

  it('com todos os cosméticos que cabem', () => {
    const { container } = render(
      // o Dourado era metálico pela cor até a fase 15; desde a 16, pelo acabamento: o mesmo desenho
      <CarSide
        car={{
          model,
          color: 'gold',
          finish: 'metallic',
          wheels: 'classic',
          accessories: FULL,
          plate: 'Serra',
        }}
      />,
    );
    expect(stable(container.innerHTML)).toMatchSnapshot();
  });
});

describe('acessibilidade', () => {
  it('role img com a descrição do carro, ou um rótulo próprio', () => {
    render(
      <CarSide
        car={{
          model: 'hatch',
          color: 'sunset',
          finish: 'solid',
          wheels: 'classic',
          accessories: ['rack', 'bike'],
          plate: null,
        }}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Hatch Pôr do sol com rack e bicicleta' }),
    ).toBeInTheDocument();
    render(
      <CarSide
        car={{
          model: 'kombi',
          color: 'sky',
          finish: 'solid',
          wheels: 'classic',
          accessories: [],
          plate: null,
        }}
        label="O carro"
      />,
    );
    expect(screen.getByRole('img', { name: 'O carro' })).toBeInTheDocument();
  });

  it('o tamanho do desenho não muda quando o carro ganha acessórios', () => {
    const a = render(<CarSide car={{ ...LEAF_SUV, accessories: [] }} />);
    const b = render(<CarSide car={{ ...LEAF_SUV, accessories: FULL }} />);
    expect(a.container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      b.container.querySelector('svg')?.getAttribute('viewBox'),
    );
  });
});

describe('o acabamento e as rodas (fase 16)', () => {
  const svgOf = (car: Partial<CarSpec>) =>
    render(<CarSide car={{ ...LEAF_SUV, ...car }} />).container.querySelector('svg');

  it('cada estilo de roda se desenha nas duas rodas: raios, furos ou o disco de sempre', () => {
    const count = (wheels: CarSpec['wheels'], what: string) =>
      svgOf({ wheels })?.querySelectorAll(`[data-wheel-style="${wheels}"] ${what}`).length ?? 0;
    expect(count('five', '[data-spoke]')).toBe(10);
    expect(count('wire', '[data-spoke]')).toBe(28);
    expect(count('steel', '[data-hole]')).toBe(12);
    const classic = svgOf({ wheels: 'classic' });
    expect(classic?.querySelectorAll('[data-wheel-style]')).toHaveLength(0);
    expect(classic?.querySelectorAll('[data-spoke], [data-hole]')).toHaveLength(0);
    expect(classic?.getAttribute('data-car-wheels')).toBe('classic');
  });

  it('com as calotas, o aro não aparece (elas o cobrem)', () => {
    const svg = svgOf({ wheels: 'five', accessories: ['hubcaps'] });
    expect(svg?.querySelectorAll('[data-spoke]')).toHaveLength(0);
  });

  it('cada acabamento muda o degradê da tinta, do mesmo perfil', () => {
    const stops = (finish: CarSpec['finish']) =>
      [...(svgOf({ finish })?.querySelectorAll('linearGradient[id$="-paint"] stop') ?? [])].map(
        (s) => s.getAttribute('stop-color'),
      );
    const all = (['solid', 'metallic', 'pearl', 'matte'] as const).map((f) => stops(f).join());
    expect(new Set(all).size).toBe(4);
    // a perolada tem a película (um tom a mais); a fosca é quase plana
    expect(stops('pearl')).toHaveLength(4);
    expect(stops('matte')).toHaveLength(3);
    expect(svgOf({ finish: 'pearl' })?.getAttribute('data-car-finish')).toBe('pearl');
  });
});
