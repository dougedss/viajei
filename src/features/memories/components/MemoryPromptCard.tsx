import { Star, X } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import type { Profile, Stop } from '@/lib/db/schema.ts';
import { formatStamp } from '@/lib/time/index.ts';

type Props = {
  stop: Stop;
  uid: string;
  profiles: ReadonlyMap<string, Profile>;
  /** quantas outras ainda pedem, depois desta */
  more: number;
  onOpen: () => void;
  onDismiss: () => void;
};

/**
 * O lugar da folha quando ela não pode abrir sozinha (a posição, notificação, catch-up, outro
 * membro): um card discreto no Modo Viagem, até ser respondido ou dispensado.
 */
export function MemoryPromptCard({ stop, uid, profiles, more, onOpen, onDismiss }: Props) {
  const by = stop.done_by && stop.done_by !== uid ? profiles.get(stop.done_by)?.name : null;
  return (
    <section
      aria-label={`Como foi ${stop.name}?`}
      className="grid gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1.5px_var(--color-line)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tight/20 text-tight-ink">
          <Star className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mv-text-17 leading-snug font-semibold break-words">Como foi {stop.name}?</p>
          <p className="mv-text-14 text-ink-2">
            {stop.done_at ? `chegaram ${formatStamp(stop.done_at)}` : ''}
            {by ? ` · ${by} marcou` : ''}
            {more > 0 ? ` · mais ${more} ${more === 1 ? 'parada' : 'paradas'} depois` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="Dispensar"
          onClick={onDismiss}
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <Button variant="secondary" size="md" onClick={onOpen}>
        Contar como foi
      </Button>
    </section>
  );
}
