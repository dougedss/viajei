import type { ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from './layouts/AppLayout.tsx';
import { AuthLayout } from './layouts/AuthLayout.tsx';
import { NotFound } from './NotFound.tsx';
import { RequireSession } from './RequireSession.tsx';
import { RouteError } from './RouteError.tsx';
import { Splash } from './Splash.tsx';

/** Rotas lazy em português: cada tela só baixa quando é aberta. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
});

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    HydrateFallback: Splash,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/entrar', lazy: page(() => import('@/features/auth/routes/EntrarPage.tsx')) },
          {
            path: '/criar-conta',
            lazy: page(() => import('@/features/auth/routes/CriarContaPage.tsx')),
          },
          {
            path: '/recuperar-senha',
            lazy: page(() => import('@/features/auth/routes/RecuperarSenhaPage.tsx')),
          },
          {
            path: '/nova-senha',
            lazy: page(() => import('@/features/auth/routes/NovaSenhaPage.tsx')),
          },
        ],
      },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', lazy: page(() => import('@/features/trips/routes/HomePage.tsx')) },
              {
                path: '/perfil',
                lazy: page(() => import('@/features/profile/routes/PerfilPage.tsx')),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
