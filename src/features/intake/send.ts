import { clearReview, NEW_TRIP_KEY, saveDraft, saveReview } from '@/features/import/draft.ts';
import { readViajei, type FormatError } from '@/features/import/format.ts';
import { newTripReview } from '@/features/import/new-review.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { decideIntake, type IntakePath } from './decide.ts';

/**
 * O que o botão do campo faz (fase 17), carregado no toque: a lista de viagens não baixa a leitura do
 * formato nem a revisão. O texto vai para o rascunho antes de tudo; a revisão de uma leitura anterior
 * dá lugar à nova (quem quiser a antiga tinha o "Continuar" ao lado do campo).
 */
export type SendOutcome =
  | { kind: 'empty' }
  /** o formato do Viajei virou revisão, no aparelho: abrir `/viagens/nova` */
  | { kind: 'review' }
  | { kind: 'format_errors'; errors: FormatError[] }
  /** a leitura com a IA ou a conversa: `/viagens/nova` começa */
  | { kind: 'start'; path: Exclude<IntakePath, 'format'> }
  /** sem rede, e o caminho precisa dela: o texto fica */
  | { kind: 'offline'; path: Exclude<IntakePath, 'format'> };

export async function sendIntake(
  text: string,
  online: boolean,
  uid: string | null,
): Promise<SendOutcome> {
  const decision = decideIntake(text, online);
  if (decision.kind === 'empty') return { kind: 'empty' };
  await saveDraft(NEW_TRIP_KEY, text);
  if (decision.kind === 'offline') return { kind: 'offline', path: decision.path };
  if (decision.path === 'format') {
    const result = readViajei(text, todayISO());
    if (!result.ok) return { kind: 'format_errors', errors: result.errors };
    const stored = await newTripReview(result.doc.data, result.doc.trip, {
      uid,
      source: 'user',
      importId: null,
      partial: false,
    });
    await saveReview(NEW_TRIP_KEY, stored);
    return { kind: 'review' };
  }
  await clearReview(NEW_TRIP_KEY);
  return { kind: 'start', path: decision.path };
}

/** A frase do campo sem rede, pelo caminho que esperou. */
export function offlineCopy(path: Exclude<IntakePath, 'format'>): string {
  const why =
    path === 'itinerary'
      ? 'Ler este roteiro precisa da internet (é a IA que lê).'
      : 'Montar a viagem conversando precisa da internet.';
  return `${why} O texto fica guardado aqui; quando a rede voltar, é só enviar. Sem internet, só o formato do Viajei (viajei/1) é lido.`;
}
