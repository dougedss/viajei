import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useOnline } from '@/lib/db/connectivity.ts';
import { db, type OutboxOp, type UploadJob } from '@/lib/db/schema.ts';
import { formatBytes } from '@/lib/media/compress.ts';
import { kickMedia, mediaQueue } from '@/lib/media/index.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { discardOp, retryOp } from '@/lib/db/sync/push.ts';
import { useSyncState } from '@/lib/db/sync/status.ts';
import { describeOp, stateLabel, type OpContext } from '../rules.ts';

type Props = { open: boolean; onClose: () => void };
type Item = { op: OutboxOp; ctx: OpContext };

async function loadItems(): Promise<Item[]> {
  const ops = await db.outbox.orderBy('seq').toArray();
  return Promise.all(
    ops.map(async (op) => {
      const trip = op.trip_id ? await db.trips.get(op.trip_id) : undefined;
      let memberName: string | null = null;
      if (op.table === 'trip_members') {
        const member = await db.trip_members.get(op.row_id);
        const profile = member?.user_id ? await db.profiles.get(member.user_id) : undefined;
        memberName = profile?.name ?? member?.invited_email ?? null;
      }
      return { op, ctx: { tripName: trip?.name ?? null, memberName } };
    }),
  );
}

type MediaRow = { job: UploadJob; tripName: string | null };

async function loadMedia(): Promise<MediaRow[]> {
  const jobs = (await db.uploads.orderBy('attachment_id').toArray()).filter(
    (j): j is UploadJob => j.op === 'upload',
  );
  return Promise.all(
    jobs
      .sort((a, b) => a.created_at - b.created_at)
      .map(async (job) => ({ job, tripName: (await db.trips.get(job.trip_id))?.name ?? null })),
  );
}

/** A lista do que ainda não chegou ao servidor, com o motivo quando foi recusado. */
export function PendingSheet({ open, onClose }: Props) {
  const items = useLiveQuery(loadItems, [], []);
  const media = useLiveQuery(loadMedia, [], []);
  const online = useOnline();
  const { phase } = useSyncState();
  const [confirming, setConfirming] = useState<number | string | null>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pendentes"
      description={
        online
          ? 'Alterações que ainda não chegaram ao servidor.'
          : 'Sem conexão. Tudo fica guardado e vai assim que a internet voltar.'
      }
    >
      {media.length > 0 ? (
        <ul className="grid max-h-[30vh] gap-2 overflow-y-auto" aria-label="Fotos e documentos">
          {media.map(({ job, tripName }) => {
            const failed = job.state === 'failed';
            const photo = job.row.kind === 'photo';
            return (
              <li
                key={job.attachment_id}
                className="grid gap-2 rounded-field bg-paper px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]"
              >
                <div className="grid gap-0.5">
                  <p className="text-[16px] font-semibold">
                    {photo ? 'Foto da memória' : `Anexo · ${job.row.filename}`}
                  </p>
                  <p className="text-[14px] text-ink-2">
                    {tripName ?? 'viagem removida'} · {formatBytes(job.row.size_bytes)}
                  </p>
                  <p
                    className={
                      failed ? 'text-[14px] font-semibold text-late-ink' : 'text-[14px] text-ink-2'
                    }
                  >
                    {failed
                      ? (job.last_error ?? 'Recusado pelo servidor.')
                      : job.attempts > 0
                        ? `Tentando de novo (${job.attempts}ª tentativa)`
                        : 'Aguardando sinal'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {failed ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void mediaQueue.retry(job.attachment_id).then(kickMedia)}
                    >
                      Tentar de novo
                    </Button>
                  ) : null}
                  {confirming === `m:${job.attachment_id}` ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null);
                          void mediaQueue.discard(job.attachment_id);
                        }}
                      >
                        Descartar mesmo
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Manter
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(`m:${job.attachment_id}`)}
                    >
                      Descartar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {items.length === 0 ? (
        media.length === 0 ? (
          <p className="py-4 text-center text-[15px] text-ink-2">Tudo enviado.</p>
        ) : null
      ) : (
        <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
          {items.map(({ op, ctx }) => {
            const d = describeOp(op, ctx);
            const failed = op.state === 'failed';
            return (
              <li
                key={op.seq}
                className="grid gap-2 rounded-field bg-paper px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]"
              >
                <div className="grid gap-0.5">
                  <p className="text-[16px] font-semibold">{d.title}</p>
                  <p className="text-[14px] text-ink-2">{d.detail}</p>
                  <p
                    className={
                      failed ? 'text-[14px] font-semibold text-late-ink' : 'text-[14px] text-ink-2'
                    }
                  >
                    {stateLabel(op)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {failed ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void retryOp(db, op.seq).then(() => syncEngine.schedule(0));
                      }}
                    >
                      Tentar de novo
                    </Button>
                  ) : null}
                  {confirming === op.seq ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirming(null);
                          void discardOp(db, op.seq).then(() => syncEngine.schedule(0));
                        }}
                      >
                        Descartar mesmo
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Manter
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(op.seq)}>
                      Descartar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        variant="secondary"
        disabled={!online || (items.length === 0 && media.length === 0)}
        loading={phase === 'syncing'}
        onClick={() => {
          kickMedia();
          void syncEngine.syncNow();
        }}
      >
        <RefreshCw className="size-5" aria-hidden="true" />
        Tentar agora
      </Button>
    </Sheet>
  );
}
