import { defineConfig, devices } from '@playwright/test';

// Viewport de celular, contra o Supabase local (seed.sql: dono, convidado, intruso). Dois alvos:
// `iphone` usa o Vite de dev (sem service worker, D22); `pwa` usa o build servido pelo
// `vite preview`, com o service worker de verdade, para os testes que recarregam sem rede (a casca
// vem do precache e os dados e arquivos, do IndexedDB). O `pwa` precisa de `pnpm build` antes; na CI
// o build é o passo anterior.
const iphone = { ...devices['iPhone 15'], defaultBrowserType: 'chromium' as const };

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
  },
  projects: [
    { name: 'iphone', testIgnore: /\.pwa\.spec\.ts$/, use: iphone },
    {
      name: 'pwa',
      testMatch: /\.pwa\.spec\.ts$/,
      use: { ...iphone, baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'allow' },
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
