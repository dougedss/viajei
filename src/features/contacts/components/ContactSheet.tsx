import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { CONTACT_TYPES, CONTACT_TYPE_KEYS, type ContactType } from '@shared/constants.ts';
import { formatPhone, toE164 } from '@shared/phone.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { cx } from '@/lib/cx.ts';
import type { Contact } from '@/lib/db/schema.ts';
import type { ContactValues } from '../actions.ts';

type Props = {
  /** `null` fechada; `'new'` para um contato novo; o contato para editar */
  contact: Contact | 'new' | null;
  onClose: () => void;
  onSave: (values: ContactValues) => void;
  onRemove: (contact: Contact) => void;
  /** "Salvar no celular": o `.vcf` deste contato */
  onExport: (contact: Contact) => void;
};

/** Nome, telefone digitado à brasileira (vira E.164), tipo e observações. */
export function ContactSheet({ contact, onClose, onSave, onRemove, onExport }: Props) {
  return (
    <Sheet
      open={contact !== null}
      onClose={onClose}
      title={contact === 'new' ? 'Novo contato' : 'Contato'}
    >
      {contact !== null ? (
        <Body
          key={contact === 'new' ? 'new' : contact.id}
          contact={contact === 'new' ? null : contact}
          onSave={onSave}
          onRemove={onRemove}
          onExport={onExport}
        />
      ) : null}
    </Sheet>
  );
}

function Body({
  contact,
  onSave,
  onRemove,
  onExport,
}: {
  contact: Contact | null;
  onSave: (values: ContactValues) => void;
  onRemove: (contact: Contact) => void;
  onExport: (contact: Contact) => void;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact ? formatPhone(contact.phone) : '');
  const [type, setType] = useState<ContactType>(
    (contact?.type as ContactType | undefined) ?? 'other',
  );
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = toE164(phone);
        const next = {
          ...(name.trim() === '' ? { name: 'Digite o nome.' } : {}),
          ...(parsed.ok ? {} : { phone: parsed.message }),
        };
        setErrors(next);
        if (!parsed.ok || name.trim() === '') return;
        onSave({
          name: name.trim().slice(0, 120),
          phone: parsed.e164,
          type,
          notes: notes.trim() === '' ? null : notes.trim().slice(0, 500),
        });
      }}
    >
      <TextField
        label="Nome"
        value={name}
        maxLength={120}
        autoComplete="off"
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label="Telefone"
        value={phone}
        inputMode="tel"
        autoComplete="off"
        hint="Com DDD: (51) 99752-7596. De fora do Brasil, com +código do país."
        error={errors.phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <fieldset className="grid gap-1.5">
        <legend className="text-[15px] font-semibold">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TYPE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={type === k}
              onClick={() => setType(k)}
              className={cx(
                'min-h-12 rounded-full px-4 text-[15px] font-semibold',
                type === k
                  ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              {CONTACT_TYPES[k].label}
            </button>
          ))}
        </div>
      </fieldset>
      <TextArea
        label="Observações"
        rows={2}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="grid gap-2">
        <Button type="submit" size="lg">
          Salvar
        </Button>
        {contact ? (
          <Button type="button" variant="secondary" size="md" onClick={() => onExport(contact)}>
            <UserPlus className="size-5" aria-hidden="true" />
            Salvar no celular
          </Button>
        ) : null}
        {contact ? (
          <button
            type="button"
            onClick={() => onRemove(contact)}
            className="inline-flex min-h-12 items-center justify-center gap-1 rounded-[12px] text-[15px] font-semibold text-late-ink"
          >
            <Trash2 className="size-5" aria-hidden="true" />
            Excluir contato
          </button>
        ) : null}
      </div>
    </form>
  );
}
