import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client.ts';

/**
 * Um canal privado por viagem (`trip:<id>`). O banco publica `{}` no evento `change` uma vez por
 * viagem por transação (trigger broadcast_trip_change); o aparelho só agenda um pull. A policy em
 * realtime.messages garante que só membros ouvem; ninguém publica pelo client.
 */
const channels = new Map<string, RealtimeChannel>();

export function watchTrips(tripIds: readonly string[], onChange: (tripId: string) => void): void {
  const wanted = new Set(tripIds);
  for (const [id, channel] of channels) {
    if (!wanted.has(id)) {
      void supabase.removeChannel(channel);
      channels.delete(id);
    }
  }
  for (const id of wanted) {
    if (channels.has(id)) continue;
    const channel = supabase
      .channel(`trip:${id}`, { config: { private: true } })
      .on('broadcast', { event: 'change' }, () => onChange(id))
      .subscribe();
    channels.set(id, channel);
  }
}
