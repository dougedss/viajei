/**
 * O que este aparelho consegue desenhar, antes de montar o Canvas: WebGPU, WebGL2 ou nada. Só APIs do
 * navegador, sem o three: as telas que decidem entre a cena 3D e a versão sem 3D (a visão geral, o
 * Modo Viagem pela lista) não baixam o three só para perguntar (fase 12, D162). `none` cai na versão
 * sem 3D (a lista do dia, a vista lateral da garagem) sem mensagem de erro, só com um aviso discreto.
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
