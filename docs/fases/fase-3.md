# Fase 3 · Roteiro, rota real e trilha

> Você é o agente de implementação da **fase 3** do Viajei. Este chat faz só esta fase. Ao terminar: um commit, resumo curto, `docs/decisoes.md` e a memória do projeto atualizados. O prompt da fase 4 sai do chat de planejamento; não comece a fase 4.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v3): seções 2 (regras), 4.2, 4.3, 5, 6.2, 6.3, 7, 8, 9.2, 12 (linha da fase 3), 13 e 16 (seed).
2. `docs/decisoes.md`: D1 a D22. Em especial D8 (`to_char` no id de `trip_days`), D12, D14, D15, D16.
3. `docs/passo-0-2026-11-04.md`, seção 5, migration `0004_roteiro.sql`: é a base da DDL desta fase. Aplique as correções C1 (`to_char(date, 'YYYY-MM-DD')`) e C10 (`trip_members.share_position`) do `docs/passo-0-delta-2026-11-04.md`.
4. A memória do projeto (bloco "Ambiente e armadilhas" e o levantamento feito ao fim da fase 2).

## 1. Estado do repositório ao começar

- Fases 1 e 2 commitadas na `main` (último commit `db5d2bd`), CI verde, produção em https://viajei-mauve.vercel.app apontando para o projeto Supabase `iihwideuknnrpvtczxjs` (sa-east-1). Migrations 0001 a 0003 aplicadas no remoto.
- Existe: auth, perfil, convites, Dexie v1 com `mutate` e outbox, motor de sync (Web Locks, coalesce, rank, backoff, Realtime por `trip:<id>`), chip "Sem conexão / N pendentes", sessão em IndexedDB, PWA (SW `injectManifest`, manifest, ícones no build, instalação, nova versão), CRUD de viagens e membros. Testes: 55 Vitest, 65 pgTAP, 8 Playwright.
- Pastas: `src/app`, `src/components/ui`, `src/features/{auth,profile,pwa,sync,trips}`, `src/lib/{auth,db,ids,pwa,supabase}`, `supabase/functions/_shared` (vazio), `supabase/templates` (e-mails pt-BR), `supabase/tests/01..05`.
- Scripts úteis: `pnpm db:start`, `db:reset`, `db:test`, `db:types`, `test`, `test:e2e`, `remote:db-push`, `remote:config-diff`, `remote:config-push`. Os `remote:*` carregam `.env.local` no shell antes da CLI.

### Armadilhas conhecidas (não redescubra)
- `nvm use` antes de tudo (Node 22.23.4). Se o shell não achar o pnpm: `export PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"`. Docker Desktop aberto para `supabase start`.
- As permissões do Claude Code **bloqueiam ler e escrever qualquer `.env*`**, inclusive `.env.example`. Só `git show HEAD:.env.example` funciona. Edição em `.env.example` é feita pelo Douglas. Scripts que precisam de segredo carregam `.env.local` dentro do shell, como os `remote:*`.
- Supabase CLI 3.0: `db push` sem `--remote` mira o stack local; `link` ignora `-p`; `supabase functions deploy <nome>` é remote-only pelo projeto linkado; `env()` no `config.toml` vira string vazia sem erro quando a variável falta.
- Vite varre todo `*.html` da raiz: `optimizeDeps.entries: ['index.html']` já está configurado; não mova HTML para a raiz.
- Node 22.23 executa `.ts` direto (strip types): sirva-se disso em `scripts/geo/build-data.ts`.
- Postgres aplica a policy de SELECT à linha nova em `INSERT ... ON CONFLICT`/`RETURNING` (D12).

### Levantamento já feito (versões de 04/11/2026)
`fractional-indexing` 4.0.0 · `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 · `shapefile` 0.6.6 · `@supabase/server` 1.9.2. Open-Meteo Elevation aceita 100 pontos por chamada. Biomas do IBGE só confirmados em 1:250.000 (`geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip`). Municípios com lat/lng e população: repositório `kelvins/municipios-brasileiros` (MIT). Linha de costa: Natural Earth. Reconfira com `pnpm view` antes de fixar.

## 2. Ação do Douglas nesta fase

A chave do OpenRouteService **ainda não existe**. Peça, logo no início, que ele crie uma conta pessoal em openrouteservice.org, gere uma chave e coloque em `.env.local` como `ORS_API_KEY`, e acrescente a linha `ORS_API_KEY=` ao `.env.example`. Enquanto a chave não chega, desenvolva a Edge Function contra o OSRM público (geometria) e o Open-Meteo Elevation (altitude), que é o caminho de desenvolvimento previsto no prompt.

## 3. Entregas

### 3.1 Migration `0004_roteiro.sql` (+ pgTAP `06_roteiro.test.sql`)
- `trip_days`: id = `uuid_generate_v5(trip_id, to_char(date, 'YYYY-MM-DD'))` conferido por `check`; `unique (trip_id, date)`; `unique (id, trip_id)` para as FKs compostas; sem `position`, sem `theme`. Rank 30.
- `stops`: como na DDL base (posição fracionária `text collate "C"`, `kind` com os nove códigos, `closes_at`, `departed_at`, `done_at`, `done_by`, `skipped`, `lat`/`lng` com os checks), FK composta `(trip_day_id, trip_id)`. Rank 40.
- `trip_tracks`: como na DDL base, id `v5(trip_day_id, user_id)`, policy restritiva "só a própria trilha". Rank 50. Fica pronta para a fase 4; esta fase não grava trilha.
- `trip_members.share_position boolean not null default true` (C10). Só o próprio membro muda a sua; o dono não muda a dos outros. Escolha o mecanismo mais limpo (grant de coluna + policy própria + checagem no `sync_guard` ou trigger) e explique em `decisoes.md`.
- `edge_calls (id, user_id, fn text, created_at)`, RLS só as próprias linhas, índice `(user_id, fn, created_at)`. Serve de limite diário genérico para as Edge Functions: `route-day` agora, `import-itinerary` e `send-notifications` depois. Registre em `private.sync_tables`? **Não**: não é sincronizada.
- Por que FKs compostas: a checagem de FK ignora a RLS; sem `(x_id, trip_id)` um membro da viagem A apontaria uma parada para um dia da viagem B só sabendo o id.
- pgTAP: membro vê e não-membro não vê; FK composta recusa dia de outra viagem; `check` do id do dia confere; `share_position` só pela própria pessoa; `trip_tracks` só do próprio; `edge_calls` só as próprias.

### 3.2 Dexie v2
Stores novos: `trip_days: 'id, trip_id, [trip_id+date]'`, `stops: 'id, trip_id, [trip_day_id+position]'`, `trip_tracks: 'id, trip_id, trip_day_id'`, `routes: 'trip_day_id'` (cache local, nunca sincronizado), `geocode: 'query'` (cache de buscas). Suba a versão; a outbox não se toca.

### 3.3 Dias derivados das datas
- Ao salvar uma viagem (criar ou mudar datas), o client cria os `trip_days` que faltam, com id determinístico, via `mutate` (um `upsert` por dia, idempotente nos dois lados).
- Encurtar as datas: dias que saem do intervalo e **não têm paradas** recebem `deleted_at`. Dias com paradas bloqueiam a mudança com uma mensagem que lista as paradas; a pessoa move ou exclui antes. Nada é apagado por acidente.

### 3.4 Paradas
- Formulário com `react-hook-form` + Zod (`_shared/constants.ts` é a fonte dos tipos e rótulos pt-BR).
- Busca de endereço pelo **Nominatim**: por botão ou pausa de digitação, nunca por tecla; no máximo 1 requisição por segundo; resultados guardados em `geocode`. O navegador envia o `Referer` do app, que identifica o uso. Mostre a atribuição do OpenStreetMap onde os resultados aparecem.
- **Colar link do Google Maps**: parser puro para os formatos com `@lat,lng`, `?q=lat,lng`, `/place/...` e `!3dlat!4dlng`. Links curtos `maps.app.goo.gl` não dá para expandir do navegador (CORS); mostre "abra o link e cole o endereço completo".
- Deep links: Google Maps e Waze com lat/lng quando houver, senão com o endereço (`lib/links`, puro).
- Reordenar: `@dnd-kit/sortable` com alça, sensor de toque com atraso, mais botões subir e descer. Posição com `fractional-indexing`: um arrasto gera um patch só.
- `travel_minutes_to_next` manual; quando a rota do dia existir, os trechos **sugerem** o valor para paradas sem ele, e a pessoa confirma.
- `closes_at` no formulário; o seed tem cinco casos.

### 3.5 Edge Function `route-day`
- Deno com `@supabase/server` (`withSupabase({ auth: 'user' })`), `verify_jwt` ligado, sem chave secreta.
- Entrada: `{ waypoints: [[lng, lat], ...] }` com 2 a 25 pontos. Saída: `{ provider, fetched_at, geometry: [[lng, lat], ...], legs: [{ distance_m, duration_s }], elevation: [[dist_m, alt_m], ...] }` com amostra a cada 2 km.
- Produção: OpenRouteService `directions/driving-car` com `elevation = true` (a resposta já traz altitude por coordenada). Desenvolvimento, ou sem `ORS_API_KEY`: OSRM público para a geometria e Open-Meteo Elevation para a altitude, em lotes de 100 pontos.
- Limite: 50 chamadas por usuário por dia em `edge_calls`; acima disso, 429 com mensagem pt-BR.
- Client: chamada pelo TanStack Query (dado exclusivo de servidor), cache em `routes` por hash das coordenadas, recalculado só quando as coordenadas mudam, botão "atualizar rota" no dia. Offline, usa o que está em cache.
- Script `remote:secrets-push` que carrega `.env.local` no shell e roda `supabase secrets set ORS_API_KEY="$ORS_API_KEY"` **só para as variáveis nomeadas**, nunca `--env-file` com o `.env.local` inteiro. Deploy com `supabase functions deploy route-day`.
- Reconfira a cota do plano gratuito do ORS ao criar a chave; a página de planos não respondeu em 04/11.

### 3.6 `lib/geo`: dados embutidos e leitura do lugar
- `scripts/geo/build-data.ts` (Node 22, `.ts` direto): baixa e converte linha de costa (Natural Earth, resolução que caiba), biomas IBGE 1:250.000 simplificados e municípios com população, gera `src/lib/geo/data/*` committados, com orçamento total de ~200 KB. Documente fontes, licenças e como regenerar em `docs/dados-geo.md`. Os arquivos brutos baixados ficam fora do git.
- Funções puras, testadas com Vitest sobre fixtures (a rota do seed e a rota São Paulo → Ubatuba do protótipo): `projectOntoRoute` (fração percorrida), `distanceToCoast`, `nearestMunicipality` (com população), `biomeAt`, `classifySegments(route, elevation)` → cerca de quatro partes por dia (cidade grande, interior, plantação, praia; serra pela inclinação) com transições suaves, `curiosities(route, elevation, segments)` → lista com posição e legenda ("desce 640 m em 7 km", "o mar a menos de 2 km", ponto mais alto, entrada de cenário), `geofence` (chegada: raio 150 m e 3 min; saída: raio 300 m). A fase 5 desenha; esta fase calcula.
- Fora do Brasil: só altitude e costa, cenário genérico. Não quebra.

### 3.7 Modo Viagem desta fase: "Agora" + lista acessível
- Rota `/viagens/:tripId/viagem`. Dia atual: hoje; senão o próximo; senão o último. Durante a viagem, `/` redireciona para cá.
- Cabeçalho **"Agora"**: próxima saída grande, **"sair às HH:MM"** (horário da próxima parada menos o deslocamento), anel de contagem com os estados verde, âmbar (< 15 min) e vermelho (atrasado), botões **Partiu!**, **Chegamos!** e "Pular", aviso quando a parada atual está perto do `closes_at`. Escritas via `mutate` (`departed_at`, `done_at` + `done_by`, `skipped`).
- Semântica: o carro fica no último nó concluído, o halo pulsa no próximo, Partiu! põe o carro na estrada. Nesta fase o "carro" é a lista acessível da trilha, que permanece como fallback permanente. A maquete 3D entra na fase 5 por cima desta estrutura, então deixe os estados e os seletores prontos para reuso.
- Texto ≥ 17 px aqui, alvos ≥ 48 px, tema noturno automático à noite (regra simples por hora nesta fase).
- `lib/time`: `leaveAt`, `countdownState`, `currentDay`, formatos pt-BR, tudo com `date-fns` sobre `date + time`, nunca `Date` em UTC.

### 3.8 Schema de importação e seed
- `supabase/functions/_shared/import-schema.ts` (Zod 4, importado no front por `@shared`): `days[] { date, title | null, stops[] { time | null, kind, name, address | null, closes_at | null, travel_minutes_to_next | null, notes | null, url | null, lat | null, lng | null } }`, `reservations[]`, `contacts[]`, `checklist_before[]`, `checklist_pack[]`, `quests[] (≤ 8, com stop_ref)`, `unclassified: string[]`. Opcionais como união com `null`; sem `min`/`max`, sem recursão (exigência da saída estruturada da fase 10).
- `supabase/seed/viagem-rs.json` com a viagem da seção 16 do prompt, completa. Coordenadas das paradas geocodificadas **uma vez** pelo Nominatim e gravadas no arquivo (coordenada nunca vem de IA, mas pode vir de geocoding).
- Botão "Carregar viagem de exemplo", só em dev, que valida o JSON com o schema e grava dias e paradas pela `mutate`. Reservas, contatos e listas entram quando as fases delas existirem; o carregador é estendido por fase.
- O mesmo arquivo é fixture dos testes do schema.

### 3.9 Testes e documentação
- Vitest: `leaveAt`, `countdownState`, `currentDay`, deep links, parser do Maps, posições fracionárias, sugestão de deslocamento, `projectOntoRoute`, `classifySegments`, `curiosities`, `geofence`, schema com o seed e com casos inválidos.
- pgTAP: itens da 3.1.
- Playwright: estender o smoke: criar dia e parada, abrir o Modo Viagem e ver o "sair às" e o Partiu!.
- `docs/decisoes.md`: D23 em diante, uma entrada por decisão não óbvia (mecanismo do `share_position`, resolução dos dados geográficos, estratégia de fallback da rota, bloqueio ao encurtar datas, etc.).
- `docs/dados-geo.md`: fontes, licenças, regeneração.

## 4. Como trabalhar nesta fase

1. **Antes de codar**, apresente em uma mensagem: a DDL final da 0004 com as diferenças em relação à base, o contrato da `route-day`, o plano dos dados geográficos (fontes, resolução, tamanho estimado) e um wireframe em texto do "Agora". Peça a chave do ORS. **Espere o ok.**
2. Desenvolva com `supabase start` local. Ao fim: `pnpm remote:db-push`, `supabase functions deploy route-day`, `pnpm remote:secrets-push` (depois da chave), push na `main` (deploy automático), e confira o "Agora" na produção pelo iPhone.
3. Commit único `fase 3: roteiro, rota real e trilha`. Resumo curto, `decisoes.md` e memória atualizados (estado, armadilhas novas, levantamento útil à fase 4: notificações push, `pg_cron` + `pg_net`, VAPID, service worker com `mutate`, catch-up, `.ics`).
4. Regras permanentes: elegância sobre velocidade; experiência acima do custo; não é jogo nem GPS; iPhone primeiro, Android igual; nada depende do app aberto; nada em conta de cliente; nenhum segredo no client.
