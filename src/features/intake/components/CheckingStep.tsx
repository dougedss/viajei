import { MapPinned } from 'lucide-react';
import { Card } from '@/components/ui/Card.tsx';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';

/**
 * "Procurando no mapa… 1 de 2": as opções vêm do mapa (fase 24). Com o planejador (fase 27), a IA
 * procura com ferramentas e a função manda o andamento em palavras (`note`): "Procurando lugares…",
 * "Lugares encontrados; seguindo…". O cartão tem altura mínima: o texto que muda não empurra a tela.
 */
export function CheckingStep({
  done,
  total,
  note,
}: {
  done: number;
  total: number;
  note?: string | null;
}) {
  return (
    <Card className="grid min-h-28 gap-2" aria-live="polite" data-checking>
      <p className="flex items-center gap-2 font-num text-[20px] font-semibold">
        <MapPinned className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
        <span className="motion-safe:animate-pulse">
          Procurando no mapa…
          {total > 1 ? ` ${String(Math.min(done, total))} de ${String(total)}` : ''}
        </span>
      </p>
      {note ? (
        <p className="text-[14px] text-ink" data-checking-note>
          {note}
        </p>
      ) : null}
      <p className="text-[14px] text-ink-2">
        O que existe de verdade, perto de onde vocês vão. A IA procura; os lugares vêm do mapa, e
        nada entra sem vocês escolherem. {OSM_ATTRIBUTION}.
      </p>
    </Card>
  );
}
