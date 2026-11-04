import { useEffect } from 'react';
import { useToast } from '@/components/ui/toast-context.ts';
import { db } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { describeColumns } from '../rules.ts';

/** Avisos discretos do sync: edição superada por outro aparelho, saída de uma viagem, alterações recusadas. */
export function SyncNotices() {
  const toast = useToast(); // valor estável (memoizado no ToastProvider): o efeito roda uma vez

  useEffect(() => {
    const off = syncEngine.onNotice((notice) => {
      switch (notice.kind) {
        case 'superseded':
          void (
            notice.table === 'trips' ? db.trips.get(notice.id) : Promise.resolve(undefined)
          ).then((trip) => {
            toast.show({
              title: 'Alguém editou antes de você',
              description: `${trip ? `${trip.name}: ` : ''}a versão mais recente de ${describeColumns(notice.columns)} prevaleceu.`,
              kind: 'warn',
              duration: 6000,
            });
          });
          break;
        case 'revoked':
          toast.show({
            title: notice.tripName ? `Você saiu de ${notice.tripName}` : 'Você saiu de uma viagem',
            description: 'A viagem foi encerrada ou você foi removido do time.',
            kind: 'warn',
            duration: 8000,
          });
          break;
        case 'failed':
          toast.show({
            title:
              notice.count === 1
                ? '1 alteração foi recusada'
                : `${notice.count} alterações foram recusadas`,
            description: 'Veja o motivo em Pendentes, no cabeçalho.',
            kind: 'late',
            duration: 8000,
          });
          break;
      }
    });
    return () => {
      off();
    };
  }, [toast]);

  return null;
}
