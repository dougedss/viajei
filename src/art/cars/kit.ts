import type { BufferGeometry, Material, Texture } from 'three/webgpu';

/**
 * O que um carro montado criou e precisa descartar: geometrias, materiais e texturas, com reuso
 * por chave (as quatro calotas, os dois lados de um adesivo e as barras do rack dividem a mesma
 * geometria). `dispose` descarta tudo uma vez só.
 */
export class Kit {
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly materials = new Map<string, Material>();
  private readonly loose: (BufferGeometry | Material | Texture)[] = [];
  private disposed = false;

  geometry<T extends BufferGeometry>(key: string, make: () => T): T {
    const hit = this.geometries.get(key);
    if (hit) return hit as T;
    const made = make();
    this.geometries.set(key, made);
    return made;
  }

  material<T extends Material>(key: string, make: () => T): T {
    const hit = this.materials.get(key);
    if (hit) return hit as T;
    const made = make();
    this.materials.set(key, made);
    return made;
  }

  /** Algo criado sem chave (uma geometria única, uma textura trocável): descartado no fim. */
  own<T extends BufferGeometry | Material | Texture>(thing: T): T {
    this.loose.push(thing);
    return thing;
  }

  get size(): number {
    return this.geometries.size + this.materials.size + this.loose.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.loose) t.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.loose.length = 0;
  }
}
