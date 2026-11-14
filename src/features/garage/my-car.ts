import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import type { CarSpec } from '@/art/cars/types.ts';
import { db, type Profile } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { carOf } from './rules.ts';

/**
 * O carro é da pessoa (fase 16): quem desenha o carro de quem está olhando (a maquete, o card, o
 * topo, a retrospectiva, o mapa) lê daqui; o carro de outra pessoa (o comboio, o time) sai do perfil
 * dela, que chega pelo pull da viagem (D113), com `carOf`.
 *
 * O último perfil lido fica guardado por pessoa enquanto o app está aberto: a próxima tela já
 * começa com ele, e o carro não pisca no padrão enquanto o Dexie responde.
 */
const lastRead = new Map<string, Profile | null>();

/** O próprio perfil, do aparelho (`null` se ainda não chegou; `undefined` só na primeira leitura). */
export function useMyProfile(): Profile | null | undefined {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  return useLiveQuery(
    async () => {
      if (!uid) return null;
      const row = (await db.profiles.get(uid)) ?? null;
      lastRead.set(uid, row);
      return row;
    },
    [uid],
    lastRead.get(uid),
  );
}

/**
 * O carro de quem está olhando, com a placa de quem desenha (o nome da viagem, ou o da pessoa fora
 * de uma viagem). `null` só enquanto o perfil é lido pela primeira vez.
 */
export function useMyCar(plate: string | null): CarSpec | null {
  const profile = useMyProfile();
  return useMemo(() => (profile === undefined ? null : carOf(profile, plate)), [profile, plate]);
}
