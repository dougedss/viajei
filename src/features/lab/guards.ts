/**
 * As guardas que rodam dentro do navegador, como texto (a suíte e2e e o laboratório as avaliam com
 * `page.evaluate`; os dois projetos não têm a lib DOM no tsconfig). Puras: nenhuma depende do app.
 * Moram aqui, ao lado dos cenários do laboratório, para a mesma regra valer na CI (todas as rotas,
 * com a viagem de teste) e todo dia na produção (as telas do lab-a).
 */

/**
 * Nenhuma tela rola para o lado (WCAG 1.4.10). Se a página é mais larga que a janela, devolve uma
 * linha com a largura e os primeiros elementos que passam da borda direita (o pai ainda cabe), fora
 * dos que estão dentro de uma faixa com rolagem própria (os chips dos dias, de propósito). Vazio
 * quando está tudo certo. Fase 12 (D161), estendida na 13: o texto que vem das pessoas (um link, um
 * código, um endereço colado) e a largura de 360 px dos Android menores.
 */
export const ROLAGEM_LATERAL = `(() => {
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth <= vw + 1) return [];
  const out = [];
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 || !r.width) continue;
    const parent = el.parentElement;
    if (parent && parent !== document.body && parent.getBoundingClientRect().right > vw + 1) continue;
    if (clipped(el)) continue;
    const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
    out.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' até ' + Math.round(r.right) + ' px');
    if (out.length === 4) break;
  }
  return ['página com ' + document.documentElement.scrollWidth + ' px em ' + vw + ' px: ' + out.join(' | ')];
})()`;

/** A largura dos Android menores: a guarda roda também nela, além da do iPhone 15 (393 px). */
export const LARGURA_ESTREITA = 360;
