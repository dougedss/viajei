import type { LandmarkRecipe } from '@shared/landmark-recipe.ts';
import {
  CircleGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three/webgpu';
import { buildLandmark } from '@/art/landmarks/build.ts';
import type { Box } from '@/art/stops/types.ts';
import { REST_FOV, REST_TILT } from '@/features/world/camera.ts';
import { cameraPosition } from '@/features/world/math.ts';
import { createRenderer } from '@/lib/three/renderer.ts';
import { detectSupport } from '@/lib/three/support.ts';

/**
 * A peça desenhada fora da tela (fase 23): o aparelho monta a receita com o mesmo construtor da
 * maquete e a fotografa em duas vistas fixas (a inclinação da câmera de repouso, em três quartos, e
 * uma frontal), num renderer próprio, pequeno (640 × 480: ~400 tokens de imagem cada). É o que a
 * conferência manda à função, e o que a escolha do refazer mostra. A função do servidor não desenha.
 */
export type RenderedView = { view: 'rest' | 'front'; media_type: 'image/png'; data: string };

const SIZE = { w: 640, h: 480 } as const;

export async function renderPieceViews(
  recipe: LandmarkRecipe,
  box: Box,
  seed = 1,
): Promise<RenderedView[]> {
  const support = await detectSupport();
  if (support === 'none') throw new Error('sem 3D neste aparelho');
  const canvas = document.createElement('canvas');
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const renderer = await createRenderer(canvas, { forceWebGL: support === 'webgl2' });
  const piece = buildLandmark(recipe, box, seed);
  try {
    renderer.setSize(SIZE.w, SIZE.h, false);
    renderer.setClearColor(0xf4f4f2, 1);
    const scene = new Scene();
    scene.add(new HemisphereLight(0xcfe0ff, 0x8d7b5c, 0.9));
    const sun = new DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-30, 44, 36);
    scene.add(sun);
    const ground = new Mesh(
      new CircleGeometry(Math.max(box.w, box.d) * 1.1, 48),
      new MeshStandardMaterial({ color: 0x7faa5a, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    scene.add(ground);
    scene.add(piece.group);
    piece.setNight(0);

    const camera = new PerspectiveCamera(REST_FOV, SIZE.w / SIZE.h, 0.5, 2000);
    const radius = Math.hypot(box.w, box.h, box.d) / 2;
    const distance = (radius / Math.sin((REST_FOV * Math.PI) / 360)) * 1.08;
    const target: [number, number, number] = [0, box.h * 0.4, 0];
    const out: RenderedView[] = [];
    for (const [view, tilt, yaw] of [
      ['rest', REST_TILT, 0.75],
      ['front', (16 * Math.PI) / 180, 0],
    ] as const) {
      const pos = cameraPosition({ target, distance, tilt, yaw, fov: REST_FOV });
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.lookAt(new Vector3(...target));
      camera.updateProjectionMatrix();
      // o renderer já foi iniciado em `createRenderer`: o `render` desenha o quadro inteiro
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      out.push({ view, media_type: 'image/png', data: url.slice(url.indexOf(',') + 1) });
    }
    ground.geometry.dispose();
    ground.material.dispose();
    return out;
  } finally {
    piece.dispose();
    void renderer.dispose();
  }
}
