import { CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { ToastInput, ToastKind } from './toast-context.ts';

export type ToastItem = ToastInput & { id: number };

const ICONS: Record<ToastKind, typeof Info> = {
  ok: CircleCheckBig,
  info: Info,
  warn: TriangleAlert,
  late: TriangleAlert,
};
const COLORS: Record<ToastKind, string> = {
  ok: 'text-[#5BD39A]',
  info: 'text-accent-ink',
  warn: 'text-tight',
  late: 'text-late',
};

/**
 * Os avisos em si, animados. Mora num chunk próprio, carregado no primeiro aviso: o `motion` não
 * entra no primeiro carregamento de nenhuma tela (o Lighthouse do celular sente cada KB ali).
 */
export default function ToastStack({
  items,
  dismiss,
}: {
  items: readonly ToastItem[];
  dismiss: (id: number) => void;
}) {
  return (
    // com reduzir movimento no sistema, o motion não desliza nem escala: só o fade
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {items.map((t) => {
          const kind = t.kind ?? 'info';
          const Icon = ICONS[kind];
          return (
            <motion.div
              key={t.id}
              role="status"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[16px] bg-night px-4 py-3 mv-text-15 text-hud-ink shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
            >
              <Icon className={`size-5 shrink-0 ${COLORS[kind]}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{t.title}</b>
                {t.description ? (
                  <span className="block text-hud-muted">{t.description}</span>
                ) : null}
              </span>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="min-h-12 rounded-[10px] bg-white/10 px-3 font-semibold text-accent-ink"
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => dismiss(t.id)}
                className="grid size-12 place-items-center rounded-full text-hud-muted"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </MotionConfig>
  );
}
