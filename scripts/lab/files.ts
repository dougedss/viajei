import { makePng } from '../../e2e/helpers/images.ts';

export { makePng };

/**
 * Um PDF de uma página, válido e mínimo, montado na hora (sem arquivo no repositório): só desenho
 * (retângulos e uma linha), sem fonte, para o pdf.js renderizar sem buscar nada. As posições da
 * tabela xref são contadas em bytes, como a especificação pede.
 */
export function makePdf(): Buffer {
  const content = [
    '0.91 0.40 0.23 rg 60 640 475 140 re f',
    '0.12 0.60 0.40 rg 60 460 300 120 re f',
    '0 0 0 RG 6 w 60 400 m 535 400 l S',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  const entry = (n: number) => `${String(n).padStart(10, '0')} 00000 n \n`;
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(entry).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
