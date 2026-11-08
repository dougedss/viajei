import { useQueryClient } from '@tanstack/react-query';
import { CircleUserRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet, useMatches } from 'react-router';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Wordmark } from '@/components/ui/Wordmark.tsx';
import { markFirstOpen } from '@/features/notifications/first-open.ts';
import { touchSubscription } from '@/features/notifications/subscription.ts';
import {
  useClearBadgeWhenVisible,
  useServiceWorkerMessages,
} from '@/features/notifications/sw-messages.ts';
import { UpdatePrompt } from '@/features/pwa/components/UpdatePrompt.tsx';
import { asPersonColor, useProfile } from '@/features/profile/queries.ts';
import { XpGainHost } from '@/features/progression/components/XpGainHost.tsx';
import { startProgress, stopProgress } from '@/features/progression/engine.ts';
import { SyncChip } from '@/features/sync/components/SyncChip.tsx';
import { SyncNotices } from '@/features/sync/components/SyncNotices.tsx';
import { useAutoStopNaming } from '@/features/travel-mode/auto-stops.ts';
import { invitesKeys } from '@/features/trips/queries.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { startMedia, stopMedia } from '@/lib/media/index.ts';
import { sweepWeather } from '@/features/weather/fetch.ts';
import { useSession } from '@/lib/supabase/session.ts';

const claimed = new Set<string>();

/** A rota pediu a tela inteira (a tela da viagem, fase 14): sem o cabeçalho do app nem o `main`. */
function isFullscreen(handle: unknown): boolean {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    'fullscreen' in handle &&
    handle.fullscreen === true
  );
}

/**
 * Casca do app autenticado. Liga o motor de sync, a fila de fotos e o motor de progressão para o
 * usuário da sessão (e desliga ao sair),
 * reivindica os convites do e-mail confirmado uma vez por sessão, e mostra o estado do sync.
 */
export function AppLayout() {
  const { session } = useSession();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const uid = session?.user.id ?? null;
  const fullscreen = useMatches().some((m) => isFullscreen(m.handle));
  useServiceWorkerMessages();
  useClearBadgeWhenVisible();
  // a parada que nasceu sem sinal ganha o nome do OSM quando a rede volta, em qualquer tela
  useAutoStopNaming();

  useEffect(() => {
    if (!uid) return;
    void syncEngine.start(uid);
    startMedia(uid);
    startProgress(uid);
    // a previsão de dia que já passou e a de viagem que saiu do aparelho saem do cache
    void sweepWeather().catch(() => undefined);
    void markFirstOpen().then(() => touchSubscription());
    return () => {
      syncEngine.stop();
      stopMedia();
      stopProgress();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || claimed.has(uid)) return;
    claimed.add(uid);
    void supabase.rpc('claim_invites').then(({ data }) => {
      if (data) {
        void queryClient.invalidateQueries({ queryKey: invitesKeys.pending });
        syncEngine.schedule(0);
      }
    });
  }, [uid, queryClient]);

  if (fullscreen) {
    // a tela da viagem é inteira: a própria tela traz a barra do topo; o chip do sync e o perfil
    // ficam em Detalhes. Os avisos, as folhas e o "+N" de XP continuam por cima
    return (
      <div className="h-full bg-paper">
        <Outlet />
        <UpdatePrompt />
        <SyncNotices />
        <XpGainHost />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-center justify-between gap-3 py-3 safe-x">
        {/* o nome acessível começa pelo que se vê (a marca), como o WCAG 2.5.3 pede */}
        <Link
          to="/viagens"
          aria-label="Viajei, início"
          className="inline-flex min-h-12 items-center"
        >
          <Wordmark className="text-[30px]" />
        </Link>
        <div className="flex items-center gap-2">
          <SyncChip />
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="grid size-12 place-items-center rounded-full"
          >
            {profile.data ? (
              <Avatar name={profile.data.name} color={asPersonColor(profile.data.color)} />
            ) : (
              <CircleUserRound className="size-10 text-ink-2" aria-hidden="true" />
            )}
          </Link>
        </div>
      </header>
      <main className="safe-x pb-10">
        <Outlet />
      </main>
      <UpdatePrompt />
      <SyncNotices />
      <XpGainHost />
    </div>
  );
}
