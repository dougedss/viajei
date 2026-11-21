# O passeio um passo de cada vez: cada escolha muda a seguinte, perto é perto, e na dúvida o app pergunta

Ideia fechada com o Douglas em 20/11/2026, no fim da tarde, depois de uma bateria de pedidos de leigo
na produção. Quem lê é o orquestrador (`docs/fases/orquestrador.md`). A fase 23 estava aberta e
andando nesta pasta (a `fase-23` em `ccc3cc6` às 21h11 UTC); o levantamento do código abaixo é dessa
hora e serve de pista, não de substituto. Os arquivos da conversa citados aqui são iguais entre
`8e3e89c` (o fechamento da fase 18) e `ccc3cc6`, menos `assemble.ts` e `useConversation.ts` (conferido
por `git diff --stat`). O balcão não conferiu qual sha estava publicado na produção na hora do teste.

A conversa nasceu de um uso real: o Douglas pediu "gostaria de amanha visitar uma cachueira e passar
em cafe(melhor que tiver) e voltar para casa", respondeu "1:30 no maximo" à pergunta do tempo de carro
e recebeu as cachoeiras e os cafés lado a lado, todos medidos a partir de casa. As palavras dele:
"dependendo da escolha onde vou por primeiro ele deveria influenciar na segunda opção que seria o
café, então nem deveria mostrar. Pois talvez eu escolha uma cachoeira e um café muito longe um do
outro, aí a rota fica horrível". E: "se eu não passasse na pesquisa quando eu iria no café, deveria
perguntar qual seria a ordem, para poder fazer as perguntas, e cada lugar influencia o outro".

## A ideia

Um passeio é uma **sequência**, e a conversa passa a montá-lo **um passo de cada vez**. A pessoa
escreve do jeito que fala ("quero ir numa cachoeira e depois tomar um café"). O app lê os passos na
ordem em que ela disse; se ela não disse a ordem, pergunta. Mostra só as opções do primeiro passo.
Escolhida a cachoeira, as opções do café são buscadas **em volta dela e no caminho de volta**, e cada
cartão diz quanto aquilo acrescenta ao passeio. O tempo que a pessoa tem vale para o **passeio todo**
(a estrada mais o tempo nos lugares), fica à vista o tempo inteiro e o que não cabe aparece marcado.

Duas regras do Douglas atravessam tudo:

- **A localização de quem pede decide o que faz sentido.** "Se falo que quero ir amanhã em uma padaria
  aqui perto, não vai ser longe em outro estado e muito menos em Portugal."
- **Na dúvida, o app pergunta; nunca afirma o que não sabe.** "Se ficar em dúvida, deve perguntar e
  não afirmar algo que não sabe."

O problema que isso resolve: desde a fase 24 a conversa lê uma **lista de vontades** e resolve cada
uma sozinha. Todas as vontades são buscadas em volta do mesmo ponto, com o mesmo raio, e aparecem
juntas (`searchMap`, em `src/features/intake/flow.ts`). A ordem dita e as relações entre os lugares
("depois", "no caminho", "por perto", "de manhã", "à noite") não existem na vontade que a IA devolve
(`planIntentSchema`, em `supabase/functions/_shared/plan-protocol.ts`). A ordem final é a do caminho
mais curto (`bestOrder`, D230). O tempo que a pessoa diz vira um raio de ida por lugar. E a cidade
dita vai ao geocodificador sem país nem proximidade. A bateria abaixo mostra o que sai disso.

## O que o teste mostrou

### A conversa do Douglas (ainda estava guardada no aparelho; 20/11, 17h36 de Brasília)

- A vontade lida: `wants` cachoeira (natureza) e café (comida); `when` "amanhã"; `reach` "day";
  `reach_hours` nulo; sem área. Uma pergunta: "Até quanto tempo de carro?" (1 hora, 2 horas, 3 horas).
- A resposta "1:30 no maximo" não foi entendida: a busca foi até **120 km** (a tela diz "a até 2,5 h").
  A cachoeira mais perto da lista já fica a cerca de 1 h 40 (Cachoeira Wiegand, José Boiteux, 71 km).
- 9 "cascatas", 3 delas as "Estrias Glaciais Rio do Salto" (Palmeira): entraram pela palavra "salto"
  do nome.
- 16 cafés, ordenados pela distância de casa. Com a Wiegand marcada, os 6 da tela ficavam de 72 a
  106 km dela em linha reta: um em Papanduva, quatro para o lado de Canoinhas (Bela Vista do Toldo,
  Canoinhas, Três Barras), um em Rio Negro. O café mais perto da cachoeira (Rota Bike Café, Rio dos
  Cedros, 35 km) era o 13º, atrás de "Mais opções".
- "O melhor que tiver" não aparece em lugar nenhum da vontade nem da tela.

### A bateria (20/11, das 17h51 às ~18h10 de Brasília; conta do Douglas, saindo de Papanduva/SC)

Dez pedidos escritos como um leigo escreveria, pela tela da produção. Nove passaram pela leitura da
IA (`ask`); um é a saída de hoje, sem IA; um foi levado até a revisão (uma leitura `plan`). Nenhuma
viagem foi criada. O estado de cada conversa foi lido do Dexie (`sync_state`, chave
`intake:conversation`).

| # | Pedido | O que o app fez |
|---|---|---|
| 1 | amanha quero almoçar em mafra e depois ir numa cachoeira | Sem pergunta. Restaurantes **e cachoeira** a 30 km de Mafra, **Portugal** (centro em 38,94° N, 9,33° O): "Dragão de Mafra", "cerca de 146 h 15 de carro"; a cachoeira era uma "Cascata seca" em Odivelas |
| 2 | quero ir no parque malwee e almoçar por perto | Parque Malwee achado (Jaraguá do Sul). O "por perto" virou restaurantes em volta de Papanduva, raio de 200 km, os de Papanduva e Canoinhas primeiro |
| 3 | vou pra joinville sabado, queria parar pra tomar um cafe no caminho | Sem pergunta. Cafés a 30 km de Joinville, **França** (Froncles, Saint-Dizier). O "no caminho" sumiu; Joinville não entra como parada |
| 4 | sabado quero levar as criancas num parquinho, tomar sorvete e comer pizza a noite | Pergunta do tempo de carro; resposta "aqui perto mesmo, na cidade": buscou até 120 km. Parquinho: "Não achei parquinho a até 2,5 h". Sorveteria: 19. Pizzaria: 1, em Canoinhas, a 1 h. O "à noite" sumiu |
| 5 | domingo quero sair pra algum lugar legal, o que tem pra fazer? | Pergunta "Para onde vocês querem ir?" com as opções "Perto de Papanduva", "Serra catarinense", "Litoral", "Vale Europeu". Escolhido "Litoral": busca no Litoral de **Camarões** (centro em 4,2° N, 10,06° L), 3 opções a 7.320 km |
| 6 | bora numa caxoeira dps comer um xis | A IA entendeu "cachoeira" e "xis". Duas perguntas. Ao digitar "1 hora e meia" no campo livre, o campo se apagou ao chegar em "1 hora" e a resposta gravada foi " e meia": buscou até 200 km ("a até 4 h"). Xis: "não achei" |
| 7 | domingo queria tomar cafe da manha numa padaria boa e depois ir num mirante, voltar antes do almoço | `reach` "morning" lido certo. Pergunta do tempo de carro oferecendo até "3 horas". Padaria: 9 a até 1 h. Mirante: nenhum a 37 km nem a 74 km; a 148 km, 9 opções a partir de 1 h 50. Marcados o mirante (Lapa) e depois a padaria (Canoinhas), a revisão saiu: 08:00 saída, **10:00 mirante, 13:25 padaria, 15:25 chegada**, sem aviso nenhum |
| 8 | sabado quero passar na casa da minha mae em mafra e depois ir num pesque pague | Sem pergunta. A casa da mãe não está na vontade nem na tela. Pesque-pague a 30 km de "Mafra": "não achei" (a coordenada do centro não foi conferida neste) |
| 9 | quero sair hoje a tarde, ver uma cachoeira e depois tomar um cafe | Saída de hoje (sem IA). Pergunta "Quanto tempo vocês têm?" com "A manhã", "O dia", "Até amanhã". Resposta "so a tarde, umas 3 horas": virou 3 h de ida (150 km). O café veio listado antes da cachoeira |
| 10 | fim de semana na praia com a familia, saindo sexta de noite | `reach` "overnight". Com "3 horas": 14 praias; a primeira é a "Prainha do Passaúna", em Curitiba; depois a Praia da Vigorelli (Joinville) e as de Barra Velha |

No teste 7, a ordem da revisão foi a do clique do balcão (o mirante primeiro). No código, com dois
lugares as duas ordens de ida e volta empatam e fica a primeira, que é a ordem em que a pessoa marcou
(`picksOf` e `bestOrder`).

### As funções puras, rodadas no Mac sobre o código da pasta

`hoursOf` (em `flow.ts`), que lê a resposta do tempo:

| Resposta | Lido |
|---|---|
| "1:30", "1:30 no máximo", "hora e meia" | nada (cai no raio padrão) |
| "1 hora e meia", "uma hora e meia", "1 hora e 30 minutos", "no máximo 1 hora e 30" | 1 h (perde a meia hora) |
| "1h30", "1,5 hora", "1.5h", "90 min" | 1,5 h |
| "2 horas", "umas 2h", "duas horas", "meia hora", "uns 40 minutos" | certo |

Os raios de hoje: 1 h dá 37 km, 1,5 h dá 63 km, 2 h dá 92 km, 3 h dá 150 km; sem resposta entendida,
120 km (com `reach` "day") ou 200 km (sem `reach`), que a tela chama de "2,5 h" e "4 h".

### O geocodificador, com chamadas reais (Nominatim público, 20/11)

Como o app manda hoje (`q`, `format=jsonv2`, `limit=5`, `accept-language=pt-BR`; o app usa o primeiro
resultado):

- "mafra": 1º Mafra, Lisboa, Portugal; 2º Mafra, Santa Catarina (a mesma importância, 0,49).
- "joinville": 1º Joinville, Haute-Marne, França (0,56); 2º Joinville, Santa Catarina (0,55).
- "litoral": 1º Litoral, Camarões; depois Benim, Guiné Equatorial, Rússia.
- "vale europeu": uma padaria chamada Vale Europeu, em Indaial.
- "serra catarinense": o Parque de Inovação da Serra Catarinense, em Lages.
- "perto de papanduva": nada (a busca cai em volta de casa).

Com `countrycodes=br`: Mafra/SC e Joinville/SC em 1º; "litoral" vira um bairro de Tramandaí/RS.
Com `viewbox` em volta de Papanduva, **sem** `bounded` (a área preferida): Mafra/SC e Joinville/SC em
1º; "litoral" ainda vira o bairro de Tramandaí. Conclusão conferida: o viés pela localização resolve a
cidade homônima; uma região que não é um lugar do mapa não se resolve por geocodificador nenhum.

## O que entra

### 1. O pedido vira um passeio em ordem

- O passo `ask` continua devolvendo a vontade, e passa a devolver **os passos na ordem dita**. Cada
  passo tem: o que é (um tipo, com as palavras da pessoa; um lugar nomeado; ou um lugar que só ela
  conhece, como "a casa da minha mãe"); **a relação dele** ("aqui perto" e "na cidade" são perto de
  casa; "por perto" e "ali perto" são perto do passo anterior; "no caminho" é no caminho; "em Mafra" é
  naquela cidade); a hora do dia, quando dita ("café da manhã", "à noite", "antes do almoço"); e se a
  ordem foi dita ("depois", "antes", "primeiro").
- **A área é do passo que a disse.** "Almoçar em Mafra e depois ir numa cachoeira": Mafra é do almoço.
  Hoje a área vale para todas as vontades do pedido.
- "Vou pra Joinville" é um destino: a cidade entra como parada, e "no caminho" é o caminho até ela.
- O que o pedido não diz fica vazio, como na D225. A IA continua sem propor lugar nem coordenada.

### 2. As perguntas: só o que falta, e na dúvida pergunta

- **O tempo é o do passeio todo.** "Quanto tempo vocês têm?", com opções que combinam com o pedido (a
  manhã, a tarde, o dia, ou em horas), no lugar de "Até quanto tempo de carro?". O app faz a conta: a
  estrada de ida, entre os lugares e de volta, mais a permanência em cada um.
- **As opções nunca contradizem o que já foi dito ou a hora.** Hoje, a quem volta antes do almoço o
  app oferece "3 horas" de carro, e a saída de hoje oferece "A manhã" à tarde e não tem "a tarde".
- **A ordem não dita se pergunta.** Com mais de um passo e sem ordem dita: "O que vem primeiro?", com
  os passos como opções e um "Tanto faz". No "tanto faz", o app começa pelo tipo com menos opções ao
  alcance (a cachoeira) e encaixa o resto em volta.
- **A cidade em dúvida se pergunta.** O app resolve a cidade pela localização de quem pede (item 4). Se
  sobrar mais de um candidato plausível, ou se o único candidato estiver fora de qualquer alcance
  razoável, pergunta com os candidatos na tela ("Mafra, SC, a cerca de 1 h?"). Nunca busca em
  silêncio num lugar que não sabe ser o certo.
- **A resposta não entendida se pergunta de novo.** Hoje ela vira um raio padrão em silêncio. A tela
  diz que não entendeu e pede de novo, com as opções.
- Continua valendo a decisão 6 de 08/11: até 3 perguntas, ditas antes. A pergunta da ordem conta.
  Suposição do balcão, não conversada: se passarem de 3, a prioridade é quando, o tempo e a ordem.

### 3. As opções, um passo de cada vez

- A tela mostra **só o passo da vez** ("1 de 2 · A cachoeira"). As opções do passo seguinte não
  aparecem antes da escolha do anterior.
- Escolhido um passo, as opções do seguinte são buscadas pela relação dele: perto do anterior, em
  volta do lugar escolhido; no caminho, na faixa da rota entre o anterior e o próximo ponto fixo (casa,
  o destino, ou um lugar já escolhido); perto de casa, em volta de casa; numa cidade, em volta dela.
  Sem relação dita, vale "em volta do anterior e no caminho de volta para casa".
- **Cada cartão diz o que o lugar acrescenta ao passeio** ("a 10 min da Cachoeira Wiegand", "+15 min
  de estrada"), não a distância de casa. As estimativas continuam ditas como "cerca de" (D228).
- **O total fica à vista:** "O passeio dá cerca de 4 h 10: 2 h 40 de estrada e 1 h 30 nos lugares",
  ao lado do tempo que a pessoa disse. A opção que estoura o tempo aparece **marcada**, não escondida.
  Se nada couber, a tela diz e oferece mais tempo ou outra escolha no passo anterior.
- Voltar um passo desfaz as escolhas dos seguintes, e a tela avisa.
- A ordem final é a dos passos. O caminho mais curto (D230) só ordena o que ficou sem ordem.
- As sugestões no caminho (D230) e a regra de ouro (D232) continuam como estão, depois dos passos.
- Suposição do balcão, não conversada: uma escolha por passo, com "Mais um" para quem quiser dois
  cafés (a D228 hoje permite uma ou mais por vontade).

### 4. Onde: a localização de quem pede decide o que faz sentido

- O ponto de referência é a posição do aparelho quando o mapa já tem a permissão, e senão a origem
  conhecida. Hoje, na conversa, a posição nem é lida (`gatherContext` só a lê na saída de hoje), e o
  app sabe só a origem da última viagem. A D176 continua: a conversa não pede a permissão.
- Toda cidade ou área dita é resolvida **com o viés desse ponto** e conferida pela distância. Um
  resultado em outro país, ou fora de qualquer alcance razoável, nunca é usado em silêncio.
- "Aqui perto", "na cidade", "pertinho" são alcance: minutos, não horas.
- As opções que a própria IA oferece para "Para onde?" têm de ser coisas que o app sabe localizar. No
  teste 5, das quatro opções oferecidas, três levam a lugar errado: "Litoral" a Camarões (visto no
  app); "Vale Europeu" a uma padaria em Indaial e "Serra catarinense" a um parque industrial em Lages
  (vistos na chamada direta ao Nominatim, não no app). Sugestão do balcão: a pergunta de quem não sabe para onde ir
  oferece o que existe ao alcance (tipos de passeio e cidades de verdade), nunca nomes de região.

### 5. O que a pessoa disse não some

- O lugar que só ela conhece ("a casa da minha mãe em Mafra") vira uma parada sem coordenada, com
  "Escolher o local" (que a revisão já tem). É a regra de ouro no sentido inverso: o que ela falou no
  chat entra.
- A cidade de destino entra como parada.
- A hora do dia dita vai para os horários da viagem e para a conta do tempo. Se a conta não fecha
  ("voltar antes do almoço" com a padaria às 13:25), a tela avisa antes de criar a viagem.
- "O melhor", "boa", "bem avaliado": o app não sabe qual é o melhor (ver "O que não dá"). Ele diz isso
  na tela, em vez de fingir que escolheu.

### 6. Os defeitos puros (a correção curta, na frente)

Não dependem do desenho novo e quebram a conversa hoje:

1. **A cidade fora do Brasil.** `first()` em `flow.ts` usa o primeiro resultado de `geocode()`
   (`src/lib/geocode/nominatim.ts`), que não manda país nem área preferida. O cache do `geocode` é
   pela consulta: com o viés, a chave precisa levar o ponto de referência.
2. **O campo livre que se apaga.** Em `QuestionsStep.tsx`, `value={chosen ? '' : answer}`: quando o
   texto digitado fica igual a uma opção ("1 hora" a caminho de "1 hora e meia"), o campo esvazia e o
   resto da digitação substitui a resposta.
3. **O tempo mal lido.** `hoursOf`: a tabela acima, medida rodando a função. Pela leitura da
   expressão (não medido à parte): "meia" depois de "hora e" não é lida, em "1 hora e 30" o "h"
   sozinho casa antes de "hora" e os minutos se perdem, e o formato "1:30" não está previsto.
4. **A resposta não entendida vira raio padrão em silêncio** (120 ou 200 km).
5. **As opções que contradizem o pedido ou a hora** (o prompt do `ask` fixa "1 hora", "2 horas",
   "3 horas"; `todayQuestions` não olha a hora nem o texto).
6. **A saída de hoje lista as vontades na ordem da tabela de tipos**, não na do texto (`wantsInText`).
7. **O nome que casa sem ser o tipo.** "Estrias Glaciais Rio do Salto" como cascata.
8. **Tipos comuns fora da tabela** (`PLACE_TYPES`, D227): parquinho, xis, pesque-pague. Viram "outro"
   com a palavra no filtro de nome, e nos três testes a busca não achou nada. As categorias certas da Places API
   são a conferir. E a tela do "não achei" pode oferecer a busca pelo nome, que hoje só aparece quando
   a busca por tipo falha.

## Decidido com o Douglas (20/11/2026)

1. **Cada escolha influencia a seguinte, e as opções do passo seguinte não aparecem antes.** Porque
   escolher uma cachoeira e um café longe um do outro dá uma rota ruim, e a tela de hoje convida a isso.
2. **A ordem se lê quando dita e se pergunta quando não dita.** Pedido dele. A forma da pergunta ("O
   que vem primeiro?", com "Tanto faz") foi recomendação do balcão.
3. **O tempo perguntado é o do passeio todo, e o app faz a conta.** Recomendação do balcão.
4. **A localização de quem pede decide o que faz sentido.** "Aqui perto" é perto; nunca outro estado,
   nunca outro país.
5. **Na dúvida, o app pergunta e não afirma o que não sabe.** Vale para a cidade, para o tempo e para
   qualquer resposta que ele não entendeu.
6. **Os defeitos puros viram uma correção curta, na frente da fase grande.** Recomendação do balcão.
7. **A prova é com pedidos de leigo.** "Textos bem simples, como realmente uma pessoa leiga iria
   fazer."

Sobre os itens 2, 3 e 6: o balcão apresentou as três recomendações e o Douglas respondeu "Aceito
sugestões". O balcão leu isso como aceite das três. A leitura é do balcão.

## Descartado

- **Manter as listas juntas e só reordenar a segunda depois da primeira escolha.** Considerado pelo
  balcão e não levado ao Douglas, porque ele já tinha dito que a segunda "nem deveria mostrar".
- **O app decidir a ordem sozinho quando ela não foi dita.** É o que acontece hoje (o caminho mais
  curto, ou a ordem do clique). Sai: a ordem muda o passeio, e quem sabe é a pessoa.
- **Perguntar "até quanto tempo de carro?" como raio de ida por lugar.** Um leigo pensa "tenho a
  tarde", e dois lugares a 1 h 30 de casa em direções opostas cabem no raio e não cabem na tarde.
- **Resolver a cidade só com `countrycodes=br`.** Não basta: há homônimos dentro do Brasil (uma Mafra
  em Nova Mutum/MT apareceu em 2º) e "Litoral" vira um bairro de Tramandaí. O que resolve é o viés
  pela localização mais a conferência pela distância, com a pergunta na dúvida.

## O que não dá como foi pedido, e o que dá

- **"O melhor café que tiver".** O mapa não tem nota de avaliação. A documentação pública da Places
  API da Geoapify, lida em 20/11 (leitura parcial da página), não lista campo de nota nem ordenação
  por avaliação; a conferir pelo orquestrador. O que dá: mostrar o que existe, com o que o mapa sabe
  (o horário, quando há), e dizer na tela que o app não sabe qual é o melhor. Uma fonte de avaliações
  seria outro serviço, com chave e contrato: fora desta ideia.
- **Regiões que não são um lugar do mapa** ("Litoral", "Serra", "Vale Europeu"). Um geocodificador
  devolve qualquer coisa com esse nome. O que dá: não oferecer região como resposta; oferecer cidades
  e tipos de passeio que existem ao alcance; e, se a pessoa escrever uma região, perguntar a cidade.
- **A busca por tipo nem sempre acha o que existe.** No teste 4, a busca de pizzaria num raio de
  120 km de Papanduva devolveu uma só, em Canoinhas, a 1 h. O balcão não conferiu a causa (o mapa sem
  o lugar, o lugar sem a categoria de pizza, ou a tabela de tipos). O que dá, em qualquer dos casos:
  dizer que a busca não achou, sem afirmar que não existe, e oferecer a busca pelo nome.
- **A posição na conversa.** Só existe se o mapa já tinha a permissão (D176). Sem ela, o ponto de
  referência é a origem conhecida, e a primeira conversa de uma conta nova pergunta de onde saem,
  como hoje.
- **Mais buscas por conversa.** Uma rodada de busca por passo, em vez de uma por vontade no começo. A
  cota por pessoa da `find-places` é de 60 em 24 h; a bateria gastou no máximo umas 22 em dez
  conversas no modelo de hoje (contagem do balcão pelos passos, não lida no servidor). O número novo e
  o limite da Geoapify são a conferir ao escrever o prompt.

## O que já existe

- `supabase/functions/_shared/plan-ai.ts`: `PLAN_ASK_SYSTEM_PROMPT` (as perguntas fixas, as opções
  "1 hora", "2 horas", "3 horas"), `aiAskSchema` e `fromAiAsk` (uma união só, o `reach_hours`; o teto
  é de 16 por schema, D129). `plan-protocol.ts`: `planIntentSchema`, `QUESTION_TOPICS`,
  `MAX_QUESTIONS` 3, `MAX_WANTS` 4, as cotas (`ask` 20 e `plan` 10 em 24 h).
- `src/features/intake/flow.ts`: `searchMap` (todas as vontades no mesmo centro e raio), `hoursOf`,
  `defaultRadius`, `first()` (a cidade pelo primeiro resultado), `picksOf`, `prepare` (a ordem, a
  rota, o corredor). `search.ts`: `radiusForHours`, `driveMinutes`, `optionsFor` (a ordenação pela
  distância de onde se procura), `bestOrder`, `corridorArea`, `suggestionsFor`. `places.ts`: a tabela
  de tipos e `wantsInText`.
- A `find-places` já busca em círculo com proximidade e em corredor de uma linha
  (`places-schema.ts`): a busca "em volta do lugar escolhido" e "no caminho" não pede função nova.
  Leitura do balcão sobre o código; o orquestrador confere.
- `src/features/intake/components/QuestionsStep.tsx` e `OptionsStep.tsx` (os grupos todos numa tela);
  `useConversation.ts` (os estágios); `conversation.ts` (a conversa no Dexie, `sync_state`).
- `src/features/intake/gather.ts` (a posição só na saída de hoje; a origem é a da última viagem) e
  `today.ts` (as perguntas do app na saída de hoje).
- `src/lib/geocode/nominatim.ts`: `geocode` sem país nem área; `searchNear` já usa `viewbox` com
  `bounded`.
- As decisões que a ideia revisita: **D225** (a vontade ganha os passos e as relações), **D228** (onde
  se procura, o alcance, uma ou mais por vontade), **D230** (a ordem pelo caminho mais curto), D227 (a
  tabela de tipos), D208 (a saída de hoje), D176 (a posição, mantida). A regra de ouro (D232), "a IA
  escreve e não escolhe" (D231) e as sugestões desligadas continuam.
- A observação da D238 (o pedido sem tipo dá opções genéricas), que está na 3.0 da fase 23, é vizinha
  do teste 5 e não é a mesma coisa: no teste 5 o defeito é a região oferecida que vai para Camarões.
- O plano (`docs/fases/plano-melhorias.md`) não prevê nada disto hoje.

## O que pede de fora

- **Nenhuma migration**, pela leitura do balcão: a conversa mora no aparelho e a forma da viagem não
  muda. A conferir.
- **A `plan-trip` republicada** (o schema e o prompt do `ask`), compatível com o app da produção
  durante a troca, como a fase 24 fez.
- **IA:** as mesmas duas leituras por conversa (`ask` e `plan`). A saída do `ask` cresce um pouco;
  custo não medido pelo balcão (a D237 tem os números de hoje).
- **Geoapify:** mais buscas por conversa. Nenhuma chave nova.
- **Só do Douglas:** nada, pela leitura do balcão.

## Onde encaixa

A fase 23 está aberta e o prompt dela não muda. A ideia cabe em duas fases novas, as duas dependendo
só da 24 (feita):

- **A correção curta** (pequena): os oito defeitos do item 6, mais "a resposta não entendida se
  pergunta de novo" e "a cidade em dúvida se pergunta" na forma mínima. Sem desenho novo de tela.
- **O passeio um passo de cada vez** (grande): os itens 1 a 5.

Recomendação de ordem: 23 (aberta) → a correção curta → o passo a passo → 19 → 20 → 21. O motivo é o
mesmo que pôs a 24 antes da 18: é a porta de entrada do app, e hoje um pedido com "em Mafra" ou "pra
Joinville" sai do Brasil. Se o orquestrador preferir uma fase só, a correção curta é o corte natural
do começo dela.

## Como se prova

- **Vitest:** a tabela de respostas de tempo desta ideia (cada linha vira um caso); a cidade com o
  viés e a conferência pela distância (Mafra, Joinville, "Litoral", com respostas fixas do Nominatim);
  a busca do passo seguinte centrada na escolha do anterior e no corredor; a conta do passeio e a
  marca do que estoura; a ordem dos passos mantida; a saída de hoje na ordem do texto.
- **A função com entrada fixa**, como a 17 e a 24: os passos, as relações e a ordem dita nas saídas da
  IA; as opções das perguntas coerentes com o pedido.
- **e2e:** `nova-viagem.spec` com o mapa e a IA respondidos no navegador: dois passos, o segundo só
  aparece depois da escolha do primeiro e as opções dele mudam com ela; o campo livre aceita "1 hora e
  meia" inteiro; a pergunta da ordem quando o pedido não diz.
- **Laboratório:** o `medir-conversa` ganha a bateria de leigo desta ideia (os dez pedidos e o do
  Douglas), com o que cobrar em cada um: nenhuma opção fora do Brasil; as opções do segundo passo
  perto da escolha do primeiro; a ordem dita mantida na revisão; o tempo estourado avisado; a casa da
  mãe como parada. Com teto de custo, como as medições anteriores.

## Em aberto

- O Douglas não disse se o "1:30 no máximo" dele era a estrada até chegar ou o passeio todo. A
  decisão 3 dispensa a resposta: o app passa a perguntar pelo passeio todo.

## Completada em 21/11/2026

Duas ideias fechadas no dia seguinte completam esta e, em parte, a substituem:

- `2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`: a fonte de lugares passa a ser o Google Places, a IA
  planeja a busca com ferramentas e o app julga (a tabela de tipos sai), o GPS entra na conversa, nada
  some em silêncio, o chat continua depois do roteiro pronto, e a bateria de pedidos roda fora do
  deploy. Com a nota do Google, "o melhor café" passa a ter resposta.
- `2026-11-21-o-mapa-por-trechos.md`: a maquete mostra um trecho até o objetivo por vez.

Onde este arquivo e os de 21/11 divergirem, valem os de 21/11. O passeio um passo de cada vez (os itens
1 a 5 daqui) continua valendo, construído sobre as fundações novas.
