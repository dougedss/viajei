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
                path: '/viagens/:tripId/importar',
                lazy: page(() => import('@/features/import/routes/ImportarPage.tsx')),
              },
              {
                path: '/viagens/:tripId/roteiro',
                lazy: page(() => import('@/features/itinerary/routes/RoteiroPage.tsx')),
              },
              {
                path: '/viagens/:tripId/roteiro/:dayId',
                lazy: page(() => import('@/features/itinerary/routes/DiaPage.tsx')),
              },
              {
                path: '/viagens/:tripId/viagem',
                lazy: page(() => import('@/features/travel-mode/routes/ModoViagemPage.tsx')),
              },
              {
                path: '/viagens/:tripId/reservas',
                lazy: page(() => import('@/features/reservations/routes/ReservasPage.tsx')),
              },
              {
                path: '/viagens/:tripId/reservas/nova',
                lazy: page(() => import('@/features/reservations/routes/ReservaFormPage.tsx')),
              },
              {
                path: '/viagens/:tripId/reservas/:reservationId/editar',
                lazy: page(() => import('@/features/reservations/routes/ReservaFormPage.tsx')),
              },
              {
                path: '/viagens/:tripId/checklists',
                lazy: page(() => import('@/features/checklists/routes/ListasPage.tsx')),
              },
              {
                path: '/viagens/:tripId/contatos',
                lazy: page(() => import('@/features/contacts/routes/ContatosPage.tsx')),
              },
              {
                path: '/viagens/:tripId/gastos',
                lazy: page(() => import('@/features/expenses/routes/GastosPage.tsx')),
              },
              {
                path: '/viagens/:tripId/diario',
                lazy: page(() => import('@/features/memories/routes/DiarioPage.tsx')),
              },
              {
                path: '/viagens/:tripId/garagem',
                lazy: page(() => import('@/features/garage/routes/GaragemPage.tsx')),
              },
              {
                path: '/viagens/:tripId/retrospectiva',
                lazy: page(() => import('@/features/retrospective/routes/RetrospectivaPage.tsx')),
              },
              {
                path: '/viagens/:tripId/avisos',
                lazy: page(() => import('@/features/notifications/routes/AvisosPage.tsx')),
              },
              {
                path: '/viagens/:tripId/membros',
                lazy: page(() => import('@/features/trips/routes/MembrosPage.tsx')),
              },
              {
                path: '/lab',
                lazy: page(() => import('@/features/lab/routes/LabPage.tsx')),
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
