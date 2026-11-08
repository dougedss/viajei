import type { Page } from '@playwright/test';

/**
 * A folha aberta está por cima do que há embaixo dela? Para cada ponto de prova (o centro do título,
 * o centro do corpo e o centro de cada pino do mapa que cai dentro da folha), o elemento que o
 * `elementFromPoint` devolve tem de pertencer ao `dialog`. Foi assim que o mapa por cima da folha
 * apareceu (fase 13): os pinos do Leaflet, com z-index 600 e mais, venciam a folha (z-50) porque a
 * caixa do mapa não criava contexto de empilhamento. O `elementFromPoint` só enxerga a área visível
 * (D165); a folha é fixa no fundo da tela, então está sempre nela.
 */
const FOLHA_POR_CIMA = `(() => {
  const dialog = document.querySelector('[role=dialog]');
  if (!dialog) return ['sem folha aberta'];
  const d = dialog.getBoundingClientRect();
  const inside = (x, y) => x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
  const points = [];
  const title = dialog.querySelector('h2');
  if (title) {
    const r = title.getBoundingClientRect();
    points.push(['título', r.left + r.width / 2, r.top + r.height / 2]);
  }
  const body = dialog.querySelector('[data-stop-sheet]');
  if (body) {
    const r = body.getBoundingClientRect();
    points.push(['corpo', r.left + r.width / 2, r.top + r.height / 2]);
  }
  for (const pin of document.querySelectorAll('[data-map-pin]')) {
    const r = pin.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (r.width && inside(x, y)) points.push(['pino ' + pin.getAttribute('data-map-pin'), x, y]);
  }
  const out = [];
  for (const [what, x, y] of points) {
    const el = document.elementFromPoint(x, y);
    if (!el || !dialog.contains(el)) {
      const cls = el && typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : '';
      out.push(what + ' coberto por ' + (el ? el.tagName.toLowerCase() + (cls ? '.' + cls : '') : 'nada'));
    }
  }
  return out;
})()`;

/** Os pontos da folha aberta que algo cobre; vazio quando a folha está por cima de tudo. */
export function folhaCoberta(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(FOLHA_POR_CIMA);
}
