import { lazy, Suspense, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastInput } from './toast-context.ts';
import type { ToastItem } from './ToastStack.tsx';

const loadStack = () => import('./ToastStack.tsx');
const ToastStack = lazy(loadStack);
// como a folha (Sheet.tsx): no dev, sem o precache do service worker, o chunk é pedido logo
if (import.meta.env.DEV) void loadStack();

/**
 * Avisos curtos, no rodapé, com ação opcional ("Desfazer"). No máximo três de cada vez. A região
 * `aria-live` existe desde o começo (o leitor de tela só anuncia mudanças numa região que já estava
 * na página); os avisos animados entram no primeiro aviso, num chunk próprio.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [started, setStarted] = useState(false);
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
      setStarted(true);
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
        {started ? (
          <Suspense fallback={null}>
            <ToastStack items={items} dismiss={dismiss} />
          </Suspense>
        ) : null}
      </div>
    </ToastContext>
  );
}
