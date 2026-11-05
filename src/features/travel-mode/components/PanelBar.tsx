import { Gauge, Power, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import type { Panel } from '../panel.ts';

/** O botão que liga o modo painel (só durante a viagem). Ligado, quem desliga é a barra. */
export function PanelToggle({ panel }: { panel: Panel }) {
  if (!panel.supported || panel.on) return null;
  return (
    <Button variant="secondary" size="md" onClick={panel.toggle}>
      <Gauge className="size-5" aria-hidden="true" />
      Modo painel
    </Button>
  );
}

/**
 * Barra fixa do modo painel: diz o que está rodando (tela ligada, GPS, trilha) e tem o "Desligar"
 * grande, para um toque sem olhar. Sem animação: respeita quem dirige e prefers-reduced-motion.
 */
export function PanelBar({ panel }: { panel: Panel }) {
  if (!panel.on) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 bg-night px-4 pt-3 safe-x pb-[max(14px,env(safe-area-inset-bottom,0px))] text-hud-ink shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.5)]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-lane">
          <Satellite className="size-5" aria-hidden="true" />
        </span>
        <span className="grid min-w-0">
          <span className="font-num text-[19px] leading-tight font-semibold">Painel ligado</span>
          <span className="truncate text-[14px] text-hud-muted">
            {panel.lowPower
              ? 'Parado · GPS econômico · trilha gravada'
              : 'Tela acesa · GPS · gravando trilha'}
          </span>
        </span>
      </span>
      <Button
        variant="primary"
        size="lg"
        className="min-h-14 shrink-0 px-6"
        onClick={panel.toggle}
        aria-label="Desligar o modo painel"
      >
        <Power className="size-6" aria-hidden="true" />
        Desligar
      </Button>
    </div>
  );
}
