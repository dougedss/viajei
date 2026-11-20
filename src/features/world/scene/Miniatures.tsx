import { useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { MINIATURE_BOX, type Miniature } from '@/art/stops/index.ts';
import { stepProgress } from '../opening.ts';
import { heightAt, type HeightField } from './heightfield.ts';
import { pieceFor } from './piece-for.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * As peças das paradas na cena (fases 14 e 22): uma por nó, ao lado da estrada e virada para ela,
 * assentada no piso plano que o layout abre para ela. Entram no R3F como `primitive` para receberem
 * o toque (o raio do ponteiro acha a malha): tocar numa abre a folha da parada, como a pílula. Na
 * abertura do dia, cada uma cresce no instante do pino dela; à noite acende as janelas e a poça de
 * luz no chão (por emissão, sem luz nova na cena).
 */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  onTap?: ((stopId: string) => void) | undefined;
  /**
   * O catálogo dos cartões-postais publicados neste aparelho (fase 23), pela chave do lugar: a
   * receita da peça. Sem o lugar no catálogo, a miniatura do tipo.
   */
  catalog?: ReadonlyMap<string, unknown> | undefined;
};

/** uma peça na cena: a de uma parada (com o toque) ou a de uma cidade de passagem (sem toque) */
type Placed = { key: string; stopId: string | null; mini: Miniature; landmark: boolean };

export function Miniatures({ runtime, field, onTap, catalog }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;

  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = [];
    for (const f of layout.features) {
      if (f.kind !== 'miniature') continue;
      const recipe = f.place_key ? catalog?.get(f.place_key) : null;
      const { mini, landmark } = pieceFor(
        f.stop,
        (layout.seed ^ (f.x * 31) ^ (f.z * 17)) >>> 0,
        recipe ?? null,
      );
      mini.group.position.set(f.x, heightAt(field, f.x, f.z) - 0.05, f.z);
      mini.group.rotation.y = f.angle;
      mini.group.userData.stopId = f.stop_id;
      mini.group.userData.landmark = landmark;
      out.push({ key: `stop:${f.stop_id}`, stopId: f.stop_id, mini, landmark });
    }
    // o cartão-postal de uma cidade de passagem (D220, fase 23): só com a peça publicada e um piso
    // para ela; sem pílula e sem toque
    for (const place of layout.places) {
      const recipe = place.key && place.piece ? catalog?.get(place.key) : null;
      if (!recipe || !place.piece) continue;
      const { mini, landmark } = pieceFor(
        'city',
        (layout.seed ^ (place.piece.x * 31) ^ (place.piece.z * 17)) >>> 0,
        recipe,
        MINIATURE_BOX.city,
      );
      if (!landmark) {
        mini.dispose();
        continue;
      }
      mini.group.position.set(
        place.piece.x,
        heightAt(field, place.piece.x, place.piece.z) - 0.05,
        place.piece.z,
      );
      mini.group.rotation.y = place.piece.angle;
      mini.group.userData.landmark = true;
      mini.group.userData.city = place.key;
      out.push({ key: `city:${place.key ?? ''}`, stopId: null, mini, landmark: true });
    }
    return out;
  }, [layout, field, catalog]);

  useEffect(() => {
    invalidate();
    return () => {
      for (const p of placed) p.mini.dispose();
    };
  }, [placed, invalidate]);

  // a abertura: cada peça cresce no instante do pino dela; a noite acende as janelas e a poça
  useEffect(
    () =>
      runtime.register(({ now }) => {
        const op = runtime.opening;
        const night = runtime.night.t;
        for (const p of placed) {
          let k = 1;
          if (op) {
            // a peça de uma cidade cresce com o último pino
            const pin = p.stopId
              ? op.plan.pins.find((x) => x.stop_id === p.stopId)
              : op.plan.pins.at(-1);
            const elapsed = runtime.openingElapsed(now);
            const t = pin ? Math.min(1, Math.max(0, (elapsed - pin.at_ms) / 400)) : 1;
            k = stepProgress(op.plan, 'pins', elapsed) > 0 ? t * (1.15 - 0.15 * t) : 0;
          }
          p.mini.group.scale.setScalar(Math.max(0.001, k));
          p.mini.group.visible = k > 0;
          p.mini.setNight(night);
        }
      }),
    [runtime, placed],
  );

  return (
    <>
      {placed.map((p) =>
        p.stopId ? (
          <primitive
            key={p.key}
            object={p.mini.group}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              // um toque fora do carro: o modo de perto acaba
              runtime.leaveClose();
              onTap?.(p.stopId ?? '');
            }}
          />
        ) : (
          <primitive key={p.key} object={p.mini.group} />
        ),
      )}
    </>
  );
}
