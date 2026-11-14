import { BellOff, BellRing } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { InstallCard } from '@/features/pwa/components/InstallCard.tsx';
import { isIOS } from '@/lib/pwa/install.ts';
import { cx } from '@/lib/cx.ts';
import { PushSetupError, subscribePush, unsubscribePush, usePushStatus } from '../subscription.ts';

/**
 * A permissão de avisos deste aparelho (fase 4; desde a fase 16 no Perfil, em "Avisos neste
 * aparelho"): o estado, o caminho para reativar quando o navegador bloqueou, e o botão de ativar ou
 * desligar. Vale para todas as viagens: é do aparelho, não da viagem.
 */
const STATUS_LABEL = {
  subscribed: 'Avisos ligados',
  granted: 'Avisos desligados',
  default: 'Avisos desligados',
  denied: 'Avisos bloqueados',
  'not-installed': 'Instale para receber avisos',
  unsupported: 'Indisponível neste navegador',
} as const;

export function DevicePush({ uid }: { uid: string }) {
  const push = usePushStatus();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ios = isIOS();

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show({ title: ok, kind: 'ok' });
    } catch (err) {
      toast.show({
        title: err instanceof PushSetupError ? err.message : 'Não deu certo. Tente de novo.',
        kind: 'late',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!push.checked) return null;
  const on = push.status === 'subscribed';
  return push.status === 'not-installed' ? (
    <InstallCard
      lead="No iPhone, os avisos só chegam com o Viajei na Tela de Início. Instale e volte aqui para ativar."
      persistent
    />
  ) : (
    <Card className="grid gap-3">
      <p className="flex items-center gap-3 text-[17px] font-semibold">
        <span
          className={cx(
            'grid size-10 shrink-0 place-items-center rounded-full',
            on ? 'bg-on-time/15 text-on-time-ink' : 'bg-accent-soft text-accent-ink',
          )}
        >
          {on ? (
            <BellRing className="size-5" aria-hidden="true" />
          ) : (
            <BellOff className="size-5" aria-hidden="true" />
          )}
        </span>
        <span>
          {STATUS_LABEL[push.status]}
          <span className="block text-[14px] font-normal text-ink-2">
            {ios
              ? 'iPhone'
              : navigator.userAgent.includes('Android')
                ? 'Android'
                : 'Este navegador'}
          </span>
        </span>
      </p>
      {push.status === 'denied' ? (
        <p className="text-[15px] text-ink-2">
          {ios
            ? 'Para reativar: Ajustes → Notificações → Viajei → Permitir notificações.'
            : 'Para reativar: toque no cadeado ao lado do endereço → Notificações → Permitir.'}{' '}
          Enquanto isso, o calendário abaixo avisa 15 min antes de cada saída.
        </p>
      ) : null}
      {push.status === 'unsupported' ? (
        <p className="text-[15px] text-ink-2">
          Este navegador não recebe avisos. Use o calendário abaixo: ele avisa 15 min antes de cada
          saída.
        </p>
      ) : null}
      {on ? (
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          onClick={() => void run(unsubscribePush, 'Avisos desligados neste aparelho')}
        >
          Desligar neste aparelho
        </Button>
      ) : push.status === 'default' || push.status === 'granted' ? (
        <Button
          size="md"
          loading={busy}
          onClick={() => void run(() => subscribePush(uid), 'Avisos ativados')}
        >
          <BellRing className="size-5" aria-hidden="true" />
          Ativar avisos
        </Button>
      ) : null}
    </Card>
  );
}
