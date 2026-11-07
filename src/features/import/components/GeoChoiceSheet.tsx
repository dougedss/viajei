import { MapPin, MapPinOff } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet.tsx';
import type { GeocodeResult } from '@/lib/db/schema.ts';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';

type Props = {
  open: boolean;
  name: string;
  options: readonly GeocodeResult[];
  onPick: (option: GeocodeResult | null) => void;
  onClose: () => void;
};

/** Resultados espalhados viram escolha: a pessoa diz qual é, ou que não é nenhum. */
export function GeoChoiceSheet({ open, name, options, onPick, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={`Onde fica “${name}”?`}>
      <ul className="grid gap-2" aria-label="Opções de local">
        {options.map((o) => (
          <li key={`${o.lat},${o.lng}`}>
            <button
              type="button"
              onClick={() => onPick(o)}
              className="flex min-h-14 w-full items-center gap-3 rounded-[16px] bg-card px-3 py-2 text-left shadow-[inset_0_0_0_1px_var(--color-line)]"
            >
              <MapPin className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
              <span className="grid min-w-0">
                <span className="text-[16px] font-semibold break-words">{o.name}</span>
                <span className="text-[13px] break-words text-ink-2">{o.address}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex min-h-14 w-full items-center gap-3 rounded-[16px] bg-card px-3 py-2 text-left shadow-[inset_0_0_0_1px_var(--color-line)]"
          >
            <MapPinOff className="size-5 shrink-0 text-ink-2" aria-hidden="true" />
            <span className="grid">
              <span className="text-[16px] font-semibold">Nenhum destes</span>
              <span className="text-[13px] text-ink-2">Fica sem local; dá para marcar depois.</span>
            </span>
          </button>
        </li>
      </ul>
      <p className="text-[12px] text-ink-2">{OSM_ATTRIBUTION}</p>
    </Sheet>
  );
}
