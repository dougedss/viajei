import { Check, Copy, Mail } from 'lucide-react';
import { useState } from 'react';
import { inboxAddress } from '@shared/inbox-code.ts';
import { Card } from '@/components/ui/Card.tsx';
import { useSession } from '@/lib/supabase/session.ts';
import { useInboxAddress } from '../queries.ts';

/**
 * "Encaminhar um e-mail para…" (fase 18): o endereço da pessoa, com "Copiar" e um texto curto de como
 * usar. O código é segredo dela (nunca sai em log); o e-mail tem de vir da conta dela, senão é
 * descartado em silêncio.
 */
export function InboxAddressCard() {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const row = useInboxAddress(uid);
  const [copied, setCopied] = useState(false);
  if (row === undefined) return null;
  const address = row ? inboxAddress(row.code) : null;
  const account = session?.user.email ?? 'o e-mail da sua conta';

  return (
    <Card className="grid gap-2" data-inbox-address={address ?? ''}>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <Mail className="size-5 text-accent-ink" aria-hidden="true" />
        Encaminhar um e-mail para…
      </p>
      {address ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-field bg-paper px-3 py-2 num text-[15px]">
            {address}
          </code>
          <button
            type="button"
            className="inline-flex min-h-12 items-center gap-1.5 rounded-button px-3 text-[15px] font-semibold text-accent-ink"
            onClick={() => {
              void navigator.clipboard.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2_000);
              });
            }}
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">
          O seu endereço chega com a próxima sincronização (precisa de internet uma vez).
        </p>
      )}
      <p className="text-[14px] text-ink-2">
        Encaminhe o e-mail da confirmação para este endereço, a partir de {account}. A reserva entra
        na viagem certa pelas datas ou aparece em "Reservas recebidas", e você recebe um aviso.
        E-mails de outro remetente são ignorados.
      </p>
    </Card>
  );
}
