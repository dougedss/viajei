// primeiro: os schemas do Zod nascem depois desta configuração
import './zod-config.ts';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@/styles/app.css';

import { startTransition, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Providers } from './providers.tsx';
import { router } from './router.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('index.html sem #root');

// a primeira renderização numa transição: o React a faz em fatias e devolve a vez ao navegador entre
// elas, em vez de uma tarefa longa só (no celular lento, o toque nos primeiros instantes responde)
const app = createRoot(root);
startTransition(() => {
  app.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
});
