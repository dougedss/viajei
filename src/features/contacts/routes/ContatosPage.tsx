import { MessageCircle, Pencil, Phone, Plus, Siren, Ticket, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CONTACT_TYPES, EMERGENCY_NUMBERS } from '@shared/constants.ts';
import { formatPhone } from '@shared/phone.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripReservations } from '@/features/reservations/queries.ts';
import { useTrip } from '@/features/trips/queries.ts';
import type { Contact } from '@/lib/db/schema.ts';
import { deliverFile } from '@/lib/files/deliver.ts';
import { telUrl, whatsappUrl } from '@/lib/links/index.ts';
import { createContact, removeContact, updateContact } from '../actions.ts';
import { ContactSheet } from '../components/ContactSheet.tsx';
import { useTripContacts } from '../queries.ts';
import { canWhatsApp, contactGroups, type ContactEntry } from '../rules.ts';
import { toVCard, vcardFilename, type VCardContact } from '../vcard.ts';

const VCARD_MIME = 'text/vcard';

const callClass =
  'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-card px-4 text-[15px] font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';

/**
 * Os contatos da viagem por tipo, com ligar (`tel:`) e WhatsApp (`wa.me`) em botões de 48 px. A
 * emergência fica sempre no topo: constantes, sem cadastro e sem internet (ligar só precisa de sinal
 * de voz). Os telefones das reservas aparecem aqui, derivados e marcados "da reserva".
 */
export default function ContatosPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const contacts = useTripContacts(tripId);
  const reservations = useTripReservations(tripId);
  const toast = useToast();
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);

  if (trip === undefined || contacts === undefined || reservations === undefined) {
    return <Splash />;
  }
  if (trip === null) return <NotFound />;

  const groups = contactGroups(contacts, reservations);
  const emergency = groups.find((g) => g.type === 'emergency')?.entries ?? [];
  const rest = groups.filter((g) => g.type !== 'emergency');
  const all = groups.flatMap((g) => g.entries);

  const exportCards = async (entries: readonly VCardContact[], base: string) => {
    if (entries.length === 0) return;
    const text = toVCard(entries, trip.name);
    const r = await deliverFile(text, vcardFilename(base), VCARD_MIME, base);
    if (r === 'downloaded') {
      toast.show({ title: 'Contatos salvos', description: 'Abra o arquivo .vcf para importar.' });
    }
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}`}
        title="Contatos"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
        actions={
          all.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void exportCards(all, `viajei-contatos-${trip.name}`)}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Salvar todos
            </Button>
          ) : null
        }
      />

      <section aria-labelledby="h-emergencia" className="grid gap-2">
        <h2 id="h-emergencia" className="flex items-center gap-1.5 label-caps text-late-ink">
          <Siren className="size-4" aria-hidden="true" />
          Emergência · ligar não precisa de internet
        </h2>
        <ul className="grid gap-2">
          {EMERGENCY_NUMBERS.map((e) => (
            <li
              key={e.number}
              className="flex items-center gap-3 rounded-[16px] bg-card py-2 pr-2 pl-4 shadow-[inset_0_0_0_1px_var(--color-line)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{e.name}</span>
                <span className="font-num text-[19px] font-semibold text-late-ink">{e.number}</span>
              </span>
              <a
                href={telUrl(e.number)}
                aria-label={`Ligar para ${e.name}, ${e.number}`}
                className={callClass}
              >
                <Phone className="size-4" aria-hidden="true" />
                Ligar
              </a>
            </li>
          ))}
          {emergency.map((entry) => (
            <ContactRow key={entry.key} entry={entry} tripId={trip.id} onEdit={setEditing} />
          ))}
        </ul>
      </section>

      {rest.map((g) => (
        <section key={g.type} aria-labelledby={`h-${g.type}`} className="grid gap-2">
          <h2 id={`h-${g.type}`} className="label-caps text-accent-ink">
            {CONTACT_TYPES[g.type].group}
          </h2>
          <ul className="grid gap-2">
            {g.entries.map((entry) => (
              <ContactRow key={entry.key} entry={entry} tripId={trip.id} onEdit={setEditing} />
            ))}
          </ul>
        </section>
      ))}

      {all.length === emergency.length ? (
        <p className="text-[15px] text-ink-2">
          Hotéis, atrações e quem mais vocês precisarem achar rápido na estrada. Os telefones das
          reservas aparecem aqui sozinhos.
        </p>
      ) : null}

      <Button size="lg" onClick={() => setEditing('new')}>
        <Plus className="size-5" aria-hidden="true" />
        Contato
      </Button>

      <ContactSheet
        contact={editing}
        onClose={() => setEditing(null)}
        onSave={(values) => {
          const current = editing;
          setEditing(null);
          void (current === 'new' || current === null
            ? createContact(trip.id, values)
            : updateContact(current.id, values));
        }}
        onRemove={(c) => {
          setEditing(null);
          void removeContact(c).then((undo) =>
            toast.show({
              title: 'Contato excluído',
              description: c.name,
              action: { label: 'Desfazer', onClick: () => void undo() },
              duration: 8000,
            }),
          );
        }}
        onExport={(c) => void exportCards([c], c.name)}
      />
    </div>
  );
}

function ContactRow({
  entry,
  tripId,
  onEdit,
}: {
  entry: ContactEntry;
  tripId: string;
  onEdit: (c: Contact) => void;
}) {
  const tag =
    entry.source === 'reservation'
      ? 'da reserva'
      : entry.reservationId
        ? 'também na reserva'
        : null;
  return (
    <li className="grid gap-2 rounded-[16px] bg-card px-4 py-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug font-semibold break-words">{entry.name}</p>
          <p className="font-num text-[16px] text-ink-2">
            {formatPhone(entry.phone)}
            {tag ? (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 font-ui text-[12px] font-semibold text-accent-ink">
                {tag}
              </span>
            ) : null}
          </p>
          {entry.notes ? <p className="text-[14px] text-ink-2">{entry.notes}</p> : null}
        </div>
        {entry.source === 'contact' ? (
          <button
            type="button"
            onClick={() => onEdit(entry.contact)}
            aria-label={`Editar ${entry.name}`}
            className="grid size-12 shrink-0 place-items-center rounded-[12px] text-ink-2"
          >
            <Pencil className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to={`/viagens/${tripId}/reservas?abrir=${entry.reservationId}`}
            aria-label={`Ver a reserva ${entry.name}`}
            className="grid size-12 shrink-0 place-items-center rounded-[12px] text-ink-2"
          >
            <Ticket className="size-5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={telUrl(entry.phone)} aria-label={`Ligar para ${entry.name}`} className={callClass}>
          <Phone className="size-4" aria-hidden="true" />
          Ligar
        </a>
        {canWhatsApp(entry.phone) ? (
          <a
            href={whatsappUrl(entry.phone)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp de ${entry.name}`}
            className={callClass}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            WhatsApp
          </a>
        ) : null}
      </div>
    </li>
  );
}
