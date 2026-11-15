import { FileWarning, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import type { FormatError } from '../format.ts';

const SHOWN = 4;

/**
 * O texto parece o formato do Viajei, e alguma linha não deu para ler (fase 17): as primeiras, com o
 * número da linha e o porquê. Com rede, "Ler com a IA" lê o mesmo texto como roteiro livre.
 */
export function FormatErrors({
  errors,
  online,
  onReadWithAi,
}: {
  errors: readonly FormatError[];
  online: boolean;
  onReadWithAi: () => void;
}) {
  const more = errors.length - SHOWN;
  return (
    <Card role="alert" className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]">
      <p className="flex items-center gap-2 font-num text-[20px] leading-tight font-semibold">
        <FileWarning className="size-5 shrink-0" aria-hidden="true" />
        Não deu para ler o formato do Viajei
      </p>
      <ul className="grid gap-1.5 text-[15px]">
        {errors.slice(0, SHOWN).map((e, i) => (
          <li key={`${String(e.line)}-${String(i)}`} className="break-words">
            {e.line !== null ? <b className="num">Linha {e.line}: </b> : null}
            {e.message}
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="text-[14px] text-ink-2">
          E mais {more} {more === 1 ? 'linha' : 'linhas'}.
        </p>
      ) : null}
      <p className="text-[14px] text-ink-2">Corrija no texto, que continua guardado aqui.</p>
      {online ? (
        <Button variant="secondary" size="md" onClick={onReadWithAi}>
          <Sparkles className="size-5" aria-hidden="true" />
          Ler com a IA, como roteiro livre
        </Button>
      ) : null}
    </Card>
  );
}
