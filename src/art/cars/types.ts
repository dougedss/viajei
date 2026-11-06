import type { CarAccessoryKey, CarColor, CarModel } from '@shared/constants.ts';
import type { Group, MeshPhysicalNodeMaterial, MeshStandardMaterial, Object3D } from 'three/webgpu';

export type { CarAccessoryKey } from '@shared/constants.ts';
export { CAR_ACCESSORY_KEYS } from '@shared/constants.ts';

/**
 * O que descreve um carro para desenhar, em 3D ou de lado: o modelo, a cor, os acessórios na ordem
 * em que foram escolhidos e o nome da viagem (a placa personalizada usa quando o acessório está
 * ligado). `normalizeCar` produz isto a partir da linha da viagem, já limpo.
 */
export type CarSpec = {
  model: CarModel;
  color: CarColor;
  accessories: readonly CarAccessoryKey[];
  plate: string | null;
};

/** As âncoras do carro montado, no espaço do grupo: onde cada coisa encaixa. */
export type RigAnchors = {
  roof: Object3D;
  lanes: readonly Object3D[];
  frontBumper: Object3D;
  rearPlate: Object3D;
  hubs: readonly Object3D[];
  antenna: Object3D;
  /** os três espaços de adesivo, nos dois lados */
  stickers: readonly { near: Object3D; far: Object3D }[];
};

export type AttachOptions = {
  animate: boolean;
  /** o instante em que o acessório assenta (o som de encaixe e a vibração entram aqui) */
  onSeat?: () => void;
};

/**
 * O que um carro por código expõe para a maquete, a garagem e a retrospectiva (fase 9): o grupo
 * para posicionar (o nariz olha para +z), a tinta, as rodas para girar, as âncoras, e os métodos que
 * trocam cor, acessórios, placa e noite. As animações internas (tinta em 400 ms, acessório
 * descendo e encaixando) avançam em `update`, chamado pelo laço da cena enquanto devolver `true`;
 * quem chama `attach` de fora do laço passa `wake` na construção, para o render sob demanda saber
 * que precisa de quadros. Trocar por um modelo de artista depois é produzir outro `CarRig`.
 */
export type CarRig = {
  readonly model: CarModel;
  readonly group: Group;
  readonly paint: MeshPhysicalNodeMaterial;
  readonly wheels: readonly Group[];
  readonly anchors: RigAnchors;
  readonly headMat: MeshStandardMaterial;
  readonly tailMat: MeshStandardMaterial;
  setColor: (color: CarColor, opts?: { animate?: boolean }) => void;
  /** liga e desliga na hora; mantém as faixas e os espaços de quem continua */
  setAccessories: (keys: readonly string[]) => void;
  /** liga um acessório: desce e encaixa com mola (ou aparece na hora) */
  attach: (key: CarAccessoryKey, opts: AttachOptions) => Promise<void>;
  /** desliga um acessório: sobe e some (ou some na hora) */
  detach: (key: CarAccessoryKey, opts: { animate: boolean }) => Promise<void>;
  setPlate: (text: string | null) => void;
  /** 0 = dia, 1 = noite: faróis, lanternas, feixes e faróis de milha */
  setNight: (t: number) => void;
  /** gira as rodas por um deslocamento em unidades da cena */
  roll: (distance: number) => void;
  /** avança as animações internas; `true` enquanto há algo em curso */
  update: (now: number) => boolean;
  /** idempotente */
  dispose: () => void;
};

export type BuildOptions = {
  /** pede quadros ao render sob demanda quando uma animação começa fora do laço */
  wake?: () => void;
  /**
   * Os feixes dos faróis (duas luzes de spot) para a noite da maquete. Padrão: sim. A garagem monta
   * sem: luz que entra ou sai da cena muda o shader de todos os materiais, e a troca de modelo
   * engasgaria; lá não há noite.
   */
  beams?: boolean;
};
