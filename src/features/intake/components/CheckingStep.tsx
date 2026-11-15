import { MapPinned } from 'lucide-react';
import { Card } from '@/components/ui/Card.tsx';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';

/** "Conferindo os lugares no mapa… 3 de 7": só lugares reais entram na revisão (fase 17). */
export function CheckingStep({ done, total }: { done: number; total: number }) {
  return (
    <Card className="grid gap-2" aria-live="polite" data-checking>
      <p className="flex items-center gap-2 font-num text-[20px] font-semibold">
        <MapPinned className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
        <span className="motion-safe:animate-pulse">
          Conferindo os lugares no mapa…
          {total > 0 ? ` ${String(done)} de ${String(total)}` : ''}
        </span>
      </p>
      <p className="text-[14px] text-ink-2">
        Cada lugar sugerido é procurado no OpenStreetMap. O que não existir no mapa sai.{' '}
        {OSM_ATTRIBUTION}.
      </p>
    </Card>
  );
}
