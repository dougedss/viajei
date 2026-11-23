import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import {
  DRIVE_FN,
  driveErrorSchema,
  drivePair,
  driveResponseSchema,
  type DriveErrorCode,
  type DriveTime,
} from '@shared/drive-schema.ts';
import type { LngLat } from '@shared/geo.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { supabase } from '@/lib/supabase/client.ts';

/**
 * O tempo de carro medido, do app (a correção de 22/11/2026, D310): pela Edge Function `drive-times` (a
 * chave do Google mora no servidor; nenhuma chamada ao Google sai do navegador). Devolve, na ordem dos
 * pares, o que o Google mediu (`null` no par sem estrada). O que foi medido fica na conversa, com as
 * opções (`MapStage.drive`): reabrir a tela não mede de novo. Quando a função não responde, o erro traz
 * o `code` e quem chama diz que não deu para medir: **a tela não mostra tempo de carro que não foi
 * medido**.
 */
export class DriveError extends Error {
  readonly code: DriveErrorCode | 'offline';
  constructor(code: DriveErrorCode | 'offline', message: string) {
    super(message);
    this.code = code;
  }
}

export async function driveTimes(
  pairs: readonly (readonly [LngLat, LngLat])[],
): Promise<(DriveTime | null)[]> {
  if (pairs.length === 0) return [];
  const response = await supabase.functions.invoke<unknown>(DRIVE_FN, {
    body: { pairs: pairs.map(([from, to]) => drivePair(from, to)) },
  });
  const error: unknown = response.error;
  if (error) {
    if (error instanceof FunctionsFetchError) {
      connectivity.markOffline();
      throw new DriveError('offline', 'Sem conexão para medir o tempo de carro.');
    }
    let body: unknown = null;
    if (error instanceof FunctionsHttpError) {
      const ctx: unknown = error.context;
      if (ctx instanceof Response) body = await ctx.json().catch(() => null);
    }
    const parsed = driveErrorSchema.safeParse(body);
    throw new DriveError(
      parsed.success ? parsed.data.error.code : 'internal',
      parsed.success ? parsed.data.error.message : 'Não deu para medir o tempo de carro.',
    );
  }
  connectivity.markOnline();
  const parsed = driveResponseSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.times.length !== pairs.length) {
    throw new DriveError('internal', 'A medição respondeu num formato inesperado.');
  }
  return parsed.data.times;
}
