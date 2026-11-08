import { useEffect, useState } from 'react';

/**
 * Quanto do pé do palco está coberto pelo que fica sobre a maquete (o cartão da vez, "Detalhes", o
 * "Agora"): do topo do filho mais alto que tem altura até o pé da caixa. A caixa ocupa o palco
 * inteiro e empilha de baixo para cima (`justify-end`), então não se move: um cartão que chega depois
 * dos dados entra acima de "Detalhes" sem empurrar nada (antes, a caixa presa ao pé crescia para cima
 * e o Lighthouse contava 0,12 de layout shift na tela da viagem). A lista do dia e as pílulas terminam
 * nesta altura.
 *
 * Os filhos podem trocar (o cartão da vez é um ramo por cartão): um `MutationObserver` volta a
 * observar quem estiver lá.
 */
export function useOverlayInset(): [observe: (el: HTMLElement | null) => void, inset: number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const bottom = el.getBoundingClientRect().bottom;
      let top = bottom;
      for (const child of Array.from(el.children)) {
        const box = child.getBoundingClientRect();
        if (box.height > 0) top = Math.min(top, box.top);
      }
      const next = Math.round(bottom - top);
      setInset((v) => (v === next ? v : next));
    };
    const ro = new ResizeObserver(measure);
    const observeAll = () => {
      ro.disconnect();
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    };
    observeAll();
    const mo = new MutationObserver(() => {
      observeAll();
      measure();
    });
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [el]);
  return [setEl, inset];
}
