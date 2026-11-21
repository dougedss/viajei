# O mapa por trechos: um trecho até o objetivo por vez, e a volta só ao chegar

Ideia fechada com o Douglas em 21/11/2026, de manhã, a partir de um print da viagem que ele criou
("Manhã de café em Canoinhas", `945dc6f5-3be1-4346-a8f9-98d97caca35a`). Quem lê é o orquestrador
(`docs/fases/orquestrador.md`). A `main` estava em `e64ee9d` (a fase 23 fechada). O levantamento do
código abaixo é dessa hora e serve de pista. A ideia irmã, do mesmo dia, é
`2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`.

## A ideia

Hoje a maquete é uma tira só, com as paradas do dia em ordem, de baixo para cima. Numa ida e volta, a
casa aparece embaixo, na saída, e de novo em cima, na chegada, como se fossem dois lugares. O Douglas,
vendo a própria viagem: "não faz sentido a rota sair do meu local e lá em cima mostrar meu local
novamente. Fica estranho meu ponto estar em dois locais diferentes do mapa".

A proposta dele: **o mapa mostra um trecho por vez, até o objetivo**. "Viagem até Curitiba, mas vou
parar em um parque em Quitandinha e continuo a viagem para Curitiba e depois volto direto para casa.
Quando eu saísse de Major Vieira, deveria aparecer a rota até Curitiba como objetivo e as paradas;
quando eu chegasse em Curitiba ele iria completar e mostraria no mapa a volta de Curitiba para Major."

No exemplo:

1. **Saindo de Major Vieira:** Major Vieira embaixo, o parque em Quitandinha no caminho, Curitiba em
   cima, como objetivo.
2. **Chegando em Curitiba:** o trecho se completa, e o mapa passa a mostrar a volta: Curitiba embaixo
   e Major Vieira em cima.

Com um trecho por vez, embaixo é de onde se sai e em cima é para onde se vai. Num dia sem volta
(Papanduva até Montenegro), nada muda: o dia é um trecho só.

## O que o teste mostrou

A viagem do print saía de Papanduva/SC (a origem errada: o Douglas estava em Major Vieira; a causa
está na ideia irmã), ia a um café em Canoinhas e voltava. O balcão leu a rota guardada no aparelho
(166 pontos, 91 km, 45,5 km por perna):

- **"Monte Castelo" aparece duas vezes na maquete, e a rota não passa lá.** O ponto mais perto fica a
  9 km do centro da cidade. A regra de hoje (D220) dá a cada amostra de 2 km "o município mais populoso
  a até 12 km", não o que a estrada atravessa. E a ida e a volta são dois trechos separados de
  amostras, então `passingPlaces` devolve o mesmo nome duas vezes, e o layout ficou com os dois, como
  o print mostra.
- **A rota passa por Major Vieira**, a 0,9 km do centro, no km 21. No print, cortado, só aparecem os
  dois "Monte Castelo".
- **A casa em dois lugares:** o layout (`src/features/world/layout.ts`) põe os nós do dia em ordem
  numa tira em retrato, e a chegada em casa é o último nó, no alto. O balcão procurou no arquivo um
  tratamento de ida e volta (por palavras) e não achou.

O Douglas: "e nada a ver esse mapa"; "a gente nem passa por Monte Castelo, como ele está supondo".

## O que entra

### 1. O dia vira trechos, e o mapa mostra o trecho da vez

- Um **objetivo** é o destino que a pessoa disse ("vou pra Curitiba"). O que fica antes dele é
  **parada** do trecho. A volta para casa é sempre o último trecho. Um dia pode ter mais de um
  objetivo.
- A maquete, a câmera de repouso e as pílulas mostram **o trecho inteiro até o objetivo**: de onde se
  sai embaixo, o objetivo em cima, as paradas do trecho no caminho.
- **"Cachoeira e depois café" é um objetivo só:** a cachoeira é o objetivo e o café é parada da volta.
  O mapa não fica picado em três trechos curtos.
- **Quando o app não sabe o objetivo** (viagem antiga ou importada): num dia que termina onde começou,
  ele divide só a ida e a volta, no ponto mais longe de casa. Num dia que não volta, um trecho só.

### 2. A troca de trecho

- No **"Chegamos!" do objetivo**, depois do "Como foi?", o trecho se completa e o mapa passa ao
  seguinte.
- **Um indicador pequeno "ida · volta"** no topo (ou "1 de 3" quando há mais), para espiar outro
  trecho com um toque. O trecho feito continua visível como feito.
- **O "Rever o dia"** toca os trechos em sequência.
- **A barra de progresso fala do trecho** ("até Curitiba"), com o total do dia menor ao lado.

### 3. As cidades de passagem

- A cidade de passagem é **a que a estrada atravessa**, não a mais populosa num raio de 12 km.
- **Nunca repetida** no mesmo trecho. Com os trechos, a ida e a volta deixam de pôr o mesmo nome duas
  vezes na mesma tela.

## Decidido com o Douglas (21/11/2026)

1. **O mapa mostra um trecho até o objetivo por vez**, e a volta só aparece ao chegar. Ideia dele.
2. **O objetivo é o destino que a pessoa disse**; o resto é parada do trecho; a volta para casa é o
   último trecho. Recomendação do balcão.
3. **Cachoeira e café: um objetivo, e o café é parada da volta.** Recomendação do balcão.
4. **O mapa troca no "Chegamos!" do objetivo**, depois do "Como foi?". É como ele descreveu.
5. **O indicador "ida · volta", a barra do trecho e a cidade que a estrada atravessa.** Sugestões do
   balcão.

Sobre os itens 2, 3 e 5: o balcão apresentou as recomendações e as sugestões, e o Douglas respondeu
"aceito sugestões dessa também", citando o trecho da resposta. O balcão leu isso como aceite de todas.

## Descartado

- **O dia inteiro numa tira, quando o dia tem volta.** É a decisão 1 de 15/11 ("deve aparecer o mapa
  inteiro do dia da viagem"), que criou a fase 22. Ela passa a valer como "o trecho inteiro até o
  objetivo". O balcão disse isso ao Douglas com essas palavras antes do aceite.
- **Cada lugar escolhido como um objetivo.** Daria um trecho curto por parada, e o mapa perderia a
  visão do caminho.

## O que não dá como foi pedido, e o que dá

- **A viagem antiga não diz qual parada é o objetivo.** O que dá: a regra de reserva (a ida e a volta,
  no ponto mais longe de casa). Nas viagens novas, o objetivo vem da conversa (a ideia irmã e a fase
  26 leem o destino e o que é "no caminho").
- **O trecho feito some da tela principal.** O que dá: o indicador para espiar e o "Rever o dia".

## O que já existe

- `src/features/world/layout.ts`: os nós, o traçado em retrato, `pickPlaces` (as cidades), a caixa da
  maquete. `camera.ts`: a câmera de repouso que enquadra a caixa. O HUD com as pílulas e
  `data-passing-place`.
- `src/lib/geo/segments.ts`: `passingPlaces` e a leitura do lugar por amostras de 2 km.
- A rota guardada tem os `legs` por par de paradas (`routes`, com `distance_m` e `duration_s`), o que
  já dá o corte da geometria por trecho. Leitura do balcão sobre o registro; a conferir.
- `travel-mode/rules.ts`: `nodeRole` e `isArrivalNode` (a chegada em casa como nó de chegada, D233);
  `lib/geo/project.ts`: a projeção com piso para a ida e volta (D234). Com trechos, a mesma estrada
  deixa de aparecer duas vezes na mesma projeção.
- As decisões que a ideia revisita: **D215** (o traçado em retrato e a caixa), **D216** (a câmera de
  repouso: o dia inteiro), **D220** (as cidades de passagem), D217 (o modo de perto), D233 e D234 (a
  chegada e a projeção), e da fase 23 as D258 e D265 (a peça da cidade de passagem). A decisão 1 de
  15/11 muda como descrito acima.

## O que pede de fora

- Nada de servidor, de IA nem de chave, pela leitura do balcão.
- **Migration:** só se o objetivo for guardado na parada. Se ele for sempre derivado (do que a
  conversa disse, guardado no rascunho, ou da regra de reserva), não precisa. A conferir.
- Nada que só o Douglas resolva.

## Onde encaixa

Fase nova, média para grande, sem dependência da busca: depende da 22 e da 24, que estão feitas. O
objetivo dito na conversa chega com a fase 26; antes dela, vale a regra de reserva. Recomendação do
balcão: depois da 26, para nascer com o objetivo de verdade. Se o orquestrador preferir antes, a regra
de reserva basta para as viagens de ida e volta.

## Como se prova

- **Vitest:** a divisão em trechos (com objetivo dito; pela regra de reserva; o dia sem volta como um
  trecho só; cachoeira e café); o layout de um trecho (a origem embaixo, o objetivo em cima, a casa uma
  vez só); as cidades de passagem (a que a estrada atravessa; nunca repetida; o caso de Monte Castelo e
  Major Vieira com a rota do teste).
- **e2e**, no molde do `ida-e-volta.spec`: sair de casa mostra a ida; o "Chegamos!" do objetivo troca
  para a volta; o indicador espia o outro trecho; a barra fala do trecho.
- **Laboratório:** o `app_maquete` com uma viagem de ida e volta, com as capturas dos dois trechos.

## Em aberto

Nada.
