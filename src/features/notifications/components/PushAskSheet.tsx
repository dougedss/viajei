import { BellRing, Clock3, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { InstallCard } from '@/features/pwa/components/InstallCard.tsx';
import type { Trip } from '@/lib/db/schema.ts';
import { PushSetupError, subscribePush } from '../subscription.ts';
import { usePushOffer } from '../use-push-offer.ts';

type Props = { trip: Pick<Trip, 'id' | 'name' | 'start_date' | 'end_date'> };

/**
 * A folha "Avisos da viagem": uma vez por aparelho e viagem, na primeira abertura de uma viagem que
 * começa em até 7 dias, nunca na primeira abertura do app (`usePushOffer`). A permissão é pedida no
 * toque. É uma folha: pode ficar na raiz de qualquer tela. No iPhone fora da Tela de Início não é
 * ela que aparece, e sim o `PushInstallCard`, que é um cartão em linha e precisa de um lugar na tela.
 */
export function PushAskSheet({ trip }: Props) {
  const offer = usePushOffer(trip);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!offer || offer.status === 'not-installed') return null;
  const { userId, close } = offer;

  const activate = async () => {
    setBusy(true);
    try {
      const status = await subscribePush(userId);
      if (status === 'subscribed') {
        toast.show({
          title: 'Avisos ativados',
          description: 'Você vai saber a hora de sair.',
          kind: 'ok',
        });
      } else if (status === 'denied') {
        toast.show({
          title: 'Avisos bloqueados',
          description: 'Dá para reativar nos ajustes do sistema; veja em Avisos.',
          kind: 'warn',
        });
      }
    } catch (err) {
      toast.show({
        title: err instanceof PushSetupError ? err.message : 'Não deu para ativar os avisos.',
        kind: 'late',
      });
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <Sheet open onClose={close} title="Avisos da viagem" description={trip.name}>
      <ul className="grid gap-3 mv-text-16">
        <li className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <BellRing className="size-5" aria-hidden="true" />
          </span>
          <span>
            <b>"Sair em 15 min"</b> e <b>"hora de sair"</b>, com o tempo de estrada.
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <Clock3 className="size-5" aria-hidden="true" />
          </span>
          <span>Briefing às 7h e um lembrete quando uma parada vai fechar.</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <LockKeyhole className="size-5" aria-hidden="true" />
          </span>
          <span>Chegam com o celular bloqueado e sem o app aberto.</span>
        </li>
      </ul>
      <Button loading={busy} onClick={() => void activate()}>
        Ativar avisos
      </Button>
      <Button variant="ghost" size="md" disabled={busy} onClick={close}>
        Agora não
      </Button>
    </Sheet>
  );
}

/**
 * No iPhone fora da Tela de Início, a oferta dos avisos é o cartão de instalação, com a frase que
 * liga as duas coisas: os avisos só chegam com o app instalado. É um cartão em linha: quem o põe
 * escolhe onde (em Detalhes, no corpo; na tela da viagem, no lugar do cartão da vez, sobre a maquete).
 */
export function PushInstallCard({ trip }: Props) {
  const offer = usePushOffer(trip);
  if (offer?.status !== 'not-installed') return null;
  return (
    <InstallCard
      lead="No iPhone, os avisos de hora de sair só chegam com o Viajei na Tela de Início. Instale primeiro; depois é um toque para ativar."
      onDismiss={offer.close}
    />
  );
}
