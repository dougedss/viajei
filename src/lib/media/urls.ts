/**
 * Uma URL de objeto por anexo durante a sessão. O arquivo é imutável, então a URL vale enquanto o
 * Blob existir; o mesmo id passa da fila de envio para o cache sem trocar de URL (a foto não pisca).
 * As mais antigas são revogadas acima do limite; um Blob despejado ou apagado revoga a dele.
 */
const LIMIT = 300;
const urls = new Map<string, string>();

export function blobUrl(id: string, blob: Blob): string {
  const hit = urls.get(id);
  if (hit) {
    // reordena: a usada agora fica por último
    urls.delete(id);
    urls.set(id, hit);
    return hit;
  }
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  if (urls.size > LIMIT) {
    const [oldest] = urls.keys();
    if (oldest !== undefined) dropUrl(oldest);
  }
  return url;
}

export function dropUrl(id: string): void {
  const url = urls.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  urls.delete(id);
}
