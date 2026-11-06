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

/** Os ids do `useId` mudam com a ordem dos testes; o desenho não. */
function stable(html: string): string {
  return html.replace(/car[a-zA-Z0-9]+-/g, 'car-');
}

describe.each(MODELS)('a vista lateral do %s', (model) => {
  it('sem cosméticos', () => {
    const { container } = render(
      <CarSide car={{ model, color: 'sunset', accessories: [], plate: null }} />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('data-car-model')).toBe(model);
    expect(svg?.getAttribute('data-car-color')).toBe('sunset');
    expect(stable(container.innerHTML)).toMatchSnapshot();
  });

  it('com todos os cosméticos que cabem', () => {
    const { container } = render(
      <CarSide car={{ model, color: 'gold', accessories: FULL, plate: 'Serra' }} />,
    );
    expect(stable(container.innerHTML)).toMatchSnapshot();
  });
});

describe('acessibilidade', () => {
  it('role img com a descrição do carro, ou um rótulo próprio', () => {
    render(
      <CarSide
        car={{ model: 'hatch', color: 'sunset', accessories: ['rack', 'bike'], plate: null }}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Hatch Pôr do sol com rack e bicicleta' }),
    ).toBeInTheDocument();
    render(
      <CarSide
        car={{ model: 'kombi', color: 'sky', accessories: [], plate: null }}
        label="O carro"
      />,
    );
    expect(screen.getByRole('img', { name: 'O carro' })).toBeInTheDocument();
  });

  it('o tamanho do desenho não muda quando o carro ganha acessórios', () => {
    const a = render(
      <CarSide car={{ model: 'suv', color: 'leaf', accessories: [], plate: null }} />,
    );
    const b = render(
      <CarSide car={{ model: 'suv', color: 'leaf', accessories: FULL, plate: null }} />,
    );
    expect(a.container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      b.container.querySelector('svg')?.getAttribute('viewBox'),
    );
  });
});
