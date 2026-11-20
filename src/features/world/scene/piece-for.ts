import type { StopKind } from '@shared/constants.ts';
import { parseRecipe } from '@shared/landmark-recipe.ts';
import { buildLandmark } from '@/art/landmarks/build.ts';
import { buildMiniature, MINIATURE_BOX, type Box, type Miniature } from '@/art/stops/index.ts';

/**
 * A peça de um nó da maquete (fase 23): **a do lugar, se houver; senão a do tipo.** A porta única da
 * D219, agora aberta: com a receita publicada do cartão-postal no catálogo, o construtor das receitas
 * monta a peça na caixa pedida; a receita que não passa no schema, que não monta nada, que monta menos
 * da metade das formas ou que lança por dentro **nunca derruba a tela**: vira a miniatura do tipo e uma
 * contagem (`landmarkFallbacks`, para o diagnóstico), sem erro na tela.
 */
export type Placed = { mini: Miniature; landmark: boolean };

export const landmarkFallbacks = { count: 0 };

export function pieceFor(
  kind: StopKind,
  seed: number,
  recipe: unknown = null,
  box: Box = MINIATURE_BOX[kind],
): Placed {
  if (recipe !== null && recipe !== undefined) {
    const parsed = parseRecipe(recipe);
    if (parsed) {
      try {
        const piece = buildLandmark(parsed, box, seed);
        if (piece.skipped * 2 <= parsed.shapes.length) {
          piece.kind = kind;
          return { mini: piece, landmark: true };
        }
        piece.dispose();
      } catch {
        // a peça do tipo, abaixo
      }
    }
    landmarkFallbacks.count += 1;
  }
  return { mini: buildMiniature(kind, seed), landmark: false };
}
