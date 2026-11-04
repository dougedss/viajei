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

Para ver o PWA de verdade (service worker, instalação, offline da casca): `pnpm build && pnpm preview`. Em `pnpm dev` o service worker fica desligado de propósito.

## Como o offline funciona

O Dexie (IndexedDB) é a fonte de verdade da tela. Toda escrita passa por `mutate` (`src/lib/db/mutate.ts`), que atualiza a linha local e enfileira a operação na `outbox` **na mesma transação**, com ou sem rede. O motor de sync (`src/lib/db/sync/engine.ts`) funde e ordena a fila, chama `sync_push`, depois `sync_pull_user` e `sync_pull` por viagem, e aplica o resultado numa transação; outros aparelhos recebem um aviso pelo Realtime e puxam. O chip no cabeçalho mostra "Sem conexão" ou "N pendentes" e abre a lista com tentar de novo e descartar.

## Scripts

| Comando                                          | O que faz                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm preview`       | Vite (o build gera os ícones do PWA e o service worker)                      |
| `pnpm lint` / `pnpm format` / `pnpm typecheck`   | ESLint, Prettier, `tsc -b`                                                   |
| `pnpm test`                                      | Vitest (lógica pura e Dexie com `fake-indexeddb`)                            |
| `pnpm test:e2e`                                  | Playwright, viewport de iPhone, contra o Vite e o Supabase locais            |
| `pnpm db:start` / `db:stop` / `db:reset`         | Supabase local (migrations + `seed.sql`)                                     |
| `pnpm db:test`                                   | pgTAP (`supabase/tests`)                                                     |
| `pnpm db:types`                                  | regenera `src/lib/supabase/database.types.ts` (commitado; a CI confere)      |
| `pnpm remote:db-push`                            | aplica as migrations no projeto hospedado                                    |
| `pnpm remote:config-diff` / `remote:config-push` | mostra e aplica a configuração do Auth (`[remotes.production]`) no hospedado |

Os scripts `remote:*` carregam `.env.local` antes de chamar a CLI: é de lá que saem o token, a senha do banco e a chave do Resend que o `config push` usa.

## Produção

- **Supabase:** projeto `viajei` (sa-east-1). Depois de uma migration nova e dos testes verdes, `pnpm remote:db-push`. A configuração do Auth (URLs, SMTP do Resend, templates) está versionada em `supabase/config.toml`; `pnpm remote:config-diff` mostra o que mudaria e `pnpm remote:config-push` aplica.
- **Vercel:** projeto `viajei`, integração com o GitHub. Push na `main` publica https://viajei-mauve.vercel.app; qualquer branch gera um preview, que usa o mesmo projeto Supabase (os links de e-mail voltam para a origem do preview).

## Contas e segredos

Há várias contas nesta máquina. O repositório usa um e-mail de commit local (`git config user.email`), o remote vai pelo alias SSH `github-dougedss`, e a CLI do Supabase lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` de `.env.local` em vez de trocar o login global. `RESEND_API_KEY` (conta da empresa, só envio) também fica em `.env.local`. Nenhuma chave secreta (Supabase, Anthropic, OpenRouteService, VAPID privada, Resend) entra no client ou no git.
