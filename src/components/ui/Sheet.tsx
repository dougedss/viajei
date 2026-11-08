import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from 'react';
import { changeOpenSheets } from './sheet-stack.ts';

/**
 * O desenho animado (o `motion`) num chunk próprio: as telas que têm uma folha fechada (o chip de
 * pendências do cabeçalho está em todas) não o baixam no primeiro carregamento (D162).
 */
const loadFrame = () => import('./SheetFrame.tsx');
const SheetFrame = lazy(loadFrame);
// em produção, o service worker já guardou o chunk (precache) e a folha abre sem rede; no dev, sem
// service worker, ele é pedido logo, para uma folha aberta sem sinal se comportar como no app
if (import.meta.env.DEV) void loadFrame();

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
  // depois da primeira abertura, a moldura fica montada: é ela que anima a saída (o estado guarda
  // o que já aconteceu, como na documentação do React: "storing information from previous renders")
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
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

  if (!open && !opened) return null;
  return (
    <Suspense fallback={null}>
      <SheetFrame
        open={open}
        onClose={onClose}
        titleId={titleId}
        title={title}
        description={description}
      >
        {children}
      </SheetFrame>
    </Suspense>
  );
}
