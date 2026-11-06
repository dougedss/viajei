import { bodyBounds, type CarProfile } from './profile.ts';
import { ANTENNA, ROOF_HEADROOM } from './shapes.ts';

/**
 * A caixa de desenho da vista lateral de um modelo: o corpo com a sombra e o estepe, e no alto a
 * folga do acessório mais alto, fixa por modelo para o carro não mudar de tamanho no card quando
 * ganha um rack.
 */
export function viewBoxOf(p: CarProfile): { minX: number; width: number; top: number } {
  const b = bodyBounds(p);
  const back = p.spare ? 0.34 : 0;
  const minX = b.minX - 0.12 - back;
  const maxX = b.maxX + 0.12;
  const top = Math.max(
    p.anchors.roof.y + ROOF_HEADROOM,
    p.anchors.antenna[1] + ANTENNA.height + 0.05,
  );
  return { minX, width: maxX - minX, top };
}
