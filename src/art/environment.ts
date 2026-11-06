import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator, type Renderer, type Texture } from 'three/webgpu';

/**
 * A luz de estúdio: o `RoomEnvironment` do three (uma sala com painéis emissivos) virado em
 * mapa de ambiente pelo PMREM, sem baixar HDR da rede. Um por renderer; a garagem (fase 6) usa o
 * mesmo. Descartar junto com o renderer.
 */
export type Environment = { texture: Texture; dispose: () => void };

export function createEnvironment(renderer: Renderer): Environment {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  return {
    texture: target.texture,
    dispose: () => {
      target.dispose();
      pmrem.dispose();
    },
  };
}
