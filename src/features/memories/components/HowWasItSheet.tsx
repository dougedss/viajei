import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MEDIA } from '@shared/constants.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { FilePickers } from '@/features/media/components/FilePickers.tsx';
import { MediaThumb } from '@/features/media/components/MediaThumb.tsx';
import { useIsOwner, useTrip } from '@/features/trips/queries.ts';
import { db, type Stop } from '@/lib/db/schema.ts';
import { removeMedia } from '@/lib/media/actions.ts';
import { useTripMedia } from '@/lib/media/hooks.ts';
import { MediaError, prepareFile, type Prepared } from '@/lib/media/index.ts';
import { addMemoryPhotos, dismissMemoryPrompt, memoryId, saveMemory } from '../actions.ts';
import { isEmptyMemory } from '../rules.ts';
import { StarRating } from './StarRating.tsx';

type Props = {
  tripId: string;
  stop: Pick<Stop, 'id' | 'name'> | null;
  uid: string;
  onClose: () => void;
};

/**
 * "Como foi?": nota de 1 a 5, até 3 fotos e uma memória curta. Tudo opcional e por pessoa; fica no
 * diário da viagem. Offline como tudo: a foto entra na fila e aparece na hora.
 */
export function HowWasItSheet({ tripId, stop, uid, onClose }: Props) {
  return (
    <Sheet
      open={stop !== null}
      onClose={onClose}
      title={stop ? `Como foi ${stop.name}?` : ''}
      description="Tudo opcional e por pessoa; fica no diário da viagem."
    >
      {stop ? <Body key={stop.id} tripId={tripId} stop={stop} uid={uid} onClose={onClose} /> : null}
    </Sheet>
  );
}

/** As fotos escolhidas antes do "Salvar": comprimidas, com uma URL para a miniatura. */
class Drafts {
  #urls = new Map<Prepared, string>();
  url(p: Prepared): string {
    let u = this.#urls.get(p);
    if (!u) {
      u = URL.createObjectURL(p.blob);
      this.#urls.set(p, u);
    }
    return u;
  }
  release(p: Prepared): void {
    const u = this.#urls.get(p);
    if (u) URL.revokeObjectURL(u);
    this.#urls.delete(p);
  }
  releaseAll(): void {
    for (const u of this.#urls.values()) URL.revokeObjectURL(u);
    this.#urls.clear();
  }
}

function Body({ tripId, stop, uid, onClose }: Props & { stop: Pick<Stop, 'id' | 'name'> }) {
  const toast = useToast();
  const trip = useTrip(tripId);
  const isOwner = useIsOwner(trip);
  const existing = useLiveQuery(
    async () => (await db.stop_memories.get(await memoryId(stop.id, uid))) ?? null,
    [stop.id, uid],
  );
  const photos = useTripMedia(
    tripId,
    (row) => row.stop_id === stop.id && row.kind === 'photo' && row.created_by === uid,
  );
  const [rating, setRating] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Prepared[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [store] = useState(() => new Drafts());

  // a memória já gravada entra uma vez, quando chega do Dexie
  if (!loaded && existing !== undefined) {
    setLoaded(true);
    if (existing?.deleted_at === null) {
      setRating(existing.rating);
      setMemo(existing.memo ?? '');
    }
  }
  useEffect(() => () => store.releaseAll(), [store]);

  const remaining = MEDIA.photosPerStop - photos.length - drafts.length;
  const empty = isEmptyMemory({ rating, memo, photos: drafts.length + photos.length });

  const onFiles = async (files: File[]) => {
    setPreparing(true);
    const ok: Prepared[] = [];
    for (const f of files.slice(0, Math.max(0, remaining))) {
      try {
        ok.push(await prepareFile(f, 'memory'));
      } catch (err) {
        toast.show({
          title: err instanceof MediaError ? err.message : 'Não deu para usar esta foto.',
          kind: 'late',
        });
      }
    }
    setDrafts((xs) => [...xs, ...ok]);
    setPreparing(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMemory({ tripId, stopId: stop.id, uid, rating, memo });
      await addMemoryPhotos(drafts, { tripId, stopId: stop.id }, uid);
      setDrafts([]);
      toast.show({ title: 'Guardado no diário', kind: 'ok' });
      onClose();
    } catch {
      toast.show({ title: 'Não deu para salvar. Tente de novo.', kind: 'late' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid max-h-[70dvh] gap-4 overflow-y-auto px-0.5 pb-1">
      <StarRating value={rating} onChange={setRating} />

      <div className="grid gap-2">
        {photos.length + drafts.length > 0 ? (
          <div className="flex flex-wrap gap-3 pt-2" aria-label="Fotos">
            {photos.map((m) => (
              <MediaThumb
                key={m.row.id}
                item={m}
                onRemove={() => void removeMedia(m, uid, isOwner)}
              />
            ))}
            {drafts.map((p, i) => (
              <div key={store.url(p)} className="relative size-20 shrink-0">
                <img src={store.url(p)} alt="" className="size-full rounded-[14px] object-cover" />
                <button
                  type="button"
                  aria-label="Tirar a foto"
                  onClick={() => {
                    store.release(p);
                    setDrafts((xs) => xs.filter((_, j) => j !== i));
                  }}
                  className="absolute -top-2 -right-2 grid size-8 place-items-center rounded-full bg-card text-ink shadow-card"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {remaining > 0 ? (
          <FilePickers
            mode="photo"
            remaining={remaining}
            disabled={preparing}
            onFiles={(f) => void onFiles(f)}
          />
        ) : (
          <p className="text-[14px] text-ink-2">Até {MEDIA.photosPerStop} fotos por parada.</p>
        )}
        {preparing ? (
          <p className="text-[14px] text-ink-2" role="status">
            Preparando a foto…
          </p>
        ) : null}
      </div>

      <TextArea
        label="Memória"
        rows={3}
        maxLength={MEDIA.memoMax}
        placeholder="Uma frase para lembrar"
        hint={`${memo.length}/${MEDIA.memoMax}`}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            void dismissMemoryPrompt(stop.id);
            onClose();
          }}
        >
          Agora não
        </Button>
        <Button
          size="md"
          loading={saving}
          disabled={empty || preparing}
          onClick={() => void save()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
