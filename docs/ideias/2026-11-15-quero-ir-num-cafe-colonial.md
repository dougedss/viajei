# "Quero ir num café colonial": as opções vêm do mapa, o caminho vem como sugestão

Ideia fechada com o Douglas em 15/11/2026, à noite, depois de um teste realista na produção. Quem lê é
o orquestrador (`docs/fases/orquestrador.md`). A `main` estava em `f8b7563` (a fase 22 fechada); o
levantamento do código abaixo é dessa hora e serve de pista, não de substituto.

A conversa nasceu de um defeito, não de um desejo novo: o Douglas pediu "um café colonial em
Pomerode" e recebeu uma viagem sem café colonial. O teste que reproduziu isso, e o que ele achou no
modo viagem, estão em "O que já existe" e na memória do projeto
(`viajei-defeito-lugares-reais.md`). A viagem do teste ficou na conta dele ("Café colonial em
Pomerode", 15/11, id `72e359d6-1a98-4023-b4f2-3fbd71cdb6f9`), para quem quiser abrir.

## A ideia

A pessoa escreve o que quer, do jeito que fala: "quero ir num café colonial". O app **não adivinha
um roteiro**. Ele pergunta só o essencial que faltar (quando, de onde), **mostra as opções que
existem de verdade** (os cafés coloniais ao alcance, com a cidade e o tempo de carro) e a pessoa
escolhe. Com o destino escolhido, o app traça a rota e, se houver algo que vale a pena **no caminho
ou perto** (um zoológico, um centro histórico, um mirante), **sugere**, cada coisa com o desvio em
minutos, e a pessoa liga o que quiser. A viagem nasce com a saída, o que a pessoa escolheu, o que ela
aceitou e a volta.

A regra de ouro, nas palavras do Douglas: **"apenas pode colocar algo direto na rota se a pessoa
realmente falar no chat"**. O que ela disse ("quero passar no zoológico") entra na rota. Tudo o mais
é sugestão, desligada até ela ligar.

O problema que isso resolve: hoje (fase 17, D207) a IA propõe nomes de lugares de memória e o app
confere cada nome no OpenStreetMap; o que não bate sai em silêncio. No teste de 15/11, com a IA de
verdade, o pedido "café colonial em Pomerode, saindo de Major Vieira" virou "Centro Histórico de
Pomerode", "Museu Pomerode" e "Café Colonial Frohsinn" (que não existe em Pomerode); a conferência
tirou dois, aceitou o museu casando com o **Museu do Brinquedo** só pela palavra "pomerode", e a
viagem nasceu **sem o café colonial**. Na captura do Douglas foi pior: os três lugares saíram e a
viagem ficou só com a saída e a chegada em casa. A IA também acrescenta por conta própria o que
ninguém pediu (o museu, o centro), e a tela deixa salvar uma viagem sem lugar nenhum com um aviso
amarelo. O jeito "adivinha e apaga" não tem conserto por remendo: a pessoa precisa ver opções e
escolher.

## O que entra

### 1. O pedido vira uma vontade, não um roteiro

- A IA lê o pedido e devolve **a intenção, estruturada**: o tipo de lugar que a pessoa quer ("café
  colonial"), o destino ou a área se ela disse ("Pomerode"; "até duas horas daqui"), quando, de
  onde sai, e **os lugares que ela nomeou de verdade** ("quero passar no Zoo Pomerode"). Nada de
  lista de paradas inventada. O mesmo passo das perguntas de hoje (`step: 'ask'`), com a saída mais
  rica.
- As perguntas continuam poucas e ditas antes (decisão 6 de 08/11): só o que falta para buscar as
  opções (quando; de onde, se o app não sabe; a área, se o pedido não diz e o alcance não resolve).

### 2. As opções vêm do mapa

- O app busca no mapa **por tipo, não por nome**: os cafés coloniais (no OSM, cafés e restaurantes
  com "colonial" no nome; a IA traduz o pedido em classes do mapa e palavras do nome, uma tabela
  pequena e explicável, nunca um nome inventado) ao alcance da pessoa. O alcance é o da fase 17
  (D207: 50 km na manhã, 120 no dia, 220 até amanhã, 200 numa viagem), ou a área que ela disse.
- A pessoa vê **cartões**: o nome como está no mapa, a cidade, o tempo de carro a partir da origem
  (pela rota real quando couber na cota; pela distância em linha reta com um aviso, senão), e, só
  quando o mapa tem, o horário de funcionamento. Nada se inventa: sem dado, sem campo (regra 16 e
  "nunca inventar dado" do prompt mestre).
- Ela escolhe uma opção (ou mais de uma, se quiser dois cafés num dia: suposição do balcão, barata
  de permitir). Sem opção nenhuma ao alcance, o app diz isso e oferece aumentar o alcance ou mudar o
  tipo, em vez de montar uma viagem vazia.
- Quando a pessoa **nomeia** um lugar ("Torten Paradies"), o app o confirma no mapa como hoje, mas
  com segunda tentativa de busca (as palavras que distinguem mais a cidade, sem preposição: no
  teste, "zoológico de pomerode, pomerode, sc" devolve zero e "zoológico pomerode" devolve o
  Bioparque Zoo Pomerode), a cidade fora da conta de semelhança, e, se houver mais de um candidato,
  a **escolha** na tela ("Escolher o local", que a revisão da fase 10 já tem) em vez de chutar ou
  apagar.

### 3. A rota e as sugestões no caminho

- Com o destino escolhido, o app traça a rota (a `route-day`, já existe) e busca no mapa o que vale a
  pena **no corredor da rota** e perto do destino: o que a pessoa gosta (o perfil e as notas, como
  pista) mais o clássico de turismo (atração, mirante, cascata, museu, centro histórico, zoológico,
  parque). Cada achado vem com o desvio em minutos a partir da rota.
- A tela mostra **sugestões, desligadas**: um cartão por lugar, com o nome do mapa, a cidade, o
  desvio e uma frase da IA sobre o porquê ("a maior coleção de brinquedos antigos do estado"). A
  pessoa liga o que quiser; o que ela ligar entra na ordem do caminho. Poucas (suposição do balcão:
  até seis, as mais perto da rota e mais parecidas com o gosto dela); nunca uma lista para rolar.
- **Nada liga sozinho.** A única coisa que entra na rota sem passar pela sugestão é o que a pessoa
  falou no chat (a regra de ouro). Isso vale também para a IA: ela escreve a frase de cada sugestão
  e as missões, não decide o que entra.

### 4. A viagem nasce do que foi escolhido

- A revisão é a mesma da fase 10 e 17, com a saída, as opções escolhidas, as sugestões aceitas e a
  chegada, os horários estimados pela rota (o tempo de carro de cada trecho, uma permanência padrão
  por tipo, ajustável na revisão) e o título do dia pela IA.
- A IA continua escrevendo o que é texto: o nome da viagem, a frase de cada parada, as missões, a
  lista "antes de viajar" e a mala. O que é **fato** (lugar, coordenada, distância, horário de
  funcionamento) vem do mapa e da rota, nunca dela.
- Uma viagem com zero lugares além da saída e da chegada **não é um sucesso**: a tela não oferece
  "Criar a viagem" como se estivesse tudo bem; diz o que faltou e volta às opções.
- A saída de hoje ("quero sair hoje", D208) usa as mesmas peças: a pergunta de alcance, as opções ao
  alcance da posição, as sugestões no caminho.

### 5. O que o teste do modo viagem pediu

O carro simulado fez os 408 km (Major Vieira → Museu → Torten Paradies → casa) e o acompanhamento
funcionou: Partiu! e Chegamos! sozinhos, a folha "Como foi?", o aviso "fecha às 18:00", a trilha.
Quatro coisas não:

- **A chegada em casa é um nó de saída.** "Chegada em Major Vieira" é `kind: origin` (é assim que a
  IA e a importação a escrevem) e a D29 trata origem e deslocamento como nós de saída: o Partiu! ao
  deixar o último lugar marcou a chegada como feita e o app disse **"Dia concluído" 204 km antes de
  casa**; não há "Chegamos em casa". Entra: o último nó do dia do tipo origem é um **nó de
  chegada**: "chega às 17:00", Chegamos! (sozinho, pela presença de 3 min, como qualquer parada), e
  o dia só se conclui com ele. O Partiu! do último lugar não o toca. A nota da progressão
  (`progression/rules.ts`: "Chegada em Papanduva, marcada pelo Partiu!…") deixa de valer.
- **A porcentagem do dia anda para trás na volta.** Numa ida e volta pela mesma estrada, a projeção
  do carro na rota pega o ponto mais perto, que na volta é o da ida (46% → 28% → 11% → 0% chegando em
  casa). Entra: a projeção respeita a ordem, a fração do carro só anda a partir da última parada
  concluída (ou da última fração salva) e a posição de cada parada na rota é a do trecho dela, não a
  do ponto mais perto.
- **"Vocês passaram por Chegada em Major Vieira?" logo ao sair de casa.** A chegada tem a mesma
  coordenada da saída e se projeta no começo da rota. Resolve-se com a regra acima (a chegada fica
  no fim do último trecho) e com a pergunta só para paradas até a próxima, em ordem.
- **Os rótulos das cidades de passagem se sobrepõem** ("JARAGUÁ DO SUL" sobre "SÃO BENTO DO SUL",
  fase 22). Pequeno; fica registrado para a fase que mexer nas cidades (a 23) ou para esta, se sobrar.

## Decidido com o Douglas (15/11/2026)

1. **"As coisas precisam ser mais simples para o usuário."** A pessoa diz o que quer ("um café
   colonial") e o app **dá as opções**; ela escolhe. Não um roteiro pronto para ela desfazer.
2. **"Se tiver algum ponto interessante no caminho para visitar, você vai sugerir e não apenas
   adicionar."** O que está no caminho aparece como sugestão, desligada; a pessoa liga.
3. **"Apenas pode colocar algo direto na rota se a pessoa realmente falar no chat."** A regra de
   ouro: só o que ela nomeou entra sem passar pela escolha.
4. **Os lugares vêm do mapa, não da memória da IA** (proposta do balcão no fechamento, sem objeção
   dele): a IA entende e escreve; o mapa diz o que existe, onde e a que distância. É o que torna as
   três decisões acima possíveis sem inventar nem apagar.
5. **Vira trabalho de fase**, com plano, testes e laboratório, não um remendo na conferência de hoje
   (ele pediu para escrever a ideia e o texto do orquestrador; nada foi implementado).

## Descartado

- **Remendar a conferência de hoje** (segunda tentativa de busca, sinônimos "zoológico/zoo", mais
  classes do OSM, cidade fora da conta) **como solução**. Melhora o acerto, e parte entra no item 2,
  mas não resolve o essencial: a IA continuaria inventando nomes e acrescentando paradas que ninguém
  pediu, e o que falhasse continuaria sumindo. Contraria as decisões 1 a 3.
- **A IA consultando o mapa sozinha** (ferramenta dentro da função, a IA decide o roteiro com os
  achados). Esconde a escolha da pessoa, que é o ponto da ideia; e as buscas no OSM são do navegador
  por decisão (D207: o limite é por IP e nada passa pelo Supabase), o que a busca por tipo pode mudar
  (abaixo), mas não para a IA decidir.
- **As sugestões já dentro da viagem, com "tirar".** É "adicionar e deixar desfazer": a decisão 2
  proíbe.
- **Uma lista comprida de opções.** Poucas, as melhores ao alcance; "mais opções" só a pedido. A
  decisão 10 de 08/11 (não poluir a tela) continua valendo.

## O que não dá como foi pedido, e o que dá

- **Buscar por tipo e no corredor da rota não é o que o Nominatim faz.** Ele é um geocodificador
  (nome e endereço): "café colonial pomerode" acha o Mahlzeit, "café colonial em pomerode" devolve
  zero, e não há busca ao longo de uma linha. A busca que a ideia pede ("os cafés coloniais a até
  2 h daqui"; "o que há de interessante a até 10 min da rota") é a do **Overpass**, e os servidores
  públicos dele **não responderam nenhuma vez em 15/11** (overpass-api.de, overpass.kumi.systems,
  overpass.private.coffee, maps.mail.ru: prazo, 502, 504), além de a política deles não servir de
  base para um app (fila por IP, sem garantia). Duas saídas, e a escolha é do Douglas:
  1. **Um Overpass próprio**, com o extrato regional do Sul do Brasil (Geofabrik), num servidor
     pequeno. Há imagem Docker da comunidade de abril de 2026 e o manual oficial cobre a instalação;
     um extrato de estado importa em minutos. O `around` do Overpass aceita uma linha de
     coordenadas: a busca no corredor da rota é nativa. Custo: um servidor (estimativa do balcão,
     não cotada: poucos dólares por mês) e a operação dele, que é infraestrutura nova neste projeto
     (hoje só Vercel e Supabase).
  2. **Uma API comercial sobre o OSM**, atrás de uma Edge Function como a `route-day` faz com o
     OpenRouteService (a chave fica no servidor; regra 9). A **Places API da Geoapify** busca por
     categorias com um filtro `polyline` e uma faixa de até 100 km em volta da linha, exatamente "no
     caminho"; tem plano gratuito com limite diário (o número se confere ao escrever o prompt da
     fase). Sem servidor para cuidar. Fontes: a documentação da Places API
     (<https://apidocs.geoapify.com/docs/places/>) e a da operação de faixa em volta de uma
     geometria (<https://apidocs.geoapify.com/how-to/data-processing/buffer-geometry/>); sobre o
     Overpass, a página do wiki do OSM (<https://wiki.openstreetmap.org/wiki/Overpass_API>) e o
     manual de instalação (<https://dev.overpass-api.de/overpass-doc/en/more_info/setup.html>).
  **Recomendação do balcão:** a opção 2, pela simplicidade operacional e por seguir o padrão que o
  app já tem para o OpenRouteService; a 1 se o Douglas preferir não depender de mais um terceiro. Nos
  dois casos a atribuição ao OpenStreetMap continua na tela.
- **"Café colonial" não é uma classe do mapa.** No OSM é `amenity=cafe` ou `restaurant`, às vezes
  com "colonial" no nome. A tradução do pedido em classes mais palavras do nome é uma tabela pequena
  do app (a IA preenche a partir dela, e o que não estiver nela vira "outro" com as palavras do
  pedido). Haverá tipos que o mapa cobre mal; o app diz "não achei X por perto" em vez de inventar.
- **Horário de funcionamento e "abre no domingo?"** só quando o OSM tem `opening_hours`. Senão, o
  cartão não mostra e a lista "antes de viajar" sugere conferir, como a IA já faz hoje.
- **O tempo de carro de cada opção** pela rota real custa uma chamada ao OpenRouteService por opção
  (cota diária). Suposição do balcão: a distância em linha reta vezes um fator para ordenar e
  mostrar "cerca de", e a rota real só para a opção escolhida. O prompt da fase decide.

## O que já existe

Pistas para o levantamento do orquestrador, em `f8b7563`:

- **A conversa (fase 17):** `src/features/intake/` (`useConversation.ts`, `conversation.ts`,
  `gather.ts`, `today.ts`, `decide.ts`, `verify.ts` e os testes); as telas em
  `intake/routes/CriarViagemPage.tsx` e `intake/components/` (`QuestionsStep`, `CheckingStep`,
  `CheckedNotice`); a função `plan-trip` (`supabase/functions/plan-trip/index.ts`) com
  `_shared/plan-ai.ts` (os dois prompts de sistema), `plan-protocol.ts` (o `ask` e o `plan`, as
  cotas `PLAN_ASK_QUOTA` e `PLAN_FN`) e `plan-handler.ts`. Decisões D201 a D213; a D207 (a
  conferência no OSM) e a D208 (a saída de hoje) são as que esta ideia revisita.
- **O mapa:** `src/lib/geocode/nominatim.ts` (`geocode`, `searchNear` com `viewbox` e `bounded`,
  `reverseGeocode`, a fila de 1,1 s e o cache em `geocode` do Dexie) e `overpass.ts` (uma consulta
  por conversa, POST sem preflight). O teste de 15/11 provou: "zoológico de pomerode, pomerode, sc"
  → 0; "zoológico pomerode" → Bioparque Zoo Pomerode (`tourism=zoo`, classe que `KIND_TAGS` não tem
  em `nature` nem em `city`); "centro de pomerode" → só ruas; "centro pomerode" → o bairro Centro
  como `boundary=administrative` (também fora de `KIND_TAGS`); o Overpass público fora o dia todo.
- **A revisão e a escolha de local:** `src/features/import/` (`geocode.ts` e `useGeocoding.ts`,
  com o estado de escolha "Escolher o local" e "nenhum destes"; `new-review.ts`; `ReviewFlow`,
  `NewTripCard`). A revisão já sabe mostrar candidatos e deixar a pessoa escolher: é a base da
  escolha de opções e sugestões, se couber estender; senão, uma tela antes dela.
- **A rota:** `supabase/functions/route-day/index.ts` (OpenRouteService com OSRM de reserva, a
  geometria simplificada pela tolerância `GEOMETRY_TOLERANCE_M`, os trechos em `legs`), a tabela
  `routes` do Dexie (`DayRoute`: `geometry`, `legs`, `elevation`).
- **O modo viagem:** `src/features/travel-mode/rules.ts` (`dayState`, `isDepartureNode`, a D29),
  `actions.ts` (`depart` marca o nó de saída seguinte como feito), `live-rules.ts` e
  `src/lib/geo/geofence.ts` (`arrivalAt`, 150 m por 3 min), `src/lib/geo/catchup.ts` (as "passadas"
  pela projeção) e `project.ts` (`projectOntoRoute`, o ponto mais perto), `travel-mode/catchup.ts`;
  `DEPARTURE_NODE_KINDS` em `supabase/functions/_shared/constants.ts`;
  `src/features/progression/rules.ts` (a nota sobre "Chegada em Papanduva") e
  `src/features/retrospective/rules.ts` (a "Chegada em" sem pílula no filme). O prompt de sistema da
  conversa manda escrever a chegada como `kind origin, "Chegada em <cidade>"`; a importação e o
  exemplo do pedido para outras IAs (`src/features/import/ai-request.ts`) também.
- **Os testes e o laboratório:** `src/features/intake/verify.test.ts` (a conferência),
  `src/lib/geo/catchup.test.ts`, `e2e/nova-viagem.spec.ts`, o cenário `app_conversa`
  (`scripts/lab/app-conversa.ts`: a IA respondida no navegador, o mapa de verdade) e a medição
  `scripts/lab/measure-conversa.ts`; `src/features/lab/scenarios.ts`.
- **Como o teste de 15/11 foi feito** (serve de roteiro para o e2e e para repetir à mão): a conta
  do Douglas no Chrome, a viagem criada pela conversa, e um `navigator.geolocation` falso injetado na
  página andando pela `geometry` da rota em `routes` do Dexie, com velocidade e um fator de aceleração
  só na distância (as regras de 3 e 10 min são em tempo de relógio). Está na memória do projeto
  (`viajei-defeito-lugares-reais.md`), com as armadilhas.

## O que pede de fora

- **A fonte da busca por tipo** (acima): um servidor para o Overpass próprio, ou a chave da Geoapify
  (ou outra API equivalente) guardada como a do OpenRouteService. **Só o Douglas resolve.** Sem ela,
  a fase ainda entrega a intenção estruturada, a regra de ouro, a confirmação com escolha e os
  consertos do modo viagem, mas as opções e as sugestões ficariam presas ao que o Nominatim acha por
  nome, que é pouco.
- **Leituras de IA:** o passo das perguntas cresce (devolve a intenção) e o passo do roteiro recebe
  as escolhas e os candidatos do mapa em vez de inventar: custo parecido com o de hoje (medir como a
  D140 e a D213 mediram). As cotas por pessoa (`edge_call`) continuam.
- **Nenhuma migration prevista:** a viagem, os dias e as paradas não mudam de forma. Um cache dos
  achados do mapa cabe no Dexie, como o `geocode`.
- **Chamadas à rota** para o tempo de carro das opções, se o prompt da fase decidir pela rota real:
  entra na cota do OpenRouteService.

## Onde encaixa

**Fase nova, grande**, depois da 22 (fechada) e sobre a 17 (fechada). Não cabe na 18, na 23 nem nas
dos carros. Recomendação do balcão: **a próxima a abrir, antes da 18**, pelo mesmo motivo que pôs a 22
antes da 18: é a porta de entrada do app, e o dono do app a achou ruim ("ainda está ruim o principal
do app"). A data da viagem real não entra na conta (decisão 7 de 15/11).

Se precisar quebrar, o corte natural é em duas: **(a)** os consertos do modo viagem do item 5 (o nó
de chegada, a projeção com ordem, a pergunta das passadas), pequenos, sem IA e sem servidor, que
podem sair primeiro como uma fase curta; **(b)** a conversa nova (itens 1 a 4), que depende da
decisão da fonte do mapa. A 23 (os cartões-postais) depende da conferência de lugares da 17; com esta
ideia, a conferência vira a escolha, e a 23 passa a usar as coordenadas escolhidas: a dependência
continua, só muda de nome.

## Como se prova

- **Vitest:** a leitura da intenção (saídas fixas da IA: o tipo, a área, quando, de onde, os lugares
  nomeados; e o pedido com ordens dentro, que continua sendo dado); a tradução do tipo em classes e
  palavras; a montagem das buscas (ao alcance; no corredor da rota); a ordenação das opções e das
  sugestões; **a regra de ouro** (só o nomeado entra; sugestão nasce desligada; nada liga sozinho); a
  confirmação por nome com segunda tentativa e candidatos; a revisão sem lugar bloqueada; o nó de
  chegada (o último origem do dia conclui por Chegamos!, nunca pelo Partiu! anterior); a projeção
  com ordem (a fração não volta numa ida e volta; a chegada no fim do último trecho; a pergunta das
  passadas só até a próxima).
- **A função com entrada fixa**, como a fase 17 fez.
- **e2e** (`nova-viagem.spec`, com o mapa e a IA respondidos no navegador): "quero ir num café
  colonial" → uma pergunta → três opções → a escolha → duas sugestões, uma ligada → a revisão → a
  viagem com exatamente saída, café, a sugestão ligada e chegada. E um e2e de GPS no molde do
  `parada-auto.spec`, com uma ida e volta: sair do último lugar não conclui o dia; chegar em casa
  conclui; a porcentagem não anda para trás.
- **Laboratório:** o `app_conversa` com a IA respondida e o mapa de verdade passa a cobrar as opções
  e as sugestões (contagens em `data`, nenhum texto da pessoa); uma medição real, uma vez, com o
  pedido do teste de 15/11 ("café colonial em Pomerode, saindo de Major Vieira"): as opções têm de
  incluir o Torten Paradies e o Mahlzeit Café Colonial, e as sugestões o Bioparque Zoo Pomerode.
- **À mão, se alguém quiser ver:** o roteiro do GPS falso no Chrome, descrito na memória.

## Em aberto

- **A fonte da busca por tipo** (Overpass próprio ou API comercial): decisão do Douglas, com a
  recomendação do balcão pela API atrás de uma Edge Function. Trava só os itens 2 e 3; o resto segue.
- Leituras do balcão marcadas como suposição nos itens: mais de um destino no mesmo pedido; até seis
  sugestões; o tempo de carro das opções por estimativa e a rota real só para a escolhida; uma
  permanência padrão por tipo nos horários. Se o orquestrador discordar, decide pela regra do plano e
  registra.
