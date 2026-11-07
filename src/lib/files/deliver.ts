/**
 * Entrega de um arquivo gerado no aparelho (`.ics`, `.vcf`): no celular, a folha de compartilhar
 * (o Calendário e os Contatos do iPhone abrem o arquivo por `navigator.share({ files })`); sem
 * suporte, download. Funciona offline.
 */
export type FileDelivery = 'shared' | 'downloaded' | 'cancelled';

// a lib do TS declara Web Share como obrigatório; nem todo navegador o tem
type ShareNavigator = Partial<Pick<Navigator, 'canShare' | 'share'>>;

export async function deliverFile(
  text: string,
  filename: string,
  mime: string,
  title: string,
): Promise<FileDelivery> {
  const file = new File([text], filename, { type: mime });
  const nav: ShareNavigator = navigator;
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // sem a folha (ex.: tipo não aceito): cai no download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
