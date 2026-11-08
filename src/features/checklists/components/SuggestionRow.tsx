import { Sparkles } from 'lucide-react';
import type { Suggestion } from '../suggestions.ts';

/**
 * Uma sugestão por regra: linha esmaecida, com o motivo e as duas ações. Nada é gravado até um dos
 * toques; "Dispensar" grava a linha como dispensada, para não voltar em nenhum aparelho.
 */
export function SuggestionRow({
  suggestion,
  onAdd,
  onDismiss,
}: {
  suggestion: Suggestion;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <li
      aria-label={`Sugestão: ${suggestion.text}`}
      className="grid gap-2 rounded-[16px] border border-dashed border-line px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug break-words text-ink-2">{suggestion.text}</p>
          <p className="text-[13px] text-ink-2">
            {suggestion.reason}
            {suggestion.points > 0 ? ` · +${suggestion.points}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2 pl-8">
        <button
          type="button"
          onClick={onAdd}
          className="min-h-12 rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent-ink"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-12 rounded-full px-4 text-[15px] font-semibold text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]"
        >
          Dispensar
        </button>
      </div>
    </li>
  );
}
