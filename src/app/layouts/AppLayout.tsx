import { useQueryClient } from '@tanstack/react-query';
import { CircleUserRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet } from 'react-router';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Wordmark } from '@/components/ui/Wordmark.tsx';
import { invitesKeys } from '@/features/trips/queries.ts';
import { asPersonColor, useProfile } from '@/features/profile/queries.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';

const claimed = new Set<string>();

/** Casca do app autenticado. Ao entrar, reivindica os convites do e-mail confirmado (uma vez por sessão). */
export function AppLayout() {
  const { session } = useSession();
  const profile = useProfile();
  const queryClient = useQueryClient();

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid || claimed.has(uid)) return;
    claimed.add(uid);
    void supabase.rpc('claim_invites').then(({ data }) => {
      if (data) void queryClient.invalidateQueries({ queryKey: invitesKeys.pending });
    });
  }, [session, queryClient]);

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-center justify-between py-3 safe-x">
        <Link to="/" aria-label="Início">
          <Wordmark className="text-[30px]" />
        </Link>
        <Link to="/perfil" aria-label="Perfil" className="rounded-full">
          {profile.data ? (
            <Avatar name={profile.data.name} color={asPersonColor(profile.data.color)} />
          ) : (
            <CircleUserRound className="size-10 text-ink-2" aria-hidden="true" />
          )}
        </Link>
      </header>
      <main className="safe-x pb-10">
        <Outlet />
      </main>
    </div>
  );
}
