/**
 * Formatação de duração compartilhada entre o client e as Edge Functions (o texto dos avisos
 * nasce no servidor, em `notifications.ts`, e o "Agora" usa a mesma função).
 */

/** "6h30", "1h", "35 min", "0 min". Negativos ganham o sinal. */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m} min`;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h${String(m).padStart(2, '0')}`;
}
