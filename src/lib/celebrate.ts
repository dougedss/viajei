/**
 * Confete e vibração do Chegamos!, por cima de tudo, em HTML. `canvas-confetti` entra por import
 * dinâmico (só baixa na primeira festa) e nada roda sob `prefers-reduced-motion`.
 */
export const CONFETTI_COLORS = ['#E8653A', '#E9C24A', '#1F9A66', '#3B8BD6', '#F1EEE7'];

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Vibração curta onde existir (Android); silenciosa onde não. */
export function vibrate(pattern: number | number[] = 30): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* sem vibração neste aparelho */
  }
}

export async function confettiBurst(originY = 0.75): Promise<void> {
  if (prefersReducedMotion()) return;
  const { default: confetti } = await import('canvas-confetti');
  await confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 38,
    origin: { y: originY },
    colors: CONFETTI_COLORS,
    disableForReducedMotion: true,
  });
}

/** A festa do Chegamos!: confete e vibração, nada sob reduzir movimento. */
export function celebrateArrival(): void {
  if (prefersReducedMotion()) return;
  vibrate([30, 40, 30]);
  void confettiBurst().catch(() => undefined);
}
