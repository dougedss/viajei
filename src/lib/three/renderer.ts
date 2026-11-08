import { setConsoleFunction, WebGPURenderer } from 'three/webgpu';
import type { Backend } from './support.ts';

export type { Backend, Support } from './support.ts';

/**
 * O motor das cenas 3D: a criação do `WebGPURenderer` do three (que tem backend WebGL2 próprio e cai
 * nele quando não há WebGPU) e a leitura de qual backend ficou ativo. A detecção, antes de montar o
 * Canvas, mora em `support.ts`, sem o three.
 */
/**
 * O R3F 9.8 cria um `THREE.Clock` em cada Canvas, e o three 0.187 o declara deprecado (r183), com um
 * aviso no console a cada maquete, garagem ou filme montados. Nenhuma versão do R3F trocou o Clock pelo
 * Timer ainda (a 9.8.2, de 14/10, é a mais nova). Até trocar, só esse aviso sai do console, pelo gancho
 * que o próprio three oferece; todo o resto passa como o three escreveria, com o rastro do TSL.
 */
const CLOCK_DEPRECATED =
  'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.';
type StackTrace = { isStackTrace: true; getError(message: string): Error };
const isStackTrace = (v: unknown): v is StackTrace =>
  typeof v === 'object' && v !== null && 'isStackTrace' in v && 'getError' in v;
setConsoleFunction((type, message, ...params) => {
  if (type === 'warn' && message === CLOCK_DEPRECATED) return;
  const [first] = params;
  if (type !== 'log' && isStackTrace(first)) console[type](first.getError(message));
  else console[type](message, ...params);
});

export function backendOf(renderer: WebGPURenderer): Backend {
  const backend: unknown = renderer.backend;
  return typeof backend === 'object' && backend !== null && 'isWebGPUBackend' in backend
    ? 'webgpu'
    : 'webgl2';
}

export type CreateOptions = { forceWebGL: boolean };

/**
 * Cria e inicializa o renderer no canvas do R3F. Se o WebGPU falhar no `init`, tenta uma vez em
 * WebGL2; se falhar de novo, lança, e o limite de erro troca a cena pela versão sem 3D.
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
