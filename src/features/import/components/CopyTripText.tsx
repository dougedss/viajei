import { Copy } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { copyText } from '@/lib/clipboard.ts';
import type { TripRows } from '../export.ts';

/**
 * "Copiar roteiro como texto" (fase 17): a viagem no formato do Viajei, para colar noutra conta, numa
 * conversa ou guardar como cópia. O escritor só baixa no toque (Detalhes não carrega o formato, D162).
 * Sem acesso à área de transferência, o texto abre numa folha para copiar à mão.
 */
export function CopyTripText({ rows }: { rows: TripRows }) {
  const toast = useToast();
  const [manual, setManual] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const text = () => import('../export.ts').then((m) => m.tripText(rows));

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => {
          void copyText(text()).then(async (copied) => {
            if (copied) {
              toast.show({
                title: 'Roteiro copiado',
                description:
                  'No formato do Viajei: cole noutra conta, numa conversa ou guarde como cópia.',
                kind: 'ok',
              });
            } else setManual(await text());
          });
        }}
      >
        <Copy className="size-5" aria-hidden="true" />
        Copiar roteiro como texto
      </Button>
      <Sheet
        open={manual !== null}
        onClose={() => setManual(null)}
        title="Copie o roteiro"
        description="Este navegador não deixou copiar sozinho. Selecione o texto e copie."
      >
        <textarea
          ref={area}
          readOnly
          value={manual ?? ''}
          aria-label="O roteiro no formato do Viajei"
          rows={10}
          className="w-full rounded-field bg-paper px-3 py-2 font-mono text-[14px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]"
        />
        <Button variant="secondary" onClick={() => area.current?.select()}>
          Selecionar tudo
        </Button>
      </Sheet>
    </>
  );
}
