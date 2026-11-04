import { Share, SquarePlus, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { dismissInstall, install, installDismissed, useInstall } from '@/lib/pwa/install.ts';

/**
 * Convite para instalar, na tela inicial. Android: abre o pedido nativo. iPhone: folha com os dois
 * toques. Some quando já está instalado ou por 7 dias quando a pessoa dispensa.
 */
export function InstallCard() {
  const { installed, canPrompt, ios } = useInstall();
  const [dismissed, setDismissed] = useState(() => installDismissed());
  const [sheet, setSheet] = useState(false);
  const toast = useToast();

  if (installed || dismissed || (!canPrompt && !ios)) return null;

  const dismiss = () => {
    dismissInstall();
    setDismissed(true);
  };

  return (
    <section
      aria-label="Instalar o Viajei"
      className="relative grid gap-3 rounded-card bg-night px-5 py-4 text-hud-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]"
    >
      <button
        type="button"
        aria-label="Agora não"
        onClick={dismiss}
        className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-hud-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-lane">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="grid gap-0.5">
          <p className="font-num text-[20px] leading-tight font-semibold">
            Leve o Viajei na tela de início
          </p>
          <p className="text-[14px] text-hud-muted">
            Instalado, ele abre sem sinal, guarda a viagem com segurança e recebe os avisos de hora
            de sair.
          </p>
        </div>
      </div>
      <Button
        size="md"
        onClick={() => {
          if (ios) {
            setSheet(true);
            return;
          }
          void install.prompt().then((outcome) => {
            if (outcome === 'accepted') toast.show({ title: 'Viajei instalado', kind: 'ok' });
          });
        }}
      >
        {ios ? 'Como instalar' : 'Instalar o Viajei'}
      </Button>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Adicionar à Tela de Início"
        description="No Safari, são dois toques."
      >
        <ol className="grid gap-3 text-[16px]">
          <li className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
              <Share className="size-5" aria-hidden="true" />
            </span>
            <span>
              Toque em <b>Compartilhar</b>, na barra de baixo.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
              <SquarePlus className="size-5" aria-hidden="true" />
            </span>
            <span>
              Escolha <b>Adicionar à Tela de Início</b> e confirme.
            </span>
          </li>
        </ol>
        <Button variant="secondary" onClick={() => setSheet(false)}>
          Entendi
        </Button>
      </Sheet>
    </section>
  );
}
