import { useQueryClient } from '@tanstack/react-query';
import { CircleUserRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet } from 'react-router';
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
import { SyncChip } from '@/features/sync/components/SyncChip.tsx';
import { SyncNotices } from '@/features/sync/components/SyncNotices.tsx';
import { invitesKeys } from '@/features/trips/queries.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';

const claimed = new Set<string>();

/**
 * Casca do app autenticado. Liga o motor de sync para o usuário da sessão (e desliga ao sair),
 * reivindica os convites do e-mail confirmado uma vez por sessão, e mostra o estado do sync.
 */
export function AppLayout() {
  const { session } = useSession();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const uid = session?.user.id ?? null;
  useServiceWorkerMessages();
  useClearBadgeWhenVisible();

  useEffect(() => {
    if (!uid) return;
    void syncEngine.start(uid);
    void markFirstOpen().then(() => touchSubscription());
    return () => syncEngine.stop();
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

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-center justify-between gap-3 py-3 safe-x">
        <Link to="/" aria-label="Início">
          <Wordmark className="text-[30px]" />
        </Link>
        <div className="flex items-center gap-2">
          <SyncChip />
          <Link to="/perfil" aria-label="Perfil" className="rounded-full">
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
    </div>
  );
}
