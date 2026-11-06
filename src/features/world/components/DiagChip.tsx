import type { Backend } from '../renderer.ts';
import { labelOf, type QualityPrefs } from '../quality.ts';

/**
 * O chip de diagnóstico: fps em movimento, motor em uso, qualidade e nível. Toque alterna Auto,
 * Leve, Alta. Em dev e com `?diag=1`, para o teste no iPhone. Os toggles menores (noite, WebGL
 * forçado, som) servem ao teste manual.
 */
type Props = {
  fps: number | null;
  backend: Backend | null;
  prefs: QualityPrefs;
  onCycle: () => void;
  night: boolean;
  onToggleNight: () => void;
  forceWebGL: boolean;
  onToggleWebGL: () => void;
  sound: boolean;
  onToggleSound: () => void;
};

const chip =
  'pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-full bg-hud px-3 text-[12px] font-semibold text-hud-ink backdrop-blur-sm';

export function DiagChip(props: Props) {
  const backend =
    props.backend === 'webgpu' ? 'WebGPU' : props.backend === 'webgl2' ? 'WebGL2' : '…';
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-diag>
      <button
        type="button"
        className={chip}
        onClick={props.onCycle}
        aria-label="Qualidade: toque para alternar"
      >
        <span
          className={`size-2 rounded-full ${props.fps === null ? 'bg-hud-muted' : props.fps >= 30 ? 'bg-on-time' : 'bg-late'}`}
          aria-hidden="true"
        />
        <span className="num" data-diag-fps>
          {props.fps ?? '·'} fps
        </span>
        <span className="text-hud-muted">·</span>
        <span data-diag-backend>{backend}</span>
        <span className="text-hud-muted">·</span>
        <span data-diag-quality>{labelOf(props.prefs)}</span>
      </button>
      <button
        type="button"
        className={chip}
        aria-pressed={props.night}
        onClick={props.onToggleNight}
      >
        {props.night ? 'Noite' : 'Dia'}
      </button>
      <button
        type="button"
        className={chip}
        aria-pressed={props.forceWebGL}
        onClick={props.onToggleWebGL}
      >
        WebGL
      </button>
      <button
        type="button"
        className={chip}
        aria-pressed={props.sound}
        onClick={props.onToggleSound}
      >
        {props.sound ? 'Som' : 'Mudo'}
      </button>
    </div>
  );
}
