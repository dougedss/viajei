import type { Page } from '@playwright/test';

/**
 * A resposta à pergunta de posição do app (D48), já dada neste aparelho, gravada no Dexie como o mapa
 * grava (`sync_state`): `granted` é "Usar posição"; `declined` é "Agora não" (vale 24 h). Com uma das
 * duas, a conversa (fase 25, D271) não mostra o cartão de consentimento.
 */
export async function posicaoDecidida(page: Page, decision: 'granted' | 'declined'): Promise<void> {
  const entry =
    decision === 'granted'
      ? { key: 'geo:asked', value: 'granted' }
      : { key: 'geo:declined-at', value: String(Date.now()) };
  await page.evaluate(`new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('sync_state', 'readwrite');
      tx.objectStore('sync_state').put(${JSON.stringify(entry)});
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    };
  })`);
}
