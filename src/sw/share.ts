/// <reference lib="webworker" />
import { parseShareForm, SHARE_PATH } from '@/features/reservations/share/parse.ts';
import { db } from '@/lib/db/schema.ts';

/**
 * O `share_target` do manifest (fase 18): o Android manda o conteúdo compartilhado num POST
 * `multipart/form-data` para `/compartilhado`, que só o service worker vê. Ele guarda o que chegou no
 * Dexie (`shares`, só neste aparelho) e responde um redirecionamento 303 para a tela, que pergunta de
 * qual viagem é e cai em "Ler a confirmação" com o texto e o arquivo já no lugar. Sem conteúdo
 * aproveitável, a tela diz isso.
 */
export async function handleShareTarget(request: Request): Promise<Response> {
  const id = crypto.randomUUID();
  try {
    const share = parseShareForm(await request.formData());
    if (
      share.title === null &&
      share.text === null &&
      share.url === null &&
      share.files.length === 0
    ) {
      return Response.redirect(new URL(`${SHARE_PATH}?vazio=1`, request.url).href, 303);
    }
    await db.shares.put({
      id,
      title: share.title,
      text: share.text,
      url: share.url,
      files: share.files.map((f) => ({ name: f.name, type: f.type, blob: f })),
      created_at: new Date().toISOString(),
    });
    return Response.redirect(new URL(`${SHARE_PATH}?id=${id}`, request.url).href, 303);
  } catch {
    return Response.redirect(new URL(`${SHARE_PATH}?erro=1`, request.url).href, 303);
  }
}
