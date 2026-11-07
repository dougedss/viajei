import { Plus } from 'lucide-react';
import { useState } from 'react';

/**
 * O campo no fim da lista: Enter adiciona e mantém o foco, para digitar a mala de uma vez. O botão
 * faz o mesmo para quem não tem Enter à mão.
 */
export function AddItemField({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const value = text.trim();
    if (value === '') return;
    onAdd(value.slice(0, 200));
    setText('');
  };
  return (
    <form
      className="flex items-center gap-2 rounded-[16px] bg-card pr-1 pl-4 shadow-[inset_0_0_0_1.5px_var(--color-line)] focus-within:shadow-[inset_0_0_0_2px_var(--color-accent)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Plus className="size-5 shrink-0 text-ink-2" aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={200}
        enterKeyHint="enter"
        onChange={(e) => setText(e.target.value)}
        className="min-h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-2"
      />
      <button
        type="submit"
        disabled={text.trim() === ''}
        className="min-h-12 rounded-[12px] px-3 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
      >
        Adicionar
      </button>
    </form>
  );
}
