import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckRow } from './CheckRow.tsx';

afterEach(cleanup);

describe('CheckRow', () => {
  it('marca e desmarca pela linha, com o rótulo como nome e o detalhe como descrição', async () => {
    const onChange = vi.fn();
    render(
      <CheckRow
        checked
        onChange={onChange}
        label="Cascata do Caracol"
        detail={<span>fecha às 17:00</span>}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Cascata do Caracol' });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription('fecha às 17:00');
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('um botão no detalhe tem o próprio toque: escolher o local não desmarca a parada', async () => {
    const onChange = vi.fn();
    const onChoose = vi.fn();
    render(
      <CheckRow
        checked
        onChange={onChange}
        label={<span>13:30 Cascata do Caracol</span>}
        ariaLabel="Cascata do Caracol"
        detail={
          <button type="button" onClick={onChoose}>
            Escolher o local (2)
          </button>
        }
      />,
    );
    const choose = screen.getByRole('button', { name: 'Escolher o local (2)' });
    // botão dentro de botão passava o toque para a caixa
    expect(screen.getByRole('checkbox', { name: 'Cascata do Caracol' })).not.toContainElement(
      choose,
    );
    await userEvent.click(choose);
    expect(onChoose).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});
