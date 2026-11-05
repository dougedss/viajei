import { db } from '@/lib/db/schema.ts';
import { askKeys } from './ask.ts';

/**
 * "Nunca na primeira abertura do app": na primeira vez que o app abre neste aparelho, grava a marca
 * e lembra, nesta sessão, que foi a primeira. A folha de avisos só aparece a partir da abertura seguinte.
 */
let firstOpen = false;
let checked: Promise<void> | null = null;

export function markFirstOpen(): Promise<void> {
  checked ??= (async () => {
    const seen = await db.sync_state.get(askKeys.firstOpen);
    if (seen) return;
    firstOpen = true;
    await db.sync_state.put({ key: askKeys.firstOpen, value: new Date().toISOString() });
  })();
  return checked;
}

export function isFirstOpenSession(): boolean {
  return firstOpen;
}
