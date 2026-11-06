import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Os .wasm do pdf.js (JPEG 2000, JBIG2 e perfis de cor dentro de PDFs) num caminho fixo,
// `/pdfjs/wasm/`, que o pdf.js monta sozinho a partir do `wasmUrl`: emitidos no build (e por isso
// no precache do service worker, para o PDF da reserva abrir sem sinal) e servidos em dev.
const PDFJS_WASM = ['openjpeg.wasm', 'jbig2.wasm', 'qcms_bg.wasm'];
function pdfjsWasm(): Plugin {
  const dir = fileURLToPath(new URL('./node_modules/pdfjs-dist/wasm/', import.meta.url));
  return {
    name: 'viajei:pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/pdfjs/wasm/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        if (!PDFJS_WASM.includes(name)) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/wasm');
        createReadStream(join(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of PDFJS_WASM) {
        this.emitFile({
          type: 'asset',
          fileName: `pdfjs/wasm/${name}`,
          source: readFileSync(join(dir, name)),
        });
      }
    },
  };
}

// React Compiler pelo caminho estável (babel-plugin-react-compiler 1.0). O compilador em Rust do
// plugin-react ainda é experimental; quando sair da fase experimental, basta trocar por `react({ compiler: true })`.
export default defineConfig({
  plugins: [
    pdfjsWasm(),
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
        // mjs e wasm: o worker e os módulos do pdf.js, para o PDF da reserva abrir sem sinal
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      {
        find: '@shared',
        replacement: fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      },
      // O R3F e os addons do three importam 'three'. O único three do bundle é o build WebGPU
      // (`three/webgpu`, que traz o backend WebGL2 dentro); sem o alias, o build clássico com o
      // WebGLRenderer entraria junto, repetido, só para ninguém usar.
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // O 3D (three, R3F) vive num chunk próprio, carregado só quando o Modo Viagem desenha a
        // maquete (`lazy()`); o nome fixo deixa medir o tamanho e a fase 6 reaproveitar.
        codeSplitting: {
          // só o que casa com o teste entra no grupo: com as dependências recursivas, o React
          // inteiro ia junto e todo chunk do app passava a importar o three
          includeDependenciesRecursively: false,
          groups: [{ name: 'three', test: /node_modules[\\/](three|@react-three)[\\/]/ }],
        },
      },
    },
  },
  // O scanner de dependências só olha a entrada do app. Por padrão ele varre todo *.html da raiz,
  // inclusive docs/prototipo-3d.html (three via CDN): a varredura falhava e desligava o pré-bundling,
  // e em dev cada dependência era descoberta em tempo de execução, com recarregamentos em série.
  optimizeDeps: { entries: ['index.html'] },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
