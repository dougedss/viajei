import { MEDIA } from '@shared/constants.ts';

/**
 * O que chega pelo Compartilhar do Android (fase 18): o `share_target` do manifest manda um POST
 * `multipart/form-data` com `title`, `text`, `url` e `files` para o service worker, que guarda tudo
 * no aparelho e abre a tela. Puro: a leitura do formulário e o texto que vai para a leitura. Só imagem
 * e PDF entram (o que o bucket aceita, D77), até 10 arquivos de até 10 MB; o resto é descartado.
 */
export const SHARE_PATH = '/compartilhado';
export const SHARE_MAX_FILES = 10;

export type ParsedShare = {
  title: string | null;
  text: string | null;
  url: string | null;
  files: File[];
  /** arquivos que não entraram (tipo ou tamanho) */
  dropped: number;
};

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, 30_000);
};

/** Imagem ou PDF, pelo tipo declarado ou pela extensão (o Android nem sempre manda o tipo). */
export function acceptsShared(file: Pick<File, 'type' | 'name' | 'size'>): boolean {
  if (file.size <= 0 || file.size > MEDIA.maxBytes) return false;
  const type = file.type.toLowerCase();
  if (type.startsWith('image/') || type === 'application/pdf') return true;
  return /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name);
}

export function parseShareForm(form: FormData): ParsedShare {
  const all = form.getAll('files').filter((f): f is File => f instanceof File);
  const files: File[] = [];
  let dropped = 0;
  for (const f of all) {
    if (files.length < SHARE_MAX_FILES && acceptsShared(f)) files.push(f);
    else dropped++;
  }
  return {
    title: text(form.get('title')),
    text: text(form.get('text')),
    url: text(form.get('url')),
    files,
    dropped,
  };
}

/**
 * O texto que vai para "Ler a confirmação": o título, o texto e o link, o que houver. Um link sozinho
 * (o Compartilhar do Chrome manda só a URL) também é dado para a leitura.
 */
export function shareText(share: Pick<ParsedShare, 'title' | 'text' | 'url'>): string {
  return [share.title, share.text, share.url].filter((s): s is string => s !== null).join('\n\n');
}
