# Teste manual · Fase 11 (mapa e clima)

> **Para o teste nos aparelhos, use o [roteiro final](teste-final.md).** Este roteiro da fase 11 fica como registro; tudo dele está lá.

Roteiro para o iPhone (primeiro) e para um Android. Aqui fica só o que um navegador de laboratório
não julga: o dedo no mapa (pinça e arrastar), a atribuição com a barra de baixo e a área segura de
verdade, o mapa no tema escuro, o mapa sem rede depois de visto num aparelho de verdade, o clima
legível ao sol e o briefing da manhã na tela bloqueada. O resto da fase (os tiles no cache, a rota, os
pinos, a faixa da visão geral, o "atualizado às" sem rede e o texto do briefing pelos fatos que a
função gravou) é conferido pela CI e pelo laboratório, todo dia.

**Fica para a versão final (D91).** O teste nos aparelhos acontece uma vez, depois da fase 12, junto
com os roteiros das fases 4 a 10.

**Antes de começar:**
- A versão final no ar, na produção, e o app **instalado na Tela de Início** no iPhone.
- A viagem real do RS (11 a 14/12/2026). **A previsão dela aparece a partir de 26/11**, quando o
  Dia 1 entra nos 15 dias do Open-Meteo. Antes disso, a faixa da visão geral diz "previsão a partir
  de 26/11", e o teste do clima usa a viagem "Teste" (com datas desta semana).
- Para o briefing: os avisos ligados na viagem e o horário da manhã que você quiser em Avisos.
- Nenhum segredo, nenhuma variável nova: o OSM e o Open-Meteo não pedem chave.

## Onde anotar

Mande no chat ou anote no fim deste arquivo:
- aparelho, sistema e se estava no tema claro ou escuro;
- o passo que falhou, o que apareceu e um print;
- se o mapa engasgou (ao abrir, ao trocar de dia, na pinça).

## 1. O mapa no dedo

1. Na visão geral da viagem do RS, toque **Mapa**. Antes da viagem, ele abre no Dia 1.
2. Pince para aproximar e afastar, e arraste. O mapa acompanha o dedo, sem a página rolar junto.
3. Toque **Dia 2 · sáb**: o mapa voa até o dia. Toque **Viagem**: os quatro dias, com pinos menores.
4. Toque num pino: a folha mostra o nome, o horário, o endereço, Google Maps e Waze. Toque Google
   Maps: abre o app do Maps no lugar. Volte e toque Waze.
5. Na página de um dia, toque **Ver no mapa**: o mapa abre naquele dia.
6. Nada no mapa pede a sua posição, e não há "você está aqui".

## 2. A atribuição e a área segura

1. Com o mapa aberto, role a página até o fim. "Leaflet | © OpenStreetMap" fica no canto de baixo do
   mapa, inteiro, sem nada por cima, e o fim da página respeita a barra de baixo do iPhone.
2. Toque **OpenStreetMap**: abre a página de copyright do OSM.
3. No Android, o mesmo, com a barra de navegação dele.

## 3. O mapa no escuro

1. Ponha o aparelho no tema escuro e abra o mapa.
2. O mapa fica escuro, as ruas legíveis; a estrada laranja e os pinos se destacam; a atribuição se lê.
3. Volte ao tema claro: o mapa volta ao tom do papel do app.

## 4. O mapa sem rede, depois de visto

1. Com rede, abra o mapa do Dia 1 e espere os tiles carregarem. Aproxime uma vez.
2. Ponha o aparelho em modo avião. Feche o app (tire da lista de apps abertos) e abra de novo.
3. Abra o mapa: aparece "Sem internet: o mapa mostra só as áreas já vistas neste aparelho", os tiles
   que você viu, a linha da estrada e os pinos. Onde você não olhou, só o fundo na cor do app.
4. Tire o modo avião.

## 5. O clima ao sol

1. Num dia com previsão, abra a visão geral ao ar livre, com o brilho que você usa no carro.
2. A faixa "Previsão do tempo" se lê: ícone, máxima, mínima e a chuva (quando passa de 20%).
3. Abra o dia: "Papanduva 26° / 15° → Nova Petrópolis 31° / 19° · chuva 60%" (com os números do
   dia) e, em cada parada com horário, a previsão pequena daquela hora.
4. No Modo Viagem do dia de hoje: a linha da previsão da próxima parada no "Agora", discreta; na
   primeira abertura do dia, o chip do clima entra com o carro e sobe para a faixa de cima da maquete.

## 6. O briefing na tela bloqueada

1. Num dia de viagem com previsão, deixe o celular bloqueado no horário da manhã.
2. O aviso chega: "Dia 1 de 4 · sexta" e, embaixo, "4 paradas · primeira saída às 07:00" e o clima,
   "Parcialmente nublado, 15° a 31°, chuva 60%" (com os números do dia). No iPhone, as duas linhas
   aparecem na tela bloqueada; no Android, a do clima aparece ao abrir o aviso.
3. Se o Open-Meteo não respondeu a tempo, o aviso chega sem a linha do clima, na mesma hora.

## Anotações
