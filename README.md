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

Usuários locais (senha `viajei123`): `dono@viajei.local`, `convidado@viajei.local` (tem um convite pendente) e `intruso@viajei.local`. E-mails de confirmação e de recuperação de senha chegam no Mailpit: http://127.0.0.1:54324.

## Scripts

| Comando                                        | O que faz                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm preview`     | Vite                                                                    |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | ESLint, Prettier, `tsc -b`                                              |
| `pnpm test`                                    | Vitest (lógica pura, `fake-indexeddb`)                                  |
| `pnpm test:e2e`                                | Playwright, viewport de iPhone, contra o Vite e o Supabase locais       |
| `pnpm db:start` / `db:stop` / `db:reset`       | Supabase local (migrations + `seed.sql`)                                |
| `pnpm db:test`                                 | pgTAP (`supabase/tests`)                                                |
| `pnpm db:types`                                | regenera `src/lib/supabase/database.types.ts` (commitado; a CI confere) |

## Contas e segredos

Há várias contas nesta máquina. O repositório usa um e-mail de commit local (`git config user.email`), o remote vai pelo alias SSH `github-dougedss`, e a CLI do Supabase lê `SUPABASE_ACCESS_TOKEN` de `.env.local` em vez de trocar o login global. Nenhuma chave secreta (Supabase, Anthropic, OpenRouteService, VAPID privada) entra no client ou no git.
