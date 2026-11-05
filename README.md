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
