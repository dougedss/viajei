import type { ComponentType } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from './layouts/AppLayout.tsx';
import { AuthLayout } from './layouts/AuthLayout.tsx';
import { NotFound } from './NotFound.tsx';
import { RequireSession } from './RequireSession.tsx';
import { RouteError } from './RouteError.tsx';
import { Splash } from './Splash.tsx';

/** Rotas lazy em português: cada tela só baixa quando é aberta (e fica no precache do service worker). */
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
                path: '/viagens/nova',
                lazy: page(() => import('@/features/trips/routes/NovaViagemPage.tsx')),
              },
              {
                path: '/viagens/:tripId',
                lazy: page(() => import('@/features/trips/routes/ViagemPage.tsx')),
              },
              {
                path: '/viagens/:tripId/editar',
                lazy: page(() => import('@/features/trips/routes/EditarViagemPage.tsx')),
              },
              {
                path: '/viagens/:tripId/membros',
                lazy: page(() => import('@/features/trips/routes/MembrosPage.tsx')),
              },
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
