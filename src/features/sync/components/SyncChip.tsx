import { CloudOff, Loader2, TriangleAlert, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/ui/Chip.tsx';
import { useSyncSummary } from '@/lib/db/sync/status.ts';
import { PendingSheet } from './PendingSheet.tsx';

/**
 * Indicador no cabeçalho: "Sem conexão", "N com erro" ou "N pendentes". Some quando está tudo
 * enviado e online. Tocar abre a lista de pendências, com tentar de novo e descartar.
 */
export function SyncChip() {
  const { online, pending, failed, syncing } = useSyncSummary();
  const [open, setOpen] = useState(false);
  const total = pending + failed;

  if (online && total === 0) return null;

  const label = !online
    ? total > 0
      ? `Sem conexão · ${total}`
      : 'Sem conexão'
    : failed > 0
      ? `${failed} com erro`
      : `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`;
  const kind = !online ? 'off' : failed > 0 ? 'late' : 'warn';
  const Icon = !online ? CloudOff : failed > 0 ? TriangleAlert : syncing ? Loader2 : UploadCloud;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          !online
            ? `Sem conexão, ${total} ${total === 1 ? 'alteração por enviar' : 'alterações por enviar'}`
            : `${label}: ver pendências`
        }
        className="rounded-full"
      >
        <Chip kind={kind}>
          <Icon
            className={syncing && online ? 'size-4 animate-spin' : 'size-4'}
            aria-hidden="true"
          />
          {label}
        </Chip>
      </button>
      <PendingSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
