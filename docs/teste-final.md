# Teste final nos aparelhos

O roteiro único do teste nos celulares, para fazer uma vez, na versão final (D91). Ele junta os
roteiros das fases 4 a 11 e a matriz de testes do plano (`passo-0-delta-2026-11-04.md`, seção 8),
na ordem em que uma pessoa usa o app: primeiro no iPhone, depois no Android. Os roteiros por fase
ficam na pasta como registro; tudo o que eles pedem está aqui.

## Quando fazer

- **Antes de 11/12**, o dia da viagem do RS: assim sobra tempo para corrigir o que aparecer.
- **De preferência a partir de 26/11.** É quando o Dia 1 da viagem real entra nos 15 dias do
  Open-Meteo e a previsão dela aparece no app; a partir de 29/11 aparecem os quatro dias. Antes de
  26/11, a faixa da visão geral diz "previsão a partir de 26/11", e o clima só se testa no Ensaio.
- **Em dias seguidos.** A viagem de teste (o **Ensaio**, montado em 1.3) tem dois dias. A folha
  "Avisos da viagem" só aparece a partir de 7 dias antes do início de uma viagem, e a primeira
  abertura do app nunca a mostra.

## Quanto tempo leva

| Sentada | Quando | Blocos | Tempo |
|---|---|---|---|
| Preparo | antes de tudo | "O que separar antes" | 20 min |
| iPhone A | a véspera do Ensaio, em casa | 1.1 a 1.7 | 2 h |
| iPhone B | o dia 1 do Ensaio, com uma saída curta a pé ou de carro; termina depois das 18:30 | 1.8 a 1.15 | 2 h 45 |
| Android, instalar | a noite do dia 1, para ele receber o briefing do dia 2 | 2.1 e 2.2 | 10 min |
| iPhone C | o dia 1 ou o dia 2 do Ensaio, de dia (o clima se lê ao sol) | 1.16 a 1.22 | 2 h 30 |
| Android | o dia 2 do Ensaio, com uma volta curta de carro | 2.3 a 2.14 | 3 h 20 |
| Com hora marcada | a manhã do dia 2, às 9h do dia seguinte ao fim do Ensaio, 07/12 e 10/12 | 1.23 | 5 min cada |
| iPhone D (fase 14) | o dia 1 do Ensaio, no carro de verdade, com o mapa aberto | 1.24 | 40 min |

**Total: umas 7 h 30 no iPhone e 3 h 15 no Android**, perto de 11 h em três dias seguidos, mais os
toques com hora marcada. A sentada C pode ficar para depois do Android.

## O que separar antes

- Os dois celulares carregados, e o carregador: o modo painel fica 30 min com a tela acesa e o GPS.
- O iPhone com iOS 26 e o Android com o Chrome atualizado.
- O Chrome do computador, entrado na mesma conta. É o "outro aparelho" da parte 1 (o Android serve
  também). Os textos com o nome de outra pessoa ("Ana chegou") só aparecem se alguém do time marcar;
  com a mesma conta, aparece "Chegamos:".
- Wi-Fi e dados móveis, para ligar e desligar o modo avião.
- Nas saídas de carro, alguém dirige, ou você para o carro antes de tocar no celular: o modo painel
  foi feito para não pedir nada de quem dirige.
- No iPhone: um PDF de reserva (em Arquivos ou num e-mail), um print de confirmação na galeria e um
  papel com texto para fotografar.
- No WhatsApp, uma mensagem para você mesmo com o texto de `supabase/seed/viagem-rs.txt`. Nas
  Notas, três notas: o mesmo texto; o texto repetido 11 vezes (perto de 29 mil caracteres); e
  repetido 12 vezes (passa de 30 mil). E um texto que não é roteiro, como uma receita.
- No Android, uma foto em HEIC na galeria (de um Samsung, por exemplo).
- O Instagram e o WhatsApp instalados nos dois.
- Os seus contatos de teste: o seu celular (com WhatsApp) e um telefone fixo qualquer.
- Em Avisos (de qualquer viagem; vale para o aparelho), na seção "Sons e conquistas": **Sons do
  Modo Viagem** e **Cartões de conquista** ligados, nos dois celulares. O iPhone fora do modo
  silencioso, para ouvir o sino.
- As viagens:
  - **A viagem real do RS** (11 a 14/12): só para olhar o mapa, o clima e os avisos dela. Não marque
    paradas nem mude nada nela.
  - **"Teste"** (06 a 09/11), que já terminou: a retrospectiva, se ela tiver paradas concluídas,
    uma ou duas memórias com foto e um gasto. Senão, a retrospectiva fica para o Ensaio, depois
    que ele terminar.
  - **"RS — cópia"** e as outras que a importação cria em 1.2. Exclua todas quando terminar, de
    preferência antes de 07/12 (veja "Se algo falhar").
  - **"Ensaio"**, montado à mão em 1.3.
- Antes de começar: Perfil › **Laboratório de testes** (o botão aparece no seu Perfil). A última
  execução tem de estar verde; se não estiver, anote o que estava vermelho.

## Onde anotar

- **Neste arquivo.** Cada item tem uma caixa `- [ ]`. Passou: troque por `- [x]`. Falhou ou ficou
  estranho: deixe `[ ]` e escreva logo abaixo, numa linha recuada, `Falhou: ...` (veja "Se algo
  falhar"). Não deu para fazer: `Pulei: <motivo>`.
- **Os números** (fps, tempos, bateria) vão nas lacunas `____` da seção "Os números que faltam".
- Cada bloco termina com uma linha **Anotações** para o que não couber nos itens.
- Com o celular na mão e longe do computador, anote nas Notas com o número do bloco ("1.8: o selo
  não apareceu") e passe para cá depois.
- **No fim, cole este arquivo** (ou só as anotações e a tabela dos números) no próximo chat com o
  Claude. Ele atualiza a D64 e a D75 com os números, registra o resultado em `docs/decisoes.md`,
  corrige o que falhou e confere no servidor o que este roteiro manda conferir lá.

## O que o laboratório já testa sozinho

Um agente automático roda todo dia às 3h07 na produção, e no preview de cada branch antes do merge
(D50, D55, D106). Ele faz o papel de dois aparelhos, num Chromium com perfil de celular, e confere:

- o servidor dos avisos inteiro (cron, função, VAPID, cifra, dedupe, o 410 do aparelho que saiu) e o
  texto de cada aviso: hora de sair, parada fechando, briefing com clima, time, véspera, prazo de
  cancelamento e retrospectiva pronta (D50, D51, D105, D125, D151);
- no navegador: a folha de avisos, o Partiu! na notificação com o app fechado, "Desde a última vez",
  o Chegamos! pela posição, o modo painel ligando, o `.ics`, a maquete montando e o "Rever o dia"
  até o fim (D55, D92);
- listas e "Pronto para partir", contatos e os links de ligar e WhatsApp, a reserva no "Agora",
  print e PDF sem rede, missões, foto sem sinal, gastos e sair com pendência (D105);
- XP e o cartão de desbloqueio, a retrospectiva até o card final e o vídeo (D125), uma importação
  real com a IA (D139), o mapa com tiles de verdade e sem rede, e o clima (D151);
- desta fase: o ensaio do expurgo, o aparelho atrasado e o Lighthouse. A CI roda ainda o fluxo
  principal e o offline num WebKit com o perfil do iPhone 15, e confere contraste, alvos de toque e
  nomes de botão.

Por isso este roteiro fica com o que só um aparelho de verdade prova: a entrega do push pela Apple
e pelo FCM, com o app fechado e o celular bloqueado; o selo no ícone; os botões da notificação no
Android; Wake Lock e GPS de verdade; câmera, galeria e HEIC; o PDF no app instalado do iPhone; o fps
da maquete e da garagem; o vídeo, a folha de compartilhar, o WhatsApp e os stories; o dedo no mapa;
o clima ao sol; som e vibração; VoiceOver, TalkBack e o texto ampliado do sistema.

## Parte 1 · iPhone

### 1.1 Instalar e entrar · 10 min (fases 2 e 4)

- [ ] **No Safari.** Abra https://viajei-mauve.vercel.app e entre com o seu e-mail e a senha. Na
  lista de viagens aparece o cartão "Leve o Viajei na tela de início", com **Como instalar**. Pode
  aparecer o aviso "Pronto para usar sem sinal".
- [ ] **A folha de instalar.** Toque **Como instalar**: a folha "Adicionar à Tela de Início", "No
  Safari, são dois toques", com os dois passos.
- [ ] **A frase dos avisos.** Abra a viagem real › **Avisos da viagem**. Em "Neste aparelho", o
  cartão diz "No iPhone, os avisos só chegam com o Viajei na Tela de Início. Instale e volte aqui
  para ativar."
- [ ] **Instalar.** Compartilhar → Adicionar à Tela de Início. O ícone do Viajei aparece na Tela de
  Início. Abra por ele: o app abre em tela cheia, sem a barra do Safari. Se pedir, entre de novo.
- [ ] **Instalado, o cartão some.** A lista de viagens não mostra mais o cartão de instalar.
- [ ] **A primeira abertura não pede nada.** Nesta primeira abertura pelo ícone, nenhuma folha de
  avisos aparece. Feche o app (deslize para cima) e abra de novo.
- [ ] **O que a conta já tinha.** Se a conta já tem XP, a primeira visão geral aberta no Safari, e
  depois no app, mostra na própria página, sem confete, "Você já tinha conquistado N conquistas e
  N XP." ("Vocês", numa viagem com time.)

Anotações:

### 1.2 A viagem com a IA · 40 min (fase 10)

Cada leitura conta uma das 20 do dia; este bloco usa umas sete (menos de US$ 1 do crédito, D140).

- [ ] **Copiar do WhatsApp.** Segure a mensagem do roteiro e toque **Copiar**. (Várias mensagens
  selecionadas também servem: o WhatsApp junta com data e nome.)
- [ ] **Criar e colar.** Em Nova viagem, nome "RS — cópia", de 11 a 14/12/2026, toque **Criar e
  colar roteiro**. Na tela **Colar roteiro**, toque no campo e cole:
  - o texto entra inteiro, com as quebras de linha e os emojis;
  - o contador mostra o tamanho ("2.617 / 30.000", mais ou menos);
  - aparecem "Rascunho guardado neste celular" e a linha "O texto vai para a IA da Anthropic".
- [ ] **O rascunho fica.** Feche o app e abra de novo na mesma tela: o texto continua lá.
- [ ] **Lendo.** Toque **Ler o roteiro**. Primeiro, **Lendo o roteiro…**, com um pulso suave.
  Anote quanto tempo fica assim (na tabela dos números).
- [ ] **Chegando.** Depois, **Chegando · N dias · N paradas**: dias e paradas entram um a um, com
  um fade curto. A tela não pula nem treme, e dá para rolar enquanto chega. O horário e o "fecha
  às" só aparecem inteiros (nunca "13:"); a última parada cresce enquanto o nome chega.
- [ ] **A revisão.** Ao terminar, abre **Revisar o roteiro**: "4 dias · 18 paradas · 2 reservas ·
  6 contatos · 4 missões". Confira dia a dia contra o texto: nomes, horários, "fecha às", tipos.
  Anote o tempo até a revisão abrir.
- [ ] **Nada inventado.** Nenhum campo que o texto não tem vem preenchido. Parada sem horário diz
  "sem horário no texto"; reserva sem código, "sem código no texto".
- [ ] **Editar na revisão.** Toque no lápis de uma parada, mude o horário e toque **Guardar na
  revisão**: a revisão volta no mesmo ponto, com o horário novo.
- [ ] **Desmarcar.** Desmarque uma parada do dia 4 e uma missão: o resumo do topo diminui.
- [ ] **A revisão fica.** Feche o app no meio da revisão e abra de novo: ela continua igual, sem
  ler de novo.
- [ ] **Os lugares.** As paradas ganham o lugar uma a uma ("Localizando os lugares… 3 de 18"); as
  que têm link do Maps no texto ganham na hora.
- [ ] **Escolher o local.** Numa parada com **Escolher o local (N)**, toque: a folha mostra as
  opções, com a atribuição do OpenStreetMap. Escolha uma: a parada mostra o endereço.
- [ ] **Nenhum destes.** Em outra, toque **Nenhum destes**: "Sem local · dá para marcar depois".
- [ ] **Sem rede na busca.** Com a busca ainda andando, ligue o modo avião: "Sem internet para
  localizar". Desligue: a busca continua sozinha.
- [ ] **Salvar.** Toque **Salvar na viagem**. A visão geral abre com as paradas em 4 dias (as 18,
  menos a que você desmarcou) e o aviso "Roteiro na viagem". Abra o Roteiro e um dia: as paradas na
  ordem do texto, com os lugares escolhidos.
- [ ] **Planejador.** No Perfil, a conquista **Planejador** (adesivo de mapa) está liberada, e o
  cartão dela apareceu num momento calmo (ao abrir a visão geral ou o Perfil). Se ela já tinha
  saído antes, anote "já tinha".
- [ ] **Acrescentar.** Na viagem "Teste", Roteiro › **Acrescentar de um texto**. Cole um texto
  curto com uma parada nova e uma que já existe. Na revisão, a que existe aparece "Já está no
  roteiro", desmarcada. Salve: a nova entra pela hora, e nada do que existia muda.
- [ ] **Um dia fora das datas.** Ainda na "Teste", cole um texto com um dia logo depois do fim
  (10/11, que já passou: a "Teste" continua terminada). O dia aparece marcado, com **Ampliar
  até…** e **Deixar de fora**. Amplie e salve: as datas da viagem mudam e o dia novo tem as paradas.
- [ ] **Cancelar.** Numa viagem nova, cole o texto, toque **Ler o roteiro** e, no meio,
  **Cancelar**: a tela volta ao texto, que continua no campo.
- [ ] **Pelas Notas.** Numa viagem nova, cole a nota do roteiro e leia: o resultado é o mesmo do
  WhatsApp.
- [ ] **Texto longo.** Cole a nota de 11 repetições. O teclado e o campo não travam ao colar nem ao
  rolar. A leitura termina, ou para em uns dois minutos e meio com "O texto não foi lido até o
  fim", mostrando o que chegou para revisar. Não salve.
- [ ] **Acima do limite.** Cole a nota de 12 repetições: o contador fica vermelho e o botão explica
  o limite.
- [ ] **Sem rede.** Em modo avião, abra a tela de colar: o botão diz **Precisa de internet para ler
  o roteiro**, e o texto continua guardado.
- [ ] **Não é roteiro.** Cole a receita e leia: termina com pouca coisa ou com "A resposta não deu
  para usar". Nada é salvo sem você tocar em Salvar.

Anotações:

### 1.3 O Ensaio, à mão · 15 min (fases 3 e 4)

O Ensaio é a viagem do teste do dia: dois dias, o dia da sentada B e o seguinte. Crie em Nova
viagem, nome "Ensaio", com origem na sua cidade. Em Roteiro, abra cada dia e use **Adicionar
parada** (tipo, nome, endereço pela busca, horário, "Fecha às" e "Deslocamento até a próxima
(min)"). Cada parada tem um papel:

| Dia | Parada | Tipo | Onde | Para quê |
|---|---|---|---|---|
| 1 | Casa | Origem | a sua casa | o aviso de saída (1.8); o Partiu! do painel (1.10) |
| 1 | Padaria | Comida | um lugar a 500 m ou mais, aonde você vá a pé ou de carro | o Chegamos! do painel, o "Como foi?" em card e o "+ Gasto" (1.10) |
| 1 | Hotel | Hotel | um lugar no caminho de volta, a 300 m ou mais da Padaria | a reserva no "Agora" e o Chegamos! ao abrir o app no lugar (1.10) |
| 1 | Praça | Outro | qualquer endereço da cidade | Partiu! e Chegamos! no toque, e a folha "Como foi?" (1.11) |
| 1 | Sorveteria | Comida | qualquer endereço | o replay ao abrir (1.13) |
| 1 | Mirante | Natureza | qualquer endereço | quem ficou em casa (1.13) |
| 1 | Museu | Cidade | qualquer endereço | "Desde a última vez" (1.13) |
| 2 | Saída do hotel | Origem | a sua casa | o aviso no Android e o Partiu! na notificação (2.3) |
| 2 | Mercado | Comida | qualquer endereço | Chegamos! na notificação, sem sinal (2.3) |
| 2 | Posto | Outro | qualquer endereço | o "estado velho" (2.3) |
| 2 | Lanchonete | Comida | qualquer endereço | o replay ao abrir no Android (2.3) |
| 2 | Igreja | Cidade | qualquer endereço | quem ficou em casa no Android (2.3) |
| 2 | Banca | Outro | no caminho de volta para casa, a uns 5 min dela | "Vocês passaram por…" (2.5) |
| 2 | Casa | Outro | a sua casa | o fim do dia |

Os horários da Casa e da Saída do hotel, e o "Fecha às" do Mercado e do Posto, você acerta na hora
do teste. Dê horário a todas as paradas, para o clima por parada aparecer.

- [ ] **Os dias.** O Ensaio tem os dois dias, das datas da viagem.
- [ ] **A busca do endereço.** Em cada parada, a busca acha o lugar (no ritmo de uma por segundo,
  regra do Nominatim). "Ou cole um link do Google Maps" também preenche.
- [ ] **A rota.** Abra a página de cada dia com internet: a rota do dia aparece. É ela que a
  maquete, a posição e o mapa usam depois.
- [ ] **O teclado.** Em "Nova parada", o campo em que você digita fica visível acima do teclado, e
  o botão de salvar dá para alcançar.

Não abra o Modo Viagem do Ensaio antes do dia 1: a abertura do dia acontece uma vez por aparelho, e
ela é testada em 1.9.

Anotações:

### 1.4 Reservas, print e PDF · 20 min (fase 7)

- [ ] **Criar.** No Ensaio, visão geral › **Reservas** › **Adicionar reserva**. Tipo Hotel, nome,
  ligada à parada Hotel (o Check-in se preenche pelo horário dela), a Saída no dia 2 às 12:00, o
  Código de confirmação, o Telefone digitado como `(54) 3282-0000` e o "Último dia para cancelar
  sem custo".
- [ ] **Anexos.** Em Anexos: **Tirar foto** (fotografe o papel com texto) e **Escolher arquivo** (o
  PDF). Salve. Anote quanto tempo a foto levou do toque em "Usar foto" até a miniatura.
- [ ] **Ver reserva.** A folha "Ver reserva" abre: **código grande**, check-in e saída, Ligar,
  WhatsApp, Maps, Waze e os dois anexos. Espere sumir o "aguardando sinal" das miniaturas.
- [ ] **Copiar o código.** Toque no código: "Código copiado". Cole em outro app para conferir.
- [ ] **O print em modo avião.** Ligue o modo avião, feche o app de vez e abra de novo, ainda em
  modo avião. Reservas › a reserva › toque no print: abre em tela cheia; a pinça aproxima; o toque
  duplo aproxima e volta.
- [ ] **O PDF em modo avião.** Ainda em modo avião, toque no PDF: abre dentro do app, com as
  páginas e os botões − e +. **É o ponto de maior risco da fase 7:** anote se abriu, se todas as
  páginas aparecem e se o texto fica nítido no zoom.
- [ ] **Compartilhar o PDF.** No PDF, toque em Compartilhar: a folha do sistema abre com "Salvar em
  Arquivos" e outros apps.
- [ ] **Ligar e WhatsApp.** Ligar abre a confirmação de chamada com o número certo (cancele);
  WhatsApp abre o app com o número. O botão funciona em modo avião; o número precisa de sinal.

Anotações:

### 1.5 Listas e "Pronto para partir" · 10 min (fases 8 e 9)

- [ ] **Abrir as listas.** No Ensaio (ainda antes do início), ponha dois ou três itens em Antes e
  em Mala. Na visão geral, toque no cartão com os anéis **Antes** e **Mala**: as listas abrem.
- [ ] **+2 XP.** Marque um item de Antes: "+2 XP" discreto perto do item. Desmarque e marque de
  novo: nada aparece (remarcar não dá XP de novo).
- [ ] **Pronto para partir.** Marque o que falta em Antes e, por último, em Mala. No último toque,
  o cartão **Pronto para partir** sobe com o carro da viagem e a mala de teto; o confete cai e o
  **sino** toca. (No iPhone a vibração não existe na web; anote se o sino tocou.)
- [ ] **Uma vez só.** Feche e volte à visão geral: o selo **Pronto para partir** no lugar da
  frase. Abra as listas de novo: o cartão não volta.
- [ ] **A barra do time.** Na visão geral, a barra **Time · Nível N** anda com o XP; no Perfil, a
  sua barra e as conquistas (as que faltam dizem o que falta).

Anotações:

### 1.6 Contatos, ligar e WhatsApp · 15 min (fase 8)

Na RS — cópia, que já tem os seis contatos do texto, acrescente os seus dois de teste.

- [ ] **Emergência no topo.** Abra **Contatos**: a Emergência antes de tudo, com SAMU 192,
  Bombeiros 193, Polícia Militar 190 e Polícia Rodoviária Federal 191.
- [ ] **Ligar no SAMU.** Toque **Ligar** no SAMU: a confirmação de chamada para 192. **Cancele.**
- [ ] **Ligar num celular.** No contato com o seu celular: a confirmação mostra o número no formato
  internacional (+55 …). Cancele.
- [ ] **WhatsApp.** No mesmo contato, **WhatsApp**: o app abre direto na conversa com esse número
  (o app, não o site).
- [ ] **Fixo sem WhatsApp.** O contato com telefone fixo tem só Ligar.
- [ ] **Salvar no celular.** Toque no lápis de um contato › **Salvar no celular**. A folha de
  compartilhar abre; escolha Contatos. Confira nome, telefone e empresa (o nome da viagem). Salve
  e procure no app Contatos.
- [ ] **Salvar todos.** Volte e toque **Salvar todos** no topo: um arquivo com todos os contatos e
  os telefones das reservas. A importação oferece adicionar todos os contatos.
- [ ] **Os campos.** Anote se algum campo veio vazio ou com caracteres estranhos (os acentos, o
  travessão de "RS — cópia" na empresa).

Anotações:

### 1.7 Ativar os avisos e o calendário · 10 min (fase 4)

- [ ] **No Safari, a instalação vem antes.** Abra o Ensaio no Safari (não no app). Em vez da folha
  de avisos, aparece o cartão de instalar com "No iPhone, os avisos de hora de sair só chegam com o
  Viajei na Tela de Início. Instale primeiro; depois é um toque para ativar." Só olhe: não toque em
  "Agora não".
- [ ] **A folha no momento certo.** Abra o Ensaio pelo app instalado (já não é a primeira
  abertura): a folha **Avisos da viagem** aparece uma vez, com "Sair em 15 min" e "hora de sair",
  o briefing e "Chegam com o celular bloqueado e sem o app aberto".
- [ ] **A permissão no toque.** **Ativar avisos** → o iOS pergunta → Permitir. Toast "Avisos
  ativados".
- [ ] **Em Avisos.** Visão geral › **Avisos da viagem**: "Avisos ligados" e, embaixo, "iPhone".
  Anote a hora; o Claude confere no servidor a assinatura com `platform = ios`.
- [ ] **As preferências do Ensaio.** "Receber avisos desta viagem" ligado, "Avisar com antecedência"
  em 15 min, "Briefing da manhã às" no horário em que você estará com o celular no dia 2, e os
  tipos ligados.
- [ ] **As preferências da viagem real.** Na viagem do RS, em Avisos: "Receber avisos desta viagem"
  ligado, com Briefing da manhã, Véspera e Prazo de cancelamento (para 1.23).
- [ ] **Exportar o dia.** Em Avisos › Calendário, **Exportar o próximo dia** (no dia, "Exportar o
  dia de hoje"): a folha de compartilhar abre e o Calendário importa os eventos, com alarme 15 min
  antes de cada "sair às".
- [ ] **Exportar a viagem.** **Exportar a viagem**: os eventos de todos os dias no Calendário, com
  os alarmes.

Anotações:

### 1.8 O dia começa pelo aviso · 30 min (fase 4)

Dia 1 do Ensaio. Edite a parada Casa para sair daqui a 20 min.

- [ ] **Com o app fechado e o celular bloqueado.** Feche o app (deslize para cima) e bloqueie o
  celular. 15 min antes da saída chega "Sair em 15 min", com "Casa · HH:MM" embaixo.
- [ ] **O selo.** O ícone do Viajei mostra o selo "1".
- [ ] **A substituição.** No minuto da saída chega "Hora de sair", que **substitui** o anterior: na
  tela bloqueada fica um aviso só dessa parada, não dois.
- [ ] **O toque abre o Agora.** Toque na notificação: o app abre direto no Modo Viagem, com o botão
  Partiu! em destaque (no iPhone não há botões na notificação). O selo some ao abrir.
- [ ] **Parada fechando.** Se a Padaria tiver "Fecha às", 60 min antes chega "Padaria fecha às
  HH:MM" · "faltam 60 min".
- [ ] **Sair em 15 min para…** Mais tarde, para uma parada que não é saída, o aviso diz "Sair em 15
  min para <parada>", com o tempo de estrada e a chegada prevista.

Anotações:

### 1.9 O Modo Viagem e a maquete · 15 min (fases 4, 5 e 11)

- [ ] **Abrir cai no dia.** Abra o app pelo ícone, durante o Ensaio: ele cai direto no Modo Viagem
  do dia. O link "Início" leva à lista de viagens, e ela fica lá.
- [ ] **A abertura do dia.** Nesta primeira abertura do dia no aparelho: o relevo sobe, a estrada
  se desenha da origem ao fim, as pílulas caem em sequência, o carro entra pela estrada e
  estaciona. Leva 2 a 3 s. Cronometre do toque até a maquete aparecer (tabela dos números). Para
  ver de novo, abra outro dia: cada dia tem a própria abertura.
- [ ] **O clima na abertura.** Com previsão: o chip do clima entra com o carro e sobe para a faixa
  de cima da maquete. No "Agora", a linha da previsão da próxima parada, discreta.
- [ ] **A posição, numa frase.** A linha "Posso usar a posição do celular para acertar onde vocês
  estão? Uma leitura ao abrir, nada em segundo plano." → **Usar posição** → o iOS pergunta →
  Permitir.
- [ ] **A linha da posição.** Com a rota: "N% do caminho do dia, pela posição do celular".
- [ ] **Parada, a maquete não desenha.** Com nada se movendo, nada anima (o anel da próxima parada
  pulsa na pílula).
- [ ] **O som depende de um toque.** O ronco da abertura pode ficar mudo nesta primeira abertura:
  no iPhone o som só sai depois de um toque na página.

Anotações:

### 1.10 O modo painel: tela acesa e GPS · 45 min (fases 4, 7, 8 e 9)

A saída curta. Anote a bateria antes de começar.

- [ ] **Ligar.** Em casa, toque **Modo painel**: a barra "Painel ligado · Tela acesa · GPS ·
  gravando trilha" aparece embaixo, e a tela não apaga sozinha.
- [ ] **Partiu! sozinho.** Saia com o celular e passe de 300 m da Casa: Partiu! automático, com o
  toast "Saímos de Casa" e **Desfazer**. Anote a distância aproximada em que marcou.
- [ ] **Chegamos! sozinho.** Fique uns 3 min na Padaria: Chegamos! automático, com "Chegamos:
  Padaria" e Desfazer.
- [ ] **O "Como foi?" em card.** Com o painel, a folha **não** abre: aparece o card "Como foi
  Padaria?" embaixo do "Agora", com "Contar como foi" e o ✕.
- [ ] **Parado.** Fique 10 min parado ali: a barra muda para "Parado · GPS econômico · trilha
  gravada".
- [ ] **+ Gasto.** Toque **Gasto** (ao lado de "Modo painel"). O formulário vem com a data de hoje,
  a Padaria e a categoria **Comida**, e o teclado é o numérico. Digite o valor e salve: "Gasto
  lançado", com "Ver gastos". Em Gastos, a barra e o total.
- [ ] **Desligar.** Toque **Desligar**: tudo para; a tela volta a apagar sozinha. Anote a bateria:
  são uns 30 min de painel.
- [ ] **A trilha.** Anote a hora; o Claude confere no servidor a linha do dia em `trip_tracks`.
- [ ] **A trilha no mapa.** No mesmo dia, visão geral › **Mapa**: a trilha do painel, fina, na sua
  cor, e o carro no último ponto, com "Visto às HH:MM". (Só aparece no dia de hoje.)
- [ ] **A reserva no Agora.** Agora o Hotel é a próxima parada: o "Agora" mostra embaixo "Hotel … ·
  código … **Ver reserva**". Toque: a folha abre com o código grande. Em modo avião, tudo continua
  aparecendo.
- [ ] **Chegar sem o painel.** Feche o app, vá até o Hotel e, a menos de 150 m, abra o Modo
  Viagem: o Chegamos! se marca sozinho, com o toast "Chegamos: Hotel" e Desfazer. Um card "Como
  foi Hotel?" aparece, com "mais 1 parada depois" enquanto o da Padaria espera.
- [ ] **O cartão de desbloqueio.** De volta, espere uns 15 s e abra a visão geral do Ensaio. Se a
  conquista ainda não tinha saído nesta conta: o cartão **Primeiro pé na estrada** sobe com o carro
  no palco, o rack desce e encaixa com o som de encaixe, o confete cai, o sino toca, e
  "Desbloqueou: Rack de teto". Anote se o encaixe engasgou (um tranco no instante em que o rack
  desce).
- [ ] **Usar no carro.** Toque **Usar no carro** e abra a **Garagem**: o carro está com o rack.

Anotações:

### 1.11 Chegamos! no toque e "Como foi?" · 15 min (fases 5, 7 e 9)

- [ ] **Partiu! no toque.** No Modo Viagem, toque **Partiu!**: a buzina toca e o carro sai do nó.
- [ ] **Chegamos! no toque.** Toque **Chegamos!** na Praça: o sino toca, o confete cai e a parada
  conclui. Um "+10 XP" discreto sobe perto do botão.
- [ ] **A folha abre sozinha.** Logo depois do confete (cerca de 1 s), a folha **Como foi Praça?**
  abre.
- [ ] **Câmera e galeria.** Dê uma nota, toque **Tirar foto** (câmera) e depois **Da galeria** (uma
  foto do rolo). Uma foto tirada em HEIC entra normalmente.
- [ ] **Salvar.** Escreva uma memória e toque **Salvar**: "Guardado no diário".
- [ ] **Na lista do dia.** A Praça mostra a sua nota na sua cor e o botão **Minha memória**.
- [ ] **Os cards que esperavam.** "Contar como foi" num card abre a folha daquela parada; o ✕
  dispensa e o card não volta.

Anotações:

### 1.12 A foto sem sinal · 10 min (fase 7)

- [ ] **Sem sinal.** Modo avião. Abra **Minha memória** na Praça e adicione uma foto. Salve.
- [ ] **Na hora.** A miniatura aparece na hora, com o selo **"aguardando sinal"**, e o cabeçalho
  mostra "Sem conexão · N" (a foto conta).
- [ ] **A volta do sinal.** Saia do modo avião com o app aberto. Em alguns segundos o selo some e o
  indicador do cabeçalho some (tudo enviado).
- [ ] **No outro aparelho.** No Chrome do computador, abra o diário do Ensaio: a foto aparece
  primeiro como borrão colorido e depois nítida.

Anotações:

### 1.13 O time em outro aparelho · 20 min (fases 4 e 5)

Use o Chrome do computador (ou o Android) com a mesma conta.

- [ ] **O replay ao abrir.** Feche o app no iPhone. No outro aparelho, marque Partiu! e Chegamos!
  na Sorveteria. Abra o app no iPhone: o carro anda do lugar onde estava até a Sorveteria, o anel
  preenche e o check salta quando ele passa, e o chip "Nome · HH:MM" aparece na pílula. "Pular"
  fica sempre visível. O card "Desde a última vez" **não** aparece junto.
- [ ] **Quem ficou em casa.** Com o Modo Viagem aberto no iPhone, marque o Mirante no outro
  aparelho: o carro avança sozinho até ele em 1 a 3 s, com o chip, sem recarregar.
- [ ] **Ver como lista.** No rodapé de "Lista do dia", toque **Ver como lista**: a maquete some e a
  lista fica aberta. Feche e abra o app: continua assim.
- [ ] **Desde a última vez.** Ainda na lista, feche o app. No outro aparelho, marque o Museu. Abra
  o app no iPhone: o card escuro "Desde a última vez" lista "Chegamos: Museu · HH:MM" (com outra
  pessoa do time, "<nome> chegou: Museu · HH:MM"). **Ok** fecha, e ele não volta.
- [ ] **Ver a maquete.** **Ver a maquete** desfaz a lista.

Anotações:

### 1.14 O fps da maquete e as curiosidades · 20 min (fases 5, 6 e 7)

O chip de diagnóstico se liga com `?diag=1` no endereço, e o app instalado não tem barra de
endereço. Por isso o fps se mede **no Safari**, com a mesma conta (entre, se pedir).

- [ ] **O chip.** No Safari, abra a RS — cópia › Roteiro › Dia 1 com internet uma vez (para a rota
  ficar no aparelho). Abra o Modo Viagem no Dia 1, toque na barra de endereço e acrescente
  `?diag=1` ao fim. No canto da maquete aparece o chip, por exemplo `· fps · WebGPU · Auto · Alta`.
  O iOS 26 tem de dizer **WebGPU**. Parado, o fps mostra `·`.
- [ ] **Para ter o que rever.** Toque Partiu! na saída de Papanduva e Chegamos! na parada seguinte
  (o Park Salto Ventoso). As marcações ficam só na cópia.
- [ ] **fps em Alta.** Toque **Rever o dia**: o carro percorre o dia do começo ao ponto atual (até
  20 s), com as curiosidades e o ronco. Leia o fps no chip durante o movimento e anote.
- [ ] **fps em Leve.** Toque no chip até ele dizer `Leve` e repita "Rever o dia". Anote. Toque de
  novo até `Auto`. Se o automático rebaixou sozinho (`Auto · Leve`), anote também.
- [ ] **WebGL2, para comparar.** Toque no chip **WebGL** (força o motor WebGL2) e repita em Alta.
  Anote. Toque de novo para voltar.
- [ ] **As curiosidades.** No Dia 1 o caminho tem o ponto mais alto, subida, entradas de cenário e a
  serra antes de Caxias. Cada mergulho da câmera dura 2,5 s no "Rever o dia" (1,5 s no replay ao
  abrir), com a legenda no alto; parado, nada se move.
- [ ] **As fotos no Rever o dia.** No app instalado, no Modo Viagem do Ensaio, toque **Rever o
  dia**: quando o carro passa pela Praça, uma miniatura com o anel na sua cor aparece sobre a pílula
  por pouco mais de um segundo; com mais de uma foto, "+N".

Anotações:

### 1.15 A noite e fora da rota · 10 min (fase 5)

- [ ] **Noite.** Depois das 18:30, abra o Modo Viagem do Ensaio: céu escuro, faróis, lanternas e
  janelas das torres acesas, e o texto 10% maior. A transição leva 1,5 s. (No Safari com
  `?diag=1`, o chip "Dia" / "Noite" troca a qualquer hora.)
- [ ] **Fora da rota.** Num dia do Ensaio, a mais de 2 km do caminho do dia (numa saída qualquer),
  abra o Modo Viagem: o carro fora da estrada, uma linha tracejada até ela e o chip "Fora da rota ·
  N km".

Anotações:

### 1.16 O mapa · 20 min (fase 11)

- [ ] **Abrir.** Na visão geral da viagem real, toque **Mapa**. Antes da viagem, ele abre no Dia 1.
- [ ] **O dedo.** Pince para aproximar e afastar, e arraste: o mapa acompanha o dedo, sem a página
  rolar junto.
- [ ] **Os dias.** Toque **Dia 2 · sáb**: o mapa voa até o dia. Toque **Viagem**: os quatro dias,
  com pinos menores.
- [ ] **O pino.** Toque num pino: a folha mostra o nome, o horário, o endereço, Google Maps e Waze.
  Google Maps abre o app do Maps no lugar. Volte e toque Waze.
- [ ] **A folha por cima do mapa** (fase 13). Com a folha do pino aberta, nenhum pino, estrada ou
  tile aparece por cima do cartão branco: a folha cobre o mapa inteira, inclusive onde há pinos
  embaixo dela. O mesmo com um toast na tela ("Parada salva"): ele fica por cima da folha.
- [ ] **Ver no mapa.** Na página de um dia, **Ver no mapa**: o mapa abre naquele dia.
- [ ] **Não é GPS.** Nada no mapa pede a sua posição, e não há "você está aqui".
- [ ] **A atribuição e a área segura.** Role até o fim: "Leaflet | © OpenStreetMap" fica no canto de
  baixo do mapa, inteiro, sem nada por cima, e o fim da página respeita a barra de baixo do iPhone.
  Toque **OpenStreetMap**: abre a página de copyright do OSM.
- [ ] **No escuro.** Ponha o iPhone no tema escuro e abra o mapa: fundo escuro, ruas legíveis, a
  estrada laranja e os pinos se destacam, a atribuição se lê. No tema claro, o mapa volta ao tom de
  papel do app.
- [ ] **Sem rede, depois de visto.** Com rede, abra o mapa do Dia 1, espere os tiles e aproxime uma
  vez. Modo avião; feche o app e abra de novo. No mapa: "Sem internet: o mapa mostra só as áreas já
  vistas neste aparelho", os tiles que você viu, a linha da estrada e os pinos. Onde você não
  olhou, só o fundo na cor do app. Tire o modo avião.
- [ ] **Engasgos.** Anote se o mapa engasgou ao abrir, ao trocar de dia ou na pinça.

Anotações:

### 1.17 O clima ao sol · 10 min (fase 11)

Na viagem real a partir de 26/11; antes, no Ensaio.

- [ ] **A faixa.** Ao ar livre, com o brilho que você usa no carro, abra a visão geral: a faixa
  "Previsão do tempo" se lê, com ícone, máxima, mínima e a chuva (quando passa de 20%). Os dias além
  dos 15 dizem "previsão a partir de DD/MM". Embaixo, "Dados do tempo: Open-Meteo.com".
- [ ] **O dia.** Abra o Dia 1: "Papanduva 26° / 15° → Bom Princípio 31° / 19° · chuva 60%" (com os
  lugares e os números do dia) e, em cada parada com horário, a previsão pequena daquela hora.
- [ ] **No Modo Viagem.** No Ensaio, de hoje: a linha da previsão da próxima parada no "Agora".
- [ ] **Sem rede.** Em modo avião, a faixa continua, com "atualizado às HH:MM".

Anotações:

### 1.18 A garagem e o fps dela · 25 min (fase 6)

O que estiver acima do nível do time abre só a **prévia**, que mostra e não grava. É o certo.

- [ ] **O chip.** No Safari, abra a garagem do Ensaio e acrescente `?diag=1` ao endereço
  (`/viagens/<id>/garagem?diag=1`). O chip fica no canto de baixo do palco, por exemplo `60 fps ·
  WebGPU · Auto · Alta`. O iOS 26 diz **WebGPU**. Cronometre até o primeiro quadro.
- [ ] **fps.** Ao entrar, o disco gira devagar sozinho por 20 s: leia o fps e anote. Toque no chip
  até `Leve`, saia, volte e anote. Volte para `Auto`. Depois de 20 s sem toque o disco para e o chip
  mostra `·`.
- [ ] **Girar com o dedo.** Arraste na horizontal: o carro gira sobre o disco, as luzes ficam
  paradas e o reflexo corre pela lataria. Solte com velocidade: a inércia leva o carro, e ele volta
  ao giro lento. Arraste na vertical: a câmera inclina numa faixa curta. Pince: aproxima e afasta,
  até um limite. A página não rola com o dedo no palco.
- [ ] **Pintura.** No app instalado, toque em outra cor: a tinta muda em cerca de 0,4 s, com o
  verniz brilhando. Feche e abra o app: a cor ficou. Ela aparece no card da viagem (na lista) e no
  topo da visão geral.
- [ ] **Prévia de modelo.** Toque **SUV**: o hatch sai rodando para a direita e o SUV entra pela
  esquerda, em cerca de 0,9 s, com um ronco curto. Aparecem o selo "Prévia" e o cartão "SUV: no
  nível 3 (Explorador)". Repita com Sedã, Picape e Kombi. Na Kombi, a saia e blusa (a cor embaixo,
  branco gelo em cima) e o V no nariz. "Voltar ao carro da viagem" traz o carro de volta. Anote se
  alguma troca engasga, na primeira vez de cada modelo e nas seguintes.
- [ ] **Prévia de acessórios.** Toque **Bicicleta**: o rack e a bicicleta descem e encaixam com
  mola e um "toc" seco; o cartão mostra a frase do rack e a da bicicleta. Com adesivos, no quarto:
  "Cabem 3 adesivos: tire um para pôr este." Na Kombi cabem três itens no teto; volte para o hatch
  com os três: um aviso diz qual saiu.
- [ ] **A prévia não grava.** Com uma prévia na tela, feche o app e abra de novo: volta o carro da
  viagem.
- [ ] **Na maquete.** Abra o Modo Viagem do Ensaio: o carro na estrada tem a cor escolhida. À
  noite, faróis e lanternas acendem como antes.
- [ ] **Sem 3D.** No Safari, `/viagens/<id>/garagem?render=list`: no lugar do palco, a vista
  lateral grande, com as mesmas linhas. A prévia e a gravação funcionam igual, e cada troca dá um
  pulinho.

Anotações:

### 1.19 O diário e a retrospectiva · 30 min (fases 7 e 9)

- [ ] **O diário.** No Ensaio, visão geral › **Diário**: por dia, as paradas concluídas com a hora
  real e quem marcou, e as memórias na cor de cada pessoa (estrelas, texto e fotos). As saídas
  aparecem como linhas discretas.
- [ ] **As fotos.** Toque numa foto: tela cheia; deslize para os lados para passar pelas fotos do
  dia.
- [ ] **A entrada.** Na visão geral da "Teste" (ou do Ensaio, depois que ele acabar): o cartão
  **Viajei!** · "A retrospectiva está pronta · N paradas". Toque.
- [ ] **O filme.** Ele toca por 15 s: o título "Viajei!", a câmera descendo até o carro, o
  sobrevoo com o chip de cada dia e as fotos nos nós, e o card final com dias, paradas, horas de
  estrada, km, o gasto contra o orçamento, as conquistas e o time. O filme não tem o chip de fps:
  anote se o sobrevoo engasga.
- [ ] **Rever e Pular.** **Rever** recomeça; durante o filme, **Pular** leva ao card final.
- [ ] **O som.** O ronco discreto no sobrevoo e o sino no fim.
- [ ] **O vídeo.** No card final, **Vídeo · 15 s**. A folha "Compartilhar a viagem" diz, em "Vídeo
  para stories", **MP4 · H.264** · 1080 × 1920 · 15 s · sem som. Toque **Gerar vídeo** ("Gerando…
  N%") e anote quanto tempo levou.
- [ ] **Conferir.** O vídeo aparece na folha: assista inteiro. Os textos sem borrão, e ele não
  engasga.
- [ ] **WhatsApp.** **Compartilhar vídeo** → WhatsApp, para você mesmo: o vídeo chega e toca.
- [ ] **Stories.** Compartilhar vídeo de novo → stories do Instagram: tela cheia, vertical, sem
  barras.
- [ ] **Os cards.** Em "Cards como imagem", escolha **Stories 9:16**, deixe as quatro marcadas e
  toque **Compartilhar 4 imagens**: a folha abre com as quatro; mande para o WhatsApp. Repita com
  **Feed 4:5**. Confira as fontes (Barlow, as do app), as fotos e o carro.

Anotações:

### 1.20 Offline completo · 15 min (fases 2, 7, 8 e 9)

- [ ] **A casca sem rede.** Modo avião. Feche o app de vez e abra pelo ícone: o app abre, com a
  lista de viagens.
- [ ] **Tudo do aparelho.** Ainda sem rede, abra e confira que aparecem: a visão geral, o Roteiro e
  um dia, o Modo Viagem com a maquete, Reservas (o print e o PDF), Contatos inteiro (Ligar continua
  levando ao discador), o Diário inteiro e a retrospectiva (o filme toca com o que o aparelho tem).
- [ ] **Escrever sem rede.** Edite uma parada e marque um item de lista: o cabeçalho mostra "Sem
  conexão · N". Toque nele: a lista das alterações por enviar.
- [ ] **A volta.** Tire o modo avião: o indicador some sozinho em segundos, sem recarregar. No
  outro aparelho, as mudanças chegam.
- [ ] **Nova versão.** Se em algum momento destes dias aparecer "Nova versão disponível" com
  **Recarregar**, toque e anote se o app voltou onde você estava.

Anotações:

### 1.21 Acessibilidade · 40 min (fases 5 a 10 e 12)

**VoiceOver** (Ajustes › Acessibilidade › VoiceOver; deslize para passar de item em item, toque
duplo para ativar). Percorra a lista de viagens, a visão geral, o Modo Viagem, uma reserva, Avisos,
a garagem e o mapa.

- [ ] **Todo botão tem nome.** Cada botão é lido pelo que faz, inclusive os de ícone ("Editar
  viagem", "Dia anterior", "Dia seguinte", "Desligar o modo painel", "Fechar"). Nenhum "botão"
  sozinho. Anote os que não dizem nada.
- [ ] **A ordem.** A leitura segue a tela de cima para baixo, sem pular o "Agora".
- [ ] **Partiu! e Chegamos!.** No Modo Viagem, os dois são achados e ativados pelo VoiceOver, e o
  toast ("Chegamos: …", com Desfazer) é lido.
- [ ] **A maquete.** O VoiceOver não fica preso na maquete; a **Lista do dia** tem as mesmas
  paradas, com os estados.
- [ ] **As folhas.** Com uma folha aberta ("Como foi?", uma reserva), o VoiceOver lê o título dela e
  não sai para a tela de trás. Anote se o foco foi para a folha ao abrir.
- [ ] **Sem rede.** Em modo avião, o indicador do cabeçalho é lido "Sem conexão, N alterações por
  enviar".
- [ ] **O mapa.** Os pinos são lidos com o número e o nome ("1. Casa").

**Texto ampliado** (Ajustes › Acessibilidade › Tela e Tamanho do Texto › Texto Maior, no máximo).

- [ ] **O app.** Anote se o texto do app mudou de tamanho. Em qualquer caso, nada corta, sobrepõe
  ou sai da tela na lista, na visão geral, no "Agora", nos botões Partiu! e Chegamos! e nas folhas.

**Reduzir movimento** (Ajustes › Acessibilidade › Movimento › Reduzir Movimento). Ligue e refaça:

- [ ] **Maquete.** Reabra o Modo Viagem: sem abertura, sem replay (o card "Desde a última vez" volta
  a ser o que conta o que aconteceu), sem mergulhos da câmera (só a legenda), sem sons. O carro
  aparece direto no lugar, e o chip do clima já pequeno.
- [ ] **Fotos no Rever o dia.** Nenhuma foto aparece.
- [ ] **Garagem.** O disco não gira sozinho e não tem inércia; as trocas acontecem na hora, sem
  som.
- [ ] **Pronto para partir.** Na RS — cópia (as listas do texto), feche Antes e Mala: o cartão
  aparece sem confete e sem sino.
- [ ] **Cartão de desbloqueio.** Se alguma conquista sair agora, o cartão vem sem confete, sem sino
  e com o carro de lado já com o acessório. Senão, anote "não saiu".
- [ ] **Importação.** Numa viagem nova, leia o roteiro: nada pulsa nem desliza; as linhas só
  aparecem.
- [ ] **Mapa.** Ao trocar de dia, o mapa vai sem voar.

Desligue o Reduzir Movimento.

**Som**

- [ ] **Desligado.** Em Avisos, desligue **Sons do Modo Viagem** (ou toque no chip "Som", no Safari
  com `?diag=1`): o encaixe da garagem, a buzina, o sino e o ronco somem. Ligue de novo.
- [ ] **Modo silencioso.** Com o iPhone no modo silencioso, marque um Chegamos!: anote se o sino
  tocou.

**Teclado e áreas seguras**

- [ ] **Formulários.** Em "Adicionar reserva" e em "Colar roteiro", o campo em que você digita fica
  acima do teclado.
- [ ] **As bordas.** Em nenhuma tela algo fica embaixo da ilha do topo ou da barra de baixo; a barra
  do modo painel respeita a barra de baixo.

Anotações:

### 1.22 Sair da conta com pendência · 5 min (fase 7)

- [ ] **A pergunta.** Em modo avião, ponha uma foto em "Minha memória" (fica "aguardando sinal").
  Perfil › **Sair**: a folha "Ainda há alterações por enviar" diz quantas alterações ainda não
  chegaram ao servidor e que sair agora apaga os dados deste celular.
- [ ] **Ficar.** Toque **Ficar e tentar depois**. Tire o modo avião: a foto sobe.

Anotações:

### 1.23 Os avisos com hora marcada (fases 4, 7, 9 e 11)

- [ ] **Briefing, manhã do dia 2 do Ensaio.** Celular bloqueado no horário do briefing. Chega "Dia
  2 de 2 · <dia da semana>" e, embaixo, "N paradas · primeira saída às HH:MM" e o clima
  ("Parcialmente nublado, 15° a 31°, chuva 60%", com os números do dia). No iPhone as linhas
  aparecem na tela bloqueada. Se o Open-Meteo não respondeu a tempo, o aviso chega sem a linha do
  clima, na mesma hora.
- [ ] **A hospedagem em curso, manhã do dia 2.** Antes do meio-dia, o "Agora" do Ensaio ainda mostra
  a reserva do Hotel (para o check-out).
- [ ] **Retrospectiva pronta, às 9h do dia seguinte ao fim do Ensaio.** Chega "A retrospectiva da
  viagem está pronta" · "2 dias, N paradas". Toque: o app abre direto no filme.
- [ ] **Prazo de cancelamento, 07/12 às 10h, viagem real.** Chega "Amanhã é o último dia para
  cancelar sem custo" · "Vila Suzana Parque Hotel · até 08/12". O toque abre a própria reserva.
- [ ] **Véspera, 10/12 às 19h, viagem real.** Chega "Amanhã é dia de viajar", com o que falta nas
  listas ("3 itens de antes e 2 da mala faltando", por exemplo); o toque abre a lista que falta. Com
  as listas fechadas, chega "Amanhã começa <viagem>".

Anotações:

### 1.24 A viagem abre no mapa · 40 min (fase 14) · sem prova até a viagem

Decisão do Douglas de 08/11: nenhum teste nos aparelhos antes da viagem. Este bloco fica como
documentação do que só um aparelho prova; a CI e o laboratório provam o resto (D174 a D180).

- [ ] **A viagem é o mapa.** Toque na viagem na lista: a maquete inteira na tela, sem rolagem, com a
  barra do dia no alto e o "Agora" embaixo. Tente rolar: nada rola (só a lista do dia, quando ela
  está no lugar da maquete). O cabeçalho do app não aparece aqui; "Detalhes" leva à visão geral.
- [ ] **O carro grande e a câmera.** Parado numa parada, o carro ocupa mais ou menos um quinto da
  altura da tela, visto de cima e de trás, com a estrada subindo à frente em direção à próxima
  parada. No "Rever o dia", a câmera recua entre paradas distantes e volta. Anote travadas.
- [ ] **As miniaturas.** Cada parada tem a miniatura do tipo (casa, árvores, parreira e barril,
  hotel, restaurante, palco, quarteirão, placa). Toque numa: a folha da parada abre, com Maps e Waze
  e, se for a próxima, Chegamos!. Toque numa pílula: a mesma folha. "+ Gasto" na folha vem com a
  parada e a categoria.
- [ ] **Partiu! sozinho, no carro.** Com a posição permitida e o mapa aberto, saia da parada: a
  mais de 300 m, "Saímos de …" com Desfazer, sem o "+10". Anote a distância aproximada.
- [ ] **Chegamos! sozinho.** Fique 3 min dentro de 150 m da próxima: "Chegamos: …" com Desfazer, e
  o "Como foi?" como cartão, não como folha. Anote quanto demorou depois de parar.
- [ ] **O ponto "GPS".** Na frase da barra, o ponto verde "GPS" enquanto acompanha; "GPS econômico"
  depois de 10 min parado.
- [ ] **"Tela acesa".** Ligue o botão de sol na barra do topo: a tela não apaga sozinha. Desligue:
  apaga. Bloqueie a tela com o botão desligado e ande: nada se marca (o PWA não recebe posição com a
  tela apagada); ao destravar, o catch-up marca o que ficou para trás. Anote a bateria antes e
  depois de 30 min com "Tela acesa" ligado e o mapa aberto (tabela dos números).
- [ ] **"Hoje".** Toque em "Dia seguinte": o chip "Hoje" aparece; toque nele: volta ao dia de hoje.
- [ ] **A folha por cima.** Com a folha da parada aberta, nada da maquete nem das pílulas vaza por
  cima dela.

Anotações:

## Parte 2 · Android

O mesmo percurso, mais curto: aqui está só o que muda no Android, e no fim o resto, item a item,
como "o mesmo do iPhone". Faça 2.1 e 2.2 na noite do dia 1 do Ensaio, para o Android receber o
briefing do dia 2; o resto, no dia 2.

### 2.1 Instalar · 5 min (fases 2 e 4)

- [ ] **Pelo cartão.** No Chrome, abra https://viajei-mauve.vercel.app e entre. O cartão "Leve o
  Viajei na tela de início" tem o botão **Instalar o Viajei**: toque → o pedido do Chrome →
  Instalar. Toast "Viajei instalado".
- [ ] **Pelo menu.** Se o cartão não aparecer, menu ⋮ do Chrome → Instalar app (ou Adicionar à tela
  inicial). Anote qual caminho funcionou.
- [ ] **Abrir pelo ícone.** O app abre em tela cheia, sem a barra do Chrome. Feche e abra de novo
  (a primeira abertura não pede avisos).

Anotações:

### 2.2 Avisos · 5 min (fase 4)

- [ ] **A folha.** Abra o Ensaio: a folha **Avisos da viagem** → **Ativar avisos** → o Chrome
  pergunta → Permitir. Toast "Avisos ativados".
- [ ] **Em Avisos.** "Avisos ligados" e, embaixo, "Android". Anote a hora.
- [ ] **O que a conta já tinha.** A primeira visão geral aberta no Android mostra, na própria
  página e sem confete, "Você já tinha conquistado N conquistas e N XP." Nenhum cartão de
  desbloqueio repete o que o iPhone já comemorou.

Anotações:

### 2.3 Os botões na notificação · 45 min (fase 4)

Edite a Saída do hotel para sair daqui a 20 min. O iPhone recebe os mesmos avisos e serve de
segundo aparelho.

- [ ] **Sair em 15 min, com o app fechado.** Feche o app. Chega "Sair em 15 min". Expanda a
  notificação: o botão **Partiu!**.
- [ ] **O selo.** O ícone instalado mostra o selo (no Android ele pode ser um ponto, conforme o
  aparelho).
- [ ] **A substituição.** No minuto da saída, "Hora de sair" substitui o anterior.
- [ ] **Partiu! sem abrir o app.** Toque **Partiu!**: a notificação é trocada por "Saímos de Saída
  do hotel" · "Marcado às HH:MM". Abra o app: já marcado e sem pendentes, e o selo limpa. No
  iPhone, a marcação chega pelo Realtime.
- [ ] **Chegamos! sem sinal.** Acerte o "Fecha às" do Mercado para daqui a uns 70 min: o aviso
  "Mercado fecha às HH:MM" · "faltam 60 min" chega com o botão **Chegamos!**. Ligue o modo avião e
  só então toque **Chegamos!**: a notificação troca para "Chegamos: Mercado" · "Marcado às HH:MM".
  Anote se o app abriu sozinho. Tire o modo avião e abra o app: sem pendentes, e o iPhone recebe.
- [ ] **Estado velho.** Faça o mesmo com o Posto, mas marque Chegamos! no iPhone antes de tocar o
  botão no Android: ele não marca duas vezes; o app abre no "Agora".
- [ ] **Vibração.** O Chegamos! no app vibra curto junto com o confete.
- [ ] **O replay ao abrir.** Feche o app no Android. No iPhone, marque Partiu! e Chegamos! na
  Lanchonete. Abra o Android: o carro anda até ela, com o chip, como em 1.13.
- [ ] **Quem ficou em casa.** Com o Modo Viagem aberto no Android, marque a Igreja no iPhone: o
  carro avança sozinho em 1 a 3 s.

Anotações:

### 2.4 A foto com o app fechado · 10 min (fase 7)

- [ ] **Background Sync.** Modo avião. Em "Minha memória" de uma parada concluída, ponha uma foto e
  salve: "aguardando sinal". Feche o app. Tire o modo avião **sem abrir o app** e espere um minuto.
  No iPhone, abra o diário do Ensaio: a foto já está lá (o service worker enviou sozinho). Depois
  abra o Android: sem "aguardando sinal". (No iPhone a foto só sobe ao abrir o app; é o esperado.)
- [ ] **HEIC.** Em "Como foi?", **Da galeria**, escolha a foto HEIC. Se o Chrome não abrir, aparece
  "Esta foto está em HEIC, um formato que este navegador não abre. Escolha outra ou tire pela
  câmera.", e não uma tela quebrada. Anote qual dos dois aconteceu.

Anotações:

### 2.5 Vocês passaram por uma parada · 10 min (fase 4)

- [ ] **A pergunta.** Com a posição permitida, volte para casa passando pela Banca sem marcar. Uns
  500 m depois dela, com o carro parado, abra o Modo Viagem: o card "Vocês passaram por Banca.
  Marcar como concluída?", com "Chegaram às" ajustável.
- [ ] **A hora escolhida.** Ajuste a hora e toque **Marcar**: a parada conclui com a hora escolhida
  (nunca inventada), com Desfazer. "Não passamos" dispensa.
- [ ] **O selo da pergunta.** Com a pergunta aberta, ponha o app em segundo plano: o selo mostra
  o número de perguntas.

Anotações:

### 2.6 Calendário · 5 min (fase 4)

- [ ] **A viagem inteira.** Avisos › **Exportar a viagem**: baixa `viajei-<viagem>.ics`; abrir
  importa no Google Agenda, com os alarmes 15 min antes de cada "sair às".

Anotações:

### 2.7 Maquete e garagem: motor e fps · 25 min (fases 5 e 6)

Como no iPhone, num separador do Chrome (o app instalado não tem barra de endereço).

- [ ] **O motor.** Modo Viagem da RS — cópia, Dia 1, com `?diag=1`: o Chrome recente no Android diz
  **WebGPU**; os demais, **WebGL2**. Anote.
- [ ] **fps da maquete.** "Rever o dia" em Alta e em Leve, e com o chip WebGL. Anote. Anote se
  rebaixou sozinho.
- [ ] **fps da garagem.** `/viagens/<id>/garagem?diag=1`: o disco girando em Alta e em Leve. Anote,
  e se a troca de modelo engasga.
- [ ] **Girar, pintar e trocar.** O dedo no disco, a pintura e a prévia de modelo funcionam como no
  iPhone (1.18).
- [ ] **Vibração na garagem.** O encaixe de um acessório vibra curto.

Anotações:

### 2.8 Mapa e briefing · 10 min (fase 11)

- [ ] **A atribuição.** No fim da página do mapa, "Leaflet | © OpenStreetMap" inteiro, e o fim da
  página respeita a barra de navegação do Android.
- [ ] **O briefing.** No briefing da manhã, a primeira linha aparece com o aviso recolhido; a do
  clima, ao expandir o aviso.

Anotações:

### 2.9 TalkBack e a fonte do sistema · 30 min (fase 12)

**TalkBack** (Configurações › Acessibilidade › TalkBack; deslize para passar de item em item, toque
duplo para ativar). O mesmo percurso do VoiceOver (1.21).

- [ ] **Todo botão tem nome.** Os mesmos de 1.21, lidos pelo que fazem.
- [ ] **A ordem.** De cima para baixo, sem pular o "Agora".
- [ ] **Partiu! e Chegamos!.** Achados e ativados, com o toast lido.
- [ ] **A maquete e a Lista do dia.** Não prende; a lista tem as paradas.
- [ ] **As folhas.** O título é lido, e o TalkBack não sai para a tela de trás.
- [ ] **Os botões da notificação.** Numa notificação, o TalkBack lê Partiu! ou Chegamos!.

**A fonte do sistema** (Configurações, "Tamanho da fonte", no máximo; o caminho muda conforme a
marca).

- [ ] **O app.** Anote se o texto do app cresceu. Nada corta, sobrepõe ou sai da tela na lista, na
  visão geral, no "Agora", nos botões e nas folhas.

Anotações:

### 2.10 Dois aparelhos, a mesma parada · 10 min (fase 2)

- [ ] **Sem rede nos dois.** Os dois em modo avião. No iPhone, mude o horário de uma parada do
  Ensaio; no Android, as observações da mesma parada. Tire o modo avião nos dois: a parada fica com
  as duas mudanças, nos dois aparelhos.

Anotações:

### 2.11 O mesmo do iPhone · 45 min

Marque cada um depois de conferir no Android o que o bloco do iPhone pede. Uma leitura da IA basta.

- [ ] 1.2 Colar do WhatsApp, o preview chegando e a revisão (uma leitura)
- [ ] 1.4 Reservas: criar com câmera e PDF, o código copiado, print e PDF em modo avião,
  Compartilhar
- [ ] 1.5 Listas: "+2 XP" e "Pronto para partir" (numa viagem futura em que o cartão ainda não saiu
  neste aparelho), agora com **vibração**
- [ ] 1.6 Contatos: emergência, Ligar no SAMU (o discador abre com 192: **não ligue**), WhatsApp,
  fixo sem WhatsApp
- [ ] 1.6 `.vcf`: o arquivo baixa ou a folha abre com o app de Contatos; importe e confira nome,
  telefone e empresa
- [ ] 1.8 e 1.9 Toque no corpo de uma notificação: abre o "Agora"; a abertura do dia, o clima e a
  posição
- [ ] 1.10 Modo painel: tela acesa, Partiu! e Chegamos! sozinhos, "Parado · GPS econômico", +
  Gasto, Desligar, e a bateria em 30 min (tabela)
- [ ] 1.11 Chegamos! no toque: sino, confete, vibração, "+10 XP" e a folha "Como foi?", com câmera
  e galeria
- [ ] 1.12 A foto sem sinal com o app aberto
- [ ] 1.15 Noite e fora da rota
- [ ] 1.16 O mapa no dedo, os pinos, o tema escuro e o mapa sem rede
- [ ] 1.17 O clima ao sol
- [ ] 1.19 A retrospectiva: o filme, o vídeo (anote o formato que a folha mostra e o tempo para
  gerar), o WhatsApp, os stories e os cards
- [ ] 1.20 Offline completo
- [ ] 1.21 Reduzir movimento (Configurações › Acessibilidade, "Remover animações") e o som
- [ ] 1.22 Sair com pendência
- [ ] 1.23 O briefing e a retrospectiva pronta chegam também no Android

Anotações:

### 2.12 Por último: o aparelho que sai · opcional (fase 4)

- [ ] **Desinstalar.** No fim de tudo, desinstale o app no Android e anote a hora. No próximo aviso
  do Ensaio ou da viagem real, a assinatura dele responde 410 no servidor e para de receber; o
  Claude confere o `failed_at`. Instale de novo depois, se quiser o Android na viagem.

Anotações:

### 2.14 A viagem abre no mapa · 20 min (fase 14) · sem prova até a viagem

- [ ] **O mesmo do 1.24** no Android: a tela sem rolagem, o carro grande, as miniaturas e a folha,
  Partiu! e Chegamos! sozinhos com o mapa aberto, "Tela acesa", "Hoje".
- [ ] **O TalkBack na tela nova.** A barra do dia (o nome, as setas, "Hoje", "Lista"), a região
  "Agora" com a ação principal, as pílulas como botões com o nome e o horário, e a lista do dia no
  lugar da maquete.

Anotações:

### 2.13 No Chrome do computador · opcional (fases 5 e 6)

- [ ] **Sem WebGL.** No Chrome do computador, em `chrome://flags` desligue a aceleração por
  hardware (ou abra o Chrome com `--disable-gpu`). O Modo Viagem mostra a lista com "Maquete
  indisponível neste aparelho.", e a garagem abre direto na vista lateral, sem erro. Religue depois.

Anotações:

## Os números que faltam

Para a D64 (maquete) e a D75 (garagem), e o que mais os roteiros pedem medido. O fps se lê no chip
de diagnóstico (`?diag=1` no endereço, no Safari e no Chrome) **durante o movimento**: no "Rever o
dia" da RS — cópia, Dia 1, e na garagem com o disco girando. Os alvos são os da matriz.

| Aparelho | iPhone | Android |
|---|---|---|
| Modelo e sistema | ____ | ____ |
| Versão do navegador | Safari do iOS ____ | Chrome ____ |

| Medida | Alvo | iPhone | Android |
|---|---|---|---|
| Motor da maquete (o chip) | WebGPU no iOS 26 e no Chrome recente | ____ | ____ |
| fps da maquete em Alta, no "Rever o dia" | ≥ 45 | ____ | ____ |
| fps da maquete em Leve | ≥ 30 | ____ | ____ |
| fps da maquete com WebGL2 forçado, em Alta | (comparação) | ____ | ____ |
| O automático rebaixou sozinho (`Auto · Leve`)? | não | ____ | ____ |
| Primeiro quadro da maquete (cronômetro, do toque à maquete) | (a D64 mediu 1,2 s no Mac) | ____ | ____ |
| Travadas na maquete (onde) | nenhuma | ____ | ____ |
| Motor da garagem | WebGPU | ____ | ____ |
| fps da garagem em Alta, disco girando | ≥ 45 (a D72 conta com 60) | ____ | ____ |
| fps da garagem em Leve | ≥ 30 | ____ | ____ |
| A troca de modelo engasga? (1ª vez / seguintes) | não | ____ | ____ |
| Primeiro quadro da garagem (cronômetro) | (a D75 mediu 0,7 s no Mac) | ____ | ____ |
| O filme da retrospectiva engasga? (sem chip de fps) | não | ____ | ____ |
| Tempo para gerar o vídeo de 15 s | — | ____ | ____ |
| Formato que a folha mostra | MP4 · H.264 | ____ | ____ |
| Bateria em 30 min com o mapa aberto e "Tela acesa" (de % a %) | — | ____ | ____ |
| Primeiro quadro da tela da viagem com a câmera nova (cronômetro) | (a D180 tem o número do laboratório) | ____ | ____ |
| Foto: de "Usar foto" até a miniatura | — | ____ | ____ |
| Importação do WhatsApp: tempo em "Lendo o roteiro…" | — | ____ | ____ |
| Importação do WhatsApp: até a primeira parada / até a revisão | — | ____ | ____ |
| Texto longo: até a primeira parada / até o fim | (a D140 mediu 17 s / 91 s) | ____ | ____ |
| Partiu! automático pelo GPS com o mapa aberto: a que distância marcou | ~300 m | ____ | ____ |
| Chegamos! automático: quanto depois de parar | ~3 min | ____ | ____ |

## Se algo falhar

- Anote logo abaixo do item, numa linha recuada que comece com `Falhou:`:
  - o que você fez (o passo, a viagem, o aparelho, com ou sem rede);
  - o que esperava (o texto do roteiro);
  - o que aconteceu (o texto que a tela mostrou, exato se der);
  - a hora, se for aviso ou sincronização (o Claude acha no servidor pela hora);
  - um print (botões lateral e de volume no iPhone; liga e volume para baixo na maioria dos
    Android). Guarde e diga o nome do arquivo.
- Uma falha não para o roteiro: siga para o próximo item. Se um item depende de outro que falhou,
  marque `Pulei: depende de <item>`.
- Nada aqui apaga dado real: o que este roteiro marca fica no Ensaio e nas cópias. Na viagem real,
  só olhe.
- No fim, exclua o Ensaio, a RS — cópia e as outras viagens de teste pela visão geral de cada uma
  (**Excluir viagem**), assim que terminar, de preferência antes de 07/12. A cópia tem as datas e
  as reservas da viagem real: com ela no aparelho, os avisos dela podem chegar junto com os da
  real, e no dia 11/12 o app, que cai na viagem em andamento, pode abrir na cópia. Nunca exclua a
  viagem real.

## O que não entrou, e por quê

- **O que conferir no servidor (fase 4):** as linhas de `notifications_sent`, o
  `cron.job_run_details` e os logs da `send-notifications` o laboratório confere todo dia (D50,
  D51). Ficou aqui só o que depende do aparelho: a assinatura do iPhone (1.7), a trilha (1.10) e o
  410 do Android (2.12), que o Claude confere pela hora anotada.
- **O console do desktop (fases 5 e 6)** e o `?garagem=tudo`: só existem em `pnpm dev`, e nada roda
  no Mac (D91).
- **"Carregar viagem de exemplo" (fase 5):** só aparece em dev. A RS — cópia, lida pela IA em 1.2,
  traz o mesmo seed.
- **"Até a fase 9, todo time está no nível 1" (fase 6):** desde a fase 9 o que fica em prévia
  depende do nível do time.
- **"Da fase 5 (ainda não testada)" (fase 6):** era um resumo da fase 5, que está inteira em 1.9 a
  1.15.
- **A retenção do IndexedDB e o `storage.persist()` (matriz):** não têm o que ver na tela; o app
  instalado pede o armazenamento persistente sozinho.
- **O Lighthouse (matriz):** passou para o laboratório nesta fase.
