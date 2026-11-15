# O mapa do dia inteiro: a maquete de mesa e os cartões-postais

Ideia fechada no balcão em 15/11/2026, com o Douglas. Quem lê é o orquestrador
(`docs/fases/orquestrador.md`). A `main` estava em `9945f35` e a fase 17 em andamento na branch
`fase-17`; o levantamento do código abaixo é dessa hora e serve de pista, não de substituto.

Os exemplos visuais que o Douglas viu e aprovou estão num artifact privado dele, que uma sessão na
conta dele abre com a ferramenta Artifact (`action: "read"`):
<https://claude.ai/artifact/TV9833ESymuYv99JHMCKqQ>. Arquivos publicados com a página: `img/hoje.jpg`
(a captura real do laboratório de 14/11), `img/A.jpg` (a câmera escolhida), `img/B.jpg`, `img/Z.jpg`
(de perto), `img/T.jpg` (a câmera nova com a arte de hoje), `img/N.jpg` (noite), `img/p-*.jpg` (quatro
peças de memória), `img/m-jardim.jpg` e `img/m-jardim2.jpg` (a peça fiel) e
`fonte/esbocos-threejs.txt` (o three.js dos esboços, um arquivo só). São esboços de direção, feitos
fora do app: valem pela composição e pelo nível de fidelidade, não como código a copiar.

## A ideia

A pessoa abre a viagem e vê **a maquete do dia inteiro**, da saída à chegada, inclinada, como uma
maquete de mesa: a estrada serpenteia de baixo para cima, o carro anda sobre ela e continua sendo o
maior objeto da estrada, e cada parada é uma peça grande, reconhecível de longe. Viagem de um dia:
o dia é a viagem, e é a viagem inteira que aparece. Um toque no carro desce até ele, mostra a
próxima parada à frente e volta sozinho para o dia inteiro.

A maquete deixa de ser genérica. Uma parada que é um lugar conhecido aparece como **o lugar** (a
Cascata do Caracol é a cascata, não um grupo de árvores), e uma cidade por onde a rota passa
aparece com o seu **cartão-postal** na beira da estrada (o exemplo do Douglas: passando por
Curitiba, o Jardim Botânico). As peças são fiéis ao lugar de verdade.

O problema que isso resolve: a fase 14 leu o desenho do caderno (decisão 10 de 08/11) como "câmera
atrás do carro" (D177). O Douglas abriu o app depois dela e não reconheceu o que tinha desenhado. O
dia inteiro hoje só aparece por 1,8 s, na primeira abertura do dia em cada aparelho; depois disso,
e no "Rever o dia", a tela mostra um trecho de estrada e uma parada (no laboratório de 14/11,
`pilulas_em_cena` = 2). E ele quer mais impacto: nos gráficos e na construção das maquetes.

## O que entra

São três partes. A primeira sozinha não se sustenta (ver "Descartado"); a terceira depende das duas
primeiras.

### 1. A câmera do dia inteiro

- **O quadro de repouso é o dia inteiro**, inclinado, entre a barra do dia e a caixa de baixo
  (cartão da vez, "Detalhes", o "Agora"). Todas as paradas do dia em cena, cada uma com a sua
  pílula; a pílula presa ao topo com seta (D177) deixa de ser necessária. Nos esboços: 52° de
  inclinação, FOV 26, numa tela de 393 × 800. O `fitCamera` do app é 64° e FOV 30: a fase afina,
  mas a referência é a imagem A, não o 64° de antes da fase 14.
- **O carro anda sobre a maquete** com a câmera parada, por GPS, por botão, no replay ao abrir e no
  "Rever o dia" (a seção 6.4 do `prompt-implementacao.md` já dizia "câmera parada" para o replay).
  Ele é desenhado maior que a escala (nos esboços 2,55×, com um anel claro no chão) para continuar
  sendo o que o olho acha primeiro.
- **De perto, ao tocar no carro.** A câmera da fase 14 (D177) não se joga fora: vira este modo.
  Desce até o carro, olha a próxima parada e volta sozinha ao dia inteiro. Com reduzir movimento,
  corta. O tempo até voltar a fase decide (suposição do balcão: alguns segundos parado, ou um toque
  fora do carro).
- **A abertura do dia** constrói a maquete no próprio quadro do dia inteiro e termina nele, sem
  descer. As curiosidades continuam mergulhando e voltando.
- **O traçado precisa caber em retrato.** O S de hoje chega a cerca de 61 × 190 unidades mais os
  tocos (`Z_MAX`, `xHalf`): enquadrado inteiro num celular, sobra margem dos lados e tudo fica
  pequeno. Nos esboços o dia ocupa 64 × 132, com mais idas e vindas de um lado ao outro. É uma
  mudança de `layout.ts`, não só de câmera.
- **O palco pequeno conta.** No Safari sem instalar, o palco tem cerca de 563 px de altura e a
  caixa de baixo cobre de 170 a 250 px (estimativa do levantamento, pelas classes; não medida). O
  enquadramento desconta a altura medida do que está sobre o pé do palco, não os 136 px fixos de
  hoje (o limite que a própria D177 registrou).

### 2. A maquete de mesa

- **A base cortada**, como maquete de verdade: o terreno termina num corte de terra sobre uma base
  escura, com sombra embaixo. Hoje o chão vai até a névoa.
- **Peças grandes onde há parada ou cidade**, como num mapa ilustrado de turismo: nos esboços as
  peças têm de 10 a 23 unidades de frente, contra 0,8 a 4,4 das miniaturas de hoje. As miniaturas
  por tipo (`STOP_KINDS`) continuam existindo e são refeitas para essa escala: são o que aparece
  quando o lugar não tem peça própria.
- **Luz e acabamento:** sombra suave, foco mais nítido no meio e levemente desfocado nas bordas de
  cima e de baixo (nos esboços é um desfoque de CSS sobre o canvas, sem pós-processamento), e à
  noite as janelas acesas com uma poça de luz quente em cada lugar do dia (o modo noite já existe).
- **A vegetação e os detalhes da região**, não só monumentos: araucárias no planalto, hortênsias
  na beira da estrada na Serra, parreirais. O app já classifica o bioma e o cenário de cada trecho.
- **A cidade de passagem** tem o nome pequeno, sem pílula e sem horário. No máximo três por dia, as
  maiores, para a tela não poluir (decisão 10 de 08/11).
- **Por que cabe:** parada, a cena não redesenha (`frameloop="demand"`), e com a câmera de repouso
  parada isso vale quase o tempo todo. O orçamento de qualidade pode ir para o quadro parado; o fps
  se mede quando o carro anda e no mergulho. É raciocínio do balcão: a fase mede.

### 3. Os cartões-postais

- **Dois gatilhos.** (a) A parada **é** o lugar: a peça toma o lugar da miniatura do tipo, e o toque
  nela continua abrindo a folha da parada (D178). (b) A rota **passa** pela cidade, sem parada: o
  cartão-postal da cidade fica na beira da estrada, com o nome.
- **Um catálogo de todos, que cresce por viagem.** Quando o roteiro de uma viagem fica pronto
  (paradas com coordenada, rota calculada), o app lista os lugares dela e procura cada um no
  catálogo. O que existe, baixa (poucos KB) e guarda com a viagem, para funcionar sem internet. O
  que falta entra numa fila no servidor: identificar o lugar (OpenStreetMap, Wikidata), buscar
  fotos de referência e medidas, a IA escreve a peça, uma conferência compara a peça com as fotos,
  e ela entra no catálogo. A segunda viagem que passar pelo mesmo lugar recebe na hora, sem IA.
- **Enquanto a peça não chega, e quando não há referência:** a miniatura do tipo. Lugar sem foto
  pública (o hotel, o restaurante) fica com a miniatura do tipo para sempre. O app nunca inventa um
  cartão-postal nem escolhe um por palpite: o lugar precisa existir numa fonte conferível.
- **Fiel, feita olhando as fotos.** No balcão a estufa do Jardim Botânico foi feita duas vezes. De
  memória, saiu com a estrutura errada (três pavilhões soltos). Olhando três fotos da Wikipédia,
  saiu certa: a base larga com 24 vãos em arco e o leque de cada um, os três tambores com as
  cúpulas, o terraço com a fonte e as duas escadas, os canteiros em zigue-zague, o canteiro central
  de amores-perfeitos, os postes de globos, as araucárias ao fundo (`img/m-jardim.jpg`). A foto de
  referência e a conferência contra ela são obrigatórias, não um capricho.
- **A peça é um dado, nunca código.** O servidor entrega uma receita declarativa (formas,
  repetições, materiais de uma paleta fechada), validada por schema e com teto de tamanho, e o
  mesmo construtor das miniaturas a monta. Nada que a IA escreva é executado no aparelho. O
  vocabulário dessa receita é a parte que pede carinho, como o perfil dos carros na fase 19; a
  estufa de `fonte/esbocos-threejs.txt` (função `modelScene`) mostra o que ele precisa dizer:
  contorno em planta, vãos repetidos, arcos, abóbada varrida, cúpulas com nervuras, vidro,
  canteiros, flores instanciadas.
- **Refazer, com limite.** Quem planejou a viagem tem um botão "refazer" na peça. Um toque gera
  mais duas opções e a pessoa escolhe entre elas. O objetivo é limitar o uso.
- **Teto por viagem:** 12 lugares novos gerados por viagem; o que passar disso fica com a miniatura
  do tipo.
- **As fotos são só entrada:** nunca se guardam nem se mostram (a mesma regra da fase 20).

## Decidido com o Douglas (15/11/2026)

1. **A câmera é a A:** o dia inteiro, inclinado, com o toque no carro para ver de perto. "Deve
   aparecer o mapa inteiro do dia da viagem. Se a viagem tem um dia apenas, aparece o mapa da
   viagem." Porque é o que ele desenhou e não achou ao abrir o app.
2. **As peças são fiéis ao lugar real**, e quanto mais próximas da realidade, melhor: "isso dá uma
   imersão ainda maior". Para lugares não vale o "como o GTA faz" dos carros (decisão 9 de 08/11):
   não se estiliza para fugir da semelhança.
3. **Licença não é impedimento:** "são lugares públicos que não tem problema ser fielmente
   parecidos". O balcão registrou o limite de fora mais abaixo e segue a decisão dele.
4. **O nível de fidelidade da estufa refeita basta** (`img/m-jardim.jpg`). É a régua.
5. **O catálogo cresce por viagem planejada:** "para cada viagem planejada, monta as maquetes que
   ainda não tem e vai salvando". Substitui a primeira recomendação do balcão (um catálogo feito à
   mão).
6. **A peça nova entra sozinha**, pela conferência automática contra as fotos; ninguém aprova uma a
   uma. **Ao refazer, o app gera mais duas opções e a pessoa precisa escolher entre elas**, para
   limitar o consumo.
7. **A viagem real não é critério de nada:** "nunca mais, em qualquer lugar, deve levar nossa
   viagem em consideração para nada, apenas vamos fazer". Reafirma a decisão 1 de 08/11. A ordem
   sai só da dependência e do valor.
8. **Valeu por omissão** (o balcão avisou que seguiria assim se ele não dissesse outra coisa, e ele
   não disse): 12 lugares novos por viagem; no máximo três cidades de passagem por dia; cidade de
   passagem com o nome pequeno, sem pílula e sem horário.

Leitura do balcão sobre o item 6, que ele não detalhou: refazer vale **uma vez por lugar**; a
escolha é entre as três (a atual e as duas novas), para ninguém ser obrigado a trocar por uma pior;
e a escolhida passa a ser a peça do catálogo para todos, porque o catálogo tem uma peça por lugar.
Assim um lugar custa no máximo três gerações na vida do app.

## Descartado

- **A câmera B (o dia inteiro, de cima).** Lê-se como mapa, mas as peças perdem o volume e a
  cascata vira uma mancha (`img/B.jpg`). O Douglas escolheu a A.
- **Mudar só a câmera.** Com o dia inteiro na tela, as miniaturas de hoje quase somem e todo dia
  fica igual (`img/T.jpg`). A câmera e a maquete de mesa andam juntas.
- **A câmera de hoje com uma miniatura do dia num canto.** Considerada pelo balcão e não proposta:
  põe mais uma coisa fixa na tela e não entrega o que ele desenhou.
- **Modelo 3D pronto da internet, ou malha gerada por IA a partir de foto** (Meshy, Tripo, Rodin).
  Pesa megabytes por peça, pede um carregador de GLTF que o app não tem, traz a luz da foto
  estampada na textura (não acompanha o dia e a noite da maquete), foge do estilo do carro e do
  cenário, e copia os pixels de uma foto que tem autor. É a mesma conclusão do item 4 de "O que não
  dá" do plano, agora para lugares.
- **Um catálogo feito à mão, começando por uma viagem.** Trocado pelo catálogo que cresce sozinho.
- **O Douglas aprovar cada peça.** Ele não quer ser o portão; a conferência é automática.
- **Ordenar pela data da viagem.** Decisão 7.

## O que não dá como foi pedido, e o que dá

1. **"Ainda mais realista" tem um teto no caminho por código,** e ele é a estufa refeita:
   proporção, estrutura, cor, material e entorno fiéis. O que não dá é textura de foto e forma
   orgânica: uma estátua sai como silhueta, não como retrato. O que dá a mais, sem trocar de
   caminho: ver a peça de perto (o mergulho) e medidas reais quando o OpenStreetMap ou o Wikidata
   as têm.
2. **O lugar é público, a foto tem dono.** As fotos de referência (Wikimedia Commons, licenças
   livres com autoria) entram só como entrada de visão: a IA olha e escreve a peça. Nenhum pixel
   delas vai para o app. É o que a fase 20 já prevê para os carros.
3. **Direito sobre a obra, se o app virar produto.** O art. 48 da Lei 9.610/98 libera representar
   obra situada em logradouro público por pintura, desenho, fotografia e audiovisual; não fala em
   reprodução em três dimensões, e as fontes dizem que o STJ lê o artigo de forma restritiva quando
   há fim lucrativo ([Migalhas](https://www.migalhas.com.br/depeso/137095/obras-de-arte-plastica-protegidas-em-logradouros-publicos),
   [Migalhas, 2025](https://www.migalhas.com.br/depeso/445184/stj-grafite-e-direitos-autorais)). O
   caso conhecido é o Cristo Redentor: a Arquidiocese do Rio se apresenta como titular e já foi à
   Justiça contra usos comerciais, com decisões nos dois sentidos
   ([ConJur](https://www.conjur.com.br/?p=509582),
   [Migalhas](https://www.migalhas.com.br/quentes/278582/operadora-de-planos-de-saude-pode-usar-imagem-do-cristo-redentor-em-propagandas)).
   O Douglas decidiu seguir com peças fiéis (decisão 3). Fica o registro para o dia em que houver
   cobrança ou loja: vale uma consulta, e o catálogo precisa conseguir tirar uma peça do ar.
4. **Função do servidor não desenha 3D.** A conferência da peça contra as fotos precisa de uma
   imagem da peça, e Edge Function não tem WebGL (a conferir pela fase). O plano já resolveu isso
   para os carros na fase 20: o laboratório desenha no Chromium e o Claude compara. O mesmo caminho
   serve aqui.
5. **Hotel e restaurante quase nunca têm foto pública.** Ficam com a miniatura do tipo. Sugestão do
   balcão para depois, não decidida: as fotos que a própria pessoa tira na parada servirem de
   referência para a peça dela, na retrospectiva.
6. **Nada novo do lado do PWA.** A ideia não depende de posição em segundo plano nem de nada que o
   iPhone negue; o app continua útil com a tela apagada do mesmo jeito.

## O que já existe

- **A câmera.** `src/features/world/layout.ts`: o quadro do dia inteiro (`fitCamera`, 64°, FOV 30,
  linhas ~851 a 877) e a caixa do terreno que depende dele (~880 a 915). `src/features/world/camera.ts`:
  a câmera que segue o carro (50°, distância 55 parado, recuo até 150, `CAR_SCREEN_Y`), que vira o
  modo "de perto". `scene/CameraRig.tsx` e `opening.ts`: o dia inteiro só nos 1,8 s da abertura,
  uma vez por dia e aparelho (`world:opened:<dayId>` em `sync_state`, `components/WorldSection.tsx`).
  `replay.ts`: o "Rever o dia" segue o carro. Não há nenhum gesto de câmera em `src/features/world`
  (o protótipo `docs/prototipo-3d.html` tinha arrastar e pinça; a garagem tem).
- **O traçado.** `layout.ts`: o S estilizado, `Z_MAX` = 190, `xHalf` entre 17 e 40, os tocos de 18.
- **O HUD.** `components/WorldHud.tsx` (as pílulas pelo laço, a regra do "em cena", `HUD_TOP` 44) e
  `WorldSection.tsx` (`NOW_BAR_INSET` 136, fixo, que o enquadramento usa no lugar da altura medida).
- **As miniaturas.** `src/art/stops/build.ts` (`BUILDERS`, um construtor por tipo, geometria por
  código, sem instância) e `types.ts` (as caixas de 0,8 a 4,4); `scene/Miniatures.tsx`. Não existe
  miniatura por lugar: o único efeito do nome é o lago (uma expressão regular em `layout.ts`).
- **As cidades.** `src/lib/geo/segments.ts`: `samplePlaces` dá, a cada 2 km da rota, o município
  mais próximo e o mais populoso a até 12 km (nome, UF, população), e `classifySegments` joga os
  nomes fora. Os 5.571 municípios estão embutidos (`municipalities-data.ts`: nome, UF, centroide,
  população; **sem código IBGE**) e funcionam offline. `src/features/weather/usePlaceName.ts` já
  usa o município de um ponto. A parada só tem `lat`, `lng`, `name` e `address`.
- **O motor.** three 0.187 com `WebGPURenderer` e WebGL2 de reserva (`src/lib/three/renderer.ts`);
  nenhum GLTF, nenhum drei; texturas por `CanvasTexture`. `scene/Lighting.tsx`: um sol com sombra
  PCF, hemisfério, ambiente a 0,3, ACES, dois presets de dia e noite; **nenhum pós-processamento**.
  Qualidade Leve e Alta (`src/lib/three/quality.ts`, `src/features/world/quality.ts`).
- **Quem mais usa a câmera.** A retrospectiva (`src/features/retrospective/film.ts`,
  `components/FilmStage.tsx`, `routes/RetrospectivaPage.tsx`) parte de `layout.camera` e reusa o
  cenário: o que mudar no cenário e no traçado aparece no filme.
- **Os testes que mudam de expectativa.** `camera.test.ts` (o quinto da altura, o recuo, o teto),
  `layout.test.ts` (o dia cabe acima do HUD), `e2e/maquete.spec.ts` (hoje assume que o Parque sai
  de cena depois da abertura), `e2e/tela.spec.ts`, e o `app_maquete` do laboratório
  (`scripts/lab/app.ts`: `pilulas_em_cena`, `maquete.png`, `maquete-folha.png`).
- **As decisões que a ideia revisita.** A D177 (a câmera: passa a ser o modo de perto), a D178 (as
  miniaturas: escala nova, e a peça por lugar), a D175 (o que fica sobre a maquete não muda, mas a
  câmera passa a descontar a altura medida), a decisão 1 de 04/11 em
  `docs/atualizacao-prompt-3d.md` (o dia inteiro na tela, que a D177 tinha revertido) e a seção 6.1
  do `prompt-implementacao.md`, que hoje diz "a câmera segue o carro".
- **O molde do gerador.** As fases 19 e 20 do plano (o perfil como dado puro; a fila `build-car`;
  fotos do Commons como entrada de visão; a segunda olhada no Chromium do laboratório; o cache em
  `car_models`; "Pedir outra tentativa", uma vez). Os cartões-postais são o mesmo desenho aplicado
  a lugares, com uma diferença: lugar é fiel, carro é "como o GTA faz".

## O que pede de fora

- **Migration:** o catálogo (o lugar com a sua chave em fonte pública, a receita, a versão, o
  estado), a fila e o registro do refazer. Todo mundo lê, só o servidor escreve. A contagem de uso
  pela `edge_call` e pelo `ai_imports` (a fase 17 acrescenta o `kind` na `0015`).
- **Função nova:** a fila que identifica, busca, gera e confere. Consultas ao Nominatim e ao
  Overpass (a fila da fase 17), ao Wikidata e à API da Wikipédia e do Commons (pedem um
  `User-Agent` identificado e têm limite de taxa).
- **IA, com o custo estimado.** Uma chamada de visão por lugar novo, com o schema da receita como
  saída estruturada, mais uma rodada de conferência. Suposição do balcão para o tamanho: cerca de
  30 mil tokens de entrada (instruções, três fotos, as imagens da peça) e 25 mil de saída (a
  receita, o raciocínio, a correção); a contagem de tokens das fotos não foi conferida. Pela tabela
  de preços de 03/11/2026: **US$ 0,30 por lugar** no Sonnet 5.5 (US$ 2 e US$ 10 por milhão, o
  modelo que a importação já usa), US$ 0,60 no Opus 5.5 (US$ 4 e US$ 20) e US$ 1,25 no Fable 5.2
  (US$ 8 e US$ 40). Uma vez na vida do app por lugar; com o refazer, até três vezes. Com o teto de
  12 lugares novos, uma viagem custa no pior caso de US$ 4 a US$ 7 sem refazer. Qual modelo escreve
  peças fiéis o bastante a fase descobre testando contra a estufa; a fase mede o custo real
  (D140).
- **Chave e conta:** nada novo. A chave `viajei-supabase` e o crédito mensal já existem.
- **Atribuição:** o OpenStreetMap já tem a dele no app. Wikidata é domínio público. As fotos do
  Commons não aparecem no app.
- **Só o Douglas resolve:** nada pendente. O teto de 12 por viagem é dele e pode mudar.

## Onde encaixa

Fase nova, não dentro da 17 (aberta, o prompt não muda mais). Recomendação do balcão: **duas
fases**, porque são dois riscos diferentes.

- **"O dia inteiro na tela"** (as partes 1 e 2): a câmera A com o modo de perto, o traçado em
  retrato, a maquete de mesa, as miniaturas do tipo na escala nova, o nome das cidades de passagem.
  **Grande.** Sem IA, sem servidor, sem migration: código do mundo 3D e testes. Depende só da 14,
  que está na `main`. É a que conserta a tela principal, que o dono do app não reconhece: por isso
  a recomendação é que seja a próxima depois da 17.
- **"Os cartões-postais"** (a parte 3): o vocabulário da receita, o construtor, o catálogo, a fila,
  a conferência, o refazer. **Grande.** Depende da fase acima (a escala e os lugares na maquete) e
  da 17 (a conferência de lugares no OSM e a fila). Divide maquinaria com a 19 e a 20: busca de
  referência, visão, segunda olhada, cache, aviso. Vale ficarem vizinhas, e a que vier primeiro
  constrói a parte comum. Se precisar quebrar, o corte natural é o da 19 e 20: primeiro o
  vocabulário e o construtor, com a estufa escrita à mão como régua e sem IA; depois o gerador.

A posição em relação às fases 18 a 21 é do orquestrador. A data da viagem real não entra na conta
(decisão 7).

## Como se prova

- **Vitest, a câmera e o traçado:** todas as paradas do dia dentro da faixa útil em três proporções
  de palco, incluindo 393 × 563 e 360 de largura, com a altura medida do que está sobre o pé; o
  carro com o tamanho mínimo na tela no dia inteiro; o toque no carro leva ao quadro de perto e a
  volta acontece; o corte com reduzir movimento; o traçado dentro da proporção nova para dias de 2,
  4 e 8 paradas, curtos e longos.
- **Vitest, as peças:** a receita passa no schema, cabe na caixa, assenta no chão e respeita o teto
  de formas (como a D66 e a D178 fizeram); a receita inválida vira a miniatura do tipo; a regra
  dos lugares (a parada casa com o lugar pela coordenada; no máximo três cidades de passagem, as
  maiores; sem referência, sem peça); o teto de 12; o refazer uma vez, com a escolha obrigatória.
- **pgTAP:** o catálogo (todo mundo lê, só o `service_role` escreve), a fila, a cota, o refazer.
- **e2e:** `tela.spec` e `maquete.spec` com o dia inteiro: uma pílula por parada, nenhuma sob a
  caixa de baixo, o toque no carro e a volta, a lista no lugar da maquete como hoje; o
  `retrospectiva.spec` continua tocando o filme.
- **Laboratório:** o `app_maquete` cobra `pilulas_em_cena` igual ao número de paradas do dia e
  guarda `maquete.png` de dia e de noite; um cenário do catálogo com o gerador simulado (custo
  zero) e uma geração de verdade, medida uma vez, até a peça aparecer na maquete; a segunda olhada
  rodando no Chromium do laboratório.
- **A régua visual:** a estufa do Jardim Botânico escrita na receita do app, ao lado de
  `img/m-jardim.jpg`. Se a receita não consegue dizer a estufa, o vocabulário está curto.

## Em aberto

Nada que trave. Dois pontos são leitura do balcão e estão marcados onde aparecem: os detalhes do
refazer (uma vez por lugar, a escolha entre três, a escolhida vale para todos) e o tempo de volta
do modo de perto. Se o orquestrador discordar de algum, decide pela regra do plano e registra.
