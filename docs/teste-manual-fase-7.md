# Teste manual · Fase 7 (reservas, anexos e memórias)

> **Para o teste nos aparelhos, use o [roteiro final](teste-final.md).** Este roteiro da fase 7 fica como registro; tudo dele está lá.

Roteiro para o iPhone (primeiro) e para um Android. Câmera, galeria, HEIC e PDF offline só se
julgam no aparelho. Os testes das fases 4, 5 e 6 também esperam: os roteiros estão em
`docs/teste-manual-fase-4.md` e `docs/teste-manual-fase-6.md` (este último traz também os da fase 5).

**Fica para a versão final (D91).** O teste nos aparelhos acontece uma vez, depois da fase 12. Até
lá, a fase 7 é verificada na web: pela CI do GitHub e pelo laboratório que roda todo dia na produção.

**Antes de começar:**
- A versão final no ar, na produção.
- O app **instalado na Tela de Início** no iPhone. O PDF e o modo avião são testados assim, porque é
  assim que se usa no balcão.
- Uma viagem sua com uma parada de hoje, para o Chegamos!. A viagem "Teste" (06 a 09/11) serve.
- Um PDF de reserva qualquer no aparelho (Arquivos ou e-mail) e um print de confirmação na galeria.
- Nenhum segredo, nenhuma variável nova.

## Onde anotar

Mande no chat ou anote no fim deste arquivo:
- aparelho e sistema;
- o passo que falhou, o que apareceu e um print;
- quanto tempo a foto levou para ficar pronta na folha (do toque em "Usar foto" até a miniatura).

## 1. Reserva com print e PDF, aberta em modo avião

1. Na visão geral da viagem, toque em **Reservas** e depois em **Adicionar reserva**.
2. Tipo Hotel, nome, ligada a uma parada (o início se preenche pelo horário dela), código de
   confirmação, telefone digitado como `(54) 3282-0000` e a data limite de cancelamento.
3. Em Anexos: **Tirar foto** (fotografe um papel com texto) e **Escolher arquivo** (o PDF). Salve.
4. A folha "Ver reserva" abre: **código grande**, check-in e saída, Ligar, WhatsApp, Maps, Waze e os
   dois anexos. Espere sumir o selo "aguardando sinal" das miniaturas.
5. Toque no código: deve aparecer "Código copiado". Cole em outro app para conferir.
6. **Modo avião.** Feche o app de vez (deslize para cima) e abra de novo, ainda em modo avião.
   Reservas › a reserva › toque no print: abre em tela cheia, pinça aproxima, toque duplo
   aproxima e volta.
7. Ainda em modo avião, toque no PDF: abre dentro do app, com as páginas e os botões − e +.
   **Este é o ponto de maior risco da fase:** anote se abriu, se todas as páginas aparecem e se o
   texto fica nítido no zoom.
8. No PDF, toque em **Compartilhar**: a folha do sistema abre com "Salvar em Arquivos" e outros apps.
9. Ligar e WhatsApp abrem o telefone e o WhatsApp com o número certo (o número precisa de sinal,
   mas o botão funciona em modo avião).

## 2. "Como foi?" depois do Chegamos!

1. Saia do modo avião. Abra o Modo Viagem do dia de hoje e marque **Partiu!** e depois
   **Chegamos!** na próxima parada que não seja uma saída.
2. Depois do confete (cerca de 1 segundo), a folha **"Como foi …?"** abre sozinha.
3. Dê uma nota, toque em **Tirar foto** (câmera) e depois em **Da galeria** (escolha uma foto do
   rolo). No iPhone, uma foto tirada em HEIC tem de entrar normalmente.
4. Escreva uma memória e toque em **Salvar**: aparece "Guardado no diário".
5. Na lista do dia, a parada mostra a sua nota na sua cor e o botão **Minha memória**.
6. **Ligue o modo painel** e marque Chegamos! na próxima parada: a folha **não** abre; aparece o
   card "Como foi …?" embaixo do "Agora". "Contar como foi" abre a folha; o ✕ dispensa.
7. Android: escolha da galeria uma foto HEIC (de um Samsung, por exemplo). Se o Chrome não abrir,
   tem de aparecer a frase "Esta foto está em HEIC…", e não uma tela quebrada.

## 3. Foto sem sinal, enviada quando o sinal volta

1. Modo avião. Abra "Minha memória" numa parada concluída e adicione uma foto. Salve.
2. A miniatura aparece na hora, com o selo **"aguardando sinal"**, e o cabeçalho mostra
   "N pendentes".
3. Saia do modo avião, com o app aberto. Em alguns segundos o selo some e o cabeçalho volta a
   "Tudo sincronizado".
4. **Android:** repita com o app **fechado** depois de salvar: saia do modo avião sem abrir o app,
   espere um minuto e abra. A foto já deve ter subido (o service worker envia sozinho). No iPhone
   ela sobe na abertura; é o esperado.
5. Num segundo aparelho (ou no navegador do computador, com a mesma conta ou outra pessoa do
   time), abra o diário: a foto aparece primeiro como borrão colorido e depois nítida.

## 4. O código da reserva no "Agora", no hotel

1. Use uma viagem com uma parada de hotel hoje e uma reserva ligada a ela (passo 1).
2. Quando o hotel for a **próxima** parada, o "Agora" mostra embaixo: "Hotel … · código …
   **Ver reserva**". Toque: a folha abre com o código grande.
3. Repita em modo avião: tudo continua aparecendo.
4. No dia seguinte, antes da hora da saída do hotel, o "Agora" ainda mostra a reserva (é a
   hospedagem em curso, para o check-out).

## 5. O diário

1. Na visão geral, toque em **Diário**.
2. Por dia, as paradas concluídas com a hora real, quem marcou, e as memórias de cada pessoa na cor
   dela: estrelas, texto e fotos. As saídas aparecem como linhas discretas.
3. Toque numa foto: tela cheia; deslize para os lados para passar pelas fotos do dia.
4. Repita em modo avião: o diário inteiro abre com o que está no aparelho.

## 6. As fotos no "Rever o dia"

1. No Modo Viagem de um dia com fotos, toque em **Rever o dia** (na maquete).
2. Quando o carro passa por um nó com foto, uma miniatura com o anel na cor de quem tirou aparece
   sobre a pílula por pouco mais de um segundo; com mais de uma foto, "+N".
3. Com **Reduzir movimento** ligado (Ajustes › Acessibilidade › Movimento), nenhuma foto aparece.

## 7. O aviso de prazo de cancelamento

Só depois da publicação, com a reserva do Vila Suzana na viagem real (cancelamento até 08/12): no
dia **07/12 às 10h**, com o tipo "Prazo de cancelamento" ligado em Avisos, chega "Amanhã é o último
dia para cancelar sem custo" · "Vila Suzana Parque Hotel · até 08/12". O toque abre a própria
reserva.

## 8. Espaço no aparelho

Em Perfil › Sair da conta com uma foto ainda "aguardando sinal" (modo avião): a pergunta avisa que
há alterações não enviadas. Cancele.
