import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LegName } from '@/features/travel-mode/legs.ts';
import { LegIndicator } from './LegIndicator.tsx';

afterEach(cleanup);

const idaEVolta: LegName[] = [
  { short: 'ida', name: 'Ida, até Canoinhas', progress: 'do trecho até Canoinhas' },
  { short: 'volta', name: 'Volta, até Major Vieira', progress: 'da volta' },
];
const tres: LegName[] = [
  { short: '1', name: 'Trecho 1 de 3, até Joinville', progress: 'do trecho até Joinville' },
  { short: '2', name: 'Trecho 2 de 3, até Blumenau', progress: 'do trecho até Blumenau' },
  { short: '3', name: 'Trecho 3 de 3, até casa', progress: 'da volta' },
];

describe('o indicador dos trechos (fase 28)', () => {
  it('"ida · volta": o trecho mostrado pressionado, o feito com o nome que diz, e o toque espia', async () => {
    const onPick = vi.fn();
    render(
      <LegIndicator names={idaEVolta} shown={1} current={1} done={[true, false]} onPick={onPick} />,
    );
    const group = screen.getByRole('group', { name: 'Trechos do dia' });
    expect(group).toBeInTheDocument();
    const ida = screen.getByRole('button', { name: 'Ida, até Canoinhas, feito' });
    const volta = screen.getByRole('button', { name: 'Volta, até Major Vieira, o trecho da vez' });
    expect(ida).toHaveAttribute('aria-pressed', 'false');
    expect(volta).toHaveAttribute('aria-pressed', 'true');
    // o nome acessível contém o texto à vista (o axe cobra isso)
    expect(ida).toHaveTextContent('ida');
    await userEvent.click(ida);
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it('três trechos: o número de cada um, e o que ainda vem diz que ainda não', () => {
    render(
      <LegIndicator
        names={tres}
        shown={0}
        current={0}
        done={[false, false, false]}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '3']);
    expect(
      screen.getByRole('button', { name: 'Trecho 3 de 3, até casa, ainda não' }),
    ).toBeInTheDocument();
  });

  it('durante o "Rever o dia" só mostra; num dia de um trecho, nada aparece', async () => {
    const onPick = vi.fn();
    const { container, rerender } = render(
      <LegIndicator
        names={idaEVolta}
        shown={0}
        current={1}
        done={[true, false]}
        disabled
        onPick={onPick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Volta/ }));
    expect(onPick).not.toHaveBeenCalled();
    rerender(
      <LegIndicator
        names={idaEVolta.slice(0, 1)}
        shown={0}
        current={0}
        done={[false]}
        onPick={onPick}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
