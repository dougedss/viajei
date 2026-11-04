# Atualização do prompt: uso com a tela apagada, notificações e replay ao abrir (04/11/2026)

**Para:** o chat de implementação, que está no Passo 0 com o prompt v2.
**Objetivo:** incorporar as decisões abaixo antes da aprovação formal do Passo 0. O prompt v3 (`docs/prompt-implementacao.md`) já as contém; este documento é o delta, para você não reler tudo.

## O problema que motivou

O desenho v2 assumia o celular aberto no Modo Viagem, com tela ligada e GPS em primeiro plano. Na vida real o motorista está no Waze, o passageiro está no WhatsApp e os dois celulares passam a viagem bloqueados. Douglas levantou isso em 04/11 e aprovou o modelo abaixo por inteiro.

## Decisões aprovadas

### 1. A viagem roda no servidor; o app é aberto em momentos
- **Nada depende do app estar aberto.** O servidor calcula o "sair às" de cada viagem do dia e avisa por notificação push.
- **O app tem que ser útil em cinco segundos de tela ligada.** Durante a viagem, abrir o app cai direto na tela **"Agora"** da viagem do dia: próxima saída grande, contagem, Partiu! e Chegamos!, e a maquete logo abaixo.
- **Tela ligada é opcional**: o **modo painel** liga Wake Lock, GPS contínuo e gravação da trilha, para quem deixa o celular no suporte. Fora dele, nada disso roda.

### 2. Notificações push agendadas pelo servidor
- Web Push com VAPID. No iPhone só funciona com o app instalado na tela de início (já exigido). No Android a notificação tem botões de ação; no iPhone o toque abre o app.
- Tipos, cada um com toggle e antecedência por pessoa e viagem: **sair em N min** (padrão 15) · **hora de sair** · **fecha em 1 h** (parada com `closes_at` não concluída) · **briefing da manhã** (paradas, primeira saída, clima; hora configurável, padrão 7h) · **véspera** (itens de "antes" e "mala" faltando) · **prazo de cancelamento** de reserva (véspera do `cancel_until`) · **time** (outro membro marcou Chegamos!; padrão desligado) · **retrospectiva pronta**.
- **No Android, Partiu! e Chegamos! direto do botão da notificação**, sem abrir o app: o service worker grava na mesma fila offline (`mutate` compartilhado com o SW) e tenta enviar na hora. No iPhone o toque abre o "Agora" com o botão em destaque.
- Permissão pedida **no momento certo**: na primeira abertura de uma viagem que começa em até 7 dias, com uma folha explicando o que o app vai avisar. Nunca na primeira abertura do app. No iPhone, a folha de instalação vem antes.
- **Selo no ícone** (`setAppBadge`): número de pendências, ou um ponto quando a próxima saída está a menos de 30 min. Limpa ao abrir.
- Limitação assumida: Partiu! marcado sem sinal não chega ao servidor a tempo, e pode vir um "hora de sair" redundante. Aceitável com dedupe e janelas curtas. O modo Foco "Dirigindo" do iPhone silencia notificações; o celular que importa é o do passageiro.

### 3. Catch-up ao abrir
Em vez de GPS contínuo, **uma leitura de posição** ao abrir o app (ou ao voltar do plano de fundo): se está no raio da próxima parada, marca Chegamos! com toast "desfazer" por 10 s; se está entre duas, posiciona o carrinho ali; se passou por paradas sem marcar, pergunta "Vocês passaram por Gramado. Marcar como concluída?" (hora atual, ajustável). Sem posição (permissão negada, sem sinal de GPS), usa a última parada concluída pelo time e a trilha de quem estiver no modo painel. **Sem hora real, sem XP de pontualidade; nunca inventar horário.**

### 4. Replay ao abrir: o carrinho repõe o que aconteceu
- Cada aparelho guarda onde estava a última vez que viu a maquete (`travel_state`: fração percorrida da rota do dia, hora, paradas concluídas e eventos vistos). Ao abrir, o app sincroniza, faz o catch-up e compara.
- Se houve avanço ou eventos novos, o carrinho **anda do ponto antigo até o atual** na própria maquete, câmera parada, 3 a 8 s conforme a distância, e **cada evento dispara quando o carro passa por ele**: anel da parada preenche e o check salta, chip "Ana · 14:02" para marcação de outro membro, curiosidades do caminho encurtadas para 1,5 s, no máximo 3 por replay (prioridade: serra, mar, ponto mais alto, entrada de cenário). "Pular" sempre visível. `prefers-reduced-motion` troca por um card com a lista do que aconteceu.
- Se o avanço é pequeno e não há eventos, o carro só aparece no lugar certo, sem replay.
- O mesmo mecanismo serve **quem ficou em casa**: o carrinho avança conforme chegam as marcações e as trilhas dos viajantes.
- Dois irmãos do replay: **abertura do dia**, uma vez por dia na primeira abertura, a maquete se constrói na frente da pessoa (relevo sobe, estrada se desenha, pinos caem, carro estaciona na origem, chip do clima), 2 a 3 s; e **"Rever o dia"**, sob demanda, do começo do dia até agora, até 20 s, com as fotos das memórias aparecendo nos nós.

### 5. Exportar para o calendário
Arquivo `.ics` do dia ou da viagem inteira, com um evento por parada, endereço e link do Maps na descrição, e alarme 15 min antes de cada "sair às". Funciona sem permissão de push e sem servidor. É a rede de segurança.

### 6. O que muda no prompt e na DDL
- **Regra nova (15):** nada depende do app estar aberto; útil em cinco segundos; tela ligada opcional.
- **Pilar novo** na seção 1.
- **Seção 4.12 "Uso com a tela apagada"** e reescrita de 4.3 (Modo Viagem = "Agora" + maquete).
- **Seção 6.3 e 6.4** reescritas: avanço por botões, notificações, catch-up e modo painel; replay ao abrir.
- **Tabelas novas (migration `0005_notificacoes`, fase 4):**
  - `push_subscriptions` (id, user_id, endpoint unique, p256dh, auth, platform ios|android|desktop, user_agent, created_at, last_seen_at, failed_at). RLS: só as próprias.
  - `notification_prefs` (id = v5(user_id, trip_id), user_id, trip_id, enabled, lead_minutes, kinds jsonb, morning_time, colunas de sync). RLS: só as próprias; sincronizada com escopo `user`.
  - `notifications_sent` (id = v5(user_id, kind:ref:scheduled_at), user_id, kind, ref, scheduled_at, sent_at, status). Sem policy para o client; só o servidor escreve. É o dedupe.
  - Função SQL `private.due_notifications(now)` que calcula o que vence neste minuto (viagens com dia hoje no fuso `America/Sao_Paulo`, "sair às" = horário da próxima menos o deslocamento, parada ainda sem `departed_at`, preferências da pessoa), e `pg_cron` a cada minuto chamando a Edge Function `send-notifications` via `pg_net` com um segredo compartilhado (`CRON_SECRET`).
  - **As migrations seguintes renumeram:** 0006 reservas, anexos e memórias · 0007 listas, contatos e gastos · 0008 progressão · 0009 importação.
- **Edge Function nova `send-notifications`:** servidor para servidor, autenticada pelo `CRON_SECRET`, única função que usa a chave secreta do Supabase (nunca no client). Insere em `notifications_sent` antes de enviar (conflito = já enviado), envia com uma biblioteca Web Push compatível com Deno, remove assinaturas com 404 ou 410, usa `tag` para substituir avisos da mesma parada.
- **Service worker próprio** (`src/sw.ts`, estratégia `injectManifest` do vite-plugin-pwa): `push`, `notificationclick` (ações `departed`/`arrived` gravam via `mutate` no Dexie e tentam enviar), `pushsubscriptionchange`. A sessão do supabase-js passa a usar um adaptador de storage em IndexedDB para o SW conseguir autenticar o envio.
- **Dexie:** store `travel_state: 'trip_day_id'`.
- **Variáveis:** `VITE_VAPID_PUBLIC_KEY` no client; `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` em `supabase secrets`.
- **Rota nova:** `/viagens/:tripId/avisos` (preferências de notificação da viagem).
- **Fases passam a 12:** a nova **fase 4, "Uso com a tela apagada"**, entra entre o roteiro e a maquete 3D, porque define o uso diário mais do que o 3D. O replay fica na fase 5 (Mundo 3D), consumindo a lista de eventos que o catch-up da fase 4 produz.
- **Testes:** `due_notifications` com pgTAP (casos de fuso, parada já saída, preferência desligada, dedupe); catch-up com Vitest (projeção na rota, raio, sugestões, estado sem posição); `.ics` com Vitest; replay com Vitest nas regras puras (seleção e ordem de eventos, duração) e manual no iPhone e Android; push manual nos dois, com e sem o app aberto, e ações no Android.

## Respondido por Douglas (não perguntar de novo)
- Modelo "a viagem roda no servidor, o app é aberto em momentos": **aprovado**.
- Replay ao abrir com o carrinho repondo os eventos: **pedido por ele**.
- Catch-up ao abrir: **aprovado**.
- Tela ligada opcional (modo painel): aprovado.
- Exportar para o calendário como complemento: aprovado.
- Fase nova antes do 3D: aprovado.
- Padrões de notificação acima (time desligado, o resto ligado, 15 min, briefing às 7h): aprovados.

## Em aberto
Nada novo. As 7 perguntas do Passo 0 continuam valendo.
