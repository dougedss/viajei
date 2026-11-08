# Viajei

PWA offline-first, em português do Brasil, para planejar e, principalmente, **seguir** roteiros de viagem de carro: tudo da viagem num lugar, legível sem sinal, com a maquete 3D do dia, o "sair às HH:MM", avisos com a tela apagada e uma experiência gamificada. Nunca um GPS.

- App: https://viajei-mauve.vercel.app
- Fonte de verdade do projeto: [`docs/prompt-implementacao.md`](docs/prompt-implementacao.md).
- Decisões técnicas, uma por registro, com o porquê e os números medidos de cada fase: [`docs/decisoes.md`](docs/decisoes.md). Este README cita as decisões pelo número (D91, D108…).

## O que é

O roteiro bonito montado antes da viagem vira um documento perdido na estrada. A confirmação do hotel fica no WhatsApp, o telefone num print, e ninguém sabe se já está na hora de sair para a próxima parada. Em lugar sem sinal, nada abre.

O Viajei resolve isso com quatro pilares:

1. **Tudo da viagem num lugar, legível offline por completo:** roteiro por dia, reservas com print e PDF, listas, contatos, gastos e fotos.
2. **Modo Viagem:** a maquete 3D do dia, vista de cima, com o carro da viagem na trilha, a próxima saída e o "sair às" calculado.
3. **Bonito e gamificado:** XP, conquistas e um carro que ganha acessórios, sem ranking (a equipe conquista junto). Não é um jogo nem um GPS: sem rota passo a passo, sem voz, nada que premie velocidade ou exija algo de quem dirige.
4. **Funciona com a tela apagada:** a viagem roda no servidor, que avisa a hora de sair por notificação. O app é aberto em momentos e tem de ser útil em cinco segundos; ao abrir, o carrinho repõe o que aconteceu desde a última vez.

iPhone primeiro, Android em seguida, os dois igualmente bem; no desktop, só não quebra. A interface é em pt-BR; os códigos de domínio são em inglês, com os rótulos em `supabase/functions/_shared/constants.ts`. O caso real que guiou o projeto: Papanduva/SC a Montenegro/RS, de 11 a 14/12/2026 (`supabase/seed/viagem-rs.json`).

## A arquitetura em uma página

**No aparelho.** Um SPA em React 19.3 (com o React Compiler), TypeScript 6 e Vite 8, rotas lazy pelo react-router 8, Tailwind 4. O **Dexie** (IndexedDB) é a fonte de verdade da tela: os componentes leem por `useLiveQuery`, e toda escrita passa por `mutate`, que grava a linha e enfileira a operação na `outbox` na mesma transação, com ou sem rede. O TanStack Query fica só com o que é do servidor (perfil, convites, importação, clima, rota do dia). O service worker próprio (`src/sw.ts`, Workbox por `injectManifest`) guarda a casca no precache, recebe os avisos, grava Partiu! e Chegamos! tocados na notificação, envia a fila de fotos e guarda os tiles do mapa já vistos.

**No servidor (Supabase).** Postgres com RLS em tudo, Auth por e-mail e senha, Storage (bucket privado `attachments`), Realtime (um aviso por viagem por transação) e cinco Edge Functions em Deno. O `pg_cron` faz o que não pode depender de alguém com o app aberto.

```
 toque ─► mutate ─► Dexie: linha + outbox (uma transação) ─► a tela redesenha, com ou sem rede
                      │ motor de sync, uma aba por vez (Web Locks)
                      ▼
                 sync_push ─► Postgres (RLS, versão por coluna) ─► Realtime ─► os outros aparelhos
                 sync_pull ◄─┘                                                 puxam

 pg_cron, a cada minuto ─► send-notifications ─► Web Push (VAPID) ─► Apple / FCM ─► service worker
 pg_cron, às 4h         ─► purge ─► banco e Storage
```

| Edge Function        | Quem chama                                                     | Como se autentica                                              | O que faz                                                                                                             |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `route-day`          | o app                                                          | JWT da pessoa (RLS vale)                                       | rota real e altitude pela OpenRouteService (HeiGIT); sem chave ou sem cota, o OSRM público com altitude do Open-Meteo |
| `import-itinerary`   | o app                                                          | JWT da pessoa (RLS vale)                                       | lê o roteiro colado com a IA e devolve o JSON aos poucos (SSE)                                                        |
| `send-notifications` | o `pg_cron`, a cada minuto, só quando algo vence               | chave secreta do projeto, lida do Vault                        | escreve o texto e envia o aviso por Web Push                                                                          |
| `purge`              | o `pg_cron`, às 4h de São Paulo; o laboratório, só o `dry_run` | chave secreta do Vault, ou o JWT de um executor do laboratório | o expurgo diário                                                                                                      |
| `push-receiver`      | a `send-notifications`, para as assinaturas do laboratório     | o próprio VAPID                                                | um push service de mentira, que só o laboratório usa                                                                  |

Os jobs do `pg_cron`: `viajei-send-notifications` (a cada minuto), `viajei-ai-imports` (a cada 10 min, fecha a importação que ficou aberta) e o do expurgo (às 4h). Os que chamam uma função leem a URL do projeto e a chave secreta do Vault.

**Fora.** Direto do navegador, sem passar pelo Supabase: os tiles do OpenStreetMap, a busca de endereço do Nominatim e a previsão do Open-Meteo. Pelas funções: a OpenRouteService (ou o OSRM), a Anthropic e, no briefing da manhã, o Open-Meteo.

**Em volta.** A Vercel serve o build (push na `main` = produção; cada branch ganha um preview). O GitHub Actions roda a CI em todo push e o laboratório todo dia.

**Pastas.**

```
src/
  app/            rotas (lazy), layouts, sessão
  features/       uma pasta por funcionalidade: trips, itinerary, travel-mode, world (maquete),
                  garage, notifications, reservations, memories, checklists, contacts, expenses,
                  progression, retrospective, import, map, weather, lab…
  lib/            db (Dexie, mutate, outbox, sync), supabase, geo (dados embutidos), three,
                  map, media, time, ids, links, audio, pwa…
  components/ui/  os primitivos (Button, Card, Sheet, Chip, Ring, Tabs…)
  art/            os carros por código e o cenário
  sw.ts, sw/      o service worker
supabase/
  migrations/     as migrations numeradas, de 0001_fundacao.sql em diante
  functions/      as Edge Functions; _shared/ é código dos dois lados (alias @shared no Vite)
  tests/          pgTAP
  seed.sql, seed/ os usuários locais e a viagem real
e2e/              Playwright
scripts/          lab/ (laboratório), geo/ (dados embutidos), security/ (varredura do dist), vapid/, db/
docs/             o prompt, as decisões, os roteiros de teste, as fontes dos dados geográficos
```

**Rotas.** `/entrar`, `/criar-conta`, `/recuperar-senha`, `/nova-senha` · `/` é a abertura do app (durante uma viagem, cai no Modo Viagem do dia) · `/viagens` é a lista, que nunca redireciona · `/viagens/nova` · `/viagens/:tripId` (visão geral) e as telas da viagem, em `/viagens/:tripId/...`: `roteiro`, `roteiro/:dayId`, `viagem` (Modo Viagem), `reservas`, `checklists`, `contatos`, `gastos`, `mapa`, `diario`, `garagem`, `retrospectiva`, `avisos`, `membros`, `importar`, `editar` · `/perfil` · `/lab` (o painel do laboratório).

## Rodar e testar

### Onde se testa (D91)

Nada roda no Mac do Douglas: nem Supabase local, nem Docker, nem as suítes, nem o Playwright. O teste acontece em três lugares:

1. **A CI do GitHub** (`.github/workflows/ci.yml`), em todo push da `main` e das branches `fase-*`. É ela que segura a fase antes da produção.
2. **O laboratório** (seção abaixo), o teste de aceitação: no preview da branch antes do merge, na produção depois, e todo dia.
3. **Os aparelhos**, uma vez, na versão final, pelo roteiro [`docs/teste-final.md`](docs/teste-final.md). Fica para ele só o que um aparelho julga: câmera, HEIC, o PDF no app instalado do iPhone, fps da maquete e da garagem, entrega pela Apple e pelo FCM, Wake Lock, GPS de verdade, VoiceOver e TalkBack. Os roteiros por fase (`docs/teste-manual-fase-4.md` a `docs/teste-manual-fase-11.md`) ficam como referência.

### O que a CI confere

Na ordem: lint e formatação; o Supabase local da própria CI (Postgres, Auth, PostgREST, Realtime, Storage); o lint das funções do banco (`supabase db lint`, nenhum aviso); pgTAP (`supabase/tests`); tipos do banco; tipos (`tsc -b`); Vitest; build; a varredura de segredos no `dist/`; Playwright (o celular no Chromium, o fluxo principal e o offline também no WebKit do iPhone 15, e o aparelho atrasado por último; o tempo de cada projeto sai no fim do log). Uma falha do pgTAP ou dos tipos do banco não para a volta: a CI segue e falha no fim, para uma volta dizer tudo.

- **Tipos do banco (D104):** quando uma migration muda o schema, a CI gera o `src/lib/supabase/database.types.ts`, guarda como artefato `tipos-do-banco`, roda o resto com ele e falha no fim. Baixe e commite: `gh run download <id> -n tipos-do-banco -D src/lib/supabase`.
- **Segredos no `dist/`:** `scripts/security/scan-dist.ts` reprova o build se o client levar uma chave secreta do Supabase, uma chave da Anthropic ou do OpenRouteService, um JWT com `service_role` ou uma chave privada. Diz o arquivo e o tipo, nunca o valor.
- **Contraste:** `src/styles/contrast.test.ts` (Vitest) confere o AA de cada token de cor sobre cada superfície, nos dois temas, lido do `app.css`.
- **Sem o mundo de fora:** nenhuma chamada real à Anthropic, ao OSM ou ao Open-Meteo. A `import-itinerary` é testada com respostas gravadas; no Playwright, os tiles e o clima nem resolvem, e os testes do mapa e do clima fingem os dois (`e2e/helpers/world.ts`).

Os projetos do Playwright (`playwright.config.ts`), todos com o perfil do iPhone 15, contra o Supabase local:

| Projeto      | Motor    | Contra                                          | O quê                                     |
| ------------ | -------- | ----------------------------------------------- | ----------------------------------------- |
| `iphone`     | Chromium | o Vite de dev (sem service worker, D22)         | a suíte inteira, menos os `*.pwa.spec.ts` |
| `pwa`        | Chromium | o build pelo `vite preview`, com service worker | os `*.pwa.spec.ts`: recarregar sem rede   |
| `webkit`     | WebKit   | o Vite de dev                                   | o fluxo principal e o uso sem sinal       |
| `webkit-pwa` | WebKit   | o build                                         | a recarga sem rede                        |

O WebKit é o motor do Safari, o mais perto do iPhone que a CI tem. Os specs que valem a leitura primeiro:

- `e2e/fluxo.spec.ts`: o fluxo principal, como uma pessoa: cria a viagem, monta o roteiro, abre o Modo Viagem, Partiu! e Chegamos!, "Como foi?", um gasto, um item da mala e a retrospectiva.
- `e2e/offline.spec.ts`: sem sinal no meio do uso (`context.setOffline(true)`), o "N pendentes" e o servidor com tudo quando a rede volta.
- `e2e/offline.pwa.spec.ts`: recarregar o app sem rede nenhuma, com o service worker de verdade; a edição sem sinal sobrevive à recarga.
- `e2e/acessibilidade.spec.ts`: todas as telas nos dois temas com o axe (WCAG 2.2 A e AA): zero violações sérias ou críticas, alvos de toque de 48 px, texto do Modo Viagem de pelo menos 17 px e 10% maior à noite.

As contagens de testes e os tempos de cada fase estão em `docs/decisoes.md`.

### Rodar localmente

Para quem tem Docker. Pré-requisitos: Docker Desktop aberto, [nvm](https://github.com/nvm-sh/nvm) e pnpm.

```sh
nvm use                      # Node 22.23 (.nvmrc); react-router 8 exige 22.22+
pnpm install
pnpm db:start                # Supabase local: Postgres, Auth, Storage, Realtime, Mailpit
cp .env.example .env.local   # cole a URL e a publishable key que o db:start imprimiu
pnpm dev                     # http://127.0.0.1:5173
```

Usuários locais (senha `viajei123`): `dono@viajei.local`, `convidado@viajei.local` (tem um convite pendente) e `intruso@viajei.local`. Os e-mails de confirmação e de nova senha (templates em pt-BR, `supabase/templates`) chegam no Mailpit: http://127.0.0.1:54324.

Para ver o PWA de verdade (service worker, instalação, offline da casca, push): `pnpm build && pnpm preview`. Em `pnpm dev` o service worker fica desligado de propósito (D22). `pnpm test:e2e` precisa do `pnpm build` antes, por causa dos projetos `pwa` e `webkit-pwa`.

**Avisos no Chrome do computador** (ele recebe Web Push de `localhost`):

1. `pnpm vapid:generate` uma vez; cole as duas linhas no `.env.local` e acrescente `VAPID_SUBJECT=mailto:...`.
2. `pnpm db:reset` (aplica as migrations e grava `viajei_project_url` e `viajei_secret_key` no Vault local).
3. `pnpm functions:serve -- --env-file ./.env.local` (a edge-runtime local; o cron chega nela por `host.docker.internal`).
4. `pnpm build && pnpm preview`, abra http://localhost:4173, entre, abra uma viagem com dia hoje e ative os avisos em `/viagens/<id>/avisos`.
5. Crie uma parada cujo "sair às" seja daqui a poucos minutos. No minuto certo, o cron chama a função e a notificação chega; `select * from notifications_sent` mostra o status.

Sem navegador: `curl -X POST http://127.0.0.1:54321/functions/v1/send-notifications -H "apikey: <SECRET_KEY do supabase status>"` devolve `{ claimed, sent, failed, no_subscription }`.

### Scripts

| Comando                                                              | O que faz                                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm preview`                           | Vite (o build roda `tsc -b`, gera os ícones do PWA e o service worker)                                                       |
| `pnpm lint` / `pnpm format` / `pnpm format:check` / `pnpm typecheck` | ESLint, Prettier, `tsc -b`                                                                                                   |
| `pnpm test` / `pnpm test:watch`                                      | Vitest (lógica pura e Dexie com `fake-indexeddb`)                                                                            |
| `pnpm test:e2e`                                                      | Playwright contra o Supabase local (`pnpm build` antes)                                                                      |
| `pnpm db:start` / `db:stop` / `db:reset`                             | Supabase local (migrations e `seed.sql`; o `db:reset` também grava o Vault local)                                            |
| `pnpm db:test`                                                       | pgTAP (`supabase/tests`)                                                                                                     |
| `pnpm db:types`                                                      | regenera `src/lib/supabase/database.types.ts` (commitado; a CI confere)                                                      |
| `pnpm db:vault-local`                                                | grava a URL e a chave secreta locais no Vault, para o `pg_cron` (o `db:reset` já chama)                                      |
| `pnpm functions:serve`                                               | Edge Functions no stack local (`-- --env-file ./.env.local` para as chaves delas)                                            |
| `pnpm remote:db-push`                                                | aplica as migrations no projeto hospedado                                                                                    |
| `pnpm remote:config-diff` / `remote:config-push`                     | mostra e aplica a configuração do Auth (`[remotes.production]` do `config.toml`) no hospedado                                |
| `pnpm remote:functions-deploy`                                       | publica `route-day`, `send-notifications`, `push-receiver`, `import-itinerary` e `purge`, empacotando no servidor (D108)     |
| `pnpm remote:secrets-push`                                           | grava `ORS_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `ANTHROPIC_API_KEY` (só elas) nos secrets; recusa variável vazia |
| `pnpm geo:build`                                                     | regenera os dados geográficos embutidos (`docs/dados-geo.md`)                                                                |
| `pnpm vapid:generate`                                                | gera o par VAPID, uma vez (`VITE_VAPID_PUBLIC_KEY` raw, `VAPID_PRIVATE_KEY` PKCS#8)                                          |
| `pnpm lab` / `lab:remote` / `lab:setup` / `lab:local`                | o laboratório (abaixo)                                                                                                       |

Os scripts `remote:*` e o `lab:setup` carregam o `.env.local` antes de chamar a CLI: é de lá que saem o token, a senha do banco e a chave do Resend que o `config push` usa.

## Laboratório, produção e deploy

### Produção

- **App:** https://viajei-mauve.vercel.app, na Vercel (projeto `viajei`, conta pessoal do Douglas, integração com o GitHub). Push na `main` é deploy de produção. Cada branch ganha um preview atrás do login da Vercel, com o mesmo banco da produção (os links de e-mail voltam para a origem do preview). O `vercel.json` reescreve toda rota para o `index.html` e serve o `sw.js` com `no-cache` (D56).
- **Supabase:** projeto `viajei`, ref `iihwideuknnrpvtczxjs`, região sa-east-1, plano Free (as funções têm 150 s de parede).
- **Repositório:** `dougedss/viajei`, privado.

### O caminho de uma fase até a produção

1. **CI da branch:** push na `fase-N`; a CI tem de ficar verde naquele sha.
2. **Tipos do banco:** se a CI gerou o artefato, baixe e commite (acima).
3. **Hospedado:** ensaie a migration com `pnpm remote:db-push --dry-run`, leia o que ela vai aplicar, e só então `SUPABASE_YES=1 pnpm remote:db-push`. Depois, `SUPABASE_YES=1 pnpm remote:functions-deploy`: as cinco funções numa chamada, com `--use-api` e `--import-map supabase/functions/deno.json`, empacotadas no servidor e sem Docker (D108).
4. **Laboratório no preview:** `gh workflow run lab.yml --repo dougedss/viajei --ref fase-N -f alvo=preview`. O navegador abre o preview da branch pelo "Protection Bypass for Automation" da Vercel, com o banco e as funções da produção (D106): o que depende de uma função nova só se confere depois de ela ser publicada.
5. **Merge:** fast-forward da branch na `main` (o deploy), com a CI e o laboratório do preview verdes naquele sha. Nunca force.
6. **Laboratório na produção:** `pnpm lab:remote` (ou `gh workflow run lab.yml --repo dougedss/viajei`).

Uma vez por projeto, já feito: o Vault do hospedado com `viajei_project_url` e `viajei_secret_key` (SQL Editor, `select vault.create_secret(...)`); os secrets das funções (`pnpm remote:secrets-push`); os usuários do laboratório (`pnpm lab:setup`); o bypass da Vercel (Settings → Deployment Protection → Protection Bypass for Automation). A configuração do Auth (Site URL, redirects, SMTP do Resend, templates) está versionada em `supabase/config.toml`: `pnpm remote:config-diff` mostra o que mudaria e `pnpm remote:config-push` aplica (D11). O `[functions.*]` não entra no `config push`: o `verify_jwt` de cada função vai pelo `functions deploy`.

### Laboratório

Um agente que exercita o app de ponta a ponta, na produção, sem ninguém pegar no celular (D50). É um script determinístico, não um modelo de linguagem decidindo o que olhar. Roda nas máquinas do GitHub Actions (`.github/workflows/lab.yml`) todo dia às 3h07 de Brasília e quando alguém pede (`pnpm lab:remote`, ou Actions → Laboratório → Run workflow). O resultado aparece no painel **`/lab`** (link no Perfil para quem tem acesso); se algo falha, o job fica vermelho, o GitHub avisa por e-mail e cada passo que falhou deixa um print como artefato.

**Como funciona.** O executor (`scripts/lab/run.ts`) entra como dois usuários de laboratório (`lab-a@viajei.invalid` e `lab-b@viajei.invalid`), com senhas derivadas do `LAB_SECRET`, e faz tudo com RLS: ele nunca tem a chave secreta do projeto (D52). Monta viagens fixas de laboratório (id determinístico, redatadas a cada execução) pelas mesmas RPCs do app, assina o push com chaves geradas na hora e aponta as assinaturas para a `push-receiver`, que confere o VAPID como a Apple ou o FCM confeririam. O cron de verdade chama a `send-notifications` de verdade, e o executor decifra o que chegou (RFC 8291). Em paralelo, um Chromium com perfil de Android (e, para o lado do time, um segundo, como `lab-b`) faz no app publicado o que o roteiro manual faria. Só o registro no FCM e o dedo na notificação são simulados (D55). Nada toca as viagens reais nem os aparelhos de ninguém.

| Grupo                        | Cenários                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor dos avisos (fase 4) | `preparo`, `entrega`, `saida`, `fechamento`, `briefing` (com o clima), `time`, `desligado`, `dedupe`, `assinatura_morta`, `vapid`, `payload` |
| Em dois dias (D105)          | `vespera`, `prazo`, `retro`: uma execução arma o aviso, a seguinte confere o texto e arma o próximo ciclo                                    |
| Tela apagada (fase 4)        | `app_avisos`, `app_notificacao`, `app_reabrir`, `app_extras` (modo painel e `.ics`)                                                          |
| Maquete (fase 5)             | `app_maquete`                                                                                                                                |
| Na estrada (fases 7 e 8)     | `app_listas`, `app_contatos`, `app_agora_reserva`, `app_reserva_offline`, `app_missoes`, `app_memoria`, `app_gastos`, `app_sair_pendente`    |
| Progressão (fase 9)          | `app_progressao`, `app_retrospectiva`                                                                                                        |
| Importação (fase 10)         | `app_importar`: uma leitura real da IA por execução                                                                                          |
| Mapa e clima (fase 11)       | `app_mapa`, `app_clima`, com os tiles e o Open-Meteo de verdade                                                                              |
| Polimento (fase 12)          | `expurgo`, `app_resync`, `lighthouse`                                                                                                        |

Os três da fase 12:

- **`expurgo`:** o `dry_run` diário da função `purge` com o JWT do lab-a. Confere que a função responde, que nada saiu do Storage e que o item mais novo de cada categoria é mais velho que a regra: nada fora da regra se qualifica.
- **`app_resync`:** o aparelho atrasado, sem mexer no horizonte de verdade. Numa viagem só do lab-a, o laboratório forja no IndexedDB uma parada que o servidor não tem e um cursor antigo; sem sinal, a pessoa marca um item e cria outro. Com a rede de volta, o `resync` tem de tirar a parada fantasma e subir as duas edições.
- **`lighthouse`:** desempenho, acessibilidade e boas práticas de pelo menos 90 no perfil de celular, pela mediana de 3 execuções, em `/entrar`, `/viagens`, a visão geral, o roteiro do dia e o Modo Viagem pela lista. A tela de entrar mede fria (a primeira visita); as de dentro, com o service worker e o precache no lugar, que é como elas abrem (só se chega a elas depois de entrar, e entrar instala o app). As de dentro também medem frias, uma vez cada, só para registro (D162). A categoria PWA saiu do Lighthouse na versão 12; no lugar dela, os critérios de instalação pelo DevTools Protocol (sem erro de instalabilidade, o manifest sem erro e o service worker controlando a página). A maquete em WebGL por software não representa um celular e fica fora da meta.

| Comando                                                                         | O que faz                                                                                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lab`                                                                      | roda o laboratório contra a produção daqui (lê `~/.config/viajei/lab-secret`)                                        |
| `pnpm lab:remote`                                                               | dispara o laboratório no GitHub Actions agora, contra a produção                                                     |
| `gh workflow run lab.yml --repo dougedss/viajei --ref <branch> -f alvo=preview` | o mesmo, no preview daquela branch (D106)                                                                            |
| `pnpm lab:setup --target production --viewer <e-mail> --github`                 | uma vez: cria os usuários de laboratório, dá acesso ao painel e grava `LAB_SECRET` nos secrets do GitHub             |
| `pnpm lab:local`                                                                | o mesmo contra o Supabase local (precisa de `functions:serve` com VAPID; afrouxa o check de https só no banco local) |

A tarefa `medir-importacao` (Run workflow → tarefa) roda só a medição do pensamento da IA (D133), sem os cenários; ela faz várias leituras reais, então só quando for preciso medir de novo. A tarefa `medir-desempenho` roda só o Lighthouse, com os relatórios inteiros nos artefatos, em uns 8 minutos e sem custo de IA; ela usa a viagem do lab-a preparada pelo laboratório do dia. O laboratório tem um grupo de concorrência só: uma execução nova espera a que está rodando, mas o GitHub cancela a que estava na fila quando chega outra.

## Contas e segredos

Há várias contas GitHub no Mac do Douglas. Antes de push, repositório ou secret, confira as três camadas: `gh auth status`, `ssh -T git@github.com` e `git config user.email`. Neste repositório, o remote vai pelo alias SSH `github-dougedss`, o e-mail de commit é local ao repositório, e a CLI do Supabase lê o token de `.env.local` em vez de trocar o login global (D10). Nada se cria em conta de cliente.

A regra: **nenhuma chave secreta entra no client nem no git** (a secreta do Supabase, a da Anthropic, a do OpenRouteService, a VAPID privada, a do Resend). O que o client leva é público. A CI não tem segredo nenhum: ela sobe o Supabase dela. Onde cada coisa mora (os nomes; nunca os valores):

| Onde                                         | O quê                                                                                                                                                                                                         | Quem grava                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.env.local` no Mac do Douglas (fora do git) | `SUPABASE_ACCESS_TOKEN` (o token `viajei-cli`, só deste projeto), `SUPABASE_DB_PASSWORD`, `RESEND_API_KEY`, `ORS_API_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ANTHROPIC_API_KEY` | o Douglas; a lista comentada está no `.env.example`                                                      |
| Secrets das Edge Functions (hospedado)       | `ORS_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ANTHROPIC_API_KEY`                                                                                                                                      | `pnpm remote:secrets-push`, a partir do `.env.local`                                                     |
| Vault do banco hospedado                     | `viajei_project_url`, `viajei_secret_key`                                                                                                                                                                     | uma vez, pelo SQL Editor; o `pg_cron` lê daqui para chamar as funções                                    |
| Secrets do repositório no GitHub             | `LAB_SECRET` (as senhas dos usuários de laboratório saem dele), `VERCEL_AUTOMATION_BYPASS_SECRET` (o laboratório abre o preview da branch)                                                                    | `pnpm lab:setup --github` grava o primeiro; o segundo, o Douglas, com o valor gerado no painel da Vercel |
| Variáveis da Vercel                          | `ENABLE_EXPERIMENTAL_COREPACK`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`                                                                                                 | nenhuma é secreta; as `VITE_*` vão no bundle                                                             |
| `~/.config/viajei/lab-secret` (0600) no Mac  | o mesmo `LAB_SECRET`                                                                                                                                                                                          | para rodar `pnpm lab` daqui                                                                              |

Mais quatro coisas que vale saber:

- **A chave secreta do projeto Supabase** não fica em arquivo nosso. Está no painel e no Vault; o `pnpm lab:setup` a lê na hora pela CLI e a mantém só na memória do processo (D52).
- **A chave da Anthropic** se chama `viajei-supabase`, na organização pessoal do Douglas no Console, sem data de expiração. A organização usa o crédito de API do plano Ultra dele (veja Custos). O valor mora só no `.env.local` e nos secrets das funções.
- **O par VAPID** foi gerado uma vez por `pnpm vapid:generate` e nunca se troca: trocar invalida todas as assinaturas (D39). A pública vai no client; a privada e o `VAPID_SUBJECT`, só nos secrets.
- **O SMTP do Auth** é o Resend de uma conta da empresa, só para envio e só para os primeiros testes (comentário do `config.toml`). O `config push` lê a `RESEND_API_KEY` do `.env.local`; rodar sem ela apagaria a senha do SMTP (D11).

## Custos

- **IA (`import-itinerary`):** `claude-sonnet-5-5`, com pensamento adaptativo e `effort: 'medium'` (D133). A US$ 2 por milhão de tokens de entrada e US$ 10 por milhão de saída, uma importação do tamanho do roteiro de exemplo (2.617 caracteres) custa **US$ 0,042**; um texto de 30.000 caracteres, o limite, **US$ 0,23** (D140). Sem cache de prompt, porque a repetição em 5 minutos é rara (D131). O limite é de 20 leituras por pessoa em 24 h.
- **Quem paga a IA:** o crédito de API do plano Ultra do Douglas, US$ 200 por ciclo, sem acumular e sem recarga automática. Cabem umas 4.700 importações do tamanho do exemplo por ciclo (D140). Se o crédito acabar, a API para e nada é cobrado.
- **Laboratório:** uma leitura real da IA por execução (`app_importar`, um texto curto), estimada em ~US$ 0,02; a diária dá ~US$ 0,60 por mês. Cada execução sob demanda, no preview ou na produção, gasta mais uma. O custo medido de cada execução fica no `data` do cenário, no painel `/lab`.
- **O resto é gratuito no uso atual:** Supabase Free, Vercel na conta pessoal, Open-Meteo, os tiles do OSM e o Nominatim. A rota usa o plano Standard da HeiGIT, com 2.000 rotas por dia e 40 por minuto (D25); sem chave ou sem cota, cai no OSRM público.
- **GitHub Actions:** o repositório é privado, então a CI e o laboratório usam os minutos do plano da conta. A CI roda em todo push da `main` e das branches `fase-*`; o laboratório, todo dia às 3h07 de Brasília (o job tem até 45 min) e a cada disparo manual.

## Calendário de manutenção

| Quando                                                      | O que acontece                                                                          | O que para                                                                                                                                                                                         | O que fazer                                                                                                                                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Antes de 11/12/2026, de preferência a partir de 26/11       | o teste final nos aparelhos, quando o clima da viagem real já aparece                   | nada                                                                                                                                                                                               | seguir [`docs/teste-final.md`](docs/teste-final.md), primeiro no iPhone, depois no Android                                                                                                                         |
| A cada ciclo do plano Ultra                                 | o crédito de API da Anthropic renova (US$ 200, sem acumular)                            | se acabar no meio do ciclo, só a importação com IA, até o ciclo seguinte (e o `app_importar` do laboratório fica vermelho); o resto do app continua                                                | esperar o ciclo, ou pôr crédito avulso no Console da Anthropic. O consumo aparece no Console; os tokens de cada leitura ficam em `ai_imports`                                                                      |
| 02/02/2027                                                  | o token `viajei-cli` da CLI do Supabase vence                                           | só os comandos rodados do Mac contra o hospedado: os `pnpm remote:*` (migration, funções, secrets, configuração do Auth) e o `pnpm lab:setup`. O app, o cron, as funções e o laboratório continuam | gerar um token novo no painel do Supabase (Account → Access Tokens), com o mesmo escopo (só este projeto), e trocar o `SUPABASE_ACCESS_TOKEN` no `.env.local`. Para conferir, `pnpm remote:config-diff`, que só lê |
| Fevereiro de 2027                                           | o primeiro expurgo de lápides de verdade (as de 90 dias; o app existe desde 04/11/2026) | nada                                                                                                                                                                                               | nada: o `expurgo` do laboratório confere todo dia que nada fora da regra se qualifica, e o aparelho que ficou mais de 90 dias sem puxar faz o `resync` sozinho                                                     |
| Nunca                                                       | trocar o par VAPID                                                                      | os avisos de todos os aparelhos, até cada um assinar de novo                                                                                                                                       | não trocar: trocar exige reassinar os avisos em todos os aparelhos (D39)                                                                                                                                           |
| Se o histórico do laboratório ficar sem execuções agendadas | o GitHub perdeu o cron do `lab.yml`                                                     | o laboratório diário (o sob demanda continua)                                                                                                                                                      | um commit que toque `.github/workflows/lab.yml` na `main` registra o cron de novo                                                                                                                                  |

## Funcionalidades

### Viagens e membros

`/viagens` é a lista, com os convites pendentes. `/` é a abertura do app: durante uma viagem, cai no Modo Viagem do dia, uma vez por abertura (D33). Os links "Início" e "Voltar" levam a `/viagens`, que nunca redireciona. O convite é por e-mail: fica em `trip_members` e só um e-mail confirmado o reivindica, ao entrar (D5). Excluir uma viagem é só do dono, e é uma lápide: depois de 30 dias, o expurgo a leva de vez.

### Avisos com a tela apagada

A cada minuto, o `pg_cron` pergunta ao banco se algo vence e, só quando há, chama a `send-notifications` pelo `pg_net`, com a chave secreta do Vault no cabeçalho `apikey`. A reserva do aviso é um insert atômico (`claim_due_notifications`): nenhum aviso sai duas vezes (D35). A função escreve o texto (`supabase/functions/_shared/notifications.ts`, a única fonte dele) e envia por Web Push (VAPID) um payload só: o Safari o lê sozinho (Declarative Web Push), e no Chrome o service worker monta a notificação com os botões Partiu! e Chegamos! (D34). Tocados na notificação, eles gravam pela mesma `mutate` da tela e tentam enviar a fila, com o app fechado (D41).

- **Os tipos** (cada um liga e desliga em `/viagens/<id>/avisos`): Sair em N min, Hora de sair, Parada fechando, Briefing da manhã (com o clima numa segunda linha), Véspera (às 19h, com o que falta nas listas), Prazo de cancelamento (na véspera, às 10h), Time (desligado por padrão) e Retrospectiva pronta (às 9h do dia seguinte ao fim).
- **A permissão** é pedida por uma folha, uma vez por aparelho e viagem, só com viagem em até 7 dias e nunca na primeira abertura (D48).
- **O calendário:** um `.ics` com alarme antes de cada "sair às", a rede de segurança sem push e sem servidor (D44).

### Offline e sincronização

O Dexie é a fonte de verdade da tela. Toda escrita passa por `mutate` (`src/lib/db/mutate.ts`), que atualiza a linha local e enfileira a operação na `outbox` na mesma transação. Os ids nascem no aparelho (UUID v5 determinístico quando há chave natural, para dois aparelhos sem sinal escreverem a mesma linha em vez de colidirem).

O motor de sync (`src/lib/db/sync/engine.ts`) roda numa aba por vez. Ele funde e ordena a fila (pais antes de filhos), chama `sync_push`, depois `sync_pull_user` e `sync_pull` por viagem, e aplica o resultado numa transação; os outros aparelhos recebem um aviso pelo Realtime e puxam. O conflito se resolve **por coluna** (`field_versions` e o trigger `sync_guard`): o Chegamos! marcado sem sinal às 14:00 e a observação editada em casa às 14:30 ficam os dois. Excluir grava uma lápide (`deleted_at`), que o pull leva aos outros aparelhos.

O chip do cabeçalho mostra "Sem conexão" ou "N pendentes" e abre a lista, com "Tentar de novo" e "Descartar". Uma falha de rede não conta tentativa (D17), e o app se recupera sozinho em segundos quando a rede volta (D111). "Sair da conta" tenta enviar e depois apaga o banco local (D20).

### O expurgo e o aparelho atrasado

A Edge Function `purge`, chamada pelo `pg_cron` às 4h de São Paulo com a chave secreta do Vault (como a `send-notifications`), apaga de vez o que já passou do prazo:

- **Viagens excluídas há mais de 30 dias** saem do banco inteiras: dias, paradas, reservas, listas, contatos, gastos, memórias, anexos, trilhas e participações. O XP e as conquistas de cada pessoa ficam, sem a viagem; o registro das importações também, até sair com os outros registros do servidor.
- **Lápides de viagens vivas** saem com 90 dias. O expurgo grava um horizonte por viagem: quando volta um aparelho que ficou mais de 90 dias sem puxar, o servidor responde `resync` com o retrato inteiro, e o aparelho apaga só o que o servidor não tem mais e não está pendente. Nada da outbox nem da fila de fotos se perde, e os caches recalculáveis (rotas, clima, o estado da maquete, os arquivos) ficam.
- **Registros do servidor** (avisos enviados, chamadas de função, importações, laboratório) saem com 90 dias.
- **Arquivos do Storage** saem pela API do Storage (apagar a linha de `storage.objects` por SQL não apaga o arquivo): os das viagens expurgadas e os sem linha viva há mais de 7 dias. A folga existe porque o arquivo sobe antes da linha (D78).

Com `dry_run`, a função devolve as contagens sem apagar nada; o laboratório faz um por dia. O log é uma linha só com contagens, nunca conteúdo. Os prazos e o handler moram em `supabase/functions/_shared/purge.ts` (testado pelo Vitest); a parte do banco é a função SQL `public.purge`, da migration 0012.

### Modo Viagem e a maquete 3D

O "Agora" diz onde o carro está (a última parada concluída), a próxima e o "sair às": o horário da próxima menos o deslocamento até ela, a mesma conta dos avisos (D29). Cada toque em Partiu! ou Chegamos! tem "Desfazer" por 10 s. O tema noturno vale das 18:30 às 6:00 enquanto o Modo Viagem está aberto. O modo painel usa a posição do celular para marcar sozinho: Partiu! só depois de ver o carro na parada, Chegamos! depois de 3 minutos no destino (D47).

A maquete (`src/features/world`) desenha o dia visto de cima: o traçado em S entre as paradas, o relevo do perfil de altitude real, o cenário lido da geografia (`src/lib/geo`), o carro da viagem (`src/art/cars`) e, em HTML por cima, as pílulas das paradas. A câmera fica parada com o dia inteiro na tela e só mergulha nas curiosidades do caminho. Motor: `three/webgpu` (WebGPU onde há, WebGL2 nos demais) com React Three Fiber, render sob demanda (parado, zero quadros) e dois níveis de qualidade, Leve e Alta, com rebaixamento automático por fps. Tudo do 3D vem num chunk próprio, só quando a maquete vai aparecer.

- **Replay ao abrir:** o carro repõe o que aconteceu desde a última vez que este aparelho viu a maquete (`travel_state`). Com "reduzir movimento", aparece o card "Desde a última vez".
- **Forçar a lista:** `?render=list` na URL, ou "Ver como lista" no rodapé de "Lista do dia" (fica guardado no aparelho). Sem WebGL2, a lista aparece sozinha, com "Maquete indisponível neste aparelho".
- **Chip de diagnóstico:** em dev, ou com `?diag=1` em produção: fps (só em movimento), motor, qualidade e nível; o toque alterna Auto → Leve → Alta. Para medir fps no iPhone: `/viagens/<id>/viagem?diag=1`, "Rever o dia", e ler o chip durante o movimento.

### Garagem

`/viagens/<id>/garagem`, aberta pelo carro no topo da visão geral: um showroom 3D (`src/features/garage`) em que o carro da viagem gira num disco sob luz de estúdio. Arrastar gira, na vertical inclina, pinçar aproxima. Embaixo, Modelo, Pintura e Acessórios.

- **Os carros:** cinco modelos por código, cada um um `CarProfile` que gera o 3D (`buildCar`) e a vista lateral em SVG (`CarSide`), usada no card da viagem, na visão geral e na garagem sem 3D.
- **O que está liberado** vem do progresso do time (o maior nível e a união das conquistas dos membros). Tocar em algo bloqueado abre a prévia, que nunca grava.
- **Cada escolha** grava só a coluna tocada (`car_model`, `car_color` ou `car_accessories`) pela outbox, e funciona offline.
- **`?garagem=tudo`** libera tudo para conferência visual, só em `pnpm dev`: o build de produção nem contém o código.

### Reservas, fotos e anexos

As fotos das memórias ("Como foi?", no Modo Viagem e no diário) e os prints e PDFs das reservas ficam no bucket privado `attachments`, em `{viagem}/{anexo}.{ext}`, e abrem sem sinal a partir de uma cópia no aparelho (`src/lib/media`).

- **Tamanhos:** a foto vira JPEG de até 1600 px e cerca de 400 KB, sem EXIF (inclusive sem a localização); o print de reserva, JPEG de até 2400 px; o PDF vai como está, até 10 MB. A compressão roda num worker, sem rede. Cada foto leva um thumbhash, o borrão que aparece antes do arquivo.
- **Fila de envio:** a foto entra na hora, mesmo sem sinal, com o selo "aguardando sinal". Com rede, o arquivo sobe primeiro e só depois a linha nasce: o servidor nunca tem linha sem arquivo. No Android, o service worker envia quando o sinal volta, mesmo com o app fechado (Background Sync); no iPhone, na próxima abertura.
- **Cache no aparelho:** ao abrir uma viagem em andamento ou futura com rede, o app baixa os anexos que faltam, documentos primeiro. O despejo nunca tira anexo de viagem em andamento ou futura; das passadas, saem primeiro as fotos menos usadas, até caber no orçamento (o menor entre 1 GB e 40% da cota do navegador).
- **PDF no iPhone instalado:** abre num visualizador próprio (pdf.js, carregado só quando um PDF abre), porque o Safari no modo app não abre PDF de Blob.
- **Reservas:** data e hora de parede de São Paulo; o telefone digitado à brasileira vira E.164; o "Ver reserva" aparece no "Agora" quando a parada atual ou a próxima tem reserva.
- **Liberar espaço sem sair da conta:** no iPhone, Ajustes › Safari › Avançado › Dados de Sites; no Android, Chrome › Configurações do site › Armazenamento. Tudo volta do servidor na próxima abertura com rede.

### Listas e missões

`/viagens/<id>/checklists`, com as abas **Antes de viajar**, **Mala** e **Missões** (`src/features/checklists`). Adicionar é um campo no fim da lista; marcar grava quem e quando, na cor da pessoa; reordenar é pela alça; excluir tem Desfazer. Tudo offline.

- **Pronto para partir:** quando Antes e Mala chegam a 100% antes do início, o cartão com confete aparece uma vez por viagem e aparelho, e vale a mala de teto do carro.
- **Sugestões** calculadas por regra, nunca gravadas antes do toque (`suggestions.ts`): uma missão por parada pelo tipo dela e itens de mala pela geografia das rotas (praia, serra). "Adicionar" grava; a dispensada nunca volta (D96).
- **Na estrada,** a folha "Como foi?" mostra as missões da parada com "Feito". Nenhuma missão premia velocidade nem exige quem dirige; a de vinícola registra rótulo e foto, nunca consumo.

### Contatos

`/viagens/<id>/contatos` (`src/features/contacts`): os contatos por tipo, com **Ligar** (`tel:`) e **WhatsApp** (`wa.me`, só para celular) em botões de 48 px. A emergência fica sempre no topo, como constantes que funcionam sem internet: SAMU 192, Bombeiros 193, Polícia Militar 190 e Polícia Rodoviária Federal 191. Os telefones das reservas aparecem sozinhos, marcados "da reserva". "Salvar no celular" gera um `.vcf` (vCard 3.0).

### Gastos

`/viagens/<id>/gastos` (`src/features/expenses`): a barra do total contra o orçamento (sempre com o valor e a porcentagem em texto), os totais por categoria e a lista por dia, com quem pagou na cor da pessoa. As somas são em centavos. O "+ Gasto" do Modo Viagem abre com o dia, a parada e a categoria pelo tipo dela, e nunca abre sozinho. "Lançar como gasto" numa reserva com valor cria o gasto ligado a ela, com id determinístico: dois aparelhos que lançam a mesma reserva escrevem a mesma linha.

### Progressão

XP, níveis e as 15 conquistas (`src/features/progression`), sem ranking. As regras (`rules.ts`, puro) derivam dos dados o conjunto inteiro de XP e conquistas da pessoa; o motor grava só o que falta, somente-anexar, com id determinístico. Desmarcar não tira XP, remarcar não dá de novo. Nada é gravado enquanto a ação tem menos de 12 s, para o Desfazer valer (D117). O nível do time é o maior nível dos membros, pelo resumo público no perfil (D113). O cartão de desbloqueio sai num momento calmo, um por vez, nunca por cima de outra folha. Regras e divergências: D112 a D120.

### Retrospectiva

`/viagens/<id>/retrospectiva` (`src/features/retrospective`), do dia seguinte ao fim em diante, quando a viagem teve parada concluída.

- **O filme "Viajei!", 15 s:** a maquete da viagem inteira, a câmera descendo até o carro, o sobrevoo com o chip de cada dia, as fotos e as missões, e o card final com dias, paradas, horas de estrada e km (só dos trechos rodados, pela rota real), o gasto contra o orçamento e as conquistas. Com reduzir movimento, sem WebGL ou com `?render=list`, uma sequência de cards.
- **Vídeo vertical, 1080 × 1920, sem som:** quadro a quadro, codificado pelo WebCodecs (H.264 em MP4; VP9 em WebM onde não há H.264) e montado pela `mediabunny`, num chunk carregado só ao exportar (D122).
- **Cards como imagem**, em feed (4:5) e stories (9:16), desenhados em Canvas 2D pelo mesmo código do filme. Compartilhar pela folha do aparelho, ou download. Tudo funciona sem sinal.

### Importar com IA

`/viagens/<id>/importar` (`src/features/import`): a pessoa cola o roteiro (a conversa do WhatsApp, as notas, os e-mails de reserva), a IA lê e o roteiro aparece aos poucos. Nada entra na viagem sem a revisão, e a importação acrescenta, nunca apaga.

- **A função `import-itinerary`:** `claude-sonnet-5-5` com saída estruturada (o JSON Schema derivado do `importSchema`, sem coordenadas), repassada por SSE. Roda como a pessoa (RLS vale, sem chave secreta do Supabase) e para em 140 s, abaixo dos 150 s do plano Free. O texto colado e a resposta nunca vão para log nem para o banco: `ai_imports` guarda só o tamanho, os tokens, o modelo, o estado e um código curto.
- **Limites:** 30.000 caracteres por leitura e 20 leituras por pessoa em 24 h; a recusa diz a hora em que a cota volta.
- **Revisão:** cada parada, reserva, contato, item e missão entra ou não; campo vazio fica vazio; cada "não classificado" vai para onde a pessoa mandar. O lugar vem de um link do Maps no texto ou da busca do Nominatim. O rascunho e a revisão ficam no aparelho até salvar.
- **Salvar** é uma transação da `mutate` (`mutate.batch`), pela outbox, com `source: 'ai'` nas paradas e nos itens.
- **Custo e chave:** veja Custos e Contas e segredos. Decisões: D127 a D140.

### Mapa e clima

`/viagens/<id>/mapa` (`src/features/map`) e a previsão do tempo (`src/features/weather`, com as regras puras em `supabase/functions/_shared/weather.ts`, as mesmas do aviso da manhã).

- **O mapa** fica fora do Modo Viagem e não é GPS: sem "você está aqui", sem pedir a posição, sem rota passo a passo. Leaflet 1.9 pelo react-leaflet 5, num chunk só da rota. A rota real de cada dia vem do Dexie e, sem rota, um traço reto pontilhado; o trecho entre paradas concluídas é o rodado; no dia de hoje, a trilha de quem compartilha a posição e o carro no último ponto ("Visto às 14:02").
- **Os tiles do OSM** (`src/lib/map/tiles.ts`, o único lugar com a URL): só `tile.openstreetmap.org`. A política de uso não permite uso offline nesse servidor: o app **nunca baixa antes** os tiles da rota nem "salva uma área". O service worker guarda só os tiles que a pessoa já viu (30 dias, 1.500 entradas), e sem rede o mapa mostra esses, com a linha e os pinos do Dexie. O app não define `Referrer-Policy`: o `Referer` que a política exige vai sozinho.
- **O clima** vem do Open-Meteo direto do navegador: uma chamada para a viagem inteira, com onde cada dia começa e termina e a hora de cada parada com horário escrito. Previsão até hoje + 15. Guardado no Dexie, vale 1 h durante a viagem e 6 h antes; sem rede, mostra o que tem com "atualizado às". Sem previsão, nada aparece.
- **O briefing da manhã** ganha o clima numa segunda linha: a `send-notifications` faz uma chamada por lote, com prazo de 3 s, e sem resposta manda o aviso sem clima (D148).
- Decisões: D141 a D153.

## Atribuições

| Dado                                   | Fonte                                                                                                | Licença                          | Onde aparece                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Mapa                                   | tiles do [OpenStreetMap](https://www.openstreetmap.org/copyright) (© colaboradores do OpenStreetMap) | ODbL                             | "© OpenStreetMap", com link para a página de copyright, sempre visível no canto do mapa (D149)               |
| Busca de endereço                      | Nominatim (OpenStreetMap), no máximo 1 pedido por segundo, com cache no aparelho (D31)               | ODbL                             | "Dados © colaboradores do OpenStreetMap" junto dos resultados, no formulário da parada e na importação       |
| Clima (e a altitude da rota pelo OSRM) | [Open-Meteo](https://open-meteo.com/)                                                                | CC BY 4.0                        | "Dados do tempo: Open-Meteo.com" na faixa da visão geral, na página do dia e na folha do pino do mapa (D149) |
| Rotas                                  | OpenRouteService (HeiGIT); sem chave ou sem cota, o OSRM público                                     | termos de cada serviço           | o cartão da rota diz quem a calculou                                                                         |
| Linha de costa                         | [Natural Earth](https://www.naturalearthdata.com/) 1:10m, v5.1.1                                     | domínio público                  | dados embutidos (`src/lib/geo/data/coast.json`)                                                              |
| Biomas                                 | IBGE, Biomas do Brasil 1:250.000                                                                     | uso livre com atribuição ao IBGE | dados embutidos (`biomes.json`)                                                                              |
| Municípios: nome, UF e centroide       | [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros)                  | MIT                              | dados embutidos (`municipalities.json`)                                                                      |
| Municípios: população                  | IBGE, API SIDRA, tabela 6579, variável 9324 (população residente estimada)                           | uso livre com atribuição ao IBGE | idem                                                                                                         |

Os dados embutidos ficam em `src/lib/geo/data/`, gerados por `pnpm geo:build`; fontes, recorte e precisão em [`docs/dados-geo.md`](docs/dados-geo.md). O IBGE pede "Fonte: IBGE" na tela que mostrar bioma ou população; hoje os dois só entram na leitura do cenário, e nenhuma tela mostra um ou outro como dado.

## Licenças que pedem atenção

São duas:

- **`react-leaflet` 5.0.0: Hippocratic-2.1.** Uma licença ética, que a OSI não aprovou: além das condições comuns, ela restringe usos que violem direitos humanos. Fica porque é a stack aprovada (D143). Se um dia ela for um problema, a alternativa é o Leaflet puro (BSD-2) numa classe, como o `WorldRuntime` da maquete. Antes de qualquer uso fora de um projeto pessoal, leia o texto inteiro.
- **`mediabunny` 1.62.1: MPL-2.0.** Copyleft por arquivo: usar o pacote como está não muda nada no resto do código; quem alterar os arquivos dele tem de publicar essas alterações sob a mesma licença (D122).
