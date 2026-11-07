import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, type ReactNode } from 'react';
import { changeOpenSheets } from './sheet-stack.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /**
   * A folha de comemoração (fase 9) não conta como "outra folha aberta": ela é quem espera as outras
   * fecharem para aparecer.
   */
  celebration?: boolean;
  children: ReactNode;
};

/** Folha de baixo: a folha de memória, confirmações e formulários curtos. Esc e toque no fundo fecham. */
export function Sheet({ open, onClose, title, description, celebration = false, children }: Props) {
  const titleId = useId();
  useEffect(() => {
    if (!open || celebration) return;
    changeOpenSheets(1);
    return () => changeOpenSheets(-1);
  }, [open, celebration]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[rgb(8_12_24/0.4)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-0 z-50 grid gap-4 rounded-t-[28px] bg-card pt-3 safe-x pb-[max(22px,env(safe-area-inset-bottom,0px))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <span className="mx-auto h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
            <h2 id={titleId} className="font-num text-[24px] leading-tight font-semibold">
              {title}
            </h2>
            {description ? <p className="-mt-2 text-[15px] text-ink-2">{description}</p> : null}
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
