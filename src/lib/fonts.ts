import { useEffect, useState } from 'react';

/**
 * As fontes do app (Barlow e Barlow Condensed, self-hosted) carregadas **antes** da primeira tela com
 * texto de quem entrou (fase 27, a 3.0). O Lighthouse do laboratório mostrou o CLS da `nova_viagem`
 * em 0,136 (D281) e o relatório inteiro disse a causa: "Web font loaded", três vezes, no cartão da
 * pergunta (run 45019395883). As fontes só começavam a baixar quando o primeiro texto era pintado
 * (a tela de espera não tem texto), então a tela aparecia na fonte do sistema e trocava um instante
 * depois, empurrando o que já estava na tela. Aqui o carregamento começa junto com o app (`loadFonts`,
 * no `main.tsx`) e a casca de quem entrou espera as fontes prontas (`useFontsReady`), com um teto curto
 * para nunca segurar a tela por uma fonte que não vem. Com o service worker, elas vêm do precache em
 * milissegundos.
 */
export const FONT_FACES: readonly string[] = [
  '400 16px Barlow',
  '500 16px Barlow',
  '600 16px Barlow',
  '700 16px Barlow',
  '500 16px "Barlow Condensed"',
  '600 16px "Barlow Condensed"',
  '700 16px "Barlow Condensed"',
];
/** Mais que isto, a tela segue sem esperar: uma fonte que não vem não pode segurar o app. */
export const FONTS_TIMEOUT_MS = 2_000;

type FontSet = Pick<FontFaceSet, 'load'>;

let pending: Promise<boolean> | null = null;
let settled = false;

/**
 * Pede o carregamento de todas as faces e resolve quando todas chegaram (`true`) ou quando o teto
 * passou (`false`). Uma vez só: as chamadas seguintes recebem a mesma promessa. Sem `document.fonts`
 * (um navegador antigo, o ambiente de teste), resolve na hora.
 */
export function loadFonts(
  fonts: FontSet | undefined = typeof document === 'undefined' ? undefined : document.fonts,
  timeoutMs = FONTS_TIMEOUT_MS,
): Promise<boolean> {
  if (pending) return pending;
  if (!fonts) {
    settled = true;
    pending = Promise.resolve(true);
    return pending;
  }
  const all = Promise.all(FONT_FACES.map((face) => fonts.load(face))).then(
    () => true,
    () => false,
  );
  const limit = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  pending = Promise.race([all, limit]).finally(() => {
    settled = true;
  });
  return pending;
}

/** As fontes já foram esperadas uma vez neste carregamento do app? */
export const fontsSettled = (): boolean => settled;

/** Só para os testes: volta ao estado de antes do primeiro `loadFonts`. */
export function resetFontsForTests(): void {
  pending = null;
  settled = false;
}

/** `true` quando as fontes estão prontas (ou o teto passou); a casca espera por isto antes do texto. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(settled);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadFonts().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}
