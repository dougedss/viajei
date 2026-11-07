# Teste manual · Fase 10 (importação com IA)

Roteiro para o iPhone (primeiro) e para um Android. Aqui fica só o que um navegador de laboratório
não julga: colar de verdade do WhatsApp e das Notas, o teclado com um texto longo, a fluidez do
preview enquanto o roteiro chega e as escolhas de lugar no dedo. O resto da fase (o limite diário, o
registro sem o texto, o schema da IA, o preview a partir do stream, a revisão, o salvar pela outbox
e a leitura real de um roteiro curto, todo dia) é conferido pela CI e pelo laboratório.

**Fica para a versão final (D91).** O teste nos aparelhos acontece uma vez, depois da fase 12, junto
com os roteiros das fases 4 a 9.

**Antes de começar:**
- A versão final no ar, na produção, e o app **instalado na Tela de Início** no iPhone.
- No WhatsApp, uma conversa (ou uma mensagem sua para você mesmo) com o roteiro da viagem do RS:
  o texto de `supabase/seed/viagem-rs.txt` serve. Nas Notas, o mesmo texto numa nota.
- Uma viagem nova, vazia, de 11 a 14/12/2026, e a viagem "Teste" com algumas paradas.
- Cada leitura conta uma das 20 do dia. Este roteiro usa umas seis.
- Nenhum segredo, nenhuma variável nova.

## Onde anotar

Mande no chat ou anote no fim deste arquivo:
- aparelho e sistema;
- o passo que falhou, o que apareceu e um print;
- quanto tempo levou até a primeira parada aparecer e até a revisão abrir.

## 1. Colar do WhatsApp

1. No WhatsApp, segure a mensagem do roteiro e toque **Copiar**. (Várias mensagens: selecione todas
   e copie; o WhatsApp junta com data e nome, e isso também serve.)
2. No app, crie a viagem de 11 a 14/12 pelo botão **Criar e colar roteiro**.
3. Na tela **Colar roteiro**, toque no campo e cole. Confira:
   - o texto entra inteiro, com as quebras de linha e os emojis;
   - o contador mostra o tamanho ("2.617 / 30.000", mais ou menos);
   - aparece "Rascunho guardado neste celular" e a linha "O texto vai para a IA da Anthropic".
4. Feche o app (deslize para cima) e abra de novo na mesma tela: o texto continua lá.

## 2. O preview enquanto o roteiro chega

1. Toque **Ler o roteiro**.
2. Primeiro aparece **Lendo o roteiro…**, com um pulso suave. Anote quanto tempo fica assim.
3. Depois, **Chegando · N dias · N paradas**: os dias e as paradas entram um a um, com um fade
   curto. Confira:
   - a tela não pula nem treme enquanto chega; dá para rolar durante a chegada;
   - o horário e o "fecha às" só aparecem inteiros (nunca "13:");
   - a última parada cresce enquanto o nome chega.
4. Com **reduzir movimento** ligado (Ajustes › Acessibilidade › Movimento), repita com outra viagem:
   nada pulsa nem desliza; as linhas só aparecem.
5. Numa terceira leitura, toque **Cancelar** no meio: a tela volta ao texto, que continua no campo.

## 3. A revisão

1. Ao terminar, abre **Revisar o roteiro**: "4 dias · 18 paradas · 2 reservas · 6 contatos · 4
   missões". Confira dia a dia contra o texto: nomes, horários, "fecha às", tipos.
2. Nenhum campo que o texto não tem aparece preenchido. Uma parada sem horário diz "sem horário no
   texto"; uma reserva sem código diz "sem código no texto".
3. Toque no lápis de uma parada: abre o formulário de parada. Mude o horário e toque **Guardar na
   revisão**: a revisão volta no mesmo ponto, com o horário novo.
4. Desmarque uma parada e uma missão: o resumo do topo diminui.
5. Feche o app no meio da revisão e abra de novo: a revisão continua igual, sem ler de novo.

## 4. Os lugares, no dedo

1. Enquanto a revisão está aberta, as paradas ganham o lugar uma a uma ("Localizando os lugares… 3
   de 18"). As que têm link do Maps no texto ganham na hora.
2. Numa parada com **Escolher o local (N)**, toque: a folha mostra as opções, com a atribuição do
   OpenStreetMap. Escolha uma: a parada mostra o endereço.
3. Em outra, toque **Nenhum destes**: a parada fica "Sem local · dá para marcar depois".
4. Com o iPhone em modo avião durante a busca: "Sem internet para localizar"; ao voltar a rede, a
   busca continua sozinha.

## 5. Salvar e acrescentar

1. Toque **Salvar na viagem**. A visão geral abre com "18 paradas em 4 dias" e o aviso "Roteiro na
   viagem". Abra o Roteiro e um dia: as paradas na ordem do texto, com os lugares escolhidos.
2. Na viagem "Teste" (que já tem paradas), no Roteiro, toque **Acrescentar de um texto** e cole um
   texto curto com uma parada nova e uma que já existe. Na revisão, a que já existe aparece "Já está
   no roteiro", desmarcada. Salve: a nova entra pela hora, e nada do que existia muda.
3. Cole um texto com um dia fora das datas da viagem: o dia aparece marcado, com **Ampliar até…** e
   **Deixar de fora**. Amplie e salve: as datas da viagem mudam e o dia novo tem as paradas.
4. Abra o **Perfil**: a conquista **Planejador** (adesivo de mapa) está liberada, e o cartão apareceu
   num momento calmo.

## 6. As Notas e o texto longo

1. Nas Notas, copie a nota do roteiro e cole numa viagem nova: o resultado é o mesmo do WhatsApp.
2. Cole um texto bem longo (perto de 30.000 caracteres: várias conversas juntas). Confira:
   - o teclado e o campo não travam ao colar nem ao rolar;
   - passando de 30.000, o contador fica vermelho e o botão explica o limite;
   - abaixo do limite, a leitura termina, ou para em uns dois minutos e meio com "O texto não foi
     lido até o fim", mostrando o que chegou para revisar.

## 7. Sem rede e erros

1. Em modo avião, abra a tela de colar: o botão diz **Precisa de internet para ler o roteiro** e o
   texto continua guardado.
2. Num texto que não é roteiro nenhum (uma receita, por exemplo), a leitura termina com pouca coisa
   ou com "A resposta não deu para usar"; nada é salvo sem você tocar em Salvar.
