# Teste manual · Fase 4 (uso com a tela apagada)

> **Para o teste nos aparelhos, use o [roteiro final](teste-final.md).** Este roteiro da fase 4 fica como registro; tudo dele está lá.

Roteiro curto para os dois aparelhos, com o que observar em cada passo. Pré-requisitos: produção
publicada com a 0005, `send-notifications` publicada, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` nos
secrets, `VITE_VAPID_PUBLIC_KEY` na Vercel, os dois segredos no Vault do hospedado, e uma viagem
cujo **dia é hoje** (edite as datas da viagem de exemplo, ou crie uma com uma origem às "agora + 20
min", deslocamento 30 e uma parada depois).

## iPhone (instalado na Tela de Início)

1. **Instalação e folha.** Abra a URL no Safari, entre, abra a viagem. Espera-se o card de instalar
   com a frase dos avisos ("No iPhone, os avisos só chegam com o Viajei na Tela de Início"). Instale
   (Compartilhar → Adicionar à Tela de Início), abra pelo ícone, feche e abra de novo (a primeira
   abertura do app nunca pede). Abra a viagem: a folha **Avisos da viagem** aparece uma vez.
2. **Permissão no toque.** "Ativar avisos" → o iOS pergunta → Permitir. Toast "Avisos ativados".
   Em `/avisos`: "Avisos ligados · iPhone". No painel do Supabase, `push_subscriptions` tem uma linha
   com `platform = ios` e `origin = https://viajei-mauve.vercel.app`.
3. **Push com o app fechado.** Feche o app (deslize para cima) e bloqueie o celular. 15 min antes do
   "sair às" chega "Sair em 15 min para …" com o tempo de estrada; no minuto exato, "Hora de sair
   para …" **substitui** o anterior (mesma parada). Observe o **selo "1"** no ícone.
4. **Toque abre o Agora.** Toque na notificação: o app abre direto no Modo Viagem com o botão
   Partiu! em destaque (no iPhone não há botões na notificação). O selo some ao abrir.
5. **Catch-up e posição.** No Modo Viagem, a linha "Posso usar a posição do celular…" → "Usar
   posição" → o iOS pergunta → Permitir uma vez. A linha de posição aparece ("N% do caminho do dia,
   pela posição do celular") quando há rota. Longe da rota: chip "Fora da rota · N km".
6. **Wake Lock e GPS (modo painel).** Toque em "Modo painel": a barra "Painel ligado · Tela acesa ·
   GPS · gravando trilha" aparece e a tela não apaga. Ande com o celular ≥ 300 m da parada atual:
   Partiu! automático com toast "Desfazer". Em `trip_tracks` nasce a linha do dia (pontos a cada
   50 m ou 30 s). "Desligar" para tudo; a tela volta a apagar sozinha.
7. **Desde a última vez.** Em outro aparelho (ou no Chrome), marque Chegamos!. Volte ao iPhone, abra o
   Modo Viagem: o card escuro "Desde a última vez" lista "<nome> chegou: <parada> · HH:MM". "Ok" fecha
   e não volta.
8. **Calendário.** Em `/avisos` → "Exportar o dia de hoje": a folha de compartilhar abre e o
   Calendário importa os eventos, com alarme 15 min antes de cada "sair às".
9. **Briefing e fechamento.** Às 07:00 (ou no horário configurado) chega "Dia N de M · <dia da
   semana>"; 60 min antes de um `closes_at` chega "<parada> fecha às HH:MM".

## Android (Chrome) ou Chrome no desktop

1. **Instalação (Android).** "Instalar o Viajei" → aceitar. No desktop não precisa instalar.
2. **Folha e permissão.** Abrir a viagem (a partir da segunda abertura do app): folha "Avisos da
   viagem" → "Ativar avisos" → o Chrome pergunta → Permitir. `/avisos` mostra "Avisos ligados ·
   Android" (ou "Este navegador").
3. **Ações na notificação, com o app fechado.** Feche o app. Quando chegar "Sair em 15 min para …",
   expanda a notificação: botão **Partiu!**. Toque nele **sem abrir o app**: a notificação é trocada
   por "Saímos de … · Marcado às HH:MM". Abra o app depois: o estado já está marcado (Dexie) e a fila
   foi enviada (sem pendentes). Em outro aparelho a marcação chega pelo Realtime.
4. **Estado velho.** Se alguém já marcou antes, o botão não marca duas vezes: o app abre no Agora.
5. **Fecha em 1 h com Chegamos!.** Em "<parada> fecha às HH:MM" da próxima parada, o botão
   **Chegamos!** aparece e marca sem abrir o app.
6. **Selo.** Depois de um "Sair em 15 min", o ícone instalado mostra o selo; abrir o app limpa.
7. **Passou por uma parada.** Com posição permitida e uma parada para trás sem marcar: o card
   "Vocês passaram por X. Marcar como concluída?" com a hora ajustável; "Marcar" grava a hora
   escolhida (nunca inventada), com "Desfazer".
8. **Calendário.** `/avisos` → "Exportar a viagem": baixa `viajei-<viagem>.ics`; abrir importa no
   Google Calendar com os alarmes.

## O que conferir no servidor

- `notifications_sent`: uma linha por aviso, `status = sent`, `attempts = 1`; nunca duas linhas para
  a mesma pessoa, tipo, parada e minuto.
- `cron.job_run_details`: o job `viajei-send-notifications` roda a cada minuto, mas `net._http_response`
  só tem chamadas nos minutos em que havia algo vencido.
- Logs da Edge Function (painel → Functions → send-notifications): uma linha `send-notifications
  { claimed, sent, failed, no_subscription, skipped, ms }` por chamada.
- Desinstalar o app no Android e esperar um aviso: a assinatura responde 410 e ganha `failed_at`;
  o aviso fica `failed` (ou `no_subscription` quando era a única).
