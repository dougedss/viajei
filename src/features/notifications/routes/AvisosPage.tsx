import { CalendarDays, ChevronRight, Smartphone } from 'lucide-react';
import { Link, useParams } from 'react-router';
import {
  isAvailableKind,
  LEAD_MINUTE_OPTIONS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS,
} from '@shared/constants.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Switch } from '@/components/ui/Switch.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { currentDay } from '@/lib/time/index.ts';
import { cx } from '@/lib/cx.ts';
import { savePrefs, usePrefs } from '../prefs.ts';
import { CalendarExport } from '../components/CalendarExport.tsx';

/**
 * Os avisos de uma viagem (`/viagens/:tripId/avisos`): as preferências desta viagem (valem em todos
 * os aparelhos da pessoa) e o calendário. O que é do aparelho (a permissão, os sons, os cartões de
 * conquista) mora no Perfil desde a fase 16, e aqui fica um link para lá.
 */
export default function AvisosPage() {
  const { tripId = '' } = useParams();
  const { session } = useSession();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const { prefs, row } = usePrefs(tripId);
  const toast = useToast();
  const uid = session?.user.id ?? '';

  if (trip === undefined || days === undefined || row === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const save = (patch: Parameters<typeof savePrefs>[2]) => {
    void savePrefs(uid, tripId, patch).catch(() =>
      toast.show({ title: 'Não deu para salvar a preferência.', kind: 'late' }),
    );
  };

  const today = currentDay(days, todayISO());
  const dayStops = today ? stops.filter((s) => s.trip_day_id === today.id) : [];
  const allDays = days.map((day) => ({
    day,
    stops: stops.filter((s) => s.trip_day_id === day.id),
  }));
  const kinds = NOTIFICATION_KIND_KEYS.filter(isAvailableKind);

  return (
    <div className="grid gap-6">
      <PageHeader
        back={`/viagens/${trip.id}/detalhes`}
        title="Avisos"
        eyebrow={<Chip>{trip.name}</Chip>}
      />

      <Card className="grid gap-2" data-device-link>
        <p className="text-[15px] text-ink-2">
          A permissão de avisos deste aparelho, os sons do Modo Viagem e os cartões de conquista
          valem para todas as viagens: ficam no Perfil.
        </p>
        <Link
          to="/perfil#h-avisos-aparelho"
          className="inline-flex min-h-12 items-center gap-1 text-[15px] font-semibold text-accent-ink"
        >
          Avisos neste aparelho
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Card>

      <section className="grid gap-3" aria-labelledby="h-prefs">
        <div className="grid gap-0.5">
          <h2 id="h-prefs" className="label-caps text-accent-ink">
            Preferências
          </h2>
          <p className="text-[14px] text-ink-2">
            Valem em todos os seus aparelhos, só nesta viagem.
          </p>
        </div>
        <Card className="grid gap-1 divide-y divide-line">
          <Switch
            label="Receber avisos desta viagem"
            description="O geral: desligado, nada chega."
            checked={prefs.enabled}
            onChange={(v) => save({ enabled: v })}
          />
          <div className="grid gap-2 py-3">
            <p className="text-[17px] font-semibold">Avisar com antecedência</p>
            <div
              role="radiogroup"
              aria-label="Antecedência do aviso de saída"
              className="flex flex-wrap gap-2"
            >
              {LEAD_MINUTE_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  role="radio"
                  aria-checked={prefs.lead_minutes === min}
                  disabled={!prefs.enabled}
                  onClick={() => save({ lead_minutes: min })}
                  className={cx(
                    'min-h-12 min-w-16 rounded-full px-4 font-num text-[17px] font-bold disabled:opacity-50',
                    prefs.lead_minutes === min
                      ? 'bg-sunset-deep text-white'
                      : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]',
                  )}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-h-12 items-center justify-between gap-4 py-2">
            <span className="text-[17px] font-semibold">Briefing da manhã às</span>
            <input
              type="time"
              value={prefs.morning_time}
              disabled={!prefs.enabled}
              onChange={(e) => {
                if (e.target.value) save({ morning_time: e.target.value });
              }}
              className="min-h-12 rounded-field bg-paper px-3 font-num text-[20px] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] disabled:opacity-50"
            />
          </label>
          {kinds.map((k) => (
            <Switch
              key={k}
              label={NOTIFICATION_KINDS[k].label}
              description={NOTIFICATION_KINDS[k].description}
              checked={prefs.kinds[k]}
              disabled={!prefs.enabled}
              onChange={(v) => save({ kinds: { [k]: v } })}
            />
          ))}
        </Card>
      </section>

      <section className="grid gap-3" aria-labelledby="h-cal">
        <h2 id="h-cal" className="label-caps text-accent-ink">
          Calendário
        </h2>
        <Card className="grid gap-3">
          <p className="flex items-start gap-3 text-[15px] text-ink-2">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden="true" />
            Funciona sem avisos e sem sinal: um evento por parada, com endereço e link do mapa, e um
            alarme 15 min antes de cada "sair às".
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {today ? (
              <CalendarExport
                trip={trip}
                day={today}
                stops={dayStops}
                label={
                  today.date === todayISO() ? 'Exportar o dia de hoje' : 'Exportar o próximo dia'
                }
              />
            ) : null}
            <CalendarExport trip={trip} stops={stops} days={allDays} />
          </div>
          <p className="flex items-center gap-2 text-[13px] text-ink-2">
            <Smartphone className="size-4" aria-hidden="true" />
            No iPhone o arquivo abre no Calendário pela folha de compartilhar; no Android, baixa e
            abre.
          </p>
        </Card>
      </section>
    </div>
  );
}
