# Melhorias depois da fase 12: as fases 13 a 20

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

Sem datas e sem trava (decisão do Douglas, 08/11): cada fase entra quando estiver pronta, e a ordem
é só a das dependências. A 13 vai primeiro por corrigir defeitos.

| Fase | Entrega | Depende de | Tamanho |
|---|---|---|---|
| 13 | Correções: o mapa sobre a folha, a rolagem horizontal, o que o teste do Douglas achar | 12 | pequena |
| 14 | A viagem abre no mapa: a maquete inteira na tela, o carro grande, Partiu! e Chegamos! pelo GPS, "Detalhes", as miniaturas | 13 | grande |
| 15 | Paradas que se registram sozinhas (com o mapa aberto) | 14 | média |
| 16 | A garagem é da pessoa, e o perfil organizado | 13 | média |
| 17 | Criar a viagem conversando: um campo só, a saída de hoje, o pedido para outras IAs | 16 | grande |
| 18 | Reservas e gastos sem digitar: ler a confirmação (colada, anexada ou encaminhada por e-mail) e a nota | 17 | média |
| 19 | O gerador de carros: o perfil paramétrico capaz de descrever carros de verdade | 16 | grande |
| 20 | O seu carro: marca, modelo e ano viram o carro da maquete, com cache e aviso | 19 | grande |
| 21 | O banco conectado (opcional): os gastos pelo Open Finance, por um agregador, com contrato | 18 | média |

## O que não dá como foi pedido, e o que dá

Quatro pedidos esbarram em limites de fora do app. O plano usa a melhor alternativa de cada um, e
o Douglas confirmou as quatro em 08/11.

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

- **O carro no perfil.** `profiles.car_model`, `car_color`, `car_accessories` (migration 0013; copia
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
   um forja. O e-mail entra pelo Cloudflare Email Routing (de graça, com um Email Worker que repassa
   o texto e os anexos a uma Edge Function `inbound-mail`); a função confere ainda que o remetente é
   o e-mail da conta, trata o conteúdo como dado (nunca como instrução, D130) e lê a confirmação. A
   reserva vai para a viagem cujas datas a contêm; sem viagem certa, para **Reservas recebidas**,
   onde um toque a põe no lugar; a pessoa recebe um push "Chegou a reserva do Vila Suzana". O
   e-mail não fica guardado: só o que a leitura tirou dele e os anexos, como qualquer anexo.
   **Depende de um domínio próprio**, que depende da decisão do nome (a pesquisa de marca de 08/11:
   "Viajei" está tomado no INPI).

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
