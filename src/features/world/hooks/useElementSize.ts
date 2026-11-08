import { useEffect, useState } from 'react';

export type ElementSize = { width: number; height: number };

/**
 * Largura e altura de um elemento, em px CSS, pelo ResizeObserver; zero até a primeira medida.
 * `observe` vai no `ref` do elemento: a medida começa quando ele entra na tela, mesmo que o primeiro
 * render tenha sido um esqueleto sem ele (um `useRef` lido num efeito de montagem ficava em zero para
 * sempre nesse caso, e a lista do dia corria por baixo da barra do "Agora"). A caixa é a inteira,
 * com o padding: é o que ela cobre na tela.
 */
export function useElementSize(): [observe: (el: HTMLElement | null) => void, size: ElementSize] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const box = el.getBoundingClientRect();
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}
