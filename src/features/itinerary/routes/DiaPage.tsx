import { MapPinPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { CalendarExport } from '@/features/notifications/components/CalendarExport.tsx';
import { useIsOwner, useTrip } from '@/features/trips/queries.ts';
import { useSession } from '@/lib/supabase/session.ts';
import type { Stop, TripDay } from '@/lib/db/schema.ts';
import { formatDayLong, formatDayShort } from '@/lib/time/index.ts';
import {
  acceptTravelSuggestion,
  createStop,
  moveStop,
  removeStop,
  updateDay,
  updateStop,
} from '../actions.ts';
import { RouteCard } from '../components/RouteCard.tsx';
import { SortableStops } from '../components/SortableStops.tsx';
import { StopForm } from '../components/StopForm.tsx';
import { useDayStops, useTripDay, useTripDays } from '../queries.ts';
import { useDayRoute } from '../route.ts';
import { suggestTravel } from '../rules.ts';

function DayTitle({ day }: { day: TripDay }) {
  const [value, setValue] = useState(day.title ?? '');
  const save = () => {
    const title = value.trim() === '' ? null : value.trim().slice(0, 80);
    if (title !== day.title) void updateDay(day.id, { title });
  };
  return (
    <TextField
      label="Título do dia"
      placeholder="Papanduva → Serra Gaúcha"
      autoComplete="off"
      maxLength={80}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function DiaPage() {
  const { tripId = '', dayId = '' } = useParams();
  const trip = useTrip(tripId);
  const day = useTripDay(dayId);
  const days = useTripDays(tripId);
  const stops = useDayStops(dayId);
  const routeState = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const [editing, setEditing] = useState<Stop | 'new' | null>(null);
  const [removing, setRemoving] = useState<Stop | null>(null);
  const { session } = useSession();
  const isOwner = useIsOwner(trip);

  if (trip === undefined || day === undefined || days === undefined) return <Splash />;
  if (trip === null || day === null) return <NotFound />;

  const index = days.findIndex((d) => d.id === day.id);
  const suggestions = suggestTravel(stops, routeState.route);

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}/roteiro`}
        title={day.title ?? `Dia ${index + 1}`}
        eyebrow={
          <span className="text-[15px] text-ink-2">
            {formatDayLong(day.date)} · dia {index + 1} de {days.length}
          </span>
        }
        actions={
          stops.some((s) => s.time) ? (
            <CalendarExport trip={trip} day={day} stops={stops} size="sm" label="Calendário" />
          ) : undefined
        }
      />

      <DayTitle key={day.id} day={day} />

      <RouteCard state={routeState} />

      {stops.length === 0 ? (
        <EmptyState
          icon={MapPinPlus}
          title="Nenhuma parada neste dia"
          text="Adicione a saída, as atrações, o hotel. Com endereço, a rota por estrada aparece sozinha."
          action={
            <Button size="md" onClick={() => setEditing('new')}>
              <Plus className="size-5" aria-hidden="true" />
              Adicionar parada
            </Button>
          }
        />
      ) : (
        <>
          <SortableStops
            stops={stops}
            suggestions={suggestions}
            onMove={(from, to) => void moveStop(day.id, from, to)}
            onAcceptSuggestion={(stop, minutes) => void acceptTravelSuggestion(stop.id, minutes)}
            onEdit={setEditing}
            onRemove={setRemoving}
          />
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="size-5" aria-hidden="true" />
            Adicionar parada
          </Button>
        </>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nova parada' : 'Editar parada'}
        description={`${formatDayShort(day.date)}${day.title ? ` · ${day.title}` : ''}`}
      >
        <div className="max-h-[70dvh] overflow-y-auto px-0.5">
          {editing !== null ? (
            <StopForm
              key={editing === 'new' ? 'new' : editing.id}
              {...(editing === 'new' ? {} : { stop: editing })}
              submitLabel={editing === 'new' ? 'Adicionar' : 'Salvar'}
              onSubmit={async (values) => {
                if (editing === 'new') await createStop(trip.id, day.id, values);
                else await updateStop(editing.id, values);
                setEditing(null);
                toast.show({
                  title: editing === 'new' ? 'Parada adicionada' : 'Parada salva',
                  kind: 'ok',
                });
              }}
            />
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Excluir a parada?"
        {...(removing
          ? {
              description: `${removing.name} sai do roteiro em todos os aparelhos. Uma reserva ligada a ela continua, no mesmo dia; a sua memória e as suas fotos da parada saem junto.`,
            }
          : {})}
      >
        <Button
          variant="danger"
          onClick={() => {
            if (!removing) return;
            void removeStop(removing.id, session?.user.id ?? '', isOwner).then(() => {
              toast.show({ title: 'Parada excluída', kind: 'info' });
              setRemoving(null);
            });
          }}
        >
          Excluir parada
        </Button>
        <Button variant="ghost" onClick={() => setRemoving(null)}>
          Cancelar
        </Button>
      </Sheet>
    </div>
  );
}
