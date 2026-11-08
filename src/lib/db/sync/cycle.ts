import type { PushOutcome } from './push.ts';
import type { MembershipChange } from './apply-pull.ts';

/**
 * Um ciclo completo do motor de sync, sem rede nem Supabase (testável): o push, o pull do usuário,
 * as viagens que a pessoa deixou e o pull de cada viagem. O motor injeta as peças; aqui mora só a
 * ordem e uma regra que nasceu do rack que não subia (fase 13): **uma escrita feita no meio dos
 * pulls sobe antes do pull seguinte.** Antes, o pedido ficava na fila e o push só saía no ciclo
 * seguinte, depois de todas as viagens; com uma dezena delas (e uma delas lenta), um Chegamos!
 * marcado durante o ciclo esperava o ciclo inteiro. Na estrada, é o que o time não vê.
 */
export type CycleDeps = {
  /** envia a outbox; `offline` quando a rede caiu no meio */
  push: () => Promise<PushOutcome>;
  pullUser: () => Promise<MembershipChange>;
  /** uma viagem que a pessoa deixou: apagar aqui */
  leaveTrip: (tripId: string) => Promise<void>;
  tripsToPull: () => Promise<string[]>;
  pullTrip: (tripId: string) => Promise<void>;
  /** quantos pedidos de ciclo já chegaram: muda quando chega um novo (uma escrita, a rede de volta, o foco) */
  requests: () => number;
  isNetworkError: (err: unknown) => boolean;
  /** cada push que saiu, para os avisos (edições superadas, pendências) */
  onPushed: (outcome: PushOutcome) => void;
  trace: (event: string, ms?: number) => void;
};

export type CycleResult = {
  /** a rede caiu: o que sobrou fica para o próximo ciclo */
  offline: boolean;
  /** erros de pull que não são de rede (um por viagem, sem segurar as seguintes) */
  errors: string[];
  /** quantos pushes saíram neste ciclo (1 no começo, mais um por escrita no meio) */
  pushes: number;
};

export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const result: CycleResult = { offline: false, errors: [], pushes: 0 };
  const push = async (label: string): Promise<boolean> => {
    const t0 = Date.now();
    const outcome = await deps.push();
    result.pushes++;
    deps.trace(
      `${label} ${String(outcome.done)}/${String(outcome.failed)}${outcome.offline ? ' sem rede' : ''}`,
      Date.now() - t0,
    );
    deps.onPushed(outcome);
    return !outcome.offline;
  };
  if (!(await push('push'))) {
    result.offline = true;
    return result;
  }
  // os pedidos até aqui o push de cima atendeu; um novo, no meio dos pulls, pede outro
  let seen = deps.requests();
  const t1 = Date.now();
  const memberships = await deps.pullUser();
  deps.trace('pull do usuário', Date.now() - t1);
  for (const tripId of memberships.left) await deps.leaveTrip(tripId);
  // cada viagem por si: a que falha não segura as seguintes; sem rede, o resto fica para o próximo
  // ciclo, que a encontra de novo pela participação gravada (D109)
  for (const tripId of await deps.tripsToPull()) {
    // a escrita que chegou enquanto puxávamos sobe agora, não depois de todas as viagens
    if (deps.requests() !== seen) {
      seen = deps.requests();
      if (!(await push('push no meio'))) {
        result.offline = true;
        return result;
      }
    }
    try {
      await deps.pullTrip(tripId);
    } catch (err) {
      if (deps.isNetworkError(err)) throw err;
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}
