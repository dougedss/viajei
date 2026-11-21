import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlanQuestion } from '@shared/plan-protocol.ts';
import { QuestionsStep } from './QuestionsStep.tsx';

afterEach(cleanup);

const REACH: PlanQuestion = {
  text: 'Até quanto tempo de carro?',
  options: ['1 hora', '2 horas', '3 horas'],
  topic: 'reach',
};

/** A tela com o estado de verdade (a conversa guarda a resposta e redesenha). */
function Harness({
  misread,
  onSubmit = () => undefined,
}: {
  misread?: Record<number, number>;
  onSubmit?: () => void;
}) {
  const [answers, setAnswers] = useState(['']);
  return (
    <QuestionsStep
      questions={[REACH]}
      answers={answers}
      misread={misread}
      onAnswer={(i, value) => setAnswers((a) => a.map((x, j) => (j === i ? value : x)))}
      onSubmit={onSubmit}
      onBack={() => undefined}
    />
  );
}

describe('QuestionsStep: o campo livre que não se apaga (fase 25, D272)', () => {
  it('digitar "1 hora e meia" letra a letra chega inteiro: passar por "1 hora" marca a opção e não esvazia', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('Ou com as suas palavras');
    await userEvent.type(field, '1 hora');
    // o texto é igual a uma opção: a pílula fica marcada, e o campo continua com o texto
    expect(screen.getByRole('button', { name: '1 hora' })).toHaveAttribute('aria-pressed', 'true');
    expect(field).toHaveValue('1 hora');
    await userEvent.type(field, ' e meia');
    expect(field).toHaveValue('1 hora e meia');
    expect(screen.getByRole('button', { name: '1 hora' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Procurar no mapa' })).toBeEnabled();
  });

  it('tocar uma opção põe a opção no campo; digitar por cima troca', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: '2 horas' }));
    const field = screen.getByLabelText('Ou com as suas palavras');
    expect(field).toHaveValue('2 horas');
    expect(screen.getByRole('button', { name: '2 horas' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(field, ' e meia');
    expect(field).toHaveValue('2 horas e meia');
    expect(screen.getByRole('button', { name: '2 horas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('QuestionsStep: a resposta não entendida (fase 25, D274)', () => {
  it('na primeira vez, a frase e o campo com o texto para editar', async () => {
    render(<Harness misread={{ 0: 1 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não entendi quanto tempo');
    const field = screen.getByLabelText('Ou com as suas palavras');
    await userEvent.type(field, '1h30');
    expect(field).toHaveValue('1h30');
    expect(screen.getByRole('button', { name: 'Procurar no mapa' })).toBeEnabled();
  });

  it('na segunda vez, só as opções: sem campo, e "Procurar no mapa" só com uma opção escolhida', async () => {
    const onSubmit = vi.fn();
    render(<Harness misread={{ 0: 2 }} onSubmit={onSubmit} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma das opções');
    expect(screen.queryByLabelText('Ou com as suas palavras')).toBeNull();
    expect(screen.getByRole('button', { name: 'Procurar no mapa' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '2 horas' }));
    expect(screen.getByRole('button', { name: 'Procurar no mapa' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Procurar no mapa' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
