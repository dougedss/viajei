# Viajei

PWA offline-first para planejar e, principalmente, **seguir** roteiros de viagem de carro: tudo da viagem num lugar, legível sem sinal, com a maquete 3D do dia, "sair às HH:MM", notificações e uma experiência gamificada. Nunca um GPS.

Fonte de verdade do projeto: [`docs/prompt-implementacao.md`](docs/prompt-implementacao.md). Decisões técnicas, uma por registro: [`docs/decisoes.md`](docs/decisoes.md).

## Rodar localmente

Pré-requisitos: Docker Desktop aberto, [nvm](https://github.com/nvm-sh/nvm) e pnpm.

```sh
nvm use                      # Node 22.23 (.nvmrc); react-router 8 exige 22.22+
pnpm install
pnpm db:start                # Supabase local: Postgres, Auth, Storage, Realtime, Mailpit
cp .env.example .env.local   # cole a URL e a publishable key que o db:start imprimiu
pnpm dev                     # http://127.0.0.1:5173
```

Usuários locais (senha `viajei123`): `dono@viajei.local`, `convidado@viajei.local` (tem um convite pendente) e `intruso@viajei.local`. E-mails de confirmação e de recuperação de senha (templates em pt-BR, `supabase/templates`) chegam no Mailpit: http://127.0.0.1:54324.

Para ver o PWA de verdade (service worker, instalação, offline da casca, **push**): `pnpm build && pnpm preview`. Em `pnpm dev` o service worker fica desligado de propósito.

## Avisos (push) e como testar localmente

A viagem roda no servidor: a cada minuto o `pg_cron` pergunta ao banco o que vence (`due_notifications`), reserva de forma atômica (`claim_due_notifications`) e, só quando há algo, chama a Edge Function `send-notifications` pelo `pg_net`, com a chave secreta do projeto no cabeçalho `apikey`. A função escreve o texto (`supabase/functions/_shared/notifications.ts`) e envia por Web Push (VAPID) um payload que o Safari lê sozinho (Declarative Web Push) e que o service worker (`src/sw.ts`) transforma em notificação com botões no Chrome. Partiu! e Chegamos! pelo botão da notificação gravam pela mesma `mutate` da tela e tentam enviar a fila, com o app fechado.

Para testar com o Chrome do computador (ele recebe Web Push de `localhost`):

1. `pnpm vapid:generate` uma vez; cole as duas linhas em `.env.local` e acrescente `VAPID_SUBJECT=mailto:...`.
2. `pnpm db:reset` (aplica as migrations e grava `viajei_project_url` e `viajei_secret_key` no Vault local pelo `db:vault-local`).
3. `pnpm functions:serve -- --env-file ./.env.local` (a edge-runtime local; o cron chega nela por `host.docker.internal`).
4. `pnpm build && pnpm preview`, abra http://localhost:4173, entre, abra uma viagem com dia hoje, ative os avisos em `/viagens/:id/avisos`.
5. Crie uma parada cujo "sair às" seja daqui a poucos minutos. No minuto certo, o cron chama a função e a notificação chega; `select * from notifications_sent` mostra o status.

Sem navegador: `curl -X POST http://127.0.0.1:54321/functions/v1/send-notifications -H "apikey: <SECRET_KEY do supabase status>"` devolve `{ claimed, sent, failed, no_subscription }`. Roteiro de teste nos aparelhos: [`docs/teste-manual-fase-4.md`](docs/teste-manual-fase-4.md).

## Como o offline funciona

O Dexie (IndexedDB) é a fonte de verdade da tela. Toda escrita passa por `mutate` (`src/lib/db/mutate.ts`), que atualiza a linha local e enfileira a operação na `outbox` **na mesma transação**, com ou sem rede. O motor de sync (`src/lib/db/sync/engine.ts`) funde e ordena a fila, chama `sync_push`, depois `sync_pull_user` e `sync_pull` por viagem, e aplica o resultado numa transação; outros aparelhos recebem um aviso pelo Realtime e puxam. O chip no cabeçalho mostra "Sem conexão" ou "N pendentes" e abre a lista com tentar de novo e descartar.

## Laboratório (testes automáticos na produção)

Um agente que exercita a tela apagada de ponta a ponta, na produção, sem ninguém pegar no celular. Roda todo dia às 3h07 de Brasília nas máquinas do GitHub Actions (`.github/workflows/lab.yml`) e quando alguém pede (`pnpm lab:remote`, ou Actions → Laboratório → Run workflow). O resultado aparece no painel **`/lab`** do app (link no Perfil para quem tem acesso); se algo falhar, o job fica vermelho e o GitHub avisa por e-mail.

Como funciona: o executor (`scripts/lab/run.ts`) entra como dois usuários de laboratório (`lab-a@viajei.invalid`, `lab-b@viajei.invalid`), monta quatro viagens de hoje com horários a poucos minutos pelas mesmas RPCs do app, e assina o push com chaves geradas na hora. Os endpoints apontam para a Edge Function `push-receiver`, um push service de mentira que confere o VAPID como o FCM ou a Apple confeririam e guarda a mensagem cifrada. O cron de verdade chama o `send-notifications` de verdade; o executor decifra o que chegou (RFC 8291) e confere os cenários do servidor: preparo, entrega e atraso, "sair em" e "hora de sair", fechamento, briefing, time, avisos desligados, repetição, aparelho que saiu (410 → `failed_at`), VAPID e payload.

Em paralelo, um Chromium (perfil de Android) faz o roteiro manual no app publicado (`scripts/lab/app.ts`): entra, abre o "Agora", ativa os avisos pela folha, fecha o app, recebe no service worker o "Hora de sair" que o servidor mandou, toca em **Partiu!** na notificação (a saída chega ao servidor com o app fechado), reabre, vê "Desde a última vez", deixa a posição no destino marcar **Chegamos!**, liga e desliga o modo painel e baixa o `.ics`. Só o registro no FCM e o dedo na notificação são simulados (D55). Tudo fica nas viagens dos usuários de laboratório; nada toca as viagens reais nem os seus aparelhos. Continua manual: a entrega pela Apple e pelo FCM, o selo no ícone, Wake Lock e GPS de verdade.

| Comando                                                         | O que faz                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lab`                                                      | roda o laboratório contra a produção daqui (lê `~/.config/viajei/lab-secret`)                                        |
| `pnpm lab:remote`                                               | dispara o agente no GitHub Actions agora                                                                             |
| `pnpm lab:setup --target production --viewer <e-mail> --github` | uma vez: cria os usuários de laboratório, dá acesso ao painel e grava `LAB_SECRET` nos secrets do GitHub             |
| `pnpm lab:local`                                                | o mesmo contra o Supabase local (precisa de `functions:serve` com VAPID; afrouxa o check de https só no banco local) |

## Maquete 3D

O Modo Viagem desenha o dia como uma maquete vista de cima (`src/features/world`): o traçado em S entre as paradas, o relevo do perfil de altitude real, o cenário lido da geografia (`lib/geo`), o carro da viagem (`src/art/cars`) e, em HTML por cima, as pílulas das paradas. A câmera fica parada com o dia inteiro na tela e só mergulha nas curiosidades do caminho. Motor: `three/webgpu` (WebGPU no iOS 26 e no Chrome recente, WebGL2 nos demais) com React Three Fiber, render sob demanda (parado, zero quadros) e dois níveis de qualidade (Leve e Alta, automático com rebaixamento por fps). Tudo do 3D entra por `lazy()` num chunk próprio, só quando a maquete vai aparecer.

- **Forçar a lista:** `?render=list` na URL do Modo Viagem, ou "Ver como lista" no rodapé de "Lista do dia" (fica guardado no aparelho; "Ver a maquete" desfaz). Sem WebGL2 a lista aparece sozinha, com "Maquete indisponível neste aparelho".
- **Chip de diagnóstico:** em dev, ou com `?diag=1` em produção. Mostra fps (só em movimento), motor, qualidade e nível; toque alterna Auto → Leve → Alta. Os chips menores forçam noite, WebGL2 e o som.
- **Medir fps no iPhone:** abra `/viagens/<id>/viagem?diag=1`, toque em "Rever o dia" e leia o chip durante o movimento, em Alta e em Leve. Roteiro completo em [`docs/teste-manual-fase-5.md`](docs/teste-manual-fase-5.md).
- **Replay ao abrir:** o carro repõe o que aconteceu desde a última vez que este aparelho viu a maquete (`travel_state`); com "reduzir movimento", o card "Desde a última vez" é o que aparece.

## Garagem

`/viagens/<id>/garagem`, aberta pelo carro no topo da visão geral. É um showroom 3D (`src/features/garage`): o carro da viagem gira num disco sob luz de estúdio. Arrastar na horizontal gira, na vertical inclina, e pinçar (ou a roda do mouse) aproxima. Embaixo ficam as linhas Modelo, Pintura e Acessórios.

- **Os carros:** cinco modelos por código (`src/art/cars`), cada um um `CarProfile`: o contorno lateral, as rodas, os vidros e as âncoras dos acessórios. O mesmo perfil gera o 3D (`buildCar`) e a vista lateral em SVG (`CarSide`), usada no card da viagem, no topo da visão geral e na garagem sem 3D.
- **O que está liberado:** vem do progresso do time (`useTeamProgress`): o maior nível e a união das conquistas dos membros aceitos. Até a fase 9 todo time está no nível 1, sem conquistas. Tocar em algo bloqueado abre a **prévia**, com o selo "Prévia" e a frase do que falta; a prévia nunca grava. O que a viagem já usa continua, mesmo que o progresso de agora não o libere.
- **Persistência:** cada escolha grava só a coluna tocada (`car_model`, `car_color` ou `car_accessories`) pela outbox, e funciona offline.
- **Sem 3D:** `?render=list`, ou um aparelho sem WebGL2, mostra a mesma tela com a vista lateral grande no lugar do palco.
- **Chip de diagnóstico:** em dev, ou com `?diag=1` em produção, como na maquete (fps, motor, qualidade; WebGL2 forçado; som). O nível de qualidade é um só por aparelho para as duas cenas.
- **Tudo liberado:** `?garagem=tudo` libera os cinco modelos, o dourado e todos os acessórios para conferência visual. Só existe em `pnpm dev`; o build de produção nem contém o código.
- Roteiro de teste nos aparelhos: [`docs/teste-manual-fase-6.md`](docs/teste-manual-fase-6.md).

## Scripts

| Comando                                          | O que faz                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm preview`       | Vite (o build gera os ícones do PWA e o service worker)                             |
| `pnpm lint` / `pnpm format` / `pnpm typecheck`   | ESLint, Prettier, `tsc -b`                                                          |
| `pnpm test`                                      | Vitest (lógica pura e Dexie com `fake-indexeddb`)                                   |
| `pnpm test:e2e`                                  | Playwright, viewport de iPhone, contra o Vite e o Supabase locais                   |
| `pnpm db:start` / `db:stop` / `db:reset`         | Supabase local (migrations + `seed.sql`)                                            |
| `pnpm db:test`                                   | pgTAP (`supabase/tests`)                                                            |
| `pnpm db:types`                                  | regenera `src/lib/supabase/database.types.ts` (commitado; a CI confere)             |
| `pnpm remote:db-push`                            | aplica as migrations no projeto hospedado                                           |
| `pnpm remote:config-diff` / `remote:config-push` | mostra e aplica a configuração do Auth (`[remotes.production]`) no hospedado        |
| `pnpm remote:functions-deploy`                   | publica as Edge Functions `route-day` e `send-notifications` no hospedado           |
| `pnpm remote:secrets-push`                       | grava `ORS_API_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (só elas) nos secrets    |
| `pnpm functions:serve`                           | Edge Functions no stack local (`-- --env-file ./.env.local` para ORS e VAPID)       |
| `pnpm geo:build`                                 | regenera os dados geográficos embutidos (`docs/dados-geo.md`)                       |
| `pnpm vapid:generate`                            | gera o par VAPID uma vez (`VITE_VAPID_PUBLIC_KEY` raw, `VAPID_PRIVATE_KEY` PKCS#8)  |
| `pnpm db:vault-local`                            | grava URL e chave secreta locais no Vault, para o `pg_cron` (o `db:reset` já chama) |

Os scripts `remote:*` carregam `.env.local` antes de chamar a CLI: é de lá que saem o token, a senha do banco e a chave do Resend que o `config push` usa.

## Produção

- **Supabase:** projeto `viajei` (sa-east-1). Depois de uma migration nova e dos testes verdes, `pnpm remote:db-push`. A configuração do Auth (URLs, SMTP do Resend, templates) está versionada em `supabase/config.toml`; `pnpm remote:config-diff` mostra o que mudaria e `pnpm remote:config-push` aplica. O Vault do hospedado precisa, uma vez, de `viajei_project_url` e `viajei_secret_key` (SQL Editor: `select vault.create_secret(...)`), que o job `viajei-send-notifications` lê.
- **Vercel:** projeto `viajei`, integração com o GitHub. Push na `main` publica https://viajei-mauve.vercel.app; qualquer branch gera um preview, que usa o mesmo projeto Supabase (os links de e-mail voltam para a origem do preview).

## Contas e segredos

Há várias contas nesta máquina. O repositório usa um e-mail de commit local (`git config user.email`), o remote vai pelo alias SSH `github-dougedss`, e a CLI do Supabase lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` de `.env.local` em vez de trocar o login global. `RESEND_API_KEY` (conta da empresa, só envio) também fica em `.env.local`. Nenhuma chave secreta (Supabase, Anthropic, OpenRouteService, VAPID privada, Resend) entra no client ou no git.

Variáveis do push: `VITE_VAPID_PUBLIC_KEY` (client; também na Vercel, Production e Preview), `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (só em `supabase secrets`, via `pnpm remote:secrets-push`). O par é gerado uma vez por `pnpm vapid:generate` e nunca trocado: trocar invalida todas as assinaturas.
