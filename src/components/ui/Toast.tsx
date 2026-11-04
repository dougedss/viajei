import { CircleCheckBig, Info, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastInput, type ToastKind } from './toast-context.ts';

type Item = ToastInput & { id: number };
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

/** Avisos curtos, no rodapé, com ação opcional ("Desfazer"). No máximo três de cada vez. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...toast, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toast.duration ?? 4000),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom,0px))]"
        aria-live="polite"
      >
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
                className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[16px] bg-night px-4 py-3 text-[15px] text-hud-ink shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
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
                    className="min-h-9 rounded-[10px] bg-white/10 px-3 font-semibold text-accent-ink"
                  >
                    {t.action.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => dismiss(t.id)}
                  className="grid size-9 place-items-center rounded-full text-hud-muted"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}
