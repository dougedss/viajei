import { MapPinned } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import type { PlanQuestion } from '@shared/plan-protocol.ts';
import { cx } from '@/lib/cx.ts';
import { canPlan, questionsLead } from '../conversation.ts';
import { UNREAD_REACH_HINT } from '../reach.ts';

type Props = {
  questions: readonly PlanQuestion[];
  answers: readonly string[];
  /** quantas vezes a resposta de cada pergunta não foi entendida (fase 25, D274), pelo índice */
  misread?: Readonly<Record<number, number>> | undefined;
  /** "Saindo de Major Vieira, SC · mudar" (fase 25, D271), antes das perguntas */
  origin?: ReactNode;
  onAnswer: (index: number, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

/** Na segunda vez sem entender, a pessoa escolhe entre as opções (D274). */
export const MISREAD_LIMIT = 2;

/**
 * As perguntas antes de montar (fase 17, a regra 16): quantas são, ditas antes; cada uma com as
 * opções e o campo para as palavras da pessoa. "Procurar no mapa" quando todas têm resposta (fase
 * 24: as respostas servem para buscar as opções que existem). O que a pessoa digita nunca se apaga
 * por coincidir com uma opção (fase 25, D272: "1 hora" a caminho de "1 hora e meia" ficava vazio);
 * a opção marcada é a que é igual ao campo. A resposta não entendida volta aqui com a frase e o texto
 * no campo para editar; na segunda vez, só as opções (D274).
 */
export function QuestionsStep({
  questions,
  answers,
  misread = {},
  origin,
  onAnswer,
  onSubmit,
  onBack,
}: Props) {
  const onlyOptions = (q: PlanQuestion, i: number) =>
    (misread[i] ?? 0) >= MISREAD_LIMIT && q.options.length > 0;
  // na segunda vez sem entender, a resposta tem de ser uma opção
  const blocked = questions.some(
    (q, i) => onlyOptions(q, i) && !q.options.includes(answers[i] ?? ''),
  );
  return (
    <div className="grid gap-4" data-questions>
      <p className="font-num text-[22px] leading-tight font-semibold">
        {questionsLead(questions.length)}
      </p>
      {origin}
      {questions.map((q, i) => {
        const answer = answers[i] ?? '';
        const tries = misread[i] ?? 0;
        return (
          <Card key={q.text} className="grid gap-3">
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-[17px] font-semibold">
                {questions.length > 1 ? `${String(i + 1)}. ` : ''}
                {q.text}
              </legend>
              {q.options.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label={q.text}>
                  {q.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={answer === option}
                      onClick={() => onAnswer(i, option)}
                      className={cx(
                        'min-h-12 rounded-full px-4 text-[16px] font-semibold',
                        answer === option
                          ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                          : 'bg-paper text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              {tries > 0 ? (
                <p
                  role="alert"
                  className="text-[15px] font-semibold text-late-ink"
                  data-misread={tries}
                >
                  {onlyOptions(q, i)
                    ? 'Não entendi de novo. Escolha uma das opções acima.'
                    : UNREAD_REACH_HINT}
                </p>
              ) : null}
              {onlyOptions(q, i) ? null : (
                <TextField
                  label={q.options.length > 0 ? 'Ou com as suas palavras' : 'A resposta'}
                  value={answer}
                  autoComplete="off"
                  onChange={(e) => onAnswer(i, e.target.value)}
                />
              )}
            </fieldset>
          </Card>
        );
      })}
      <Button
        disabled={blocked || !canPlan({ questions: [...questions], answers: [...answers] })}
        onClick={onSubmit}
      >
        <MapPinned className="size-5" aria-hidden="true" />
        Procurar no mapa
      </Button>
      <Button variant="ghost" size="md" onClick={onBack}>
        Voltar ao texto
      </Button>
    </div>
  );
}
