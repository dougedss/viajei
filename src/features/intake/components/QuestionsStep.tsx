import { MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import type { PlanQuestion } from '@shared/plan-protocol.ts';
import { cx } from '@/lib/cx.ts';
import { canPlan, questionsLead } from '../conversation.ts';

type Props = {
  questions: readonly PlanQuestion[];
  answers: readonly string[];
  onAnswer: (index: number, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
};

/**
 * As perguntas antes de montar (fase 17, a regra 16): quantas são, ditas antes; cada uma com as
 * opções e o campo para as palavras da pessoa. "Procurar no mapa" quando todas têm resposta (fase
 * 24: as respostas servem para buscar as opções que existem).
 */
export function QuestionsStep({ questions, answers, onAnswer, onSubmit, onBack }: Props) {
  return (
    <div className="grid gap-4" data-questions>
      <p className="font-num text-[22px] leading-tight font-semibold">
        {questionsLead(questions.length)}
      </p>
      {questions.map((q, i) => {
        const answer = answers[i] ?? '';
        const chosen = q.options.includes(answer);
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
              <TextField
                label={q.options.length > 0 ? 'Ou com as suas palavras' : 'A resposta'}
                value={chosen ? '' : answer}
                autoComplete="off"
                onChange={(e) => onAnswer(i, e.target.value)}
              />
            </fieldset>
          </Card>
        );
      })}
      <Button
        disabled={!canPlan({ questions: [...questions], answers: [...answers] })}
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
