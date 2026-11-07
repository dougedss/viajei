import type { BrowserContext } from '@playwright/test';

/** Liga os cartões de conquista neste contexto (o padrão dos testes é desligado: playwright.config). */
export async function comCartoes(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem('viajei:celebrations', 'on');
  });
}
