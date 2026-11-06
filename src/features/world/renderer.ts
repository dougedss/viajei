import { WebGPURenderer } from 'three/webgpu';

/**
 * O motor da maquete: detecção antes de montar o Canvas (WebGPU, WebGL2 ou nada), a criação do
 * `WebGPURenderer` do three (que tem backend WebGL2 próprio e cai nele quando não há WebGPU) e a
 * leitura de qual backend ficou ativo. `none` cai na lista acessível sem mensagem de erro, só com
 * o aviso discreto "Maquete indisponível neste aparelho".
 */
export type Backend = 'webgpu' | 'webgl2';
export type Support = Backend | 'none';

// a lib do TS declara `navigator.gpu` como obrigatório; o Safari antigo e o Firefox não o têm
type GpuNavigator = Partial<Pick<Navigator, 'gpu'>>;

let supportPromise: Promise<Support> | null = null;

/** WebGPU com adaptador de verdade; senão WebGL2; senão nada. Uma vez por página. */
export function detectSupport(): Promise<Support> {
  supportPromise ??= probe();
  return supportPromise;
}

async function probe(): Promise<Support> {
  if (typeof document === 'undefined') return 'none';
  const nav: GpuNavigator = navigator;
  const gpu = nav.gpu;
  if (gpu) {
    try {
      // o Chromium sem tela (Playwright) expõe navigator.gpu e devolve adaptador nulo
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      /* sem WebGPU utilizável: tenta WebGL2 */
    }
  }
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'none';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return 'webgl2';
}

export function backendOf(renderer: WebGPURenderer): Backend {
  const backend: unknown = renderer.backend;
  return typeof backend === 'object' && backend !== null && 'isWebGPUBackend' in backend
    ? 'webgpu'
    : 'webgl2';
}

export type CreateOptions = { forceWebGL: boolean };

/**
 * Cria e inicializa o renderer no canvas do R3F. Se o WebGPU falhar no `init`, tenta uma vez em
 * WebGL2; se falhar de novo, lança, e o limite de erro da seção troca a maquete pela lista.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: CreateOptions,
): Promise<WebGPURenderer> {
  const make = (forceWebGL: boolean) =>
    new WebGPURenderer({
      canvas,
      antialias: true,
      forceWebGL,
      powerPreference: 'high-performance',
    });
  let renderer = make(opts.forceWebGL);
  try {
    await renderer.init();
  } catch (err) {
    if (opts.forceWebGL) throw err;
    console.warn('viajei: WebGPU não iniciou, tentando WebGL2', err);
    renderer = make(true);
    await renderer.init();
  }
  return renderer;
}
