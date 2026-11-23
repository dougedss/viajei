import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CatchupPosition } from '@/lib/geo/catchup.ts';
import { PositionLine } from './CatchupCards.tsx';

afterEach(cleanup);

const position = (over: Partial<CatchupPosition> = {}): CatchupPosition => ({
  fraction: 0.2,
  alongM: 9_000,
  offRoute: false,
  distanceM: 20,
  source: 'gps',
  point: [0, 0],
  ...over,
});

describe('a linha da posição (fase 28)', () => {
  it('num dia de trechos, o trecho até o objetivo primeiro e o dia menor ao lado', () => {
    render(
      <PositionLine
        position={position()}
        leg={{ fraction: 0.4, label: 'do trecho até Curitiba' }}
      />,
    );
    expect(
      screen.getByText('40% do trecho até Curitiba, pela posição do celular'),
    ).toBeInTheDocument();
    // a frase do dia continua a mesma, só menor (o `ida-e-volta.spec` a lê)
    expect(screen.getByText(/20% do caminho do dia/)).toHaveTextContent('· 20% do caminho do dia');
  });

  it('na volta, "da volta"; num dia de um trecho, a linha de sempre', () => {
    const { rerender } = render(
      <PositionLine
        position={position({ fraction: 0.8 })}
        leg={{ fraction: 0.6, label: 'da volta' }}
      />,
    );
    expect(screen.getByText('60% da volta, pela posição do celular')).toBeInTheDocument();
    rerender(<PositionLine position={position()} leg={null} />);
    expect(
      screen.getByText('20% do caminho do dia, pela posição do celular', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/do trecho/)).toBeNull();
  });

  it('sem a fração do trecho (o trecho sem rota), a linha do dia', () => {
    render(<PositionLine position={position()} leg={{ fraction: null, label: 'da volta' }} />);
    expect(screen.queryByText(/da volta/)).toBeNull();
    expect(screen.getByText(/20% do caminho do dia/)).toBeInTheDocument();
  });
});
