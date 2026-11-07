import { z } from 'zod';

/**
 * JSON Schema para a saída estruturada da Anthropic, a partir de um schema do Zod.
 *
 * Por que não o `zodOutputFormat` do SDK: a transformação dele (conferida na 1.3.0 e na 1.6.0) só
 * mantém tipo, propriedades, itens, uniões, formato e descrição; `enum` e `const` vão para a
 * descrição como texto, e a gramática deixa de restringir o tipo da parada, da reserva e do contato.
 * Aqui fica o que a API aceita (inclusive `enum` e `const`) e sai o que ela recusa: limites de texto,
 * de número e de lista, `pattern`, formatos fora da lista, lista de tipos (vira `anyOf`). Quem
 * confere esses limites é o próprio Zod, depois, no texto inteiro. Todo objeto fecha as propriedades
 * e exige todas (opcional é união com null, regra do `importSchema`).
 *
 * O schema é o da entrada do `parse` (`io: 'input'`): o que a IA escreve. Um codec (o texto vazio
 * da IA que vira `null`, em `import-schema.ts`) entra pelo lado de lá, e a união que ele evita não
 * conta no limite de 16 da API.
 */
export type JsonSchemaNode = { [key: string]: unknown };

const FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid',
]);

const isNode = (v: unknown): v is JsonSchemaNode =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function strict(node: JsonSchemaNode): JsonSchemaNode {
  // o Zod escreve `nullable` de um tipo simples como `type: ["string", "null"]`; a lista de tipos não
  // está entre o que a saída estruturada aceita, a união está: vira `anyOf`, um ramo por tipo
  if (Array.isArray(node.type)) {
    const rest = Object.fromEntries(Object.entries(node).filter(([k]) => k !== 'type'));
    return {
      anyOf: node.type
        .filter((t): t is string => typeof t === 'string')
        .map((t) => strict(t === 'null' ? { type: 'null' } : { ...rest, type: t })),
    };
  }
  const out: JsonSchemaNode = {};
  if (node.type !== undefined) out.type = node.type;
  if (typeof node.description === 'string') out.description = node.description;
  if (Array.isArray(node.enum)) out.enum = node.enum;
  if (node.const !== undefined) out.const = node.const;
  if (typeof node.format === 'string' && FORMATS.has(node.format)) out.format = node.format;
  for (const key of ['anyOf', 'allOf'] as const) {
    const list = node[key];
    if (Array.isArray(list)) out[key] = list.filter(isNode).map(strict);
  }
  // o Zod escreve uma união como anyOf; oneOf não é aceito, e para valores disjuntos dá no mesmo
  if (Array.isArray(node.oneOf)) out.anyOf = node.oneOf.filter(isNode).map(strict);
  if (isNode(node.items)) out.items = strict(node.items);
  if (node.minItems === 0 || node.minItems === 1) out.minItems = node.minItems;
  if (node.type === 'object') {
    const props = isNode(node.properties) ? node.properties : {};
    out.properties = Object.fromEntries(
      Object.entries(props).flatMap(([k, v]) => (isNode(v) ? [[k, strict(v)]] : [])),
    );
    const required = Array.isArray(node.required) ? node.required : [];
    out.required = required.filter((k): k is string => typeof k === 'string' && k in props);
    out.additionalProperties = false;
  }
  return out;
}

/** O schema inteiro, sem `$defs` (tudo em linha) e sem recursão: o Zod lança se houver ciclo. */
export function structuredSchema(schema: z.ZodType): JsonSchemaNode {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    reused: 'inline',
    cycles: 'throw',
    unrepresentable: 'throw',
  }) as JsonSchemaNode;
  if (json.type !== 'object') throw new Error('a saída estruturada começa por um objeto');
  return strict(json);
}
