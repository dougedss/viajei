/// <reference lib="webworker" />
// Variáveis do Vite dentro do service worker (o vite-plugin-pwa constrói o sw.ts com o mesmo `define`).
// Só o projeto do worker (tsconfig.sw.json) vê este arquivo; o app usa src/vite-env.d.ts.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
