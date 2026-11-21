# Melhorias depois da fase 12: as fases 13 a 29

As anotações do Douglas de 08/11/2026 (o caderno com o desenho do mapa e o print da tela do mapa),
organizadas em fases. Cada fase ganha o próprio `docs/fases/fase-N.md` quando chegar a vez dela,
gerado como os anteriores, e segue as regras de `docs/prompt-implementacao.md` (seções 2, 3, 5, 11 e
13): a melhor solução, nunca a mais rápida; não é um jogo nem um GPS; iPhone primeiro e Android igual;
offline primeiro; nunca inventar; nada roda no Mac (D91); plano antes do código, salvo quando o
Douglas dispensar; um commit `fase N: ...` por fase; `docs/decisoes.md` continua de D167.

**A autorização antecipada vale para todas as fases** (o Douglas, 08/11: "todos os prompts precisam
receber todas as permissões, pois eu não vou estar presente para autorizar nada"). Cada `fase-N.md`
traz a seção 2 de `docs/fases/fase-12.md`: publicar o plano e seguir sem ok; o hospedado com o
`--dry-run` lido; o fast-forward na `main` com a CI e o laboratório do preview verdes naquele sha;
`git revert` se a produção quebrar; e os limites de segurança, que nenhum ok desfaz (senha, contas,
`.env*`, segredos no client, secrets e painéis, dados reais fora do expurgo, `--force`, outra conta,
mensagem a outras sessões, gasto extra). Um chat que precisar quebrar um limite para seguir, para e
deixa a pendência no resumo final.

**Uma regra nova, para tudo daqui em diante (vai para o prompt mestre como v4):**

> **A regra do não-preencher.** O app nunca pede que a pessoa preencha o que ele pode ler, descobrir
> ou perguntar numa frase. Formulário é a última opção, nunca a primeira. Quando precisar perguntar,
> diz antes quantas perguntas são, oferece opções e aceita texto livre.

## A ordem

Sem datas e sem trava (decisão do Douglas, 08/11, reafirmada em 15/11: a viagem real não é critério
de nada): cada fase entra quando estiver pronta, e a ordem é só a das dependências e do valor. A 13
vai primeiro por corrigir defeitos. O número é o nome da fase (o `fase-N.md`), não a posição: a 22 e
a 23 chegaram pelo balcão de ideias em 15/11 (`docs/ideias/2026-11-15-mapa-do-dia-inteiro.md`) e
entram onde a dependência e o valor mandam. A 22 vem logo depois da 17 porque conserta a tela
principal, que o dono do app não reconheceu; a 18 fecha o trio do "sem digitar" (15, 17, 18) antes
do bloco dos geradores; a 23 vem antes da 19 porque constrói a maquinaria que a 19 e a 20 reaproveitam
(busca de referência, visão, segunda olhada, cache), e a maquete é o que a pessoa vê todo dia. A 24
chegou pelo balcão na noite de 15/11 (`docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`), depois de
um teste realista na produção, e vem antes da 18 pelo mesmo motivo que pôs a 22 antes dela: é a porta de
entrada do app, e o dono do app a achou ruim ("ainda está ruim o principal do app"); a 23 passa a
depender da escolha de lugares que a 24 constrói. Ordem proposta pelo orquestrador em 15/11 à noite e
confirmada pelo Douglas na mesma noite: 24 → 18 → 23 → 19 → 20 → 21.

A 25 e a 26 chegaram pelo balcão em 20/11 (`docs/ideias/2026-11-20-o-passeio-um-passo-de-cada-vez.md`),
depois de um uso real do Douglas e de uma bateria de dez pedidos de leigo na produção: "almoçar em Mafra"
buscou em Portugal, "vou pra Joinville" na França, e as opções de dois lugares vêm lado a lado, todas
medidas de casa. Em 21/11 o balcão fechou mais duas ideias, que completam e em parte substituem a de 20/11
(`docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md` e `docs/ideias/2026-11-21-o-mapa-por-trechos.md`):
**a pesquisa e a montagem do roteiro são a prioridade do app** ("devemos gastar o tempo e dinheiro que for
nela para deixar quase perfeita"); a fonte de lugares passa a ser o Google Places; a IA planeja a busca com
ferramentas e o app julga (a tabela de tipos sai); o GPS entra na conversa; nada some em silêncio; o chat
continua depois do roteiro pronto; uma bateria de pedidos de leigo mede a qualidade fora do deploy; e a
maquete mostra um trecho até o objetivo por vez. O orquestrador reviu as fases 25 e 26 e encaixou três
novas em 21/11, pela recomendação do balcão: a **25** fica com as correções que não dependem da fonte de
lugares (o campo livre, o tempo lido, a resposta não entendida, as opções coerentes, a ordem do texto) e
ganha o GPS na conversa com a origem à vista e "nada some em silêncio"; a **27** é a fundação nova (a fonte
e o planejador: o Google atrás de uma função nossa, a IA com ferramentas, o app julgando, a bateria no
laboratório); a **26** (o passeio um passo de cada vez) passa a ser construída sobre a 27; a **28** é o mapa
por trechos, independente da busca; a **29** é o chat que continua depois do roteiro pronto. A ordem
recomendada pelo balcão e adotada pelo orquestrador, pela decisão 1 de 21/11: 23 → 25 → 27 → 26 → 28 →
29 → 19 → 20 → 21. **A confirmação é do Douglas**, a cada "próxima"; a 25 ficou escrita e à espera em
21/11, a pedido dele, até estes ajustes chegarem.

| Fase | Entrega | Depende de | Tamanho |
|---|---|---|---|
| 13 | Correções: o mapa sobre a folha, a rolagem horizontal, o que o teste do Douglas achar | 12 | pequena |
| 14 | A viagem abre no mapa: a maquete inteira na tela, o carro grande, Partiu! e Chegamos! pelo GPS, "Detalhes", as miniaturas | 13 | grande |
| 15 | Paradas que se registram sozinhas (com o mapa aberto) | 14 | média |
| 16 | A garagem é da pessoa, e o perfil organizado | 13 | média |
| 17 | Criar a viagem conversando: um campo só, a saída de hoje, o pedido para outras IAs | 16 | grande |
| 22 | O dia inteiro na tela: a câmera A (a maquete do dia inteiro, inclinada; de perto ao tocar no carro), o traçado em retrato, a maquete de mesa | 14 | grande |
| 24 | As opções vêm do mapa: a conversa devolve a vontade, a pessoa escolhe entre lugares reais, o caminho vem como sugestão desligada; a chegada em casa e a ida e volta no modo viagem | 17, 15 | grande |
| 18 | Reservas e gastos sem digitar: ler a confirmação (colada, anexada ou encaminhada por e-mail) e a nota | 17 | média |
| 23 | Os cartões-postais: a parada é o lugar, a cidade de passagem na beira da estrada; o catálogo que cresce por viagem | 22, 24 | grande |
| 25 | Correções da conversa: o campo livre que não se apaga, o tempo lido inteiro, a resposta não entendida perguntada de novo, as opções coerentes com o pedido e a hora, a saída de hoje na ordem do texto, a cidade conferida (nunca outro país em silêncio); o GPS na conversa, com a origem à vista e editável; nada some em silêncio, e o texto só fala do que existe | 24 | pequena |
| 27 | A fonte e o planejador: o Google Places atrás de uma função nossa (a nota, o horário, "em Canoinhas" dentro da cidade), a IA planejando a busca com ferramentas e o app julgando (a tabela de tipos sai); a bateria de pedidos de leigo no laboratório, fora do deploy | 25 | grande |
| 26 | O passeio um passo de cada vez, sobre o planejador: a tela mostra um passo por vez, o tempo do passeio todo à vista, a hora do dia na conta, o lugar da pessoa e a cidade de destino como paradas | 27 | grande |
| 28 | O mapa por trechos: a maquete mostra um trecho até o objetivo por vez, e a volta só ao chegar; o indicador "ida · volta"; a cidade de passagem é a que a estrada atravessa | 22, 24 (o objetivo dito vem da 26; antes dela, a regra de reserva) | média a grande |
| 29 | O chat que continua depois do roteiro pronto: dúvidas, sugestões e ajustes, cada mudança como um cartão com "Aplicar" | 27, 26 | média |
| 19 | O gerador de carros: o perfil paramétrico capaz de descrever carros de verdade | 16 | grande |
| 20 | O seu carro: marca, modelo e ano viram o carro da maquete, com cache e aviso | 19 | grande |
| 21 | O banco conectado (opcional): os gastos pelo Open Finance, por um agregador, com contrato | 18 | média |

## O que não dá como foi pedido, e o que dá

Quatro pedidos esbarram em limites de fora do app, e a ideia de 20/11 trouxe mais dois. O plano usa a
melhor alternativa de cada um: o Douglas confirmou os quatro primeiros em 08/11, e os dois de 20/11
seguem a decisão 5 dele daquele dia (na dúvida, o app pergunta e não afirma o que não sabe).

1. **Registrar paradas com o app fechado.** Um PWA não recebe posição com o app fechado, nem no
   iPhone nem no Android: a API de geolocalização só funciona com a página ativa, e não existe
   geolocalização em segundo plano para a web. Então o app é inteligente **enquanto está aberto**:
   com o mapa na tela e a posição permitida, ele acompanha o GPS o tempo todo e marca Partiu!,
   Chegamos! e as paradas não planejadas sozinho (fases 14 e 15); o modo painel passa a ser só
   "tela acesa" por cima disso. Com o app fechado, nada se grava, e ao abrir o catch-up continua
   perguntando só sobre as paradas planejadas ("Vocês passaram por…"), porque de uma parada não
   planejada não há nenhum dado.
2. **Integração com o Booking.** A API de reservas do Booking é para os hotéis e os sistemas deles,
   amarrada ao id da propriedade, com certificação de parceiro; não há caminho oficial para um app
   puxar as reservas de quem viaja (Airbnb e Decolar, idem). A fonte que existe é o que a pessoa
   recebe ao reservar: o e-mail de confirmação, o PDF, o print. A fase 18 lê isso de três jeitos,
   colado, anexado ou **encaminhado para um e-mail do app**, e preenche a reserva.
3. **Gastos automáticos pelo banco ou cartão.** Pelo Open Finance, um app só chega aos extratos por
   um agregador autorizado pelo Banco Central (Pluggy, Belvo), com contrato de empresa e custo
   mensal (o piso relatado por quem negociou é de uns R$ 2,5 mil por mês; a confirmar com eles), e
   o consentimento é dado no app do banco e renovado a cada 12 meses. É viável como **opção**, e
   fica numa fase própria (21), que o Douglas liga quando quiser pagar por ela. O que não depende
   de contrato entra na fase 18: a nota fiscal pela câmera, o QR code da NFC-e e o que o contexto já
   sabe (a parada, a categoria, o valor da reserva).
4. **"Exatamente o carro da pessoa".** Buscar um modelo 3D pronto na internet e pô-lo na maquete não
   funciona: a qualidade e a licença variam, o estilo foge do app e nada encaixa na pintura e nos
   acessórios. O que funciona é o caminho que a D66 abriu: cada carro do app é um perfil de
   números, e o 3D e a vista lateral saem dele. As fases 19 e 20 tornam esse perfil capaz de
   descrever um carro de verdade (proporções, silhueta, frente e traseira) e o geram a partir das
   medidas e de fotos de referência da internet. **Como o GTA faz com os carros dele:** qualquer um
   reconhece o modelo pelos traços, mas não há logotipo, nome de marca nem réplica. O resultado é
   o seu carro na linguagem do Viajei, feito com carinho.
5. **"O melhor café que tiver".** O mapa de hoje não tem nota de avaliação: a resposta da Places da
   Geoapify (a documentação pública, lida em 21/11) traz nome, endereço, cidade, coordenada, categorias,
   distância e `place_id`, nenhum campo de nota, de avaliações ou de popularidade, e o único ordenador
   é a proximidade (`bias`). **Revisto em 21/11 (decisão 3 daquele dia):** a fonte passa a ser o Google
   Places, que traz a nota e o número de avaliações; com ela, "o melhor" passa a ter resposta, e o app
   diz o critério (fase 27). Até lá, o app diz na tela que não sabe qual é o melhor, em vez de fingir
   que escolheu.
6. **Regiões que não são um lugar do mapa** ("Litoral", "Serra", "Vale Europeu"). Um geocodificador
   devolve qualquer coisa com esse nome: no teste de 20/11, "Litoral" foi para Camarões, "Vale
   Europeu" é uma padaria em Indaial e "Serra catarinense" um parque industrial em Lages; com o viés
   pela localização, "litoral" ainda vira um bairro de Tramandaí. O que dá (fases 25, 27 e 26): nunca
   oferecer região como resposta; oferecer cidades e tipos de passeio que existem ao alcance; e, se a
   pessoa escrever uma região, perguntar a cidade.
7. **Os termos do Google Places** (lidos pelo balcão em 21/11: os termos de serviço de 26/08/2026 e os
   específicos de 28/10/2026). Eles proíbem guardar nomes, endereços e avaliações ("copy and save
   business names, addresses, or user reviews", 3.2.3 a-iii) e usar o conteúdo com um mapa que não é
   do Google (14.2; o mapa 2D do app é Leaflet com o OpenStreetMap); o `place_id` pode ser guardado
   (§3) e a coordenada por até 30 dias (14.3); o balcão não achou exceção para app fechado, gratuito ou
   de pesquisa; os termos preveem a suspensão do acesso (seção 5). **A decisão 4 de 21/11 é do Douglas
   e está reafirmada:** o roteiro guarda o nome e o endereço do lugar, como hoje, e os termos não
   entram na conta enquanto o app é um estudo fechado ("é apenas um teste de app"). As sessões seguem
   isso e não reabrem. O que dá, sem custo: guardar sempre o `place_id` junto do lugar, para o caminho
   de ficar dentro dos termos continuar aberto se o app um dia abrir ao público (sugestão do balcão,
   não conversada).
8. **"A feirinha" não está em mapa nenhum**, nem no Google, e o dia e a hora de uma feira ou de um
   evento não vêm de mapa. O que dá (fase 27): a IA oferece os candidatos que achou (o mercado público,
   a praça) e pergunta, ou a pessoa aponta o local ("Escolher o local"); o pedido nunca some. A busca
   na web (a ferramenta da Anthropic, US$ 10 por mil buscas, pela leitura do balcão) fica como último
   recurso, fora do caminho principal, com a fonte na tela e a pessoa confirmando.

---

## Fase 13 · Correções

O que está errado hoje, antes de qualquer coisa nova. Entra também o que o teste do Douglas achar: a
lista fica aberta até o chat começar.

**13.1 O mapa por cima da folha** (o print). Em `MapaPage`, a caixa que envolve o `TripMap`
(`relative … overflow-hidden rounded-card`, linha ~176) não cria contexto de empilhamento. As camadas
do Leaflet têm `z-index` 400 (tiles), 600 (pinos) e 1000 (controles) e competem na raiz com a folha
(`SheetFrame`, `fixed z-50`): ao tocar num pino, a folha abre por baixo do mapa. Correção: `isolate`
(ou `z-0`) na caixa do mapa, para o Leaflet empilhar só dentro dela; o aviso "Sem internet" (`z-[1001]`)
continua funcionando por estar dentro. Conferir o mesmo em toda caixa com Leaflet ou three. Teste
Playwright: abrir um pino e provar que o ponto central da folha pertence a ela (`elementFromPoint`).

**13.2 A rolagem horizontal.** A tela Roteiro rola para o lado: algo nela é mais largo que a janela
(suspeitos: uma linha de chips com `-mx-4` sem pai que recorte, um texto sem quebra, uma grade sem
`min-w-0`). Corrigir a causa, não esconder com `overflow-x: hidden` no corpo. E uma guarda para
sempre: a suíte e2e e o laboratório conferem em **toda** tela, a 390 px e a 360 px, que
`document.documentElement.scrollWidth <= window.innerWidth` (fora das listas que rolam de propósito,
como os chips dos dias).

**13.3 O que o teste do Douglas achar.** Cada item com a tela, o aparelho, o que foi feito e o que
era esperado.

Testes: CI, laboratório no preview, merge, laboratório na produção. Decisões: uma D para cada defeito,
com a causa.

---

## Fase 14 · A viagem abre no mapa

O desenho do caderno: a maquete é a tela inteira, sem rolagem; no alto, uma barra fixa com a data e
"‹ Hoje ›"; o carro grande; poucas cidades, mais detalhadas; o mapa só com o que importa; um botão
flutuante "Detalhes" leva ao resto. O botão "Abrir o Modo Viagem" deixa de existir: tocar na viagem
já abre isso.

**O que entra**

- **A viagem é o mapa.** `/viagens/:tripId` passa a ser a maquete (hoje `/viagens/:tripId/viagem`);
  a visão geral de hoje (`ViagemPage`) vira `/viagens/:tripId/detalhes`, sem o botão do Modo Viagem.
  `/viagens/:tripId/viagem` redireciona, para os avisos push (que abrem essa URL) e os links antigos
  continuarem valendo. D33 e D159 continuam: abrir o app durante a viagem cai em `/viagens/:id`.
  O card na lista de viagens abre o mapa. Antes da viagem, o Dia 1 com a estrada inteira; depois, o
  último dia com o cartão "Viajei!" por cima.
- **Sem rolagem.** A barra do topo fica (nome pequeno, a data, "Dia anterior" / "Dia seguinte", e
  "Hoje" quando é hoje, como o `header` atual do `ModoViagemPage`). A maquete ocupa todo o resto. O
  "Agora" vira uma barra compacta sobre a maquete, embaixo, com a frase ("sair às 08:30 · 12 min") e
  a ação principal (Partiu! ou Chegamos!, grandes como hoje). "Detalhes" é o botão flutuante acima
  dessa barra, à direita.
- **Partiu! e Chegamos! pelo GPS, sempre que o mapa está aberto.** Hoje a marcação automática só
  existe com o painel ligado (D47) e na leitura única ao abrir. Passa a ser o padrão: com o mapa na
  tela e a posição permitida, o app acompanha a posição (`watchPosition`) e marca sozinho, com as
  regras da D47 (ver o carro na parada antes de sair, 3 min para chegar) e o Desfazer de 10 s. Os
  botões continuam, grandes, para quando a posição está negada ou errada e para o VoiceOver; nunca
  forçam nada. O "Modo painel" vira só "Tela acesa" (Wake Lock) por cima disso; o GPS econômico
  quando parado (D47) continua. Bateria: o GPS contínuo só existe com a tela acesa, que já é o que
  mais gasta; o sistema corta tudo ao bloquear.
- **Nada que polua.** Fixos na tela, só a barra do topo, o carro, a estrada, as miniaturas, a barra
  de baixo e "Detalhes". O chip do clima entra e recolhe como hoje. Tudo o mais aparece quando
  acontece e some (toasts, a folha da parada, o card "Desde a última vez"). Cada coisa nova nesta
  tela precisa justificar o lugar.
- **O carro grande.** Câmera alta e atrás, a três quartos; parado, o carro ocupa um quinto da altura
  da tela; em movimento entre paradas distantes, a câmera recua para a estrada caber. A estrada
  serpenteia à frente, em retrato, como no desenho. A abertura do dia, o replay ao abrir, "Rever o
  dia" e as curiosidades continuam (`opening.ts`, `motion.ts`, `layout.ts` mudam de câmera, não de
  regra). Noite, reduzir movimento e "Ver como lista" continuam.
- **Poucas cidades, mais detalhadas; só o que importa.** Prédios só onde há parada de cidade, hotel
  ou comida; o relevo quieto, sem enfeite longe da estrada. Cada parada vira uma **miniatura 3D** do
  seu tipo (`STOP_KINDS`: casa, árvores, parreira e barril, hotel, restaurante, palco, prédios,
  placa), na mesma linguagem low-poly e com os mesmos materiais do carro. Tocar na miniatura abre a
  folha da parada (hora, endereço, Maps, Waze, Chegamos!). Os ícones 2D das listas e dos pinos do
  mapa (lucide, `StopKindIcon`) continuam e combinam com as miniaturas.
- **A lista acessível.** "Ver como lista" continua, lembrado por aparelho; o VoiceOver e o TalkBack
  precisam dela. O mapa 2D (Leaflet) fica em Detalhes: é o mapa de endereços.

**Decidido em 08/11:** Partiu! e Chegamos! na barra de baixo, e automáticos pelo GPS; a Lista do dia
atrás do toggle; a folha "Como foi?" continua abrindo sozinha depois do Chegamos!, por cima do mapa.

**Uma sugestão, se couber sem poluir: o comboio.** Cada pessoa tem o próprio carro (fase 16) e o app
já compartilha a posição entre os membros (D23). Quando alguém do time está em outro carro (a mais
de 500 m de mim), o carro dele aparece pequeno na estrada, na última posição que ele mandou; quando
estamos juntos, nada aparece. Nada de nomes nem rastros: só o carro.

**Cuidados**

- A rota principal da viagem agora carrega o three. A barra do topo, a frase do "Agora" e a ação
  aparecem na hora, com a maquete entrando por baixo; sem WebGL, a lista no lugar (como hoje). O
  Lighthouse do laboratório mede Detalhes e a lista; a maquete fica de fora (regra da fase 12).
- O laboratório tem cenários sobre a maquete e o card (`app_reabrir`, D92) e sobre o "Agora"; eles
  mudam de seletor, não de intenção. A suíte e2e e os testes do mundo (`layout.test`, `motion.test`,
  `opening.test`) acompanham a câmera nova.
- O chunk da maquete e o fps (D64) se medem de novo; os números vão para a D.

Testes: Vitest do layout e da câmera; e2e do mapa como tela da viagem e dos redirecionamentos;
laboratório (preview e produção); o teste final nos aparelhos ganha um bloco. Decisões: a tela, a
câmera, as miniaturas, as rotas.

---

## Fase 15 · Paradas que se registram sozinhas

Com o mapa aberto (o GPS da fase 14), o carro para alguns minutos num lugar que não estava no
roteiro: o app descobre onde é (posto, restaurante, mirante) e registra, sem perguntar. Com o app
fechado nada acontece (ver "O que não dá"). As trilhas que o app já gravou em viagens de verdade
(`trip_tracks`) viram os dados de teste do detector; sem elas, trilhas forjadas no laboratório.

**O que entra**

- **O detector**, puro e testado com trilhas reais: parada = 8 min ou mais dentro de 60 m e **fora
  da linha da estrada** (mais de 40 m: um estacionamento), ou 20 min ou mais em qualquer lugar.
  Trânsito = sobre a linha da estrada (menos de 25 m) e menos de 20 min: ignorado. Uma detecção
  por lugar a cada 2 h; a saída marca o fim. Os números seguem a escala da D47 (3 min para chegar,
  10 min para o GPS econômico) e se acertam com as trilhas reais.
- **O lugar**, pelo Nominatim reverso (zoom de ponto de interesse): o nome e a classe do lugar mais
  próximo (posto, restaurante, hotel, mirante…) viram o tipo da parada. Sem lugar a 60 m, a parada
  se chama pelo endereço ("Parada na BR-116, km 180"). Sem sinal, registra com as coordenadas e dá
  nome quando a rede voltar. Uma chamada por detecção, dentro da política do Nominatim.
- **O registro**, pelo mesmo caminho de tudo: uma parada com `source: 'auto'`, a hora medida de
  chegada e de saída, na outbox, visível ao time. Toast "Parada registrada: Posto Ipiranga" com
  Desfazer (10 s, como hoje); depois o card "Como foi?" como em qualquer parada; no diário,
  "registrada pelo painel". Nunca inventado: o nome vem do OSM e as horas são medidas.
- **O tipo Posto.** Aparece duas vezes nas anotações e não existe em `STOP_KINDS`. Entra como
  `fuel`, com ícone e miniatura (a fase 14 deixa o lugar), no schema da importação e, se houver
  `check` no banco, numa migration. Pensar se "Compras" (`shop`) entra junto.

**Decidir:** os limiares (os de cima são a proposta); o tipo Posto. Testes: Vitest com as trilhas da
viagem; laboratório com uma trilha forjada no cenário do painel (ele já simula o GPS). Decisões: o
detector e os números, o lugar, o tipo novo.

---

## Fase 16 · A garagem é da pessoa, e o perfil

O carro representa o carro que a pessoa tem; ele é dela, não da viagem. Desbloquear um SUV para quem
tem um sedã não faz sentido.

**O que entra**

- **O carro no perfil.** `profiles.car_model`, `car_color`, `car_accessories` (migration 0014: a 0013 foi o Posto da fase 15; copia
  da viagem mais recente de que a pessoa é dona). **Cada pessoa vê o próprio carro** na maquete, no
  card e na retrospectiva, em qualquer viagem (decisão do Douglas, 08/11); a viagem deixa de ter
  carro. O perfil de cada membro já viaja com a viagem pelo pull (D113), então os carros dos outros
  chegam sem sinal, para o comboio da fase 14. As colunas `car_*` de `trips` deixam de ser lidas e
  saem numa migration depois. A garagem passa a `/perfil/garagem` (`/viagens/:id/garagem`
  redireciona). `normalizeCar` (D70) continua, agora sobre o perfil.
- **O que se conquista muda de natureza.** Os cinco modelos ficam livres desde o começo ("escolha o
  seu carro"); a Kombi deixa de ser prêmio. Os níveis passam a liberar **o que vai no carro**: as
  cores (como hoje), os acabamentos da tinta (metálico, perolado, fosco: o material já é físico,
  D66), os estilos de roda; as conquistas continuam liberando os acessórios (D68); e o último nível
  libera **o seu carro de verdade** (fase 20). A regra da prévia (D69) continua para o que está
  trancado. `unlocksAt`, `levelPhrase`, o cartão de desbloqueio (D120) e o laboratório acompanham.
- **O perfil organizado**, em seções: Você (nome, cor, e-mail); O seu carro (a vista lateral e a
  entrada da garagem); Progresso (como hoje); O que você gosta (o lugar fica pronto para a fase 17);
  Avisos neste aparelho (a permissão, os sons do Modo Viagem e os cartões de conquista, que hoje
  moram em Avisos de cada viagem e já valem para o aparelho; a antecedência e a hora do briefing
  padrão para viagens novas); Aparência (tema sistema/claro/escuro; movimento reduzido segue o
  sistema, dito ali); Dados (sair, com a pergunta das pendências); Laboratório (só para quem o tem).

**Decidido em 08/11:** cada pessoa tem o seu carro; os modelos livres e a escada nova (cores,
acabamentos, rodas; o seu carro no último nível). Testes: pgTAP da migration e dos grants (`car_*`
editáveis só pela própria pessoa); Vitest das regras novas; e2e do perfil; laboratório. Decisões: o
carro da pessoa, a escada nova, o perfil.

---

## Fase 17 · Criar a viagem conversando

Sai o botão "Nova viagem" e o formulário (`/viagens/nova`). Entra um campo só, na lista de viagens:
"Conte a viagem, cole o roteiro ou diga 'quero sair hoje'". A regra do não-preencher, aplicada à
porta de entrada.

**O que entra**

- **Um campo, três caminhos**, decididos pelo que a pessoa escreve:
  1. **O formato do Viajei** (abaixo): lido no aparelho, sem IA, na hora, sem internet.
  2. **Um roteiro em texto livre** (WhatsApp, Notas): a importação da fase 10, que agora também cria
     a viagem. Nome, datas e origem saem do texto; o que faltar vira uma pergunta.
  3. **Uma descrição ou uma vontade** ("Serra Gaúcha em dezembro, 4 dias, saindo de Papanduva";
     "quero sair hoje"): a conversa. A IA diz antes quantas perguntas são (até 3), cada uma com
     opções e texto livre, e monta o roteiro. A revisão é a da fase 10, a mesma tela.
- **A saída de hoje.** O que entra na conta: o que a pessoa gosta (o perfil, como pista, nunca como
  regra: gostar de cachoeira não obriga a cachoeira hoje), o histórico (lugares visitados, a nota
  que deu no "Como foi?", quanto tempo faz: "voltar?"), o tempo de hoje (Open-Meteo, já no app), e
  uma pergunta de alcance ("quanto tempo vocês têm?"). Só lugares reais: a IA propõe, e o app
  **confere cada lugar no OSM** (Nominatim e Overpass, perto da pessoa) antes de mostrar; o que não
  se confirma sai. Nasce uma viagem de um dia, pronta para abrir no mapa (fase 14).
- **O pedido para outras IAs.** "Montou a viagem com outra IA? Copie este pedido": um prompt pronto
  que a pessoa cola no chat onde planejou, e que pede a resposta **no formato do Viajei**: um texto
  legível com marcação leve (`viajei/1` no topo, um dia por bloco, uma linha por parada com hora,
  tipo, nome, endereço e link; reservas, contatos, listas e missões; os mesmos campos do
  `importSchema`), com o JSON do schema aceito também. Colado de volta, é lido no aparelho, sem IA,
  sem custo, sem internet. O mesmo formato é o que "Copiar roteiro como texto" exporta de qualquer
  viagem: portabilidade e cópia de segurança de graça.
- **O que você gosta**, no perfil (fase 16 deixou o lugar): chips opcionais (natureza, vinícolas,
  comida, cidades históricas, praia, museus, estrada de chão: não) e o que o app aprende pelas notas.
- **Privacidade e limites**, como na fase 10: o texto e o histórico são dado, nunca ficam em log
  (D128, D130); a `edge_call` limita por pessoa e por dia (D127); o custo se mede (D140). Sem
  internet, o campo aceita o formato do Viajei e diz que os outros caminhos precisam de rede.

**Decidido em 08/11:** até 3 perguntas, ditas antes; o formulário não sobrevive como alternativa
("Serra Gaúcha, 11 a 14 de dezembro" já é uma viagem; a edição por campo continua existindo depois,
em Detalhes). Testes: Vitest do leitor do formato (com o seed e inválidos), da
decisão entre os três caminhos e da conferência de lugares; teste da função com entrada fixa; e2e do
campo; laboratório com uma leitura real (como D139). Decisões: o campo, o formato, a saída de hoje,
os limites.

---

## Fase 22 · O dia inteiro na tela

A pessoa abre a viagem e vê **a maquete do dia inteiro**, da saída à chegada, inclinada, como uma
maquete de mesa: a estrada serpenteia de baixo para cima, o carro anda sobre ela e continua sendo o
maior objeto da estrada, e cada parada é uma peça grande, reconhecível de longe. Viagem de um dia: o
dia é a viagem, e é a viagem inteira que aparece. A fase 14 leu o desenho do caderno como "câmera
atrás do carro" (D177); o Douglas abriu o app depois dela e não reconheceu o que tinha desenhado. O
dia inteiro hoje só aparece por 1,8 s na primeira abertura do dia em cada aparelho; depois disso, e
no "Rever o dia", a tela mostra um trecho de estrada e uma parada. Ideia fechada no balcão em
15/11/2026 (`docs/ideias/2026-11-15-mapa-do-dia-inteiro.md`, com os esboços que ele aprovou).

**O que entra**

- **A câmera do dia inteiro (a A dos esboços).** O quadro de repouso é o dia inteiro, inclinado,
  entre a barra do dia e a caixa de baixo (o cartão da vez, "Detalhes", o "Agora"): todas as paradas
  do dia em cena, cada uma com a sua pílula; a pílula presa ao topo com seta (D177) deixa de ser
  necessária. Nos esboços, 52° de inclinação e FOV 26 numa tela de 393 × 800; o `fitCamera` do app é
  64° e FOV 30: a fase afina, e a referência é a imagem A, não o 64° de antes da 14. O enquadramento
  desconta a **altura medida** do que está sobre o pé do palco (`useOverlayInset`, D175), não os
  136 px fixos de hoje: é o limite que a própria D177 registrou. No Safari sem instalar o palco tem
  cerca de 563 px e a caixa de baixo cobre de 170 a 250 px (estimativa pelas classes; a fase mede).
- **O carro anda sobre a maquete, com a câmera parada:** por GPS, por botão, no replay ao abrir e no
  "Rever o dia" (a seção 6.4 do prompt mestre já dizia "câmera parada" para o replay). Desenhado
  maior que a escala (nos esboços 2,55×, com um anel claro no chão) para continuar sendo o que o
  olho acha primeiro; a fase mede o tamanho mínimo dele na tela.
- **De perto, ao tocar no carro.** A câmera da fase 14 (D177) não se joga fora: vira este modo.
  Desce até o carro, olha a próxima parada e volta sozinha ao dia inteiro. Com reduzir movimento,
  corta. A volta: a recomendação é alguns segundos parado, ou um toque fora do carro; a fase decide
  o número e registra.
- **A abertura do dia** constrói a maquete no próprio quadro do dia inteiro e termina nele, sem
  descer. As curiosidades continuam mergulhando e voltando.
- **O traçado em retrato.** O S de hoje chega a cerca de 61 × 190 unidades mais os tocos (`Z_MAX`,
  `xHalf` em `layout.ts`): enquadrado inteiro num celular, sobra margem dos lados e tudo fica
  pequeno. Nos esboços o dia ocupa 64 × 132, com mais idas e vindas de um lado ao outro. É uma
  mudança de `layout.ts`, não só de câmera; a retrospectiva parte do mesmo layout e muda junto.
- **A maquete de mesa.** A base cortada, como maquete de verdade: o terreno termina num corte de
  terra sobre uma base escura, com sombra embaixo (hoje o chão vai até a névoa). Sombra suave, foco
  mais nítido no meio e levemente desfocado nas bordas de cima e de baixo (nos esboços, um desfoque
  de CSS sobre o canvas, sem pós-processamento); à noite, as janelas acesas e uma poça de luz quente
  em cada lugar do dia (o modo noite já existe). A vegetação e os detalhes da região, não só
  monumentos: araucárias no planalto, hortênsias na beira da estrada na Serra, parreirais (o app já
  classifica o bioma e o cenário de cada trecho, seção 6.2).
- **As miniaturas por tipo, na escala nova.** Com o dia inteiro na tela, as miniaturas de hoje
  (0,8 a 4,4 unidades de frente, D178) quase somem e todo dia fica igual: mudar só a câmera não
  basta. Elas continuam existindo, refeitas para a escala das peças grandes (nos esboços, 10 a 23
  unidades de frente), e são o que aparece quando o lugar não tem peça própria (a fase 23 traz a
  peça do lugar). Tocar nelas continua abrindo a folha da parada (D178).
- **A cidade de passagem** por onde a rota passa, sem parada: o nome pequeno na beira da estrada,
  sem pílula e sem horário; no máximo três por dia, as maiores (`samplePlaces` em
  `src/lib/geo/segments.ts` já dá o município mais populoso a cada 2 km da rota). O cartão-postal
  dela é da fase 23.
- **Por que cabe:** parado, a cena não redesenha (`frameloop="demand"`), e com a câmera de repouso
  parada isso vale quase o tempo todo. O orçamento de qualidade pode ir para o quadro parado; o fps
  se mede quando o carro anda e no mergulho. É raciocínio do balcão: a fase mede, nas máquinas do
  laboratório e com o índice de CPU (D170), e registra.

**O que muda nas decisões e nos documentos.** A **D177** passa a descrever o modo de perto (a câmera
que segue o carro ao toque, com os números dela), não o quadro de repouso; a pílula presa ao topo com
seta sai; o limite dos 136 px fixos se resolve pela altura medida. A **D178** ganha a escala nova das
miniaturas por tipo (as caixas mudam) e a regra de que elas são o que aparece sem peça própria. A
**D175** não muda o que fica sobre a maquete, mas o enquadramento passa a descontar a altura medida.
A **seção 6.1 do prompt mestre** deixa de dizer "a câmera segue o carro" e volta a dizer o que a
decisão 1 de 04/11 (`docs/atualizacao-prompt-3d.md`) dizia: o dia inteiro na tela, com o carro
andando sobre a maquete e o modo de perto ao toque; a 6.4 continua ("câmera parada" no replay).

Sem IA, sem servidor e sem migration: código do mundo 3D e testes. **Decidido em 15/11:** a câmera é
a A, com o toque no carro para ver de perto; a câmera B (de cima) foi descartada porque as peças
perdem o volume; mudar só a câmera foi descartado. Testes: Vitest da câmera e do traçado (todas as
paradas do dia dentro da faixa útil em três proporções de palco, incluindo 393 × 563 e 360 de
largura, com a altura medida do que está sobre o pé; o tamanho mínimo do carro; o toque no carro e a
volta; o corte com reduzir movimento; o traçado para dias de 2, 4 e 8 paradas, curtos e longos);
`camera.test`, `layout.test`, `tela.spec` e `maquete.spec` com o dia inteiro (uma pílula por parada,
nenhuma sob a caixa de baixo; o `maquete.spec` hoje assume que o Parque sai de cena depois da
abertura); o `retrospectiva.spec` continua tocando o filme; o laboratório cobra `pilulas_em_cena`
igual ao número de paradas do dia e guarda `maquete.png` de dia e de noite. Decisões: a câmera e os
números, o traçado, a maquete de mesa, as miniaturas na escala nova, a cidade de passagem, o que
mudou na D175, na D177 e na D178.

---

## Fase 24 · As opções vêm do mapa

A pessoa escreve o que quer, do jeito que fala ("quero ir num café colonial"), e o app **não adivinha
um roteiro**. Ele pergunta só o essencial que faltar (quando, de onde), **mostra as opções que existem
de verdade** (os cafés coloniais ao alcance, com a cidade e o tempo de carro) e a pessoa escolhe. Com o
destino escolhido, traça a rota e, se houver algo que vale a pena **no caminho ou perto**, **sugere**,
cada coisa com o desvio em minutos, desligada até ela ligar. A viagem nasce com a saída, o que ela
escolheu, o que ela aceitou e a volta. A regra de ouro, nas palavras do Douglas: **"apenas pode colocar
algo direto na rota se a pessoa realmente falar no chat"**. Nasceu de um defeito, achado num teste
realista na produção em 15/11: "um café colonial em Pomerode, saindo de Major Vieira" virou uma viagem
**sem café colonial**, porque a conversa da fase 17 propõe nomes de memória da IA, a conferência da D207
tira em silêncio o que não bate no mapa (e aceitou um museu só pela palavra "pomerode"), a IA acrescenta
o que ninguém pediu e a tela deixa salvar uma viagem sem lugar nenhum com um aviso amarelo. Ideia fechada
no balcão na noite de 15/11 (`docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`); o defeito, o teste
com GPS falso e o que ele achou no modo viagem estão na memória do projeto.

**O que entra**

- **O pedido vira uma vontade, não um roteiro.** A IA devolve a **intenção estruturada**: o tipo de
  lugar, o destino ou a área se ela disse, quando, de onde, e **os lugares que ela nomeou de verdade**.
  Nada de lista de paradas inventada. É o passo das perguntas de hoje (`step: 'ask'`) com a saída mais
  rica; as perguntas continuam poucas e ditas antes (decisão 6 de 08/11), só o que falta para buscar.
- **As opções vêm do mapa, por tipo.** "Café colonial" não é classe do OSM: a tradução do pedido em
  classes e palavras do nome é **uma tabela pequena e explicável do app**, que a IA preenche e que nunca
  inventa um nome; o que não estiver nela vira "outro" com as palavras do pedido. O alcance é o da D207
  ou a área que ela disse. A pessoa vê **cartões**: o nome como está no mapa, a cidade, o tempo de carro
  (estimado pela distância para ordenar e mostrar "cerca de"; a rota real só para a escolhida, dentro da
  cota do OpenRouteService) e o horário só quando o mapa tem. Sem opção ao alcance, o app diz isso e
  oferece aumentar o alcance ou mudar o tipo, em vez de uma viagem vazia. Mais de um destino no mesmo
  pedido é permitido. O lugar **nomeado** se confirma no mapa como hoje, mas com segunda tentativa (as
  palavras que distinguem, sem preposição), a cidade fora da conta de semelhança e, com mais de um
  candidato, a **escolha** na tela ("Escolher o local", que a revisão da fase 10 já tem), nunca o chute
  nem o apagar.
- **A rota e as sugestões no caminho.** Com o destino escolhido, a `route-day` traça a rota e o app
  busca no corredor dela e perto do destino o que a pessoa gosta (perfil e notas como pista) mais o
  clássico de turismo. **Sugestões, desligadas:** até seis, as mais perto da rota e mais parecidas com o
  gosto dela, cada uma com o nome do mapa, a cidade, o desvio em minutos e uma frase da IA sobre o
  porquê. **Nada liga sozinho**, nem a IA: ela escreve a frase e as missões, não decide o que entra.
- **A viagem nasce do que foi escolhido.** A revisão da fase 10 e 17, com a saída, as opções, as
  sugestões aceitas e a chegada, os horários pela rota (uma permanência padrão por tipo, ajustável) e o
  título do dia pela IA. O que é texto vem da IA; o que é **fato** (lugar, coordenada, distância,
  horário) vem do mapa e da rota, nunca dela. **Uma viagem com zero lugares além da saída e da chegada
  não é um sucesso:** a tela diz o que faltou e volta às opções. A saída de hoje (D208) usa as mesmas
  peças.
- **Os quatro consertos do modo viagem** que o teste pediu: **o último nó do dia do tipo origem é um nó
  de chegada** ("chega às 17:00", Chegamos! pela presença de 3 min, e só ele conclui o dia; o Partiu!
  do último lugar não o toca; a D29 ganha a exceção; a conversa, a importação e o pedido para outras IAs
  continuam escrevendo "Chegada em <cidade>", quem muda é a leitura); **a projeção na rota respeita a
  ordem** (numa ida e volta pela mesma estrada a fração não anda para trás: só a partir da última parada
  concluída, e a posição de cada parada é a do trecho dela); **a pergunta das passadas** só para paradas
  até a próxima, em ordem (e nunca "passaram pela Chegada" ao sair de casa); **os rótulos das cidades de
  passagem** sem sobreposição (da 22).

**O que pede de fora.** **A fonte da busca por tipo** (abaixo), que só o Douglas resolve. Leituras de
IA parecidas com as de hoje (o passo das perguntas devolve a intenção; o do roteiro recebe as escolhas e
os candidatos em vez de inventar), medidas como a D140 e a D213 mediram; as cotas por pessoa
(`edge_call`) continuam. **Nenhuma migration:** a viagem, os dias e as paradas não mudam de forma; um
cache dos achados do mapa cabe no Dexie, como o `geocode`.

**O que não dá, e o que dá.** O Nominatim é um geocodificador: não busca por tipo nem ao longo de uma
linha. A busca que a ideia pede é a do **Overpass**, e os servidores públicos dele não responderam
nenhuma vez em 15/11, além de a política deles não servir de base para um app. Duas saídas, e a escolha
é do Douglas: **(1) um Overpass próprio**, com o extrato regional do Sul (Geofabrik) num servidor
pequeno (o `around` com uma linha de coordenadas faz o corredor da rota nativamente; é infraestrutura
nova neste projeto, com custo e operação); **(2) uma API comercial sobre o OSM atrás de uma Edge
Function**, como a `route-day` faz com o OpenRouteService (a chave no servidor, regra 9): a Places da
Geoapify busca por categoria num `polyline` com faixa em volta, e tem plano gratuito com limite diário
(o número se confere ao escrever o prompt). **Recomendação:** a 2, pela simplicidade operacional e pelo
padrão que o app já tem; a 1 se ele preferir não depender de mais um terceiro. Nos dois casos a
atribuição ao OpenStreetMap continua na tela. Sem a fonte, a fase ainda entrega a intenção, a regra de
ouro, a confirmação com escolha e os consertos do modo viagem; as opções e as sugestões ficariam presas
ao que o Nominatim acha por nome, que é pouco.

**Se precisar cortar em duas:** os consertos do modo viagem saem antes, como uma fase curta própria,
sem IA e sem servidor; a conversa nova fica para a seguinte. Uma fase só se a fonte estiver decidida ao
abrir.

Testes: Vitest da intenção (saídas fixas da IA, inclusive o pedido com ordens dentro, que continua sendo
dado), da tradução em classes, da montagem das buscas (ao alcance; no corredor), da ordenação, **da regra
de ouro**, da confirmação com candidatos, da revisão sem lugar bloqueada, do nó de chegada e da projeção
com ordem; a função com entrada fixa, como a 17; e2e `nova-viagem.spec` com o mapa e a IA respondidos no
navegador (pedido → uma pergunta → três opções → a escolha → duas sugestões, uma ligada → a revisão → a
viagem com exatamente saída, café, a sugestão e chegada) e um e2e de GPS de ida e volta no molde do
`parada-auto.spec` (sair do último lugar não conclui; chegar em casa conclui; a porcentagem não volta);
laboratório: o `app_conversa` passa a cobrar as opções e as sugestões (contagens, nenhum texto da
pessoa) e uma medição real, uma vez, com o pedido do teste de 15/11 (Torten Paradies e Mahlzeit nas
opções; o Bioparque Zoo Pomerode nas sugestões). Decisões: a intenção, a fonte do mapa, a tabela de
tipos, a regra de ouro, a escolha, o nó de chegada, a projeção; a D207 e a D208 recebem o que mudou.

---

## Fase 18 · Reservas e gastos sem digitar

**Reservas.** O que a pessoa recebe ao reservar é a fonte (ver "O que não dá"). "Ler a
confirmação" chega por três caminhos, e os três caem na mesma leitura: a IA preenche tipo, nome,
datas, código, endereço, telefone, valor, prazo de cancelamento e "reservado por", e a pessoa
confirma numa revisão como a da importação.

1. **Colar ou anexar**, no app: o texto do e-mail, o PDF ou o print (tudo já possível hoje).
2. **Compartilhar → Viajei**, no Android: `share_target` no manifest, do Gmail ou do app do Booking
   direto em "Ler a confirmação". No iPhone não existe `share_target` para PWA (WebKit 194593,
   aberto desde 2019).
3. **Encaminhar o e-mail** para um endereço do app, o caminho que funciona igual nos dois celulares
   e sem abrir o app. Cada pessoa tem o seu endereço, com um código próprio
   (`r-7f3k@reservas.<domínio>`): é ele que diz de quem é o e-mail, e não o remetente, que qualquer
   um forja. O e-mail entra por um recebimento no subdomínio, que repassa o texto e os anexos a uma
   Edge Function `inbound-mail` (o Resend, que o app já usa para enviar, também recebe: MX no
   subdomínio, webhook `email.received` só com metadados, corpo e anexos pela API de Receiving; o
   Cloudflare Email Routing só serviria levando o DNS para a Cloudflare; a 3.0 decide); a função
   confere ainda que o remetente é
   o e-mail da conta, trata o conteúdo como dado (nunca como instrução, D130) e lê a confirmação. A
   reserva vai para a viagem cujas datas a contêm; sem viagem certa, para **Reservas recebidas**,
   onde um toque a põe no lugar; a pessoa recebe um push "Chegou a reserva do Vila Suzana". O
   e-mail não fica guardado: só o que a leitura tirou dele e os anexos, como qualquer anexo.
   **O domínio é o que o app já usa para enviar** (decisão do Douglas de 15/11 à noite):
   `reitechia.com.br`, o do remetente do Auth (`viajei@reitechia.com.br`, Resend, D11), num subdomínio
   próprio de recebimento (algo como `reservas.reitechia.com.br`), porque o DNS está na GoDaddy e o MX
   da raiz é o e-mail da GoDaddy. Nenhum domínio novo antes da troca de nome. O registro MX, ligar o
   recebimento e os secrets novos são do Douglas.

"Procurar hotel perto de <parada>" abre o Booking ou o Google Hotels com as datas e o lugar: um link,
sem API.

**Gastos.** "Fotografar a nota": a IA lê o total, o estabelecimento e a data; um toque confirma. O QR
code da NFC-e, quando houver, dá o estabelecimento e a data sem IA (o CNPJ está na chave de acesso;
a BrasilAPI dá o nome). O que o contexto já sabe continua vindo preenchido (a parada, a categoria);
uma reserva com valor vira gasto sem digitar de novo; a parada registrada sozinha num posto (fase 15)
oferece "Fotografar a nota" no seu "Como foi?". A foto da nota fica anexada ao gasto, comprimida como
as memórias (serve para reembolso).

Os dois usam a mesma família de funções da importação: `edge_call`, nada em log, custo medido.
Testes: Vitest dos leitores e da escolha da viagem pelas datas; teste das funções com entradas fixas
(um PDF, um print, uma nota, um e-mail bruto); e2e; laboratório (um e-mail de verdade encaminhado,
de ponta a ponta até o push). Decisões: a leitura, o `share_target`, o e-mail, a NFC-e.

---

## Fase 23 · Os cartões-postais

A maquete deixa de ser genérica. Uma parada que é um lugar conhecido aparece como **o lugar** (a
Cascata do Caracol é a cascata, não um grupo de árvores), e uma cidade por onde a rota passa aparece
com o seu **cartão-postal** na beira da estrada (passando por Curitiba, o Jardim Botânico). As peças
são fiéis ao lugar de verdade. É o mesmo desenho das fases 19 e 20 aplicado a lugares, com uma
diferença: lugar é fiel, carro é "como o GTA faz". Depende da 22 (a escala e os lugares na maquete)
e da 17 (a conferência de lugares no OSM e a fila do Nominatim e do Overpass).

**O que entra**

- **Dois gatilhos.** (a) A parada **é** o lugar: a peça toma o lugar da miniatura do tipo, e o toque
  nela continua abrindo a folha da parada (D178). (b) A rota **passa** pela cidade, sem parada: o
  cartão-postal fica na beira da estrada, com o nome (a cidade de passagem da fase 22).
- **A peça é um dado, nunca código.** O servidor entrega uma **receita declarativa** (formas,
  repetições, materiais de uma paleta fechada), validada por schema e com teto de tamanho, e o mesmo
  construtor das miniaturas a monta. Nada que a IA escreva é executado no aparelho. O vocabulário
  dessa receita é a parte que pede carinho, como o perfil dos carros na fase 19: contorno em planta,
  vãos repetidos, arcos, abóbada varrida, cúpulas com nervuras, vidro, canteiros, flores
  instanciadas. **A régua visual é a estufa do Jardim Botânico** escrita nessa receita, ao lado da
  peça fiel dos esboços (`img/m-jardim.jpg` do artifact citado na ideia): se a receita não consegue
  dizer a estufa, o vocabulário está curto. É o corte natural se a fase precisar ser quebrada em
  duas: primeiro o vocabulário e o construtor, com a estufa escrita à mão e sem IA; depois o gerador.
- **Um catálogo de todos, que cresce por viagem.** Quando o roteiro de uma viagem fica pronto
  (paradas com coordenada, rota calculada), o app lista os lugares dela e procura cada um no
  catálogo. O que existe, baixa (poucos KB) e guarda com a viagem, para funcionar sem internet. O
  que falta entra numa fila no servidor: identificar o lugar (OpenStreetMap, Wikidata), buscar fotos
  de referência e medidas, a IA escreve a peça, uma **conferência automática** compara a peça com as
  fotos, e ela entra no catálogo sozinha, sem ninguém aprovar uma a uma. A segunda viagem que passar
  pelo mesmo lugar recebe na hora, sem IA.
- **Fiel, feita olhando as fotos.** No balcão a estufa foi feita duas vezes: de memória saiu com a
  estrutura errada; olhando três fotos da Wikipédia saiu certa (a base larga com 24 vãos em arco, os
  três tambores com as cúpulas, o terraço com a fonte e as duas escadas, os canteiros em
  zigue-zague). A foto de referência e a conferência contra ela são obrigatórias. **As fotos são só
  entrada** (Wikimedia Commons, licenças livres com autoria): a IA olha e escreve a peça; nenhum
  pixel delas vai para o app, nunca se guardam nem se mostram (a regra da fase 20). Medidas reais
  quando o OpenStreetMap ou o Wikidata as têm.
- **Enquanto a peça não chega, e quando não há referência:** a miniatura do tipo. Lugar sem foto
  pública (o hotel, o restaurante) fica com a miniatura do tipo para sempre. O app nunca inventa um
  cartão-postal nem escolhe um por palpite: o lugar precisa existir numa fonte conferível.
- **Refazer, com limite.** Quem planejou a viagem tem um botão "refazer" na peça: um toque gera mais
  duas opções e a pessoa **precisa escolher** entre elas. A leitura do balcão, que a fase confirma e
  registra: refazer vale uma vez por lugar; a escolha é entre as três (a atual e as duas novas), para
  ninguém ser obrigado a trocar por uma pior; a escolhida passa a ser a peça do catálogo para todos.
  Um lugar custa no máximo três gerações na vida do app.
- **Teto por viagem:** 12 lugares novos gerados por viagem; o que passar disso fica com a miniatura
  do tipo. É do Douglas e pode mudar.
- **O que pede de fora.** Uma migration: o catálogo (o lugar com a sua chave em fonte pública, a
  receita, a versão, o estado, e um jeito de **tirar uma peça do ar**), a fila e o registro do
  refazer; todo mundo lê, só o servidor escreve. Uma função nova: a fila que identifica, busca, gera
  e confere, com a contagem pela `edge_call` e pelo `ai_imports` (o `kind` da fase 17), consultas ao
  Nominatim e ao Overpass (a fila da fase 17), ao Wikidata e às APIs da Wikipédia e do Commons (pedem
  um `User-Agent` identificado e têm limite de taxa). Função do servidor não desenha 3D: a
  conferência da peça contra as fotos usa o caminho da fase 20, o laboratório desenha no Chromium e
  o Claude compara. Nada novo do lado do PWA; chave e conta já existem.
- **O custo, estimado pelo balcão e medido pela fase (D140):** uma chamada de visão por lugar novo
  mais uma rodada de conferência, perto de 30 mil tokens de entrada e 25 mil de saída (a contagem
  das fotos não foi conferida): cerca de **US$ 0,30 por lugar** no Sonnet 5.5, US$ 0,60 no Opus 5.5,
  US$ 1,25 no Fable 5.2 (preços de 03/11/2026). Uma vez na vida do app por lugar, até três com o
  refazer; com o teto de 12, uma viagem custa no pior caso de US$ 4 a US$ 7 sem refazer. Qual modelo
  escreve peças fiéis o bastante, a fase descobre testando contra a estufa.
- **Um limite de fora, registrado para quando houver cobrança ou loja:** o art. 48 da Lei 9.610/98
  libera representar obra em logradouro público por pintura, desenho, fotografia e audiovisual, e
  não fala em três dimensões; o STJ lê o artigo de forma restritiva quando há fim lucrativo, e o
  Cristo Redentor tem titular que já foi à Justiça. O Douglas decidiu seguir com peças fiéis ("são
  lugares públicos"); o catálogo precisa conseguir tirar uma peça do ar, e vale uma consulta no dia
  em que o app virar produto.

**Decidido em 15/11:** as peças são fiéis ao lugar real (não vale o "como o GTA faz" dos carros);
licença não é impedimento; o nível de fidelidade da estufa refeita basta; o catálogo cresce por
viagem planejada (não um catálogo feito à mão); a peça nova entra sozinha pela conferência
automática; ao refazer, mais duas opções e a escolha obrigatória; 12 lugares novos por viagem. O que
foi descartado: modelo 3D pronto da internet ou malha gerada por IA a partir de foto (pesa megabytes,
pede GLTF, traz a luz da foto na textura, foge do estilo, copia pixels com autor: o item 4 de "O que
não dá", agora para lugares); o Douglas aprovar cada peça. Sugestão do balcão para depois, não
decidida: as fotos que a própria pessoa tira na parada servirem de referência para a peça dela, na
retrospectiva.

Testes: Vitest das peças (a receita passa no schema, cabe na caixa, assenta no chão e respeita o teto
de formas, como a D66 e a D178; a receita inválida vira a miniatura do tipo; a regra dos lugares: a
parada casa com o lugar pela coordenada, no máximo três cidades de passagem, sem referência sem
peça; o teto de 12; o refazer uma vez com a escolha obrigatória); pgTAP do catálogo (todo mundo lê,
só o `service_role` escreve), da fila, da cota e do refazer; teste da função com um lugar fixo; e2e
da peça na maquete e da folha; laboratório com o gerador simulado (custo zero) e uma geração de
verdade, medida uma vez, até a peça aparecer na maquete, com a segunda olhada no Chromium. Decisões:
a receita e o construtor, o catálogo, a fila e as fontes, a conferência, o refazer, o teto, o custo
medido, o registro do limite legal.

---

## Fase 25 · Correções da conversa

O que quebra a conversa hoje para um leigo e **não depende da fonte de lugares**, antes da fundação nova
da 27. Nasceu da bateria de 20/11 (`docs/ideias/2026-11-20-o-passeio-um-passo-de-cada-vez.md`: dez
pedidos escritos como uma pessoa leiga escreveria, pela tela da produção, saindo de Papanduva/SC) e foi
revista em 21/11 com `docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`: "1 hora e meia"
digitado no campo livre virou " e meia" (o campo se apagou ao passar por "1 hora") e a busca foi a
200 km; "1:30 no máximo" não foi lido e a busca foi a 120 km, em silêncio; a quem volta antes do almoço
o app ofereceu "3 horas" de carro; "almoçar em Mafra" buscou em Mafra, **Portugal**; a saída de hoje
listou o café antes da cachoeira; e, no pedido de 21/11 ("feirinha, café e cortar o cabelo em
Canoinhas"), **a origem saiu como Papanduva** (a pessoa estava em Major Vieira: a conversa não lê a
posição, e `lastOrigin` devolve a viagem com a data de início mais distante) e **a feirinha e o salão
sumiram em silêncio**, mas o título do dia, a nota do café, a lista e uma missão falaram deles como se
estivessem lá. As regras do Douglas: **a localização de quem pede decide o que faz sentido**; **na
dúvida, o app pergunta e não afirma o que não sabe**; **nada some em silêncio, e o texto só fala do que
existe**.

**O que entra** (o levantamento é de 21/11, em `e64ee9d`; o prompt confere na hora)

- **25.1 O GPS na conversa, a origem à vista, o `lastOrigin` consertado** (decisões 2 e 8 de 21/11).
  Hoje `gatherContext` (`intake/gather.ts`) só lê a posição na saída de hoje, e a conversa não pede a
  permissão (uma nota da D176). Passa a pedir ali, com uma frase e um toque ("Usar onde vocês estão"),
  pela mesma pergunta do app e do navegador que o mapa usa (D48, D176); com a posição, ela é **o ponto
  de referência de tudo** (a origem, o viés da cidade dita, os tempos de carro), arredondada a uns 1 km
  no que sai do aparelho (D208, D228). **"Saindo de Major Vieira · mudar"** fica à vista e editável
  antes das opções. Sem posição, vale a origem **da viagem mais recente** (hoje `lastOrigin`, em
  `features/import/new-trip.ts`, ordena por `start_date` e devolve a viagem futura: a de dezembro) e a
  pergunta na dúvida.
- **25.2 O campo livre que não se apaga.** `QuestionsStep.tsx`, `value={chosen ? '' : answer}`: quando o
  texto digitado fica igual a uma opção, o campo esvazia e o resto da digitação vira a resposta. O que a
  pessoa digita nunca se apaga por coincidir com uma opção.
- **25.3 O tempo lido inteiro.** `hoursOf` (`flow.ts`): a tabela da ideia de 20/11, medida rodando a
  função, vira um caso de teste por linha ("1:30" e "hora e meia" não lidos; "1 hora e meia" e "1 hora e
  30 minutos" dão 1 h, porque a alternativa `h` da expressão casa antes de `hora`). E **uma regra só para
  o alcance**: hoje `reachOfAnswer` (`flow.ts`) e `reachOf` (`today.ts`, que manda "2h" e "duas horas"
  para a manhã) leem a mesma resposta com regras diferentes, e há dois raios padrão.
- **25.4 A resposta não entendida se pergunta de novo.** Hoje vira o raio padrão em silêncio (120 ou
  200 km). A tela diz que não entendeu e pergunta de novo, com as opções; perguntar de novo não é uma
  pergunta nova para o teto de três (decisão 6 de 08/11).
- **25.5 As opções nunca contradizem o pedido nem a hora.** O prompt do `ask` fixa "1 hora", "2 horas",
  "3 horas" (`PLAN_ASK_SYSTEM_PROMPT`); `todayQuestions` (`today.ts`) oferece "A manhã" à tarde e não
  tem "a tarde". As opções da IA combinam com o pedido, e as do app com a hora de agora; as opções de
  "para onde" são coisas que o app localiza, nunca nome de região ("Litoral" foi para Camarões).
- **25.6 A saída de hoje na ordem do texto.** `wantsInText` (`places.ts`) devolve as vontades na ordem
  da tabela; passa a ser a ordem em que a pessoa escreveu.
- **25.7 A cidade conferida, nunca outro país em silêncio.** Na forma mínima, porque a fonte muda na 27:
  a cidade e a área ditas são geocodificadas com o viés do ponto de referência (um `viewbox` **sem**
  `bounded`, que o balcão conferiu resolver Mafra/SC e Joinville/SC), **conferidas pela distância** (um
  resultado em outro país ou além do alcance máximo da D228 nunca é usado em silêncio) e, na dúvida,
  **perguntadas** na tela ("Mafra, SC, a cerca de 1 h?", com os candidatos e "Nenhum destes"), no molde
  da D229. A 27 herda a regra ("o app julga") sobre o que o Google devolver.
- **25.8 Nada some em silêncio, e o texto só fala do que existe** (decisão 8 de 21/11). Cada coisa que a
  pessoa pediu termina num de três estados, visível na tela: **escolhida**, **pendente** (a busca não
  achou: "Escolher o local", que a revisão já tem, ou uma pergunta) ou **tirada pela pessoa**. A leitura
  que escreve a viagem (`PLAN_WRITE_SYSTEM_PROMPT`, `assemble.ts`) recebe só o que entrou de fato e as
  pendências marcadas, e **não escreve título, nota, lista nem missão sobre o que não está no roteiro**:
  no teste de Canoinhas, a viagem só com o café não pode se chamar "Café e feirinha" nem ter a "sacola
  para as compras da feirinha".

**Sai desta fase (21/11):** o que era remendo da tabela de tipos e da Geoapify (o nome que casa sem ser
o tipo, os tipos que faltam, a busca pelo nome no "não achei"): a 27 tira a tabela do caminho e troca a
fonte. Nada da 26 (a tela um passo de cada vez, o tempo do passeio todo) nem da 27 (o Google, as
ferramentas) entra aqui.

**O que pede de fora.** A `plan-trip` republicada (os prompts do `ask` e da escrita; o schema do `ask`
não muda), compatível com o app da produção durante a troca (D225). Nenhuma migration (a conversa mora
no aparelho; a forma da viagem não muda). Nenhuma chave nova. A permissão de posição pedida na conversa é
a mesma do mapa. IA: só o que a prova gastar (abaixo). Nada do Douglas.

Testes: Vitest de cada correção (a tabela do tempo, linha a linha; a regra única de alcance; a origem pela
posição e pela viagem mais recente; a cidade com o viés e a conferência pela distância, com respostas
fixas do Nominatim para "mafra", "joinville" e "litoral"; a ordem das vontades no texto; os três estados
de cada coisa pedida; a escrita só sobre o que entrou); o teste da função com entrada fixa (as opções
coerentes; o prompt da escrita com as pendências); e2e `nova-viagem.spec` com a posição concedida no
navegador (a origem à vista e editável), o campo livre digitado inteiro, a resposta não entendida
perguntada de novo, a pergunta da cidade com dois candidatos e o pedido com uma coisa que a busca não
acha terminando em "pendente"; **a prova é com pedidos de leigo** (decisão 7 de 20/11): o
`medir-conversa` ganha, uma vez, "amanha quero almoçar em mafra e depois ir numa cachoeira", "vou pra
joinville sabado, queria parar pra tomar um cafe no caminho", o pedido de 20/11 do Douglas respondendo
"1:30 no maximo" e o de Canoinhas ("iria na feirinha, tomar um cafe e levar a minha mulher cortar o
cabelo, tudo isso em canoinhas sc"), cobrando nenhuma opção fora do Brasil, o tempo lido, e a viagem de
Canoinhas sem título, nota, lista ou missão sobre a feirinha e o salão; teto de custo. Decisões: uma D
para cada defeito, com a causa (como a 13); a D176 (a conversa pede a posição), a D208, a D203 (a origem
de antes), a D225, a D228 e a D231 (a escrita só sobre o que existe) recebem o que mudou.

**Decidido em 20/11:** a localização de quem pede decide o que faz sentido (4); na dúvida, o app pergunta
e não afirma o que não sabe (5); os defeitos puros viram uma correção curta, na frente da fase grande (6);
a prova é com pedidos de leigo (7). **Decidido em 21/11:** o GPS entra na conversa e em toda etapa em que
ajudar (2); a origem à vista e editável, nada some em silêncio e o texto só fala do que existe (8).

---

## Fase 27 · A fonte e o planejador

A fundação nova da pesquisa e da montagem do roteiro, que o Douglas pôs como **a prioridade do app**
(21/11: "Essa parte da pesquisa e montar o roteiro deveria ser a melhor do nosso app e devemos gastar o
tempo e dinheiro que for nela para deixar quase perfeita"; sobre o de hoje: "Nada de imersão para o
usuário, apenas frustração"). O diagnóstico do balcão, que ele aceitou: **o problema não é o modelo da
IA**. Nos onze pedidos de leigo de 20 e 21/11 a IA leu certo os tipos e a cidade, inclusive com erro de
digitação. O que falha é o que fica entre a IA e a tela: um tradutor escrito à mão (a tabela de tipos,
D227), um círculo único de busca (D228) e um mapa pobre em comércio de cidade pequena. No pedido de 21/11
("feirinha, café e cortar o cabelo em Canoinhas"), a tabela derrubou duas das três vontades por
construção ("cortar o cabelo" virou atração turística com "cortar" ou "cabelo" no nome), o café veio num
círculo de 30 km ("não faz sentido, totalmente longe"), e o OpenStreetMap tinha 1 cabeleireiro em
Canoinhas onde o Google Maps lista mais de 40 (a Geoapify usa o OpenStreetMap como fonte, pela
documentação dela). Ideia fechada no balcão em 21/11 (`docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`).

**O que entra**

- **A fonte de lugares é o Google Places** (decisão 3): a **Places API (New)**, atrás de uma função nossa,
  com a chave no servidor (regra 9), no molde da `find-places` (D226: o contrato comum, o handler sem
  rede testado com `fetch` injetado, a chave só no cabeçalho, `no_source` sem a chave, a cota pela
  `edge_call`). O que os cartões ganham: **a nota e o número de avaliações**, o horário e o "aberto nesse
  horário", o lugar fechado de vez; a tela diz que o dado vem do Google Maps, como hoje diz do
  OpenStreetMap e da Geoapify. **"Em Canoinhas" é dentro da cidade** (a área restrita da busca), e só
  abre para os vizinhos quando não acha, dizendo (revê a D228: o círculo de 30 km). **O horário entra na
  conta do passeio**: o app avisa quando o roteiro chega antes de abrir ou depois de fechar. **O roteiro
  guarda o lugar inteiro**, como hoje (o nome, o endereço, a coordenada), **mais o `place_id` do Google**
  (uma coluna nova na parada, ao lado de `osm_type`/`osm_id` da 23): a decisão 4 do Douglas, registrada
  em "O que não dá" (item 7), **não se reabre**. A `find-places` de hoje (a Geoapify) pode continuar
  servindo as sugestões de natureza e turismo, onde o OpenStreetMap é bom, até a medição dizer o
  contrário; o que fica dela é do levantamento do prompt.
- **A IA planeja a busca com ferramentas, e o app julga** (decisão 5; "Gostei do app julga"). A tabela de
  tipos e o filtro por palavra do nome **saem do caminho principal**. A IA recebe o pedido e o contexto
  (onde a pessoa está, a hora, o dia da semana, os gostos) e usa **ferramentas nossas, executadas pela
  função**: **procurar lugares** (o que se quer, com as palavras da pessoa, e onde: dentro de uma cidade,
  perto de um ponto, no caminho entre dois pontos), **localizar um nome** (o lugar que ela nomeou) e **o
  tempo de carro** entre dois pontos. Ela devolve **o passeio em passos**: a ordem, a relação de cada
  passo com o anterior, os candidatos de cada passo, **o que não achou** e **as perguntas quando tem
  dúvida** (a cidade, a ordem, "onde fica a feirinha?"). **O app julga:** só vale candidato que voltou de
  uma ferramenta nesta conversa, e a função confere cada identificador; a IA continua sem inventar lugar,
  coordenada nem horário; a regra de ouro (D232) e "a IA escreve e não escolhe" (D231) continuam: nada
  entra no roteiro sem a pessoa escolher. O laço é curto e tem teto de chamadas; o modelo é o de hoje
  (`claude-sonnet-5-5`, `IMPORT_MODEL`), até a bateria dizer outra coisa. A relação entre os passos deixa
  de ser uma tabela de regras do app e vira o "onde" da ferramenta de procurar: é o que a 26 usa.
- **A bateria de pedidos de leigo, no laboratório, fora do deploy** (decisão 6): **10 pedidos por rodada,
  sempre diferentes entre si**, os resultados **guardados** em `lab_runs` (o painel `/lab`) "para sempre
  ir melhorando e analisá-los", **nunca como portão da CI** ("não pode ser atrelado ao deploy, para não
  deixar ainda mais demorado"). Por pedido: o texto, o que a IA leu, o que as ferramentas devolveram, o
  que ficou pendente, o roteiro que saiu, o tempo e o custo, e o resultado de cada cobrança. As
  cobranças (sugestão do balcão, não conversada): as que valem para qualquer pedido (nada fora do alcance
  dito, nada que suma sem aviso, a ordem dita mantida, a cidade certa, cada coisa pedida com um desfecho)
  mais uma leitura da IA que julga o roteiro contra o pedido. Os onze pedidos de 20 e 21/11 são o
  primeiro material. **Em aberto, para o Douglas:** os 10 pedidos são novos a cada rodada ou fixos
  (recomendação do balcão: novos, com os que falharam voltando até passar).

**O que pede de fora.** **Do Douglas, antes de abrir a fase:** uma conta do Google Cloud com faturamento,
a Places API (New) ligada e a chave em `supabase secrets` (o nome se decide no prompt; o balcão não criou
nada). **Custo do Google** (a página oficial de preços, lida pelo balcão em 21/11): Text Search Pro
US$ 32 por mil, com 5.000 grátis por mês; com nota e horário (Enterprise), US$ 35 por mil, com 1.000
grátis; Place Details Essentials US$ 5 por mil, com 10.000 grátis; estimativa do balcão, não medida: uma
conversa com três buscas sai por cerca de US$ 0,10 depois da faixa grátis. **Custo da IA:** o laço com
ferramentas gasta mais leituras que hoje, não medido; as cotas por pessoa (20 perguntas e 10 roteiros em
24 h, D206) precisam de revisão. **Migration:** provável, para o `place_id` na parada (a conferir). **A
conferir pelo orquestrador ao escrever o prompt:** a forma do pedido da Places API (New) (a busca por texto
com a área preferida e a restrita, a busca ao longo de uma rota, os campos por faixa de preço), o tempo
máximo de uma Edge Function para o laço, e o uso de ferramentas com saída estruturada no modelo de hoje.

**O que não dá, e o que dá.** Os termos do Google e a decisão 4 (item 7 de "O que não dá"); "a feirinha"
e o dia de uma feira (item 8); **as ferramentas de IA do próprio Google** ("Maps Experience agent tools",
um serviço MCP) existem, com termos que proíbem extrair os lugares da resposta e preço não confirmado:
ficam anotadas como alternativa, porque o roteiro precisa do lugar estruturado, que as nossas ferramentas
sobre a Places API dão.

**Se precisar cortar em duas:** primeiro **a fonte** (o Google atrás da função, os cartões com nota e
horário, "em Canoinhas" dentro da cidade, o `place_id` na parada, a atribuição), com a conversa de hoje
por cima; depois **o planejador** com as ferramentas e a bateria. Uma fase só se a chave existir ao abrir.

Testes: Vitest da função com o Google de mentira (a busca numa cidade, perto de um ponto, no caminho; os
campos; a chave nunca na URL nem no log), do julgamento do app (o candidato que não veio de ferramenta é
recusado; o identificador conferido), do laço com teto, dos passos e das perguntas nas saídas fixas da IA,
do `place_id` na parada; o teste da função com entrada fixa, como a 17 e a 24; e2e com a IA e o Google
respondidos no navegador: o pedido de Canoinhas termina com o café escolhido, o salão escolhido e a
feirinha pendente com a pergunta; laboratório: a tarefa da bateria (10 pedidos, com teto de custo por
rodada) e o painel para ler o histórico; uma medição real da conversa de Canoinhas, uma vez, com o custo
do Google e da IA. Decisões: a fonte (a D226 recebe o que mudou), a tabela que sai (D227), onde se
procura (D228), a vontade que vira um plano com ferramentas (D225), o caminho e a escrita sobre os fatos
das ferramentas (D230, D231), o julgamento, a bateria, o `place_id`, as cotas, os custos medidos, o
registro dos termos e da decisão 4.

**Decidido em 21/11:** a pesquisa e a montagem do roteiro são a prioridade (1); a fonte é o Google Places,
com as avaliações e o horário (3); o roteiro guarda o nome e o endereço, e os termos não entram na conta
(4, reafirmada); a IA planeja com ferramentas e o app julga (5); a bateria: 10 pedidos, diferentes,
guardados, fora do deploy (6); "em Canoinhas" dentro da cidade (8).

---

## Fase 26 · O passeio um passo de cada vez (sobre o planejador)

Um passeio é uma **sequência**, e a conversa passa a montá-lo **um passo de cada vez**. A pessoa escreve
do jeito que fala ("quero ir numa cachoeira e depois tomar um café"); o planejador da 27 lê os passos na
ordem em que ela disse e, se ela não disse a ordem, **pergunta**. A tela mostra **só as opções do primeiro
passo**; escolhida a cachoeira, as opções do café são buscadas **em volta dela e no caminho de volta**, e
cada cartão diz quanto aquilo acrescenta ao passeio, não a distância de casa. O tempo que a pessoa tem
vale para o **passeio todo** (a estrada mais o tempo nos lugares), fica à vista o tempo inteiro, e o que
não cabe aparece marcado, não escondido. Nasceu de um uso real do Douglas em 20/11 ("gostaria de amanha
visitar uma cachueira e passar em cafe (melhor que tiver) e voltar para casa", "1:30 no maximo"): as
cachoeiras e os cafés vieram lado a lado, todos medidos de casa; com a cachoeira marcada, os seis cafés
da tela ficavam de 72 a 106 km dela. Nas palavras dele: "dependendo da escolha onde vou por primeiro ele
deveria influenciar na segunda opção que seria o café, então nem deveria mostrar"; "se eu não passasse na
pesquisa quando eu iria no café, deveria perguntar qual seria a ordem". Ideia fechada em 20/11
(`docs/ideias/2026-11-20-o-passeio-um-passo-de-cada-vez.md`) e **mantida em 21/11, construída sobre a
27**: a ordem, a relação de cada passo e a pergunta da ordem passam a vir do planejador; a relação entre
os passos é o "onde" da ferramenta de procurar lugares, não uma tabela de regras do app.

**O que entra** (os itens 1 a 5 da ideia de 20/11, sobre o planejador)

- **A tela um passo de cada vez** ("1 de 2 · A cachoeira"): só os candidatos do passo da vez; os do
  seguinte não aparecem antes da escolha do anterior. Escolhido um passo, o planejador busca o seguinte
  pela relação dele (perto do anterior; no caminho entre o anterior e o próximo ponto fixo: casa, o
  destino, um lugar já escolhido; perto de casa; numa cidade; sem relação dita, em volta do anterior e no
  caminho de volta). **Cada cartão diz o que o lugar acrescenta ao passeio** ("a 10 min da Cachoeira
  Wiegand", "+15 min de estrada"), como "cerca de" (D228). Voltar um passo desfaz as escolhas seguintes,
  e a tela avisa. A ordem final é a dos passos; o caminho mais curto (D230) só ordena o que ficou sem
  ordem. Uma escolha por passo, com "Mais um" para quem quiser dois cafés, é suposição do balcão: o
  prompt decide e registra.
- **O tempo é o do passeio todo** ("Quanto tempo vocês têm?", com opções que combinam com o pedido: a
  manhã, a tarde, o dia, ou em horas), no lugar de "até quanto tempo de carro?"; o app faz a conta (a
  estrada de ida, entre os lugares e de volta, pela rota ou pela estimativa da D228, mais a permanência
  de cada um pela D232, mais o horário do lugar pelo Google). **O total fica à vista** ("O passeio dá
  cerca de 4 h 10: 2 h 40 de estrada e 1 h 30 nos lugares"), ao lado do tempo que a pessoa disse; a
  opção que estoura aparece **marcada**; se nada couber, a tela diz e oferece mais tempo ou outra escolha
  no passo anterior. Até 3 perguntas, ditas antes (decisão 6 de 08/11); a da ordem conta; a prioridade
  quando passarem de três é decisão do prompt (a suposição do balcão: quando, o tempo, a ordem).
- **"Aqui perto", "na cidade", "pertinho" são alcance de minutos, não de horas**, a partir do ponto de
  referência da 25. A quem não sabe para onde ir, o app oferece o que existe ao alcance (tipos de
  passeio e cidades de verdade), nunca nome de região.
- **O que a pessoa disse não some** (sobre os três estados da 25): o lugar que só ela conhece ("a casa da
  minha mãe em Mafra") vira uma parada sem coordenada com "Escolher o local"; a cidade de destino ("vou
  pra Joinville") entra como parada, e "no caminho" é o caminho até ela; a hora do dia dita ("café da
  manhã", "à noite", "antes do almoço") vai para os horários e para a conta, e se a conta não fecha
  ("voltar antes do almoço" com a padaria às 13:25, como no teste 7 de 20/11), a tela avisa antes de
  criar a viagem. **"O melhor café"** ordena pela nota do Google e diz o critério (a 27).

**O que pede de fora.** A `plan-trip` (ou a função do planejador da 27) republicada, compatível com o app
no ar (D225: acrescentar é compatível; renomear ou tirar não é). IA: as leituras do planejador por passo
(a 27 mede). Nenhuma migration, pela leitura do balcão (a conversa mora no aparelho), a conferir. Nenhuma
chave nova. Nada do Douglas. O objetivo do dia que esta fase lê (o destino dito, o que é "no caminho") é o
que a 28 usa para dividir o mapa em trechos.

**Se precisar cortar em duas:** primeiro a tela um passo de cada vez sobre os passos do planejador;
depois o tempo do passeio todo (a pergunta, a conta, a marca do que estoura e o aviso antes de criar a
viagem) e a hora do dia nos horários.

Testes: Vitest (a busca do passo seguinte pela relação; a conta do passeio e a marca do que estoura; a
ordem dos passos mantida; o caminho mais curto só no que ficou sem ordem; o lugar sem coordenada e a
cidade de destino na montagem; o aviso da conta que não fecha); a função com entrada fixa (os passos, as
relações, a ordem dita e a pergunta da ordem nas saídas da IA); e2e com o planejador e o Google
respondidos no navegador (dois passos: o segundo só aparece depois da escolha do primeiro e as opções dele
mudam com ela; a pergunta da ordem; o total à vista e a opção marcada); laboratório: a bateria da 27
ganha as cobranças desta fase (as opções do segundo passo perto da escolha do primeiro; a ordem dita
mantida na revisão; o tempo estourado avisado; a casa da mãe como parada). Decisões: a tela um passo de
cada vez, o tempo do passeio todo, a hora do dia, o lugar da pessoa como parada; **a D228 e a D230
recebem o que mudou**, do jeito da D221 com a D175, a D177 e a D178; a seção 2 do prompt mestre ganha a
regra do perguntar na dúvida ao lado da do não-preencher.

**Decidido em 20/11:** cada escolha influencia a seguinte, e as opções do passo seguinte não aparecem
antes (1); a ordem se lê quando dita e se pergunta quando não dita (2); o tempo perguntado é o do passeio
todo, e o app faz a conta (3). **Em 21/11 (item 7 da ideia principal):** o passeio um passo de cada vez
continua valendo, construído sobre o planejador e o Google.

---

## Fase 28 · O mapa por trechos

Hoje a maquete é uma tira só, com as paradas do dia em ordem, de baixo para cima. Numa ida e volta, a
casa aparece embaixo, na saída, e de novo em cima, na chegada, como se fossem dois lugares. O Douglas,
vendo a própria viagem em 21/11: "não faz sentido a rota sair do meu local e lá em cima mostrar meu local
novamente. Fica estranho meu ponto estar em dois locais diferentes do mapa". A proposta dele: **o mapa
mostra um trecho por vez, até o objetivo**. "Quando eu saísse de Major Vieira, deveria aparecer a rota
até Curitiba como objetivo e as paradas; quando eu chegasse em Curitiba ele iria completar e mostraria no
mapa a volta de Curitiba para Major." Com um trecho por vez, embaixo é de onde se sai e em cima é para
onde se vai; num dia sem volta nada muda. O mesmo print mostrou **"Monte Castelo" duas vezes na maquete,
sem a rota passar lá** (o ponto mais perto fica a 9 km do centro): a regra da D220 dá a cada amostra de
2 km o município mais populoso a até 12 km (`CITY_RADIUS_M`), não o que a estrada atravessa, e a ida e a
volta são dois trechos de amostras, então o mesmo nome entrou duas vezes ("a gente nem passa por Monte
Castelo, como ele está supondo"). Ideia fechada em 21/11 (`docs/ideias/2026-11-21-o-mapa-por-trechos.md`).
É independente da busca.

**O que entra**

- **O dia vira trechos, e o mapa mostra o trecho da vez.** Um **objetivo** é o destino que a pessoa disse
  ("vou pra Curitiba"); o que fica antes dele é **parada do trecho**; a volta para casa é sempre o último
  trecho; um dia pode ter mais de um objetivo. **"Cachoeira e depois café" é um objetivo só** (a cachoeira;
  o café é parada da volta): o mapa não fica picado em trechos curtos. **Quando o app não sabe o objetivo**
  (viagem antiga ou importada): num dia que termina onde começou, divide só a ida e a volta, no ponto
  mais longe de casa; num dia que não volta, um trecho só. A maquete, a câmera de repouso (D216) e as
  pílulas mostram **o trecho inteiro até o objetivo**: de onde se sai embaixo, o objetivo em cima, as
  paradas do trecho no caminho (`layout.ts`, `camera.ts`).
- **A troca de trecho.** No **"Chegamos!" do objetivo**, depois do "Como foi?", o trecho se completa e o
  mapa passa ao seguinte. **Um indicador pequeno "ida · volta"** no topo (ou "1 de 3" quando há mais)
  espia outro trecho com um toque; o trecho feito continua visível como feito. **O "Rever o dia"** toca os
  trechos em sequência. **A barra de progresso fala do trecho** ("até Curitiba"), com o total do dia menor
  ao lado. A projeção com piso (D234) passa a projetar dentro do trecho: a mesma estrada deixa de
  aparecer duas vezes na mesma projeção.
- **As cidades de passagem** (revê a D220): a cidade de passagem é **a que a estrada atravessa**, não a
  mais populosa num raio de 12 km; **nunca repetida** no mesmo trecho. A peça da cidade (D258, D265)
  segue o nome.

**O que pede de fora.** Nada de servidor, de IA nem de chave. **Migration:** só se o objetivo for guardado
na parada; se for sempre derivado (do que a conversa disse, guardado no rascunho, ou da regra de
reserva), não precisa: a conferir. Nada que só o Douglas resolva.

**O que não dá, e o que dá.** A viagem antiga não diz qual parada é o objetivo: vale a regra de reserva;
nas viagens novas, o objetivo vem da conversa (a 26). O trecho feito some da tela principal: o indicador
e o "Rever o dia" o trazem de volta.

Testes: Vitest da divisão em trechos (com o objetivo dito; pela regra de reserva; o dia sem volta como
um trecho só; cachoeira e café), do layout de um trecho (a origem embaixo, o objetivo em cima, a casa uma
vez só), das cidades de passagem (a que a estrada atravessa; nunca repetida; o caso de Monte Castelo e
Major Vieira com a rota do teste de 21/11), da projeção dentro do trecho; e2e no molde do
`ida-e-volta.spec`: sair de casa mostra a ida; o "Chegamos!" do objetivo troca para a volta; o indicador
espia o outro trecho; a barra fala do trecho; laboratório: o `app_maquete` com uma viagem de ida e volta,
com as capturas dos dois trechos. Decisões: os trechos e o objetivo, a regra de reserva, a troca, o
indicador, a barra, a cidade que a estrada atravessa; **a D215, a D216, a D217, a D220, a D233, a D234, a
D258 e a D265 recebem o que mudou**, e **a decisão 1 de 15/11** ("deve aparecer o mapa inteiro do dia da
viagem") passa a valer como **"o trecho inteiro até o objetivo"**; a seção 6.1 do prompt mestre.

**Decidido em 21/11 (o mapa):** o mapa mostra um trecho até o objetivo por vez, e a volta só aparece ao
chegar (1); o objetivo é o destino que a pessoa disse, o resto é parada do trecho, a volta é o último
trecho (2); cachoeira e café: um objetivo, e o café é parada da volta (3); o mapa troca no "Chegamos!" do
objetivo, depois do "Como foi?" (4); o indicador "ida · volta", a barra do trecho e a cidade que a estrada
atravessa (5).

---

## Fase 29 · O chat que continua

O Douglas (21/11): "mesmo após o roteiro estar montado, ainda deixar o chat para o user, para ele ir
podendo tirar dúvidas, sugestões e ir ajustando seu roteiro". A mesma IA da 27, com as mesmas
ferramentas, mais a leitura da viagem. Três usos: **dúvidas** ("o café abre domingo?"), **sugestões** ("o
que tem perto do mirante?") e **ajustes** ("troca o café por uma padaria", "sai às 9", "tira a segunda
parada"). Ideia fechada em 21/11 (item 5 de `docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`).

**O que entra**

- **O chat na viagem**, depois do roteiro pronto, com a leitura da viagem como dado (os dias, as paradas,
  os horários, as reservas que a IA pode citar) e as ferramentas da 27 (procurar lugares, localizar um
  nome, o tempo de carro).
- **Cada mudança proposta aparece como um cartão com "Aplicar"**: nada muda sem o toque, e há desfazer. É
  o mesmo "o app julga": a proposta vale só com lugares que voltaram das ferramentas; a IA escreve e não
  escolhe (D231); nada entra na rota sem a pessoa (D232). Uma troca de parada, um horário novo e uma
  parada tirada passam pelas mesmas peças da revisão e do `reschedule` (D232).
- **Só com rede.** Onde mora o histórico do chat (só no aparelho, ou sincronizado com o time) é do
  levantamento do prompt; a cota por pessoa é própria.

**O que pede de fora.** IA: leituras a mais por viagem, com cota própria e teto medido. Migration:
provável, para o histórico, se ele sincronizar (a conferir). Nenhuma chave nova. Nada do Douglas.

Testes: Vitest (as propostas da IA viram cartões; nada muda sem "Aplicar"; o desfazer; a proposta com um
lugar que não veio de ferramenta é recusada); a função com entrada fixa; e2e: o chat depois do roteiro
propõe uma troca, e ela só acontece no "Aplicar"; laboratório: uma conversa de ajuste na bateria da 27,
com o custo. Decisões: o chat, o cartão com "Aplicar", o histórico, a cota; a 4.8 e a 9.4 do prompt
mestre.

**Decidido em 21/11:** o chat continua depois do roteiro pronto (7); o cartão com "Aplicar" (8).

---

## Fase 19 · O gerador de carros

A base das fases 20 e do "carro grande" da 14. Hoje há cinco perfis escritos à mão (`src/art/cars/
profiles/*`, D66); o perfil precisa ganhar vocabulário para descrever carros de verdade sem perder o
estilo.

**O que entra**

- **O perfil estendido**, ainda um dado puro: famílias de teto (hatch, sedã, fastback, perua, SUV,
  crossover, picape de cabine simples e dupla, van, cupê); as proporções em números (comprimento,
  largura, altura, entre-eixos, balanços, linha de cintura, altura do vidro); a frente (farol
  retangular, redondo, fino, anguloso; grade em barras, colmeia, hexagonal, fechada de elétrico); a
  traseira (lanternas e barra de luz); portas (2, 4, 5); detalhes (rack de fábrica, aerofólio,
  limpador traseiro, faróis de milha); rodas (tamanho e cinco estilos de aro). O contrato da D66
  continua: o contorno fecha na soleira, os arcos ficam sob a chapa, vidros e adesivos dentro da
  carroceria, e o mesmo contorno vira o 3D e o SVG (D67).
- **De spec a perfil.** Um `CarSpec` compacto (o que a IA vai escrever na fase 20) vira o
  `CarProfile` que o `rig.ts` e o `CarSide` já consomem: uma fonte, duas artes, como hoje.
- **A régua.** Os cinco carros atuais reescritos como specs **sem mudança visual** (os snapshots do
  `CarSide` e as fotos do laboratório provam). Os acabamentos da tinta da fase 16 e os estilos de
  roda entram no material e no perfil.

Sem IA e sem servidor nesta fase: código puro e testes. É aqui que mora o carinho: as proporções, o
chanfro, os vidros, as luzes. Testes: Vitest das validações do perfil para cada família; snapshots;
laboratório com o showroom. Decisões: o vocabulário, o spec, a régua.

---

## Fase 20 · O seu carro

O último desbloqueio: "Põe o seu carro na estrada". A pessoa escolhe marca, modelo e ano **numa
lista** (a tabela FIPE, pela API gratuita do Parallelum v2, com cache no servidor: é assim que o
brasileiro chama o próprio carro), nunca num campo de texto. O pedido fica registrado e a pessoa é
avisada quando o carro ficar pronto.

**O que entra**

- **O pedido** vai para uma Edge Function `build-car`, em fila: (1) a geração e as medidas do modelo
  naquele ano (comprimento, largura, altura, entre-eixos, carroceria) com o Claude e busca na web
  (Wikipedia, Wikidata, a página do fabricante); (2) fotos de referência com licença livre do
  Wikimedia Commons (de lado, de frente e de trás, quando houver), como entrada de visão; (3) o
  Claude, com pensamento adaptativo e o schema do `CarSpec` da fase 19 como saída, escreve o spec,
  **como o GTA desenha os carros dele**: os traços que fazem reconhecer o modelo, sem logotipo nem
  nome de marca; (4) a
  **segunda olhada**: o laboratório renderiza o spec no Chromium e pede ao Claude que compare com a
  foto, uma rodada de ajuste; (5) o spec entra em `car_models`, com a chave da FIPE; (6) um push "O
  seu Civic 2019 está pronto" (um tipo novo em `send-notifications`). Na garagem, o carro; "Pedir
  outra tentativa" com uma frase ("o capô está curto") roda de novo, uma vez.
- **O cache.** A chave é marca + modelo + ano (a geração, não a versão: o Civic EXL e o LX 2019 têm a
  mesma carroceria; o chat define o agrupamento). A segunda pessoa com o mesmo carro recebe na
  hora, sem IA. Custo: centavos por carro, **uma vez na vida por modelo e ano**; a `edge_call`
  limita a um pedido por pessoa por dia.
- **A expectativa, dita no app:** "o seu carro na linguagem do Viajei": proporções, silhueta, frente
  e traseira reconhecíveis, pintado e com os acessórios conquistados; sem logotipos nem marcas
  registradas (de propósito). O nome aparece como texto no card ("Civic 2019"). As fotos são só
  entrada: nunca se guardam nem se mostram.
- **Riscos, e o que os segura:** a IA pode errar uma forma (a segunda olhada e "outra tentativa");
  um modelo sem foto no Commons (o spec sai das medidas e do conhecimento do modelo, marcado "sem
  foto de referência"); a FIPE lista versões, não gerações (o agrupamento da chave).

Testes: Vitest do agrupamento e do leitor do spec; teste da função com um pedido fixo; pgTAP de
`car_models` (todo mundo lê, só o `service_role` escreve); laboratório com um pedido real, de ponta a
ponta, até o push. Decisões: a fila, as fontes, o cache, a expectativa.

---

## Fase 21 · O banco conectado (opcional)

Os gastos pelo Open Finance, como opção que a pessoa liga. Fica numa fase própria porque depende de
um contrato de empresa com um agregador autorizado pelo Banco Central (Pluggy ou Belvo; o piso
relatado é de uns R$ 2,5 mil por mês, a confirmar com eles) e porque mexe com dado bancário. O
Douglas decide quando, ou se, paga por isso.

**O que entra**

- **Conectar o banco**, em Perfil › Dados: a pessoa escolhe o banco, consente **no app do próprio
  banco** (o fluxo do Open Finance; o Viajei nunca vê senha nem credencial) e renova a cada 12 meses.
  Dá para desconectar com um toque, e tudo o que veio dali some.
- **O que o app faz com isso:** durante os dias de uma viagem, as transações da conta ou do cartão
  viram **gastos sugeridos**, casados com a parada pela hora e pelo nome do estabelecimento, com a
  categoria pelo tipo do estabelecimento. Entram sozinhos, com Desfazer, ou ficam em "Gastos
  recebidos" para um toque, conforme a pessoa escolher. Nunca inventado: a transação é um fato; o
  que o app faz é pôr no lugar certo. Com a nota fotografada (fase 18) do mesmo valor e hora, os
  dois viram um só.
- **O mínimo de dado:** só valor, data, descrição e a categoria do estabelecimento, só dos dias de
  viagem; nada de saldo, nada fora das datas; cifrado no banco e apagado quando a pessoa desconecta
  ou pelo expurgo da viagem. A LGPD exige dizer isso em palavras simples na tela de conectar.
- **O laboratório** usa o sandbox do agregador (de graça para desenvolver) com um banco de mentira.

Testes: Vitest do casamento transação → parada; teste da função com transações fixas; pgTAP das
tabelas (só a própria pessoa lê o que é dela); laboratório no sandbox. Decisões: o agregador, o
consentimento, o mínimo de dado, o casamento.

---

## O que muda nos documentos

- `docs/prompt-implementacao.md` ganha a regra do não-preencher na seção 2 e esta tabela como
  continuação da seção 12 (v4).
- Cada fase gera o seu `docs/fases/fase-N.md` na vez dela, com o levantamento feito no código daquele
  momento. Este arquivo é o mapa; não substitui o prompt de cada fase.
- O teste final nos aparelhos (`docs/teste-final.md`) ganha um bloco por fase que mexe na tela.
- **Com as fases 22 e 23 (15/11):** a seção 12 do prompt mestre ganha as duas na vez da primeira
  delas; a 6.1 volta a dizer "o dia inteiro na tela" (a decisão 1 de 04/11 em
  `docs/atualizacao-prompt-3d.md`, que a D177 tinha revertido), com o modo de perto ao toque; a D175,
  a D177 e a D178 recebem o que a fase 22 registra (acima); as peças por lugar e o catálogo entram na
  6.1 e no modelo de dados (seção 5) pela fase 23. Nenhum desses documentos muda antes da fase que o
  toca: o plano é o mapa.
- **Com a fase 24 (15/11, noite):** a D207 (a conferência no OSM) e a D208 (a saída de hoje) recebem o
  que a fase registra, do jeito da D221 com a D175, a D177 e a D178; a D29 ganha a exceção do último nó
  do dia; a seção 12 do prompt mestre ganha a 24 na vez dela; a regra do não-preencher ganha o seu
  exemplo maior: a pessoa diz o que quer e escolhe entre lugares reais, nunca desfaz um roteiro
  adivinhado.
- **Com as fases 25 e 26 (20/11):** a D225 (a vontade ganha os passos, as relações e a ordem dita), a
  D228 (onde se procura: em volta da escolha anterior e no caminho; o tempo do passeio todo no lugar do
  raio de ida; uma ou mais por passo, conforme a 26 decidir) e a D230 (o caminho mais curto só ordena o
  que ficou sem ordem) recebem o que a 26 registra, do jeito da D221 com a D175, a D177 e a D178; a D227
  (a tabela de tipos: os que faltam, a palavra que nomeia o lugar) e a D208 (a saída de hoje: as opções
  pela hora, as vontades na ordem do texto) recebem o que a 25 e a 26 mudam; a seção 12 do prompt mestre
  ganha as duas na vez da primeira; a seção 2 ganha, ao lado da regra do não-preencher, **a regra do
  perguntar na dúvida** (decisão 5 de 20/11: o app pergunta e não afirma o que não sabe), pela 26.
  Nenhum desses documentos muda antes da fase que o toca.
- **Com as fases 25, 27, 26, 28 e 29 (21/11):** a D176 (a conversa passa a pedir a posição), a D203 e a
  D208 (a origem de antes, as opções pela hora) pela 25; a D226 (a fonte), a D227 (a tabela sai), a
  D228 ("em tal cidade" é dentro da cidade; as opções com nota e horário), a D225 (a vontade vira um
  plano com ferramentas), a D230 e a D231 (o caminho e a escrita sobre os fatos das ferramentas) pela
  27 e pela 26, do jeito da D221; a D215, a D216, a D217, a D220 (a cidade que a estrada atravessa), a
  D233, a D234, a D258 e a D265 pela 28, e **a decisão 1 de 15/11 passa a valer como "o trecho inteiro
  até o objetivo"**; no prompt mestre, a 6.1 (o trecho) pela 28, a 9.5 (a fonte) e uma seção do
  planejador pela 27, a 4.8 e a 9.4 (o chat que continua) pela 29, a seção 2 (a regra do perguntar na
  dúvida) pela 26, e a seção 12 ganha as cinco na vez da primeira. Nenhum desses documentos muda antes
  da fase que o toca.

## O que o Douglas decidiu em 08/11/2026

1. Sem datas nem trava: cada fase entra quando estiver pronta, independentemente da viagem.
2. Partiu! e Chegamos! na barra de baixo sobre a maquete, **e automáticos pelo GPS sempre que o
   mapa está aberto**: o app precisa ser inteligente.
3. **Cada pessoa tem o seu carro**, em qualquer viagem. A viagem não tem carro.
4. Os modelos ficam livres; os níveis passam a liberar cores, acabamentos e rodas; o último nível
   libera o seu carro.
5. O tipo Posto entra em `STOP_KINDS`.
6. Até 3 perguntas na conversa, ditas antes; sem formulário alternativo.
7. As confirmações de reserva chegam também **encaminhadas por e-mail** para um endereço do app.
8. O Open Finance entra **como opção**, numa fase própria (21), por um agregador.
9. O seu carro é feito **como o GTA faz**: reconhecível pelos traços, sem logotipo nem réplica.
10. O desenho do caderno vale como está; sugestões são bem-vindas desde que **não poluam a tela**.
11. **Todos os chats de fase recebem a autorização antecipada**, com os limites de segurança: ele não
    vai estar presente para autorizar nada.


## O que o Douglas decidiu em 15/11/2026

No balcão de ideias, sobre o mapa do dia inteiro (`docs/ideias/2026-11-15-mapa-do-dia-inteiro.md`):

1. **A câmera é a A:** o dia inteiro, inclinado, com o toque no carro para ver de perto. "Deve
   aparecer o mapa inteiro do dia da viagem. Se a viagem tem um dia apenas, aparece o mapa da
   viagem." Porque é o que ele desenhou e não achou ao abrir o app.
2. **As peças são fiéis ao lugar real**, e quanto mais próximas da realidade, melhor ("isso dá uma
   imersão ainda maior"). Para lugares não vale o "como o GTA faz" dos carros (decisão 9 de 08/11):
   não se estiliza para fugir da semelhança.
3. **Licença não é impedimento:** "são lugares públicos que não tem problema ser fielmente
   parecidos". O limite de fora fica registrado na fase 23, e o catálogo precisa conseguir tirar uma
   peça do ar.
4. **O nível de fidelidade da estufa refeita basta.** É a régua.
5. **O catálogo cresce por viagem planejada:** "para cada viagem planejada, monta as maquetes que
   ainda não tem e vai salvando". Substitui um catálogo feito à mão.
6. **A peça nova entra sozinha**, pela conferência automática contra as fotos; ninguém aprova uma a
   uma. **Ao refazer, o app gera mais duas opções e a pessoa precisa escolher entre elas**, para
   limitar o consumo.
7. **A viagem real não é critério de nada:** "nunca mais, em qualquer lugar, deve levar nossa viagem
   em consideração para nada, apenas vamos fazer". Reafirma a decisão 1 de 08/11: a ordem sai só da
   dependência e do valor.
8. **Valeu por omissão** (o balcão avisou que seguiria assim e ele não disse outra coisa): 12 lugares
   novos por viagem; no máximo três cidades de passagem por dia; cidade de passagem com o nome
   pequeno, sem pílula e sem horário.

O que essas decisões mudam: a **D177** (a câmera atrás do carro vira o modo de perto; o quadro de
repouso é o dia inteiro), a **D178** (as miniaturas por tipo na escala nova; a peça por lugar toma o
lugar delas quando existe) e a **D175** (o enquadramento desconta a altura medida), na fase 22; a
**seção 6.1 do prompt mestre** na fase 22 e na 23. O orquestrador encaixou a ideia como as fases 22
e 23 (a tabela "A ordem") em 15/11, com a fase 17 em andamento; nenhuma das duas começa antes do
Douglas pedir.

## O que o Douglas decidiu em 15/11/2026, à noite (com a fase 22 fechada)

1. **O nome fica Viajei** até o app estar pronto e disponível; a troca se vê depois. Nenhum domínio
   novo antes disso.
2. **O e-mail encaminhado da fase 18 usa o domínio que o app já usa para enviar**, `reitechia.com.br`
   (o remetente do Auth é `viajei@reitechia.com.br`, Resend, D11), num subdomínio próprio de
   recebimento, porque o DNS está na GoDaddy e o MX da raiz é o e-mail da GoDaddy. A 3.0 da 18 decide
   o provedor do recebimento; o MX, ligar o recebimento e os secrets são dele (a seção da fase 18,
   acima, já diz isso).
3. **A CLI da Vercel saiu da conta de cliente:** a identidade agora vem da pasta; no viajei a CLI fica
   sem login, e a regra das fases de não usá-la continua.

No balcão de ideias, sobre o café colonial (`docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`):

4. **"As coisas precisam ser mais simples para o usuário."** A pessoa diz o que quer e o app **dá as
   opções**; ela escolhe. Não um roteiro pronto para ela desfazer.
5. **"Se tiver algum ponto interessante no caminho para visitar, você vai sugerir e não apenas
   adicionar."** O que está no caminho é sugestão, desligada; a pessoa liga.
6. **"Apenas pode colocar algo direto na rota se a pessoa realmente falar no chat."** A regra de ouro.
7. **Os lugares vêm do mapa, não da memória da IA** (proposta do balcão no fechamento, sem objeção): a
   IA entende e escreve; o mapa diz o que existe, onde e a que distância.
8. **Vira trabalho de fase**, com plano, testes e laboratório, não um remendo na conferência de hoje.

9. **A fonte da busca por tipo é a API comercial atrás de uma Edge Function** (a Places da Geoapify,
   sobre o OSM; a chave no servidor, como a do OpenRouteService; o plano gratuito, com a atribuição),
   decidida às 21h de 15/11 quando o orquestrador perguntou, contra o Overpass próprio e contra cortar a
   fase em duas. A conta e a chave são dele.
10. **A 24 é a próxima**, antes da 18 (a mesma pergunta): a ordem 24 → 18 → 23 → 19 → 20 → 21.

O orquestrador encaixou a ideia como a **fase 24** na noite de 15/11, com a 22 fechada, e abriu o portão
dela na mesma noite, a pedido do Douglas (`docs/fases/fase-24.md`).

## O que o Douglas decidiu em 20/11/2026

No balcão de ideias, sobre o passeio um passo de cada vez
(`docs/ideias/2026-11-20-o-passeio-um-passo-de-cada-vez.md`), depois de um uso real dele na produção
("gostaria de amanha visitar uma cachueira e passar em cafe (melhor que tiver) e voltar para casa") e
de uma bateria de dez pedidos de leigo:

1. **Cada escolha influencia a seguinte, e as opções do passo seguinte não aparecem antes.** "Dependendo
   da escolha onde vou por primeiro ele deveria influenciar na segunda opção que seria o café, então nem
   deveria mostrar. Pois talvez eu escolha uma cachoeira e um café muito longe um do outro, aí a rota
   fica horrível."
2. **A ordem se lê quando dita e se pergunta quando não dita.** "Se eu não passasse na pesquisa quando eu
   iria no café, deveria perguntar qual seria a ordem, para poder fazer as perguntas, e cada lugar
   influencia o outro." A forma da pergunta ("O que vem primeiro?", com "Tanto faz") foi recomendação do
   balcão.
3. **O tempo perguntado é o do passeio todo, e o app faz a conta.** Recomendação do balcão: um leigo pensa
   "tenho a tarde", e dois lugares a 1 h 30 de casa em direções opostas cabem no raio e não cabem na
   tarde.
4. **A localização de quem pede decide o que faz sentido.** "Se falo que quero ir amanhã em uma padaria
   aqui perto, não vai ser longe em outro estado e muito menos em Portugal."
5. **Na dúvida, o app pergunta e não afirma o que não sabe.** "Se ficar em dúvida, deve perguntar e não
   afirmar algo que não sabe." Vale para a cidade, para o tempo e para qualquer resposta que ele não
   entendeu.
6. **Os defeitos puros viram uma correção curta, na frente da fase grande.** Recomendação do balcão.
7. **A prova é com pedidos de leigo.** "Textos bem simples, como realmente uma pessoa leiga iria fazer."

Sobre as decisões 2, 3 e 6: o balcão apresentou as três recomendações e o Douglas respondeu "Aceito
sugestões"; o balcão leu isso como aceite das três, e a leitura é dele. **Descartado** com ele: manter
as listas juntas e só reordenar a segunda depois da primeira escolha; o app decidir a ordem sozinho
quando ela não foi dita; perguntar "até quanto tempo de carro?" como raio de ida por lugar; resolver a
cidade só com `countrycodes=br`.

O que essas decisões mudam: a **D225** (a vontade ganha os passos, as relações e a ordem dita), a
**D228** (onde se procura e o tempo do passeio todo) e a **D230** (o caminho mais curto só ordena o que
ficou sem ordem), na fase 26; a **D227** (a tabela de tipos) e a **D208** (a saída de hoje) de leve, nas
fases 25 e 26; a **seção 2 do prompt mestre** ganha a regra do perguntar na dúvida, pela 26. O
orquestrador encaixou a ideia como as fases 25 e 26 (a tabela "A ordem") na noite de 20/11, com a fase
23 em andamento; nenhuma das duas começa antes do Douglas pedir, e a posição delas antes da 19 espera a
palavra dele.

## O que o Douglas decidiu em 21/11/2026

No balcão de ideias, de manhã, sobre a pesquisa e a montagem do roteiro
(`docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`), depois de mais um pedido real dele na
produção ("iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em
canoinhas sc": a feirinha e o salão sumiram, o café veio longe, e a origem saiu como Papanduva quando ele
estava em Major Vieira):

1. **A pesquisa e a montagem do roteiro são a prioridade do app**, com o tempo e o dinheiro que for
   preciso. "Essa parte da pesquisa e montar o roteiro deveria ser a melhor do nosso app e devemos
   gastar o tempo e dinheiro que for nela para deixar quase perfeita." Sobre o de hoje: "Nada de imersão
   para o usuário, apenas frustração."
2. **O GPS entra na conversa e em toda etapa em que ajudar.** "Deve usar no momento que está montando o
   roteiro e todas as outras etapas que achar necessário, não devemos poupar recurso."
3. **A fonte é o Google Places**, com as avaliações e o horário. "Acho que o melhor é Google Places"; "é
   confiável e mais atualizado".
4. **O roteiro guarda o nome e o endereço do lugar, como hoje, e os termos do Google não entram na
   conta.** O balcão leu os termos e disse que eles proíbem isso (o item 7 de "O que não dá"). Ele
   respondeu: "como é um app de pesquisa e desenvolvimento, não tem problema, é apenas para nós usar,
   veja que não tem nada cobrando e ele é fechado". E reafirmou: "não levar em consideração os termos,
   apenas vamos usar o recurso e pronto para nosso estudo de app fechado. Isso está sendo apenas um
   teste de app." **As sessões seguem esta decisão e não a reabrem.**
5. **A IA planeja com ferramentas e o app julga.** A tabela de tipos sai (revê a D227). "Gostei do app
   julga."
6. **A bateria:** 10 pedidos por rodada, diferentes, resultados guardados, fora do deploy ("não pode
   ser atrelado ao deploy, para não deixar ainda mais demorado"; "para sempre ir melhorando e
   analisá-los").
7. **O chat continua depois do roteiro pronto.** "Mesmo após o roteiro estar montado, ainda deixar o
   chat para o user, para ele ir podendo tirar dúvidas, sugestões e ir ajustando seu roteiro."
8. **As sugestões do balcão estão aceitas** ("aceito sugestões", duas vezes): a origem à vista e
   editável; "em Canoinhas" dentro da cidade; nada some em silêncio; o texto só fala do que existe; o
   cartão com "Aplicar" no chat.

No mesmo dia, sobre o mapa por trechos (`docs/ideias/2026-11-21-o-mapa-por-trechos.md`), a partir de um
print da viagem que ele criou ("não faz sentido a rota sair do meu local e lá em cima mostrar meu local
novamente"; "a gente nem passa por Monte Castelo, como ele está supondo"):

9. **O mapa mostra um trecho até o objetivo por vez**, e a volta só aparece ao chegar. Ideia dele.
10. **O objetivo é o destino que a pessoa disse**; o resto é parada do trecho; a volta para casa é o
    último trecho. Recomendação do balcão.
11. **Cachoeira e café: um objetivo, e o café é parada da volta.** Recomendação do balcão.
12. **O mapa troca no "Chegamos!" do objetivo**, depois do "Como foi?". Como ele descreveu.
13. **O indicador "ida · volta", a barra do trecho e a cidade que a estrada atravessa.** Sugestões do
    balcão ("aceito sugestões dessa também").

**Descartado** com ele: trocar o modelo da IA (o Sonnet 5.5 entendeu os pedidos; um modelo maior
alimentaria o mesmo funil); um índice próprio de lugares com dados abertos (Overture, Foursquare aberto),
que o balcão recomendou primeiro e fica como reserva se o Google deixar de servir; guardar só a referência
do Google e pedir permissão ao Google antes (saíram pela decisão 4); um robô raspando o Google Maps; uma
bateria de 50 a 100 pedidos como portão do deploy (ele reduziu para 10 e tirou do deploy); o dia inteiro
numa tira quando o dia tem volta (a decisão 1 de 15/11 passa a valer como "o trecho inteiro até o
objetivo"); cada lugar escolhido como um objetivo.

**Em aberto, para ele:** os 10 pedidos da bateria são novos a cada rodada ou são 10 fixos? O balcão leu
"sempre um diferente do outro" como os dois e recomenda novos a cada rodada, com os que falharam
voltando até passar. **Pendência só dele, antes da fase 27:** a conta do Google Cloud com faturamento, a
Places API (New) ligada e a chave em `supabase secrets`.

O que essas decisões mudam: a **D176**, a **D203** e a **D208** (a conversa pede a posição; a origem à
vista; as opções pela hora), na fase 25; a **D226**, a **D227**, a **D228**, a **D225**, a **D230** e a
**D231** (a fonte, a tabela que sai, onde se procura, a vontade que vira plano, o caminho e a escrita
sobre os fatos), nas fases 27 e 26; a **D215**, a **D216**, a **D217**, a **D220**, a **D233**, a **D234**,
a **D258** e a **D265** e **a decisão 1 de 15/11**, na fase 28. O orquestrador reviu as fases 25 e 26 e
encaixou as 27, 28 e 29 (a tabela "A ordem") em 21/11 de manhã, com a 23 fechada e a 25 escrita e à espera
destes ajustes, a pedido do Douglas; nenhuma fase começa antes dele pedir, e a ordem se confirma a cada
"próxima".
