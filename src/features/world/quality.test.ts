import { describe, expect, it } from 'vitest';
import {
  cycleMode,
  DEFAULT_QUALITY,
  downgrade,
  DOWNGRADE_WINDOW_MS,
  effectiveLevel,
  emptyStats,
  labelOf,
  medianFps,
  parseQualityPrefs,
  pushFrame,
  serializeQualityPrefs,
  shouldDowngrade,
  type FrameStats,
} from '@/lib/three/quality.ts';
import { tierFor } from './quality.ts';

describe('níveis', () => {
  it('Alta usa até dpr 2 e sombras cheias; Leve fica em 1 e afina o cenário', () => {
    const alta = tierFor('alta', 3);
    expect(alta.dpr).toBe(2);
    expect(alta.shadowMapSize).toBe(2048);
    expect(alta.instanceRatio).toBe(1);
    expect(alta.treeShadows).toBe(true);
    expect(tierFor('alta', 1.5).dpr).toBe(1.5);
    const leve = tierFor('leve', 3);
    expect(leve.dpr).toBe(1);
    expect(leve.shadowMapSize).toBe(1024);
    expect(leve.instanceRatio).toBe(0.6);
    expect(leve.treeShadows).toBe(false);
  });

  it('o modo automático começa em Alta e o toque alterna Auto, Leve, Alta', () => {
    expect(effectiveLevel(DEFAULT_QUALITY)).toBe('alta');
    expect(cycleMode('auto')).toBe('leve');
    expect(cycleMode('leve')).toBe('alta');
    expect(cycleMode('alta')).toBe('auto');
    expect(labelOf(DEFAULT_QUALITY)).toBe('Auto · Alta');
    expect(labelOf({ mode: 'leve', auto: 'alta' })).toBe('Leve');
  });

  it('rebaixa só no automático, uma vez, e nunca sobe sozinho', () => {
    const once = downgrade(DEFAULT_QUALITY);
    expect(once).toEqual({ mode: 'auto', auto: 'leve' });
    expect(downgrade(once)).toBe(once);
    const manual = { mode: 'alta' as const, auto: 'alta' as const };
    expect(downgrade(manual)).toBe(manual);
    // o nível automático guardado volta como Leve na próxima sessão, e não há caminho de subida
    expect(effectiveLevel(parseQualityPrefs(serializeQualityPrefs(once)))).toBe('leve');
  });

  it('persistência tolera lixo e preserva o que vale', () => {
    expect(parseQualityPrefs(null)).toEqual(DEFAULT_QUALITY);
    expect(parseQualityPrefs('{')).toEqual(DEFAULT_QUALITY);
    expect(parseQualityPrefs('"x"')).toEqual(DEFAULT_QUALITY);
    expect(parseQualityPrefs('{"mode":"ultra","auto":"leve"}')).toEqual({
      mode: 'auto',
      auto: 'leve',
    });
    const prefs = { mode: 'alta' as const, auto: 'leve' as const };
    expect(parseQualityPrefs(serializeQualityPrefs(prefs))).toEqual(prefs);
  });
});

describe('medição de fps em movimento', () => {
  function run(fps: number, seconds: number, start = 0): FrameStats {
    let stats = emptyStats();
    const dt = 1000 / fps;
    for (let t = start; t <= start + seconds * 1000; t += dt) stats = pushFrame(stats, t, dt);
    return stats;
  }

  it('a mediana reflete os quadros da janela e ignora lixo', () => {
    expect(medianFps(emptyStats())).toBeNull();
    expect(medianFps(run(60, 1))).toBe(60);
    expect(medianFps(run(20, 1))).toBe(20);
    let stats = run(60, 1);
    stats = pushFrame(stats, 2000, 0);
    stats = pushFrame(stats, 2001, 5000);
    expect(stats.frames.every(([, dt]) => dt > 0 && dt <= 1000)).toBe(true);
  });

  it('só rebaixa com 3 s de movimento abaixo de 24 fps na mediana', () => {
    expect(shouldDowngrade(run(20, 1), 1000)).toBe(false);
    expect(shouldDowngrade(run(20, 3.2), 3200)).toBe(true);
    expect(shouldDowngrade(run(30, 3.2), 3200)).toBe(false);
    // um tranco curto numa sessão fluida não derruba
    let stats = run(60, 2.5);
    for (let t = 2500; t < 3200; t += 100) stats = pushFrame(stats, t, 100);
    expect(shouldDowngrade(stats, 3200)).toBe(false);
  });

  it('quadros antigos saem da janela', () => {
    let stats = run(20, 3.2);
    stats = pushFrame(stats, 3200 + DOWNGRADE_WINDOW_MS + 10, 16);
    expect(stats.frames).toHaveLength(1);
  });
});
