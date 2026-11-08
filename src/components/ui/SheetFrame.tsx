import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * O desenho animado da folha: o fundo e o painel que sobe. Mora num chunk próprio, com o `motion`,
 * que só baixa quando alguma folha abre pela primeira vez (`Sheet.tsx`, D162).
 */
export default function SheetFrame({
  open,
  onClose,
  titleId,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  description: string | undefined;
  children: ReactNode;
}) {
  return (
    // com reduzir movimento no sistema, o motion não desliza nem escala: só o fade
    <MotionConfig reducedMotion="user">
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
              <h2 id={titleId} className="font-num mv-text-24 leading-tight font-semibold">
                {title}
              </h2>
              {description ? <p className="-mt-2 mv-text-15 text-ink-2">{description}</p> : null}
              {children}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
