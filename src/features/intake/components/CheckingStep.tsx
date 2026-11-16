import { MapPinned } from 'lucide-react';
import { Card } from '@/components/ui/Card.tsx';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';

/** "Procurando no mapa… 1 de 2": as opções vêm do mapa, por tipo e pelo nome dito (fase 24). */
export function CheckingStep({ done, total }: { done: number; total: number }) {
  return (
    <Card className="grid gap-2" aria-live="polite" data-checking>
      <p className="flex items-center gap-2 font-num text-[20px] font-semibold">
        <MapPinned className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
        <span className="motion-safe:animate-pulse">
          Procurando no mapa…
          {total > 1 ? ` ${String(Math.min(done, total))} de ${String(total)}` : ''}
        </span>
      </p>
      <p className="text-[14px] text-ink-2">
        O que existe de verdade, perto de onde vocês vão. {OSM_ATTRIBUTION}.
      </p>
    </Card>
  );
}
