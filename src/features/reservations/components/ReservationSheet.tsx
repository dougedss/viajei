import { Copy, ExternalLink, MessageCircle, Pencil, Phone, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { formatPhone } from '@shared/phone.ts';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { LaunchExpense } from '@/features/expenses/components/LaunchExpense.tsx';
import { MediaThumb } from '@/features/media/components/MediaThumb.tsx';
import { MediaViewer } from '@/features/media/components/MediaViewer.tsx';
import { formatMoney } from '@/features/trips/rules.ts';
import type { Reservation, Stop } from '@/lib/db/schema.ts';
import { googleMapsUrl, telUrl, wazeUrl, whatsappUrl } from '@/lib/links/index.ts';
import { cancelInfo, policyAdds, typeLabel, whenLabel } from '../rules.ts';
import { useReservationMedia } from '../queries.ts';

type Props = {
  reservation: Reservation | null;
  /** a parada ligada, para os links do Maps e do Waze irem pela coordenada */
  stop: Pick<Stop, 'lat' | 'lng' | 'name' | 'address'> | null;
  today: string;
  onClose: () => void;
  /** aberta do "Agora": o rótulo diz que é a reserva de agora */
  now?: boolean;
};

const linkClass =
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-button bg-card px-4 text-[17px] font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';

/**
 * "Ver reserva", a razão de existir desta parte do app: no balcão do hotel, sem sinal, o código
 * grande (um toque copia), o horário, ligar e WhatsApp, o endereço no Maps e no Waze e os prints e
 * PDFs, todos abrindo do aparelho.
 */
export function ReservationSheet({ reservation: r, stop, today, onClose, now = false }: Props) {
  const type = r ? typeLabel(r.type) : '';
  return (
    <Sheet
      open={r !== null}
      onClose={onClose}
      title={r?.name ?? ''}
      description={now ? `${type} · agora` : type}
    >
      {r ? <Body r={r} stop={stop} today={today} /> : null}
    </Sheet>
  );
}

function Body({ r, stop, today }: { r: Reservation; stop: Props['stop']; today: string }) {
  const toast = useToast();
  const media = useReservationMedia(r.trip_id, r.id);
  const [viewing, setViewing] = useState<number | null>(null);
  const when = whenLabel(r);
  const cancel = cancelInfo(r, today);
  const place = {
    lat: stop?.lat ?? null,
    lng: stop?.lng ?? null,
    name: r.name,
    address: r.address ?? stop?.address ?? null,
  };
  const maps = r.address || stop?.lat ? googleMapsUrl(place) : null;
  const waze = r.address || stop?.lat ? wazeUrl(place) : null;
  const code = r.confirmation_code;

  const copy = () => {
    if (!code) return;
    void navigator.clipboard
      .writeText(code)
      .then(() => toast.show({ title: 'Código copiado', kind: 'ok' }))
      .catch(() => toast.show({ title: 'Não deu para copiar', kind: 'late' }));
  };

  return (
    <>
      <div className="grid max-h-[72dvh] gap-4 overflow-y-auto px-0.5 pb-1">
        {code ? (
          <button
            type="button"
            onClick={copy}
            className="grid gap-1 rounded-card bg-paper p-4 text-left shadow-[inset_0_0_0_1.5px_var(--color-line)]"
            aria-label={`Código ${code}. Toque para copiar`}
          >
            <span className="label-caps text-ink-2">Código</span>
            <span className="flex items-center justify-between gap-3">
              <span className="num text-[40px] leading-none font-bold tracking-wide break-all">
                {code}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-semibold text-accent-ink">
                <Copy className="size-5" aria-hidden="true" />
                Copiar
              </span>
            </span>
          </button>
        ) : null}

        {when ? <p className="num text-[19px] font-semibold">{when}</p> : null}
        {cancel ? (
          <p
            className={
              cancel.soon
                ? 'inline-flex w-fit items-center gap-1.5 rounded-full bg-tight/20 px-3 py-1 text-[15px] font-semibold text-tight-ink'
                : 'text-[15px] text-ink-2'
            }
          >
            {cancel.soon ? <TriangleAlert className="size-4" aria-hidden="true" /> : null}
            {cancel.label}
            {policyAdds(r.cancel_policy, cancel.label) ? ` · ${r.cancel_policy ?? ''}` : ''}
          </p>
        ) : r.cancel_policy ? (
          <p className="text-[15px] text-ink-2">{r.cancel_policy}</p>
        ) : null}

        {r.phone ? (
          <div className="grid gap-2">
            <p className="num text-[17px] font-semibold">{formatPhone(r.phone)}</p>
            <div className="flex gap-2">
              <a href={telUrl(r.phone)} className={linkClass}>
                <Phone className="size-5" aria-hidden="true" />
                Ligar
              </a>
              <a href={whatsappUrl(r.phone)} target="_blank" rel="noreferrer" className={linkClass}>
                <MessageCircle className="size-5" aria-hidden="true" />
                WhatsApp
              </a>
            </div>
          </div>
        ) : null}

        {maps || waze ? (
          <div className="grid gap-2">
            {place.address ? <p className="text-[15px] text-ink-2">{place.address}</p> : null}
            <div className="flex gap-2">
              {maps ? (
                <a href={maps} target="_blank" rel="noreferrer" className={linkClass}>
                  <ExternalLink className="size-5" aria-hidden="true" />
                  Google Maps
                </a>
              ) : null}
              {waze ? (
                <a href={waze} target="_blank" rel="noreferrer" className={linkClass}>
                  <ExternalLink className="size-5" aria-hidden="true" />
                  Waze
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {media.length > 0 ? (
          <div className="grid gap-2">
            <p className="label-caps text-ink-2">Anexos · abrem sem sinal</p>
            <div className="flex flex-wrap gap-3">
              {media.map((m, i) => (
                <MediaThumb key={m.row.id} item={m} size="lg" onOpen={() => setViewing(i)} />
              ))}
            </div>
          </div>
        ) : null}

        {r.amount !== null || r.booked_via || r.notes ? (
          <p className="text-[15px] whitespace-pre-line text-ink-2">
            {[
              r.amount !== null ? formatMoney(r.amount) : null,
              r.booked_via ? `reservado por ${r.booked_via}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {r.notes ? `${r.amount !== null || r.booked_via ? '\n' : ''}${r.notes}` : ''}
          </p>
        ) : null}

        <LaunchExpense reservation={r} />

        <ButtonLink
          to={`/viagens/${r.trip_id}/reservas/${r.id}/editar`}
          variant="secondary"
          size="md"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Editar reserva
        </ButtonLink>
      </div>
      {viewing !== null ? (
        <MediaViewer
          items={media}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
