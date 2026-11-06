import {
  BackSide,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  SpotLight,
  TorusGeometry,
  type Material,
} from 'three/webgpu';
import { distance, float, reflector, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { DISC_TOP } from './runtime.ts';
import { STUDIO_BACKGROUND } from './studio-colors.ts';

/**
 * O estúdio da garagem, portado do protótipo: piso escuro com brilho do ambiente, disco giratório
 * com o anel emissivo no acento, parede côncava ao fundo (aberta para o lado da câmera), luz
 * principal quente (com a sombra real do carro no disco), preenchimento frio, contraluz e a
 * hemisférica. As intensidades do protótipo (220, 70, 110) baixaram para 70, 24 e 45, com o
 * ambiente em 0,4: acima disso o vermelho da tinta satura no tone mapping e a cor vira pêssego. Na Alta, o topo do disco
 * reflete o carro de verdade (`reflector()` do TSL, em meia resolução, desbotando para a borda);
 * na Leve, fica só o brilho do ambiente.
 */
const DISC_RADIUS = 3.7;
const DISC_COLOR = 0x2a2e36;

export type Studio = {
  root: Group;
  background: Color;
  setShadowSize: (size: number) => void;
  setReflection: (on: boolean) => void;
  dispose: () => void;
};

export function createStudio(accent: string): Studio {
  const root = new Group();
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(t: T): T => {
    disposables.push(t);
    return t;
  };

  const floor = new Mesh(
    keep(new CircleGeometry(30, 72)),
    keep(new MeshStandardMaterial({ color: 0x121419, roughness: 0.55, metalness: 0.1 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  const discMat = keep(new MeshStandardMaterial({ color: DISC_COLOR, roughness: 0.5 }));
  const disc = new Mesh(
    keep(new CylinderGeometry(DISC_RADIUS, DISC_RADIUS, DISC_TOP, 72)),
    discMat,
  );
  disc.position.y = DISC_TOP / 2;
  disc.receiveShadow = true;

  const ring = new Mesh(
    keep(new TorusGeometry(DISC_RADIUS, 0.026, 6, 120)),
    keep(new MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2 })),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = DISC_TOP + 0.01;

  // parede côncava: um pedaço de cilindro visto por dentro, com a abertura do lado da câmera
  const wall = new Mesh(
    keep(new CylinderGeometry(24, 24, 16, 64, 1, true, Math.PI * 0.6, Math.PI * 1.3)),
    keep(new MeshStandardMaterial({ color: 0x111318, roughness: 0.95, side: BackSide })),
  );
  wall.position.y = 8;

  const key = new SpotLight(0xfff1dc, 70, 40, 0.62, 0.65, 1.4);
  key.position.set(6, 9, 6);
  key.castShadow = true;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { near: 3, far: 26 });
  const fill = new SpotLight(0xbcd3ff, 24, 40, 0.8, 0.8, 1.4);
  fill.position.set(-7, 6, -3);
  const rim = new SpotLight(0xffffff, 45, 40, 0.6, 0.7, 1.4);
  rim.position.set(-3, 7, 8);
  const hemi = new HemisphereLight(0x3a4254, 0x0b0d10, 0.5);

  // o topo do disco: liso na Leve, espelho suave na Alta
  const topGeo = keep(new CircleGeometry(DISC_RADIUS - 0.04, 72));
  const top = new Mesh<CircleGeometry, Material>(topGeo, discMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = DISC_TOP + 0.001;
  top.receiveShadow = true;
  let mirror: {
    material: MeshStandardNodeMaterial;
    target: { removeFromParent: () => void };
  } | null = null;

  root.add(floor, disc, ring, wall, key, key.target, fill, fill.target, rim, rim.target, hemi, top);

  return {
    root,
    background: new Color(STUDIO_BACKGROUND),
    setShadowSize: (size) => {
      key.shadow.mapSize.set(size, size);
      if (key.shadow.map) {
        key.shadow.map.dispose();
        key.shadow.map = null;
      }
    },
    setReflection: (on) => {
      if (on && !mirror) {
        const reflection = reflector({ resolutionScale: 0.5 });
        reflection.target.rotateX(-Math.PI / 2);
        reflection.target.position.y = DISC_TOP + 0.001;
        root.add(reflection.target);
        const material = new MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.2 });
        // o reflexo desbota do centro para a borda do disco, por cima da cor dele
        const fade = float(1).sub(smoothstep(0.18, 0.5, distance(uv(), vec2(0.5, 0.5))));
        const base = new Color(DISC_COLOR);
        material.colorNode = reflection.rgb.mul(fade.mul(0.22)).add(vec3(base.r, base.g, base.b));
        top.material = material;
        mirror = { material, target: reflection.target };
      } else if (!on && mirror) {
        top.material = discMat;
        mirror.target.removeFromParent();
        mirror.material.dispose();
        mirror = null;
      }
    },
    dispose: () => {
      if (mirror) {
        mirror.target.removeFromParent();
        mirror.material.dispose();
        mirror = null;
      }
      key.shadow.map?.dispose();
      for (const l of [key, fill, rim, hemi]) l.dispose();
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
  };
}
