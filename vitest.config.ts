import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      {
        find: '@shared',
        replacement: fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      },
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: [
      'src/**/*.test.{ts,tsx}',
      'supabase/functions/_shared/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/features/**/rules.ts', 'supabase/functions/_shared/**'],
    },
  },
});
