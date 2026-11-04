import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// React Compiler pelo caminho estável (babel-plugin-react-compiler 1.0). O compilador em Rust do
// plugin-react ainda é experimental; quando sair da fase experimental, basta trocar por `react({ compiler: true })`.
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    // PWA com service worker próprio (src/sw.ts): precache da casca, navegação offline e, na fase 4, push.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      pwaAssets: { config: true, injectThemeColor: false },
      manifest: {
        id: '/',
        name: 'Viajei',
        short_name: 'Viajei',
        description: 'Seu roteiro de viagem, inteiro, mesmo sem sinal.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F4F2',
        theme_color: '#F4F4F2',
        categories: ['travel', 'navigation'],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  // O scanner de dependências só olha a entrada do app. Por padrão ele varre todo *.html da raiz,
  // inclusive docs/prototipo-3d.html (three via CDN): a varredura falhava e desligava o pré-bundling,
  // e em dev cada dependência era descoberta em tempo de execução, com recarregamentos em série.
  optimizeDeps: { entries: ['index.html'] },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
