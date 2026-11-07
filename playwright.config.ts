import { defineConfig, devices } from '@playwright/test';

// Viewport de celular, contra o Supabase local (seed.sql: dono, convidado, intruso). Dois alvos:
// `iphone` usa o Vite de dev (sem service worker, D22); `pwa` usa o build servido pelo
// `vite preview`, com o service worker de verdade, para os testes que recarregam sem rede (a casca
// vem do precache e os dados e arquivos, do IndexedDB). O `pwa` precisa de `pnpm build` antes; na CI
// o build é o passo anterior.
const iphone = { ...devices['iPhone 15'], defaultBrowserType: 'chromium' as const };

/**
 * Os cartões de conquista (fase 9) começam desligados em todo teste: os usuários do seed são os
 * mesmos em testes paralelos, e um cartão que chega de outro teste cobriria um botão. Os testes da
 * progressão ligam de volta (`e2e/helpers/celebrations.ts`).
 */
const quiet = (origin: string) => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: 'viajei:celebrations', value: 'off' }] }],
});

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Nenhum teste pede tile ao OSM nem previsão ao Open-Meteo de verdade (fase 11): no navegador
    // inteiro, inclusive nos contextos criados à mão e no service worker, os dois nem resolvem. Os
    // testes do mapa e do clima fingem os dois com `context.route` (e2e/helpers/world.ts).
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP tile.openstreetmap.org ~NOTFOUND, MAP api.open-meteo.com ~NOTFOUND',
      ],
    },
  },
  projects: [
    {
      name: 'iphone',
      testIgnore: /\.pwa\.spec\.ts$/,
      use: { ...iphone, storageState: quiet('http://127.0.0.1:5173') },
    },
    {
      name: 'pwa',
      testMatch: /\.pwa\.spec\.ts$/,
      use: {
        ...iphone,
        baseURL: 'http://127.0.0.1:4173',
        serviceWorkers: 'allow',
        storageState: quiet('http://127.0.0.1:4173'),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm preview --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
