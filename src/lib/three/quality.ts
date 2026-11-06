/**
 * Níveis de qualidade das cenas 3D (a maquete e a garagem), puros: o que todo nível muda (`dpr` e
 * sombra), o modo automático que começa em Alta e rebaixa quando a mediana de fps fica abaixo de
 * 24 por 3 s de movimento (e nunca sobe sozinho na mesma sessão), e a persistência por aparelho,
 * uma só para as duas cenas. Medir só enquanto há movimento: parada, a cena não desenha nada,
 * então fps não existe. O que é de uma cena só (o cenário da maquete) estende o `Tier` lá.
 */
export type QualityLevel = 'leve' | 'alta';
export type QualityMode = 'auto' | QualityLevel;

export type Tier = {
  level: QualityLevel;
  dpr: number;
  shadowMapSize: number;
};

export const SHADOW_MAP_SIZE: Record<QualityLevel, number> = { leve: 1024, alta: 2048 };

export function tierFor(level: QualityLevel, devicePixelRatio: number): Tier {
  return {
    level,
    dpr: level === 'alta' ? Math.min(2, Math.max(1, devicePixelRatio)) : 1,
    shadowMapSize: SHADOW_MAP_SIZE[level],
  };
}

export type QualityPrefs = {
  mode: QualityMode;
  /** o último nível a que o modo automático chegou neste aparelho */
  auto: QualityLevel;
};

export const DEFAULT_QUALITY: QualityPrefs = { mode: 'auto', auto: 'alta' };
export const QUALITY_STORAGE_KEY = 'viajei:world:quality';
export const DOWNGRADE_FPS = 24;
export const DOWNGRADE_WINDOW_MS = 3_000;
/** os primeiros segundos de um Canvas compilam shaders: não contam */
export const WARMUP_MS = 2_000;
/** um quadro mais longo que isto é tranco, não ritmo */
export const HITCH_MS = 250;

export function parseQualityPrefs(raw: string | null): QualityPrefs {
  if (!raw) return DEFAULT_QUALITY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_QUALITY;
    const p = parsed as Partial<Record<keyof QualityPrefs, unknown>>;
    const mode: QualityMode =
      p.mode === 'leve' || p.mode === 'alta' || p.mode === 'auto' ? p.mode : 'auto';
    const auto: QualityLevel = p.auto === 'leve' ? 'leve' : 'alta';
    return { mode, auto };
  } catch {
    return DEFAULT_QUALITY;
  }
}

export function serializeQualityPrefs(prefs: QualityPrefs): string {
  return JSON.stringify(prefs);
}

export function effectiveLevel(prefs: QualityPrefs): QualityLevel {
  return prefs.mode === 'auto' ? prefs.auto : prefs.mode;
}

/** Toque no chip: Auto → Leve → Alta → Auto. */
export function cycleMode(mode: QualityMode): QualityMode {
  return mode === 'auto' ? 'leve' : mode === 'leve' ? 'alta' : 'auto';
}

/** Rebaixa só no modo automático e só uma vez: Alta vira Leve; Leve fica. */
export function downgrade(prefs: QualityPrefs): QualityPrefs {
  if (prefs.mode !== 'auto' || prefs.auto === 'leve') return prefs;
  return { mode: 'auto', auto: 'leve' };
}

export function labelOf(prefs: QualityPrefs): string {
  const level = effectiveLevel(prefs) === 'alta' ? 'Alta' : 'Leve';
  return prefs.mode === 'auto' ? `Auto · ${level}` : level;
}

// ------------------------------------------------------------------ medição de fps
export type FrameStats = {
  /** [instante, duração do quadro em ms], só de quadros em movimento, na janela */
  frames: [number, number][];
};

export const emptyStats = (): FrameStats => ({ frames: [] });

/** Registra um quadro desenhado em movimento e descarta o que saiu da janela de 3 s. */
export function pushFrame(stats: FrameStats, now: number, dt_ms: number): FrameStats {
  // um tranco longo é compilação de shader ou troca de aba, não a taxa de quadros
  if (dt_ms <= 0 || dt_ms > HITCH_MS) return stats;
  const frames = stats.frames.filter(([t]) => now - t <= DOWNGRADE_WINDOW_MS);
  frames.push([now, dt_ms]);
  return { frames };
}

/** A mediana de fps dos quadros na janela; `null` sem quadros. */
export function medianFps(stats: FrameStats): number | null {
  if (stats.frames.length === 0) return null;
  const sorted = stats.frames.map(([, dt]) => dt).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const dt =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 16)
      : ((sorted[mid - 1] ?? 16) + (sorted[mid] ?? 16)) / 2;
  return Math.round(1000 / dt);
}

/** A janela inteira (3 s de movimento) ficou abaixo de 24 fps na mediana. */
export function shouldDowngrade(stats: FrameStats, now: number): boolean {
  const first = stats.frames[0];
  if (!first || now - first[0] < DOWNGRADE_WINDOW_MS - 50) return false;
  const fps = medianFps(stats);
  return fps !== null && fps < DOWNGRADE_FPS;
}
