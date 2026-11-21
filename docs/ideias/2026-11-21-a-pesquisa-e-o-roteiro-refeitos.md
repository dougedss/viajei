# A pesquisa e a montagem do roteiro, refeitas: o Google como fonte, a IA com ferramentas, o app julga

Ideia fechada com o Douglas em 21/11/2026, de manhã, depois de mais um pedido real dele e de uma
leitura das fontes de lugares. Quem lê é o orquestrador (`docs/fases/orquestrador.md`). A `main`
estava em `e64ee9d` (a fase 23 fechada). O `fase-25.md` já estava escrito, e o Douglas tinha pedido
ao orquestrador para **esperar estes ajustes** antes de abrir a sessão ("você ajusta as demandas
todas de uma vez"). O levantamento do código abaixo é dessa hora e serve de pista.

Esta ideia **completa e em parte substitui** `2026-11-20-o-passeio-um-passo-de-cada-vez.md`. Onde as
duas divergirem, vale esta. O que muda nas fases 25 e 26 está em "Onde encaixa". A ideia irmã, do
mesmo dia, é `2026-11-21-o-mapa-por-trechos.md`.

## A ideia

A prioridade, nas palavras do Douglas: "Essa parte da pesquisa e montar o roteiro deveria ser a
melhor do nosso app e devemos gastar o tempo e dinheiro que for nela para deixar quase perfeita."
Sobre o resultado de hoje: "Nada de imersão para o usuário, apenas frustração."

O diagnóstico do balcão, que ele aceitou: **o problema não é o modelo da IA**. A IA lê certo o que a
pessoa pede. O que falha é o que fica entre a IA e a tela: um tradutor escrito à mão (a tabela de
tipos), um círculo único de busca e um mapa pobre em comércio de cidade pequena. O que não cabe neles
some em silêncio, e depois a IA que escreve a viagem fala do que sumiu como se estivesse lá.

A forma nova tem três fundações e quatro consequências:

1. **A fonte de lugares passa a ser o Google Places.**
2. **A IA planeja a busca com ferramentas, e o app julga.** A tabela de tipos sai.
3. **O app sabe onde a pessoa está**: o GPS entra na conversa e em toda etapa em que ajudar.
4. Nada do que a pessoa pediu some em silêncio, e o texto só fala do que existe.
5. O chat continua disponível depois do roteiro pronto.
6. Uma bateria de pedidos de leigo mede a qualidade, fora do deploy.
7. O passeio um passo de cada vez (a ideia de 20/11) continua valendo, agora sobre estas fundações.

## O que o teste mostrou (21/11)

### O pedido do Douglas

"iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em canoinhas sc".
Ele estava em Major Vieira. A conversa original não ficou guardada (ela é apagada do aparelho quando a
viagem é criada), então o balcão repetiu o pedido na produção com esse texto e leu a viagem que ele
criou ("Manhã de café em Canoinhas", `945dc6f5-3be1-4346-a8f9-98d97caca35a`).

- **A IA entendeu tudo:** `wants` feirinha (evento), café (comida) e cortar o cabelo (outro); área
  "Canoinhas SC". A cidade foi achada certa (centro em 26,18° S, 50,39° O).
- **A tabela de tipos derrubou duas das três.** "Feirinha" virou as categorias `tourism.attraction` e
  `entertainment` com "feirinha" no nome. "Cortar o cabelo" virou `tourism.attraction`,
  `tourism.sights` e `entertainment` com "cortar" ou "cabelo" no nome. As duas buscas voltaram "Não
  achei … a até 50 min de Canoinhas SC", por construção.
- **O café:** 4 opções num círculo de 30 km em volta do centro: duas em Canoinhas, uma em Três Barras
  e uma em Bela Vista do Toldo. O Douglas: "não faz sentido, totalmente longe". Ele relatou ter visto
  cafés de Rio Negrinho e Mafra na conversa dele; o balcão não reproduziu isso.
- **A viagem criada só tem o café**, mas o dia se chama "Café e feirinha em Canoinhas", a nota do café
  diz "boa pedida para o café da manhã enquanto o cabelo é feito", a lista tem "Confirmar o horário do
  salão e da cafeteria no sábado" e "Sacola para as compras da feirinha", e há uma missão "Achar na
  feirinha algo que combine com a cor do guarda-chuva".
- **A origem saiu como Papanduva/SC.** A conversa não lê a posição do aparelho (`gatherContext`, em
  `intake/gather.ts`, só a lê na saída de hoje). A origem vem de `lastOrigin`
  (`features/import/new-trip.ts`), que devolve a da viagem com a **data de início mais distante**: a de
  dezembro, de Papanduva. O perfil não tem campo de cidade. O "cerca de 1 h de carro" dos cafés foi
  contado de Papanduva.

### O que cada mapa tem em Canoinhas

| O que se procura | O mapa de hoje (OpenStreetMap) | Google Maps |
|---|---|---|
| Cabeleireiro | 1 ("Garage do Corte") | mais de 40 na lista, que não chegou ao fim |
| Café | 2 em Canoinhas nas opções do app | uns 12 cafés no começo da lista |
| Feira | "Mercado Público Municipal" (categoria de feira) | "Mercado Municipal de Canoinhas", "Praça Lauro Müller", "Mercado Público de Canoinhas" |

O OpenStreetMap foi consultado pelo Nominatim público, numa caixa em volta da cidade; o Google Maps,
pelo site, no Chrome. A documentação da Geoapify diz: "We use the OpenStreetMap as the data source".
Nenhum dos dois mapas tem "a feirinha" como um lugar: quem sabe onde ela fica é a pessoa.

## O que entra

### 1. O app sabe onde a pessoa está

- **O GPS entra na conversa que monta o roteiro e em toda etapa em que ajudar.** O Douglas: "deve usar
  no momento que está montando o roteiro e todas as outras etapas que achar necessário, não devemos
  poupar recurso". Hoje a conversa não pede a permissão (uma nota da D176 em `gather.ts`); passa a
  pedir ali, com uma frase.
- **De onde a pessoa sai fica à vista e editável** ("Saindo de Major Vieira · mudar"), antes das
  opções. Sugestão do balcão, aceita.
- **`lastOrigin` é um defeito:** a origem de uma viagem futura não diz onde a pessoa está hoje. Sem
  posição, vale a origem da viagem mais recente e a pergunta na dúvida.
- A posição é o ponto de referência de tudo: o viés da cidade dita, o "aqui perto", os tempos de carro.
- Sugestão do balcão, não conversada: manter o arredondamento a uns 1 km no que sai do aparelho, como
  a D208 e a D228 já fazem.

### 2. A fonte de lugares é o Google Places

- A busca passa a consultar a **Places API (New)** do Google, atrás de uma função nossa, com a chave
  no servidor (regra 9). O Douglas: "Acho que o melhor é Google Places"; "é confiável e mais
  atualizado", e traz as avaliações.
- **O que os cartões ganham:** a nota e o número de avaliações, o horário e o "aberto nesse horário",
  o lugar fechado de vez. Sugestão do balcão: a tela diz que o dado vem do Google Maps, como hoje diz
  do OpenStreetMap e da Geoapify.
- **"O melhor café que tiver" passa a ter resposta:** com a nota, o app pode ordenar pelo melhor e
  dizer o critério. Isto revê o item "o app não sabe qual é o melhor" da ideia de 20/11.
- **"Em Canoinhas" é dentro da cidade.** Só abre para os vizinhos quando não acha, e dizendo. Hoje é um
  círculo de 30 km (D228).
- **O horário entra na conta do passeio.** Sugestão do balcão: com o horário do lugar, o app avisa
  quando o roteiro chega antes de abrir ou depois de fechar.
- **O roteiro guarda o lugar inteiro**, como hoje: o nome, o endereço e a coordenada, mais o
  identificador do Google (`place_id`). Decisão do Douglas, abaixo.
- O que fica da `find-places` de hoje (a Geoapify) é do levantamento do orquestrador. Leitura do
  balcão: ela pode continuar servindo as sugestões de natureza e turismo, onde o OpenStreetMap é bom,
  até a medição dizer o contrário.

### 3. A IA planeja a busca com ferramentas; o app julga

- A tabela de tipos (`PLACE_TYPES`, D227) e o filtro por palavra do nome saem do caminho principal. A
  IA recebe o pedido e o contexto (onde a pessoa está, a hora, o dia da semana, os gostos) e usa
  ferramentas nossas, executadas pela função:
  - **procurar lugares:** o que se quer, com as palavras da pessoa, e onde (dentro de uma cidade, perto
    de um ponto, no caminho entre dois pontos);
  - **localizar um nome:** o lugar que a pessoa nomeou;
  - **tempo de carro** entre dois pontos.
- Ela devolve o passeio em passos: a ordem, a relação de cada passo com o anterior, os candidatos de
  cada passo, **o que não achou** e **as perguntas quando tem dúvida**.
- **O app julga.** Só vale candidato que voltou de uma ferramenta nesta conversa; a função confere cada
  identificador. A IA continua sem inventar lugar, coordenada nem horário. A regra de ouro (D232) e "a
  IA escreve e não escolhe" (D231) continuam: nada entra no roteiro sem a pessoa escolher.
- O laço é curto e tem teto de chamadas. O modelo de hoje (`claude-sonnet-5-5`, em `IMPORT_VARIANTS`)
  serve: nos onze pedidos que ele leu em dois dias, entendeu os tipos e a cidade, inclusive com erro
  de digitação. O que se perdeu (a ordem, o "no caminho", a casa da mãe) não cabia na forma que o app
  pede de volta.
- O Douglas: "Gostei do app julga".

### 4. Nada some em silêncio, e o texto só fala do que existe

- Cada coisa que a pessoa pediu termina num de três estados, visível na tela: **escolhida**,
  **pendente** (a busca não achou: "Escolher o local", ou uma pergunta, como "Onde fica a feirinha?")
  ou **tirada pela pessoa**.
- A leitura que escreve a viagem recebe só o que entrou de fato e as pendências marcadas. Ela não
  escreve título, nota, lista nem missão sobre o que não está no roteiro.
- Vale a regra do Douglas de 20/11: na dúvida, o app pergunta; nunca afirma o que não sabe.

### 5. O chat continua depois do roteiro pronto

- O Douglas: "mesmo após o roteiro estar montado, ainda deixar o chat para o user, para ele ir podendo
  tirar dúvidas, sugestões e ir ajustando seu roteiro".
- A mesma IA, com as mesmas ferramentas, mais a leitura da viagem. Três usos: **dúvidas** ("o café
  abre domingo?"), **sugestões** ("o que tem perto do mirante?") e **ajustes** ("troca o café por uma
  padaria", "sai às 9", "tira a segunda parada").
- **Cada mudança proposta aparece como um cartão com "Aplicar".** Nada muda sem o toque, e há desfazer.
  É o mesmo "o app julga". Sugestão do balcão, aceita.
- Só com rede. Onde mora o histórico do chat (só no aparelho, ou sincronizado com o time) é do
  levantamento do orquestrador.

### 6. A bateria de pedidos de leigo

- Decisão do Douglas: **10 pedidos por rodada, sempre um diferente do outro**, com os resultados
  **guardados** "para sempre ir melhorando e analisá-los", e **fora do deploy** ("não pode ser atrelado
  ao deploy, para não deixar ainda mais demorado").
- O laboratório já roda sozinho, todo dia e sob pedido, separado do deploy, e grava as rodadas em
  `lab_runs` (o painel `/lab`). A bateria entra como uma tarefa dele, nunca como portão da CI.
- O que guardar por pedido: o texto, o que a IA leu, o que as ferramentas devolveram, o que ficou
  pendente, o roteiro que saiu, o tempo e o custo, e o resultado de cada cobrança.
- Sugestão do balcão para as cobranças, não conversada: as que valem para qualquer pedido (nada fora
  do alcance dito, nada que suma sem aviso, a ordem dita mantida, a cidade certa, cada coisa pedida
  com um desfecho) mais uma leitura da IA que julga o roteiro contra o pedido.
- Os onze pedidos destes dois dias (os dez de 20/11 e o de Canoinhas) são o primeiro material.

### 7. O passeio um passo de cada vez continua

A ideia de 20/11 (a ordem dita ou perguntada, as opções do passo seguinte em volta da escolha
anterior, o tempo do passeio todo à vista) continua valendo e passa a ser construída sobre a IA com
ferramentas e o Google. A relação entre os passos deixa de ser uma tabela de regras do app e vira o
"onde" da ferramenta de procurar lugares.

## Decidido com o Douglas (21/11/2026)

1. **A pesquisa e a montagem do roteiro são a prioridade do app**, com o tempo e o dinheiro que
   for preciso.
2. **O GPS entra na conversa e em toda etapa em que ajudar.**
3. **A fonte é o Google Places**, com as avaliações e o horário.
4. **O roteiro guarda o nome e o endereço do lugar, como hoje, e os termos do Google não entram na
   conta.** O balcão leu os termos e disse que eles proíbem isso (abaixo). O Douglas respondeu: "como
   é um app de pesquisa e desenvolvimento, não tem problema, é apenas para nós usar, veja que não tem
   nada cobrando e ele é fechado". E reafirmou: "não levar em consideração os termos, apenas vamos
   usar o recurso e pronto para nosso estudo de app fechado. Isso está sendo apenas um teste de app."
   As sessões seguem esta decisão e não a reabrem.
5. **A IA planeja com ferramentas e o app julga.** A tabela de tipos sai (revê a D227).
6. **A bateria:** 10 pedidos por rodada, diferentes, resultados guardados, fora do deploy.
7. **O chat continua depois do roteiro pronto.**
8. **As sugestões do balcão estão aceitas** ("aceito sugestões", duas vezes): a origem à vista e
   editável; "em Canoinhas" dentro da cidade; nada some em silêncio; o texto só fala do que existe; o
   cartão com "Aplicar" no chat.

## Descartado

- **Trocar o modelo da IA.** O Sonnet 5.5 entendeu os pedidos; um modelo maior alimentaria o mesmo
  funil.
- **Um índice próprio de lugares com dados abertos como base** (Overture, Foursquare aberto). Foi a
  primeira recomendação do balcão, por poder guardar tudo sem restrição. O Douglas preferiu o Google,
  pela cobertura e pelas avaliações. A cobertura dos dados abertos no interior de SC não chegou a ser
  medida. Fica como reserva se o Google deixar de servir.
- **Guardar só a referência do Google** (o identificador e a coordenada renovada) e **pedir a permissão
  ao Google antes**. Eram os caminhos que o balcão recomendou para ficar dentro dos termos. Saíram pela
  decisão 4.
- **Um robô raspando o Google Maps.** Não recomendado pelo balcão, e desnecessário com a API.
- **Uma bateria de 50 a 100 pedidos como portão do deploy.** O Douglas reduziu para 10 e tirou do
  deploy.

## O que não dá como foi pedido, e o que dá

- **Os termos do Google** (lidos pelo balcão no navegador; termos de serviço de 26/08/2026 e termos
  específicos de 28/10/2026). Registro para ninguém redescobrir, não para reabrir a decisão 4:
  - "copy and save business names, addresses, or user reviews" está entre os exemplos proibidos
    (3.2.3 a-iii);
  - "Customer must not use Google Maps Content from the Places API in conjunction with a non-Google
    map" (termos específicos, 14.2); o mapa 2D do app é Leaflet com o OpenStreetMap (`TripMap.tsx`);
  - o `place_id` pode ser guardado (§3), e a coordenada por até 30 dias (14.3);
  - o balcão procurou no texto uma exceção para app fechado, gratuito ou de pesquisa e não achou: a
    palavra "research" não aparece, e a licença vale para qualquer aplicação do cliente;
  - os termos preveem a suspensão do acesso (seção 5).
  Sugestão do balcão, não conversada: guardar sempre o `place_id` junto do lugar. Não custa nada e
  deixa aberto o caminho de ficar dentro dos termos se o app um dia abrir ao público.
- **"A feirinha" não está em mapa nenhum.** Nem no Google. O que dá: a IA oferece os candidatos que
  achou (o mercado público, a praça) e pergunta; ou a pessoa aponta o local.
- **O dia e a hora de uma feira ou de um evento** não vêm de mapa. A IA pode buscar na web (a
  ferramenta de busca da Anthropic custa US$ 10 por mil buscas), com a fonte na tela e a pessoa
  confirmando. Uma busca do balcão por "feirinha Canoinhas" não achou dia nem lugar confiável. Fica
  como último recurso, fora do caminho principal.
- **As ferramentas de IA do próprio Google** ("Maps Experience agent tools", um serviço MCP com busca
  de lugares, rotas e clima, para qualquer modelo) existem. Os termos delas deixam a resposta ficar
  até 2 anos no histórico de chat do usuário e proíbem extrair os lugares de dentro dela (10.3.1). O
  preço não foi confirmado. Leitura do balcão: as nossas próprias ferramentas sobre a Places API dão
  o lugar estruturado, que é o que o roteiro precisa; o serviço do Google fica anotado como
  alternativa.

## O que já existe

- A busca de hoje: a função `find-places` (`supabase/functions/_shared/places-handler.ts`, a Geoapify)
  e o tipo `Place` em `places-schema.ts`. O fluxo: `src/features/intake/flow.ts` (`searchMap`,
  `prepare`), `search.ts`, `places.ts` (a tabela), `assemble.ts` (a reconciliação da regra de ouro),
  `useConversation.ts`, `conversation.ts`.
- A IA: `supabase/functions/_shared/plan-ai.ts` (os prompts do `ask` e do `plan`, os schemas),
  `plan-handler.ts`, `import-ai.ts` (`IMPORT_MODEL`, `IMPORT_VARIANTS`).
- Onde a pessoa está: `intake/gather.ts` (`gatherContext`, `allowedPosition`),
  `features/import/new-trip.ts` (`lastOrigin`), `travel-mode/live.ts` (o GPS do mapa da viagem).
- As paradas já têm `osm_type` e `osm_id` (fase 23). Um campo para o `place_id` do Google é do
  levantamento.
- O laboratório: `.github/workflows/lab.yml` (agendado e sob pedido, com tarefas como
  `medir-conversa`), `lab_runs` e o painel `/lab`.
- O mapa 2D: `src/features/map/components/TripMap.tsx` (Leaflet 1.9.4).
- As decisões que a ideia revisita: **D227** (a tabela sai), **D226** (a fonte da busca), **D228**
  (onde se procura; "em tal cidade"), **D225** (a vontade vira um plano com ferramentas), **D176** (a
  conversa passa a pedir a posição), **D208** (a saída de hoje usa as mesmas peças), D230 e D231 (o
  caminho e a escrita, sobre os fatos). A D232 (a regra de ouro) continua.

## O que pede de fora

- **Do Douglas:** uma conta do Google Cloud com faturamento, a Places API (New) ligada e a chave em
  `supabase secrets`. O balcão não criou nada.
- **Custo do Google** (página oficial de preços, lida em 21/11): Text Search Pro US$ 32 por mil, com
  5.000 grátis por mês; com nota e horário (Enterprise), US$ 35 por mil, com 1.000 grátis; Place
  Details Essentials US$ 5 por mil, com 10.000 grátis. Estimativa do balcão, não medida: uma conversa
  com três buscas sai por cerca de US$ 0,10 depois da faixa grátis.
- **Custo da IA:** o laço com ferramentas gasta mais leituras que hoje. Não medido. O Sonnet 5.5 custa
  US$ 2 e US$ 10 por milhão de tokens de entrada e de saída. As cotas por pessoa de hoje (20 perguntas
  e 10 roteiros em 24 h) precisam de revisão, mais ainda com o chat que continua.
- **Migration:** provável, para o identificador do Google na parada e para o histórico do chat. A
  conferir.
- **A conferir pelo orquestrador:** a forma do pedido da Places API (New) (a busca por texto com a
  área preferida e a restrita, a busca ao longo de uma rota, os campos por faixa de preço), o tempo
  máximo de uma Edge Function para o laço, e o uso de ferramentas com saída estruturada no modelo de
  hoje.

## Onde encaixa

O `fase-25.md` está escrito e não foi aberto. Recomendação do balcão, para o orquestrador decidir:

- **A 25 (Correções da conversa) fica com o que não depende da fonte:** o campo livre que não se
  apaga, o tempo lido inteiro, a resposta não entendida perguntada de novo, as opções coerentes, a
  saída de hoje na ordem do texto. **Ganha** o item 1 desta ideia (o GPS na conversa, a origem à vista,
  o conserto do `lastOrigin`) e o item 4 (nada some em silêncio; o texto só fala do que existe).
  **Perde** o que era remendo da tabela e da Geoapify (o nome que casa sem ser o tipo, os tipos que
  faltam) e, em parte, a cidade pelo viés do Nominatim, que muda com o GPS e com o Google.
- **Uma fase nova, grande, logo depois: a fonte e o planejador** (os itens 2, 3 e 6). É a fundação.
- **A 26 (o passeio um passo de cada vez)** vem depois dela, construída sobre o planejador.
- **Uma fase nova: o chat que continua** (item 5), depois da 26.
- **O mapa por trechos** (a ideia irmã) é independente da busca.

Ordem recomendada: 25 → a fonte e o planejador → 26 → o mapa por trechos → o chat que continua → 19 →
20 → 21. O motivo é a decisão 1.

## Como se prova

- **Vitest:** a função com o Google de mentira (a busca numa cidade, perto de um ponto, no caminho); o
  julgamento do app (o candidato que não veio de ferramenta é recusado); os três estados de cada coisa
  pedida; a escrita só sobre o que entrou; `lastOrigin` e o ponto de referência.
- **e2e:** a conversa com a IA e o Google respondidos no navegador: o pedido de Canoinhas termina com
  o café escolhido, o salão escolhido e a feirinha pendente com a pergunta; a origem editável; o chat
  depois do roteiro propõe uma troca, e ela só acontece no "Aplicar".
- **Laboratório:** a tarefa da bateria (item 6), com teto de custo por rodada, e o painel para ler o
  histórico.

## Em aberto

- **Os 10 pedidos mudam a cada rodada, ou são 10 fixos?** O balcão leu "sempre um diferente do outro"
  como os dois: diferentes entre si e novos a cada rodada. Perguntou duas vezes e o Douglas não
  respondeu. Recomendação: novos a cada rodada, com os que falharam voltando até passar.
