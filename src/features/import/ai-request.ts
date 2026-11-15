import { CONTACT_TYPES, RESERVATION_TYPES, STOP_KINDS, STOP_KIND_KEYS } from '@shared/constants.ts';

/**
 * "Montou a viagem com outra IA? Copie este pedido" (fase 17): o pedido que a pessoa cola no chat onde
 * planejou a viagem, para a resposta vir no formato do Viajei. Colada de volta no campo, é lida no
 * aparelho, sem IA, sem custo e sem internet. Pede um bloco de código porque o chat desenha o
 * markdown: copiado da resposta desenhada, o "## " e o "- " sumiriam; o bloco chega como foi escrito,
 * e o leitor tira a cerca e o que vier antes e depois dela.
 */
const words = (table: Readonly<Record<string, { label: string }>>) =>
  Object.values(table).map((t) => t.label.toLocaleLowerCase('pt-BR'));
const orList = (list: readonly string[]) =>
  list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} ou ${list.at(-1) ?? ''}`;

/** O exemplo do pedido: curto, com cada parte do formato, sem nada do seed. */
export const AI_REQUEST_EXAMPLE = `viajei/1
# Curitiba e Morretes
datas: 20/03/2027 a 21/03/2027
origem: Curitiba, PR

## 20/03/2027 · Descida da serra
- 08:00 origem Saída de Curitiba · Curitiba, PR
  até a próxima: 90 min
- 10:00 natureza Estrada da Graciosa · Quatro Barras, PR
- 12:30 comida Almoço de barreado · Morretes, PR
  obs: Reservar mesa.
- 15:00 hotel Pousada em Morretes · Morretes, PR

## 21/03/2027 · Volta
- 10:00 cidade Centro histórico · Morretes, PR
- 16:00 origem Chegada em Curitiba · Curitiba, PR

## Reservas
- hotel Pousada em Morretes
  parada: Pousada em Morretes
  entrada: 20/03/2027 15:00
  valor: R$ 380,00

## Mala
- Casaco leve

## Missões
- Foto do time na curva da serra
  parada: Estrada da Graciosa`;

export const AI_REQUEST = `Monte o roteiro da viagem que combinamos nesta conversa no formato do Viajei, um app para seguir roteiros de viagem de carro. Responda só com um bloco de código (entre \`\`\`), sem nada antes ou depois, para o texto chegar sem formatação. Não invente: horário, endereço, telefone, valor ou código que não combinamos fica de fora.

O formato:
- A primeira linha é exatamente: viajei/1
- Depois, "# " e o nome da viagem, e as linhas "datas: DD/MM/AAAA a DD/MM/AAAA", "origem: a cidade de onde o carro sai" e, se tiver, "orçamento: R$ 0.000,00".
- Cada dia começa com "## DD/MM/AAAA · título do dia".
- Uma parada por linha: "- HH:MM tipo Nome · endereço ou cidade · link". A hora é opcional. O tipo é obrigatório e é um destes: ${orList(words(STOP_KINDS))}.
- Os detalhes da parada vão nas linhas de baixo, com dois espaços antes: "fecha: HH:MM", "até a próxima: N min" e "obs: texto".
- Nunca escreva coordenadas.
- Depois dos dias, as seções que tiverem, cada uma com "## ":
  - "## Reservas": "- tipo Nome", com o tipo ${orList(words(RESERVATION_TYPES))}, e embaixo, com dois espaços, o que souber: parada, entrada (DD/MM/AAAA HH:MM), saída, código, valor, cancelamento, cancelar até, telefone, endereço, por (onde reservou) e obs;
  - "## Contatos": "- tipo Nome · telefone", com o tipo ${orList(words(CONTACT_TYPES))};
  - "## Antes de ir" e "## Mala": um item por linha, "- texto";
  - "## Missões": coisas curtas e divertidas para o grupo fazer ou registrar num lugar, "- texto", com "parada: Nome" embaixo.

Um exemplo:
${AI_REQUEST_EXAMPLE}`;

/** Os tipos de parada que o pedido lista, para o teste conferir com `STOP_KINDS`. */
export const AI_REQUEST_KINDS = STOP_KIND_KEYS.map((k) =>
  STOP_KINDS[k].label.toLocaleLowerCase('pt-BR'),
);
