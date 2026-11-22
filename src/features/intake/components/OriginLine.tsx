import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/TextField.tsx';

/**
 * "Saindo de Major Vieira, SC · mudar" (fase 25, D271): de onde o carro sai fica à vista antes das
 * opções, nas perguntas e nas opções, e é editável. "mudar" abre o campo da origem, e a resposta vale
 * como origem (a conversa guarda a escolha e busca de novo). Sem origem conhecida, nas perguntas nada
 * aparece (a pergunta é da IA, ou do app na saída de hoje); nas opções (fase 27), a linha pergunta
 * "De onde vocês saem?" e oferece informar, porque o planejador pode ter entregado sem a origem.
 */
export function OriginLine({
  label,
  whenUnknown = 'hide',
  onChange,
}: {
  label: string | null;
  /** sem origem conhecida: esconder (as perguntas) ou perguntar (as opções) */
  whenUnknown?: 'hide' | 'ask';
  onChange: (origin: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (editing) {
    return (
      <form
        className="grid gap-2"
        data-origin="editing"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim().length >= 2) {
            onChange(value.trim());
            setEditing(false);
          }
        }}
      >
        <TextField
          label="De onde vocês saem?"
          value={value}
          autoComplete="off"
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" size="md" variant="secondary" disabled={value.trim().length < 2}>
            Usar esta origem
          </Button>
          <Button type="button" size="md" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }
  if (!label) {
    if (whenUnknown === 'hide') return null;
    return (
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2"
        data-origin="unknown"
      >
        <LocateFixed className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
        <span>De onde vocês saem?</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          aria-label="Informar de onde vocês saem"
          className="min-h-8 font-semibold text-accent-ink underline"
          onClick={() => {
            setValue('');
            setEditing(true);
          }}
        >
          informar
        </button>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2" data-origin>
      <LocateFixed className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
      <span>
        Saindo de <strong className="font-semibold text-ink">{label}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        aria-label="Mudar de onde vocês saem"
        className="min-h-8 font-semibold text-accent-ink underline"
        onClick={() => {
          setValue(label);
          setEditing(true);
        }}
      >
        mudar
      </button>
    </p>
  );
}
