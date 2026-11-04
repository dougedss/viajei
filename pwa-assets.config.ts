import { defineConfig } from '@vite-pwa/assets-generator/config';

/**
 * Ícones do PWA gerados no build a partir do favicon.svg (nada rasterizado é commitado).
 * `any`: o quadrado arredondado como está. `maskable` e Apple: o mesmo desenho com a margem de
 * segurança e o fundo noite por trás, para a máscara do Android e os cantos do iOS não cortarem o V.
 */
export default defineConfig({
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0 },
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: '#141A26' } },
    apple: { sizes: [180], padding: 0.12, resizeOptions: { background: '#141A26' } },
  },
  images: ['public/favicon.svg'],
});
