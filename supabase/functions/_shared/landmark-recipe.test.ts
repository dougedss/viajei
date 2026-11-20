import { describe, expect, it } from 'vitest';
import {
  LANDMARK_SHAPE_KINDS,
  landmarkRecipeSchema,
  landmarkShapeSchema,
} from './landmark-recipe.ts';
import { structuredSchema, type JsonSchemaNode } from './structured-schema.ts';

/**
 * O JSON Schema da receita que vai à API da Anthropic como saída estruturada (fase 23): raso, sem
 * nenhuma união (a API aceita até 16 parâmetros com união por pedido), com `enum` nas formas e nos
 * materiais e todo número sempre presente. Conta as uniões antes de a API recusar.
 */
function countUnions(node: JsonSchemaNode): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (typeof v !== 'object' || v === null) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    const o = v as JsonSchemaNode;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf) || Array.isArray(o.type)) n += 1;
    for (const x of Object.values(o)) walk(x);
  };
  walk(node);
  return n;
}

describe('o JSON Schema da receita para a saída estruturada', () => {
  const schema = structuredSchema(landmarkRecipeSchema);

  it('não tem união nenhuma (cabe nos 16 da API com folga)', () => {
    expect(countUnions(schema)).toBe(0);
  });

  it('mantém as enumerações e exige todo campo de toda forma', () => {
    const shapes = (schema.properties as Record<string, JsonSchemaNode>).shapes;
    const item = shapes?.items as JsonSchemaNode;
    const props = item.properties as Record<string, JsonSchemaNode>;
    expect(props.k?.enum).toEqual([...LANDMARK_SHAPE_KINDS]);
    expect((props.m?.enum as string[]).length).toBeGreaterThan(30);
    expect(item.required).toEqual(Object.keys(landmarkShapeSchema.shape));
    expect(item.additionalProperties).toBe(false);
    // o que a API recusa saiu: os limites de número e de lista ficam para o Zod
    expect(JSON.stringify(schema)).not.toMatch(/"minimum"|"maximum"|"maxItems"|"minLength"/);
  });

  it('é pequeno o bastante para ir em todo pedido', () => {
    expect(JSON.stringify(schema).length).toBeLessThan(6_000);
  });
});
