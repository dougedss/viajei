import { easeInOut, type ReplayCue, type ReplayPlan } from './replay.ts';

/**
 * O controlador de movimento da maquete, puro e testável: uma fila de movimentos (abertura, replay,
 * avanço ao vivo, "Rever o dia", suavização da posição), o `s` do carro a cada instante, as deixas
 * que disparam quando o carro passa por elas e o mergulho de câmera das curiosidades. A cena chama
 * `step(now)` a cada quadro enquanto há movimento e redesenha; parado, nada chama e nada desenha.
 */
export type MoveKind = 'opening' | 'replay' | 'live' | 'review' | 'smooth';

export type Move = {
  kind: MoveKind;
  from_s: number;
  to_s: number;
  duration_ms: number;
  /** espera antes de começar, contada da entrada na fila */
  delay_ms: number;
  cues: ReplayCue[];
  plan: ReplayPlan | null;
};

export type Dive = { caption: string; started_at: number; until: number; s: number };

export type MotionEvent =
  | { type: 'start'; move: Move }
  | { type: 'cue'; cue: ReplayCue; move: Move }
  | { type: 'done'; move: Move; skipped: boolean };

type Running = { move: Move; enqueued_at: number; started_at: number | null; fired: number };

export class MotionController {
  /** posição atual do carro no caminho */
  s: number;
  /** curiosidade em andamento: a câmera mergulha até `until`, a legenda fica visível */
  dive: Dive | null = null;
  reducedMotion: boolean;
  private queue: Running[] = [];
  private current: Running | null = null;

  constructor(s0: number, reducedMotion = false) {
    this.s = s0;
    this.reducedMotion = reducedMotion;
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0 || this.dive !== null;
  }

  /** A preferência pode mudar com a maquete aberta; a partir daqui os movimentos são instantâneos. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.dive = null;
  }

  get currentMove(): Move | null {
    return this.current?.move ?? null;
  }

  /** Progresso (0 a 1) do movimento atual num instante; 0 quando não há movimento. */
  progress(now: number): number {
    const c = this.current;
    if (!c) return 0;
    if (c.started_at === null) return 0;
    if (c.move.duration_ms <= 0) return 1;
    return Math.min(1, (now - c.started_at) / c.move.duration_ms);
  }

  enqueue(move: Move, now: number): void {
    // uma suavização substitui a anterior: só a posição mais nova importa
    if (move.kind === 'smooth') {
      this.queue = this.queue.filter((r) => r.move.kind !== 'smooth');
      if (this.current?.move.kind === 'smooth') this.current = null;
    }
    this.queue.push({ move, enqueued_at: now, started_at: null, fired: 0 });
  }

  /** Salta o carro para `s` sem animação (sem movimento ou com reduzir movimento). */
  jumpTo(s: number): void {
    this.s = s;
  }

  fromPlan(
    plan: ReplayPlan,
    kind: MoveKind = plan.mode === 'review' ? 'review' : plan.mode === 'live' ? 'live' : 'replay',
  ): Move {
    return {
      kind,
      from_s: plan.from_s,
      to_s: plan.to_s,
      duration_ms: this.reducedMotion ? 0 : plan.duration_ms,
      delay_ms: 0,
      cues: plan.cues,
      plan,
    };
  }

  /** Avança o relógio: move o carro, dispara as deixas que ficaram para trás e encerra o que acabou. */
  step(now: number): MotionEvent[] {
    const events: MotionEvent[] = [];
    if (this.dive && now >= this.dive.until) this.dive = null;
    if (!this.current) {
      const next = this.queue[0];
      if (next && now - next.enqueued_at >= next.move.delay_ms) {
        this.queue.shift();
        this.current = next;
        next.started_at = now;
        this.s = next.move.from_s;
        events.push({ type: 'start', move: next.move });
      }
    }
    const c = this.current;
    if (!c) return events;
    if (c.started_at === null) return events;
    const p = this.progress(now);
    this.s = c.move.from_s + (c.move.to_s - c.move.from_s) * easeInOut(p);
    events.push(...this.fireCues(c, now, false));
    if (p >= 1) {
      this.s = c.move.to_s;
      this.current = null;
      events.push({ type: 'done', move: c.move, skipped: false });
    }
    return events;
  }

  /** "Pular": vai ao fim do movimento atual e dispara as deixas restantes de uma vez. */
  skip(now: number): MotionEvent[] {
    const c = this.current;
    if (!c) return [];
    this.s = c.move.to_s;
    const events = this.fireCues(c, now, true);
    this.current = null;
    this.dive = null;
    events.push({ type: 'done', move: c.move, skipped: true });
    return events;
  }

  private fireCues(c: Running, now: number, all: boolean): MotionEvent[] {
    const events: MotionEvent[] = [];
    for (;;) {
      const cue = c.move.cues[c.fired];
      if (!cue) break;
      if (!all && cue.s > this.s + 1e-6) break;
      c.fired++;
      events.push({ type: 'cue', cue, move: c.move });
      if (cue.kind === 'curiosity' && !all && !this.reducedMotion) {
        this.dive = {
          caption: cue.caption,
          started_at: now,
          until: now + cue.duration_ms,
          s: cue.s,
        };
      }
    }
    return events;
  }
}
