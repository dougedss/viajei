import { Share, SquarePlus, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { dismissInstall, install, installDismissed, useInstall } from '@/lib/pwa/install.ts';

/**
 * Convite para instalar, na tela inicial. Android: abre o pedido nativo. iPhone: folha com os dois
 * toques. Some quando já está instalado ou por 7 dias quando a pessoa dispensa.
 *
 * Pinta na primeira vez (fase 26, a 3.0): até a fase 27 o cartão só aparecia quando o navegador
 * disparava `beforeinstallprompt`, que chega quando o Chromium quer, às vezes depois da primeira
 * pintura, e aí o cartão entrava no topo e empurrava a lista de viagens inteira (o CLS 0,16 da lista
 * na produção, intermitente desde 18/11). Agora o cartão aparece desde o primeiro quadro em todo
 * navegador que sabe instalar (o iPhone, ou um que tenha o evento); o toque usa o pedido nativo
 * quando o navegador já o ofereceu e, senão, mostra o caminho pelo menu do navegador. Nada empurra
 * nada, e a seção não se esconde.
 */
type Props = {
  /** a frase que liga a instalação a outra coisa (ex.: os avisos, que no iPhone só chegam instalado) */
  lead?: string;
  /** não some por 7 dias ao dispensar (telas que explicam o estado, como /avisos) */
  persistent?: boolean;
  onDismiss?: () => void;
};

export function InstallCard({ lead, persistent = false, onDismiss }: Props) {
  const { installed, canPrompt, supported, ios } = useInstall();
  const [dismissed, setDismissed] = useState(() => !persistent && installDismissed());
  const [sheet, setSheet] = useState(false);
  const toast = useToast();

  if (installed || dismissed || (!supported && !canPrompt && !ios)) return null;

  const dismiss = () => {
    if (!persistent) dismissInstall();
    setDismissed(true);
    onDismiss?.();
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
        className="absolute top-1 right-1 grid size-12 place-items-center rounded-full text-hud-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-lane">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="grid gap-0.5">
          <p className="font-num mv-text-20 leading-tight font-semibold">
            Leve o Viajei na tela de início
          </p>
          <p className="mv-text-14 text-hud-muted">
            {lead ??
              'Instalado, ele abre sem sinal, guarda a viagem com segurança e recebe os avisos de hora de sair.'}
          </p>
        </div>
      </div>
      <Button
        size="md"
        data-install-prompt={canPrompt ? 'native' : 'menu'}
        onClick={() => {
          // o pedido nativo só quando o navegador já o ofereceu; senão, o caminho pelo menu
          if (ios || !canPrompt) {
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
        title={ios ? 'Adicionar à Tela de Início' : 'Instalar pelo menu do navegador'}
        description={
          ios
            ? 'No Safari, são dois toques.'
            : 'O navegador ainda não ofereceu a instalação por aqui.'
        }
      >
        {ios ? (
          <ol className="grid gap-3 mv-text-16">
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
        ) : (
          <ol className="grid gap-3 mv-text-16">
            <li className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                <Smartphone className="size-5" aria-hidden="true" />
              </span>
              <span>
                Abra o menu do navegador (os três pontos) e toque em <b>Instalar app</b> ou{' '}
                <b>Adicionar à tela inicial</b>.
              </span>
            </li>
          </ol>
        )}
        <Button variant="secondary" onClick={() => setSheet(false)}>
          Entendi
        </Button>
      </Sheet>
    </section>
  );
}
