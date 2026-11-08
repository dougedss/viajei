import { BookOpen, Navigation, Pencil, Star } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { PERSON_COLORS } from '@shared/constants.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { MediaThumb } from '@/features/media/components/MediaThumb.tsx';
import { MediaViewer } from '@/features/media/components/MediaViewer.tsx';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import type { Profile, Stop } from '@/lib/db/schema.ts';
import type { MediaItem } from '@/lib/media/hooks.ts';
import { useTripMediaPrefetch } from '@/lib/media/hooks.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { formatDayShort, formatStamp } from '@/lib/time/index.ts';
import { HowWasItSheet } from '../components/HowWasItSheet.tsx';
import { useTripMemories, useTripPhotos } from '../queries.ts';
import { buildDiary, type DiaryDay, type DiaryMemory } from '../rules.ts';

/**
 * O diário da viagem: por dia, as paradas concluídas na hora real, com as memórias de todo o time
 * (estrelas, texto e fotos de cada pessoa, na cor dela). Funciona inteiro offline com o que está no
 * aparelho; as fotos que ainda não chegaram mostram o borrão.
 */
export default function DiarioPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const memories = useTripMemories(tripId);
  const photos = useTripPhotos(tripId);
  const members = useTripMembers(tripId);
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const [editing, setEditing] = useState<Stop | null>(null);
  const [viewing, setViewing] = useState<{ day: string; index: number } | null>(null);
  useTripMediaPrefetch(tripId);

  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const profiles = new Map<string, Profile>();
  for (const m of members) if (m.profile) profiles.set(m.profile.id, m.profile);
  const diary = buildDiary(days, stops, memories, photos, uid);
  const viewingDay = viewing ? diary.find((d) => d.day.id === viewing.day) : undefined;

  const caption = (item: MediaItem) => {
    const p = profiles.get(item.row.created_by);
    return [p?.name, item.pending ? 'aguardando sinal' : null].filter(Boolean).join(' · ') || null;
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}/detalhes`}
        title="Diário"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
      />

      {diary.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="O diário começa no primeiro Chegamos!"
          text="Cada parada concluída entra aqui, com a hora real, as notas, as fotos e as memórias de todo o time."
          action={
            <ButtonLink to={`/viagens/${trip.id}`} size="md">
              <Navigation className="size-5" aria-hidden="true" />
              Abrir a viagem
            </ButtonLink>
          }
        />
      ) : (
        diary.map((d) => (
          <DiaryDaySection
            key={d.day.id}
            day={d}
            uid={uid}
            profiles={profiles}
            onEdit={setEditing}
            onOpenPhoto={(item) =>
              setViewing({
                day: d.day.id,
                index: d.photos.findIndex((p) => p.row.id === item.row.id),
              })
            }
          />
        ))
      )}

      <HowWasItSheet tripId={trip.id} stop={editing} uid={uid} onClose={() => setEditing(null)} />
      {viewing && viewingDay ? (
        <MediaViewer
          items={viewingDay.photos}
          index={viewing.index}
          onIndex={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
          caption={caption}
        />
      ) : null}
    </div>
  );
}

function DiaryDaySection({
  day,
  uid,
  profiles,
  onEdit,
  onOpenPhoto,
}: {
  day: DiaryDay;
  uid: string;
  profiles: ReadonlyMap<string, Profile>;
  onEdit: (stop: Stop) => void;
  onOpenPhoto: (item: MediaItem) => void;
}) {
  return (
    <section className="grid gap-3" aria-label={`Dia ${day.index}`}>
      <h2 className="label-caps text-accent-ink">
        {formatDayShort(day.day.date).toUpperCase()} · dia {day.index}
        {day.day.title ? ` · ${day.day.title}` : ''}
      </h2>
      <ol className="grid gap-3">
        {day.entries.map((e) => {
          const by = e.by ? profiles.get(e.by)?.name : undefined;
          const mine = e.memories.find((m) => m.user_id === uid);
          if (e.departure) {
            return (
              <li key={e.stop.id} className="flex items-center gap-3 px-1 text-[15px] text-ink-2">
                <span className="w-12 shrink-0 num font-semibold text-ink">
                  {formatStamp(e.at)}
                </span>
                <span className="min-w-0 truncate">
                  ↗ {e.stop.name}
                  {by ? ` · ${by}` : ''}
                </span>
              </li>
            );
          }
          return (
            <li key={e.stop.id} className="grid gap-3 rounded-card bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="w-12 shrink-0 pt-2 num text-[17px] font-semibold">
                  {formatStamp(e.at)}
                </span>
                <StopKindIcon kind={e.stop.kind} filled className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] leading-snug font-semibold break-words">
                    {e.stop.name}
                  </p>
                  {by ? <p className="text-[14px] text-ink-2">{by} marcou</p> : null}
                </div>
              </div>
              {e.memories.map((m) => (
                <MemoryBlock
                  key={m.user_id}
                  memory={m}
                  profile={profiles.get(m.user_id)}
                  onOpenPhoto={onOpenPhoto}
                />
              ))}
              <button
                type="button"
                onClick={() => onEdit(e.stop)}
                className="inline-flex min-h-12 w-fit items-center gap-1.5 text-[15px] font-semibold text-accent-ink"
              >
                {mine ? (
                  <>
                    <Pencil className="size-4" aria-hidden="true" />
                    Editar minha memória
                  </>
                ) : (
                  <>
                    <Star className="size-4" aria-hidden="true" />
                    Contar como foi
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MemoryBlock({
  memory,
  profile,
  onOpenPhoto,
}: {
  memory: DiaryMemory;
  profile: Profile | undefined;
  onOpenPhoto: (item: MediaItem) => void;
}) {
  const color = asPersonColor(profile?.color ?? 'sunset');
  const hex = PERSON_COLORS[color].hex;
  const name = profile?.name ?? 'Alguém do time';
  return (
    <div
      className="grid gap-2 rounded-field bg-paper p-3"
      style={{ boxShadow: `inset 3px 0 0 ${hex}` }}
      aria-label={`Memória de ${name}`}
    >
      <div className="flex items-center gap-2">
        <Avatar name={name} color={color} size="sm" />
        <span className="text-[15px] font-semibold">{name}</span>
        {memory.rating !== null ? (
          <span className="ml-auto flex" role="img" aria-label={`${String(memory.rating)} de 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={
                  n <= (memory.rating ?? 0) ? 'size-4 fill-current text-tight' : 'size-4 text-line'
                }
                aria-hidden="true"
              />
            ))}
          </span>
        ) : null}
      </div>
      {memory.memo ? (
        <p className="text-[16px] leading-snug whitespace-pre-line">“{memory.memo}”</p>
      ) : null}
      {memory.photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {memory.photos.map((p) => (
            <MediaThumb key={p.row.id} item={p} ring={hex} onOpen={() => onOpenPhoto(p)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
