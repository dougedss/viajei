import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const list = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}`;

/**
 * O que a conferência no mapa tirou do roteiro (fase 17): o lugar que a IA propôs e o mapa não tem
 * não existe para o app. O que não deu para conferir (o mapa não respondeu) também saiu, e dá para
 * conferir de novo, sem outra leitura.
 */
export function CheckedNotice({
  removed,
  unchecked,
  onRecheck,
}: {
  removed: readonly string[];
  unchecked: readonly string[];
  onRecheck?: (() => void) | undefined;
}) {
  if (removed.length + unchecked.length === 0) {
    return (
      <p className="text-[14px] text-ink-2" data-checked="todos">
        Todos os lugares sugeridos foram conferidos no mapa. {OSM_ATTRIBUTION}.
      </p>
    );
  }
  return (
    <Card className="grid gap-2 shadow-[inset_0_0_0_2px_var(--color-tight)]" data-checked>
      {removed.length > 0 ? (
        <p className="text-[15px]">
          {plural(
            removed.length,
            'lugar sugerido não foi encontrado no mapa e saiu',
            'lugares sugeridos não foram encontrados no mapa e saíram',
          )}
          : {list(removed)}.
        </p>
      ) : null}
      {unchecked.length > 0 ? (
        <>
          <p className="text-[15px]">
            {plural(unchecked.length, 'lugar ficou', 'lugares ficaram')} de fora porque o mapa não
            respondeu agora: {list(unchecked)}.
          </p>
          {onRecheck ? (
            <Button variant="secondary" size="md" onClick={onRecheck}>
              <RefreshCw className="size-5" aria-hidden="true" />
              Conferir de novo
            </Button>
          ) : null}
        </>
      ) : null}
      <p className="text-[13px] text-ink-2">{OSM_ATTRIBUTION}.</p>
    </Card>
  );
}
