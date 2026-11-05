# Decisões técnicas

Um registro curto por decisão não óbvia: contexto, decisão, consequência. Em ordem cronológica.

## Fase 1 · Base (04/11/2026)

### D1 · React Compiler pelo Babel, não pelo compilador em Rust
**Contexto.** O `@vitejs/plugin-react` 6 oferece o compilador em Rust (`compiler: true`, via `oxc-transform-react`, marcado como experimental) e o caminho Babel (`@rolldown/plugin-babel` + `babel-plugin-react-compiler` 1.0).
**Decisão.** Babel com a versão 1.0 estável do compilador.
**Consequência.** Build um pouco mais lento; nenhum risco de compilar diferente da referência. Quando o caminho Rust sair de experimental, a troca é uma linha no `vite.config.ts`.

### D2 · Node 22.23 fixado em `.nvmrc`
**Contexto.** O react-router 8 exige Node 22.22+; a máquina tinha 22.17.
**Decisão.** `.nvmrc` com 22.23.4 e `engine-strict=true` no `.npmrc`, sem mudar o `default` do nvm (outros projetos continuam no deles).
**Consequência.** `nvm use` antes de trabalhar; a CI lê o `.nvmrc`.

### D3 · Dois temas com `@theme inline` apontando para variáveis cruas
**Contexto.** O Tailwind 4 gera utilities a partir do `@theme`, mas os valores de lá são estáticos.
**Decisão.** As cores que mudam com o tema vivem em `:root` (claro) e são redefinidas sob `prefers-color-scheme: dark` e `[data-theme]`; o `@theme inline` faz `bg-paper`, `text-ink` etc. apontarem para elas.
**Consequência.** Troca de tema sem classe `dark:` em cada elemento; os fixos (acento, estados, tipos de parada) ficam no `@theme` normal.

### D4 · Sessão por `getSession()` num store externo
**Contexto.** `getUser()` bate na rede; sem sinal, deslogaria quem está offline.
**Decisão.** Um `getSession()` no boot (lido do storage) e depois só `onAuthStateChange`, expostos com `useSyncExternalStore`.
**Consequência.** A rota protegida espera um estado `loading` curto; nada depende de rede para saber se há sessão.

### D5 · Convites reivindicados ao entrar, uma vez por sessão
**Contexto.** O convite fica em `trip_members` com o e-mail; só um e-mail confirmado pode reivindicá-lo (`claim_invites`).
**Decisão.** O layout autenticado chama `claim_invites` na primeira renderização com sessão e invalida a lista de convites.
**Consequência.** Quem se cadastra com o e-mail convidado vê o convite logo que confirma e entra.

### D6 · `sync_guard` tolera escrita sem `field_versions` (correção C4 do Passo 0)
**Contexto.** Uma operação sem `versions` gravava `field_versions = null` e, no trigger, `null ? coluna` fazia toda coluna inalterada ganhar versão nova.
**Decisão.** `coalesce(..., '{}')` no trigger e no `sync_push` (fase 2).
**Consequência.** Escritas do servidor (RPCs) continuam vencendo pela hora do servidor; nada mais muda de versão por acidente.

### D7 · `claim_invites` aposenta convite redundante em vez de colidir (C2)
**Contexto.** Convidar o e-mail de quem já é membro faria o `update` violar `unique (trip_id, user_id)` e derrubar a reivindicação dos outros convites.
**Decisão.** Primeiro marca `deleted_at` nos convites de viagens em que a pessoa já é membro; depois reivindica o resto.
**Consequência.** Nunca erra; o dono vê o convite redundante como encerrado.

### D8 · Índices do pull em `trip_members` (C7) e `to_char` no id de `trip_days` (C1, fase 3)
**Contexto.** `trip_members` não passa por `enable_trip_sync` e ficaria sem índice `(trip_id, synced_at)`; `date::text` depende do `DateStyle`.
**Decisão.** Índices criados na 0002; o `check` do id de `trip_days` usará `to_char(date, 'YYYY-MM-DD')`.
**Consequência.** Pull por cursor sem varredura; o UUID v5 do client e do banco batem em qualquer sessão.

### D9 · Testes de RLS com `request.jwt.claims` e `set local role`
**Contexto.** pgTAP roda como `postgres`; as policies só fazem sentido como `authenticated`.
**Decisão.** Cada arquivo cria `pg_temp.login(uuid)`, que define as claims do JWT e assume o papel `authenticated`, e cria os próprios usuários (tudo em transação, com rollback).
**Consequência.** Testes independentes do seed e do estado do banco; `supabase test db` roda na CI em minutos.

### D10 · Token da CLI do Supabase por variável, não por login
**Contexto.** Várias contas na mesma máquina; a CLI guarda um login só.
**Decisão.** `SUPABASE_ACCESS_TOKEN` da conta pessoal em `.env.local`.
**Consequência.** As contas de cliente ficam intocadas; o projeto nunca é criado na conta errada por engano.

## Fase 2 · Offline, PWA e viagens (04/11/2026)

### D11 · Auth do projeto hospedado versionado em `config.toml`, com `[remotes.production]`
**Contexto.** Site URL, redirects, SMTP e templates (em inglês) viviam só no painel. A CLI 3.0 tem `config push`, que altera **apenas o que o arquivo declara** e deixa o resto como está; a substituição `env(VAR)` vira string vazia quando a variável não existe, sem erro.
**Decisão.** A base do arquivo descreve o ambiente local (Mailpit, 1 s entre e-mails) e o que vale nos dois (templates em pt-BR, senha mínima 8, confirmação de e-mail ligada, TOTP desligado). O bloco `[remotes.production]` declara só o que difere: Site URL, redirects (produção e os previews da Vercel, que usam o mesmo projeto), limite de e-mails e o SMTP do Resend com `pass = "env(RESEND_API_KEY)"`. Os scripts `pnpm remote:*` carregam `.env.local` antes de chamar a CLI, porque um push sem a variável apagaria a senha do SMTP.
**Consequência.** O painel deixa de ser fonte de verdade; `pnpm remote:config-diff` mostra o que mudaria antes de aplicar; a chave do Resend nunca entra no git.

### D12 · O dono sempre vê a própria viagem (policy de SELECT de `trips`)
**Contexto.** Com `ON CONFLICT` (o upsert do `sync_push`) ou `RETURNING`, o Postgres aplica a policy de SELECT à linha nova. A viagem recém-inserida só é "de membro" depois do trigger que cria a participação do dono, então o insert caía em "new row violates row-level security policy".
**Decisão.** `using (owner_id = auth.uid() or is_trip_member(id))`, que é o que já era verdade. Não contornar no `sync_push` com exceções como fluxo de controle.
**Consequência.** O upsert continua set-based e barato; qualquer `insert().select()` do dono pelo PostgREST também passa a funcionar.

### D13 · Sessão do supabase-js em IndexedDB
**Contexto.** Na fase 4, o service worker precisa autenticar o envio da fila quando Partiu! ou Chegamos! vem do botão da notificação; service workers não enxergam localStorage.
**Decisão.** Adaptador `lib/supabase/idb-storage.ts` (IndexedDB cru, sem Dexie) com `storageKey: 'viajei-auth'`.
**Consequência.** A sessão mora num banco próprio (`viajei-auth`), que o service worker abre sem carregar o banco do app.

### D14 · A outbox só cresce; fusão e ordem acontecem na hora do push
**Contexto.** Fundir operações ao gravar exigiria ler e alterar entradas na transação de escrita e apagaria a história do que a pessoa fez.
**Decisão.** Cada `mutate` acrescenta uma operação; `coalesce` funde por linha e `orderByRank` põe pais antes de filhos ao montar o lote; a resposta do servidor remove todas as operações fundidas de uma vez.
**Consequência.** A escrita local é constante; "Pendentes" mostra cada edição; descartar é por operação.

### D15 · Linhas que o servidor deriva entram como projeção local, sem outbox
**Contexto.** A participação do dono nasce por trigger no insert da viagem. Se o client a enviasse, o upsert cairia na linha existente, a policy "dono remove" (só `role = 'member'`) não deixaria atualizar e a operação voltaria como `stale`.
**Decisão.** `mutate.project` grava no Dexie sem enfileirar; o pull substitui pela versão do servidor (mesmo id).
**Consequência.** A tela de membros mostra o dono na hora, offline, sem ruído na fila.

### D16 · `sync_pull` genérico para tabelas de escopo `user` que carregam `trip_id` (C6)
**Contexto.** Conquistas e XP (fase 9) são do usuário, mas a retrospectiva e a tela de membros precisam dos dados do time, que a policy já deixa ler.
**Decisão.** O loop do `sync_pull` inclui qualquer tabela da whitelist que tenha a coluna `trip_id`, consultando o catálogo.
**Consequência.** A fase 9 só registra as tabelas e cria os índices; a RPC não muda.

### D17 · Erro de rede não conta tentativa
**Contexto.** Um backoff que contasse tentativas transformaria "sem sinal por dois dias" em operações "com erro".
**Decisão.** Fetch sem resposta marca a conectividade como offline e para o ciclo; só erro do servidor no lote inteiro conta tentativa (1 s, 2 s, 4 s… até 60 s; na quinta, vai para Pendentes). Erro de regra numa operação (RLS, check, whitelist) vai direto para Pendentes, sem insistir.
**Consequência.** O chip diz "Sem conexão · N" sem culpar a operação; "Tentar de novo" zera o contador.

### D18 · Descartar uma pendência refaz a linha a partir do servidor
**Contexto.** Apagar só a operação deixaria a linha local com um valor que o servidor nunca viu.
**Decisão.** Descartar um `upsert` apaga a linha local e os filhos; descartar um `patch` zera o cursor da viagem, e o próximo pull traz a linha como o servidor a tem.
**Consequência.** Nenhuma edição fantasma sobrevive no aparelho.

### D19 · `revoked` apaga a viagem e as operações dela
**Contexto.** Quem foi removido pode ter operações pendentes daquela viagem; o servidor as recusaria para sempre (P0002).
**Decisão.** `wipeTrip` apaga linhas, cursor e as operações da viagem, com o aviso "Você saiu de X".
**Consequência.** A regra "a outbox nunca é apagada sem ter sido enviada" tem uma exceção explícita: operação sem destino.

### D20 · Sair da conta apaga o banco local, depois de tentar enviar
**Contexto.** Aparelho compartilhado: os dados de uma pessoa não podem aparecer para outra.
**Decisão.** `trySignOut` sincroniza; se sobrar pendência, a tela pergunta; `signOutNow` para o motor, encerra a sessão e apaga o Dexie. Ao entrar, se `sync_state.uid` for de outra pessoa, o motor zera o banco antes.
**Consequência.** Entrar de novo custa um pull completo; é o preço certo.

### D21 · Ícones do PWA gerados no build, não commitados
**Contexto.** PNGs no git envelhecem em relação ao SVG e ninguém lembra de regenerar.
**Decisão.** `@vite-pwa/assets-generator` pelo `pwaAssets` do plugin, a partir de `public/favicon.svg`: `any` como está, maskable e Apple com margem e fundo noite.
**Consequência.** `sharp` entra no build (CI e Vercel têm binário pronto); os PNGs gerados ficam no `.gitignore`.

### D22 · Service worker só no build
**Contexto.** Em dev, um service worker com precache serve versões velhas e atrapalha o Playwright.
**Decisão.** `devOptions` desligado; o e2e offline prova os dados (Dexie e outbox), não a casca; a casca offline, a instalação e "nova versão disponível" validam-se no preview e na produção da Vercel.
**Consequência.** `pnpm build && pnpm preview` é o jeito de ver o PWA localmente.

## Fase 3 · Roteiro, rota real e trilha (04/11/2026)

### D23 · `share_position`: grant de coluna, policy da própria linha e trigger `a_guard`
**Contexto.** Cada membro decide se compartilha a própria posição; o dono não muda a dos outros. No Postgres a policy é por linha e o grant é por coluna: nenhum dos dois diz "esta coluna só nesta linha".
**Decisão.** `grant update (share_position)`, uma policy permissiva "membros: a própria linha" (`user_id = auth.uid()`) e o trigger `a_guard` (antes do `b_sync`) que recusa `share_position` mudado por quem não é a pessoa e `deleted_at` em membro aceito por quem não é o dono. A policy restritiva de `trip_tracks` passa a mostrar a trilha dos outros só com o compartilhamento ligado.
**Consequência.** A policy nova abre a própria linha, então "sair da viagem" (membro aceito marcando o próprio `deleted_at`) é recusado pelo trigger até existir como funcionalidade. `decline_invite` e `claim_invites` continuam iguais porque só tocam convites pendentes. Quem já recebeu a trilha antes de o compartilhamento ser desligado fica com a cópia local; a fase 4 esconde no client o que `trip_members` disser.

### D24 · `edge_calls` e a RPC `edge_call(fn, limite)`
**Contexto.** As Edge Functions precisam de um limite diário por pessoa, genérico (`route-day` agora; `import-itinerary` depois).
**Decisão.** Tabela `edge_calls` com RLS "só as próprias" e a RPC `edge_call`, security invoker: conta as chamadas da função nas últimas 24 h, levanta `54000` acima do limite sem registrar, senão registra e devolve o total. A janela é móvel, não o dia civil.
**Consequência.** Uma ida ao banco por chamada, a regra num lugar só, sem fuso. A Edge Function mapeia `54000` para 429 com mensagem pt-BR.

### D25 · `route-day`: HeiGIT, trechos com instruções e queda para o OSRM
**Contexto.** A HeiGIT aposentou `api.openrouteservice.org` (desligamento na semana de 16/11/2026); o prompt cita o host antigo. Com `instructions: false` o ORS omite os `segments`, que trazem distância e duração por trecho.
**Decisão.** Host `api.heigit.org/openrouteservice/v2/directions/driving-car/geojson`, `elevation: true` e `instructions: true` (os passos são descartados no servidor). Sem `ORS_API_KEY`, ou se o ORS falhar por cota ou erro, a função cai no OSRM público com altitude do Open-Meteo em lotes de 100 e diz `provider` na resposta. "Sem rota" (códigos 2009 e 2010 do ORS, `NoRoute` do OSRM) vira 422, nunca cai no outro provedor. Geometria simplificada a 25 m; altitude amostrada a cada 2 km mais o fim.
**Consequência.** A chave vale só no host novo; a quota de Directions do plano Standard é 2.000 por dia e 40 por minuto (painel da HeiGIT em 04/11/2026). O cache em `routes` é por hash FNV das coordenadas com 5 casas: só recalcula quando uma parada muda de lugar ou a pessoa pede.

### D26 · Dados geográficos embutidos: fontes, resolução e formato
**Contexto.** A leitura do lugar roda no celular, offline, com orçamento de cerca de 200 KB.
**Decisão.** Natural Earth 1:10m para a costa (500 m de tolerância), IBGE 1:250.000 para os biomas (2 km), kelvins/municipios-brasileiros mais a estimativa de população do SIDRA (tabela 6579) para os 5.571 municípios. Codificação própria: milésimos de grau, deltas, zigzag, varint, base64; municípios em colunas. Tudo gerado por `scripts/geo/build-data.ts`, documentado em `docs/dados-geo.md`.
**Consequência.** 14 KB de costa, 45 KB de biomas e 125 KB de municípios (184 KB no total, menos ainda com brotli), num chunk carregado só quando a leitura é pedida. A costa tem erro de 1 a 2 km: "praia" é costa a até 4 km e a curiosidade diz "o mar a menos de 3 km".

### D27 · Classificação do cenário: prioridade, trechos mínimos e pontas intocadas
**Contexto.** Cerca de quatro partes por dia, com transições suaves, a partir de amostras de 2 km.
**Decisão.** Prioridade por amostra: cidade grande, praia, centro de cidade média, serra, plantação, interior (a praia vence o centro de uma cidade média, Ubatuba é praia; não vence uma metrópole). Trechos menores que 10 km ou 5% do dia são absorvidos pelo vizinho maior; o primeiro e o último nunca, porque são de onde se sai e aonde se chega; acima de seis partes, as menores são fundidas.
**Consequência.** São Paulo → Ubatuba lê "cidade grande, plantação, cidade grande, serra, praia"; o dia 1 do seed lê "plantação, interior, plantação, interior, cidade grande (Caxias do Sul), serra". Os limiares vivem como constantes em `segments.ts` e são ajustáveis sem mexer no algoritmo.

### D28 · Dias derivados das datas, com bloqueio ao encurtar
**Contexto.** Um dia por data, id `v5(trip_id, 'YYYY-MM-DD')`, criado pelo client. Encurtar a viagem não pode apagar paradas por acidente.
**Decisão.** `planDays` (puro) decide o que criar, restaurar, aposentar e o que bloqueia. `createTrip` e `updateTrip` chamam `syncDays`; com parada em dia que sairia, `updateTrip` lança `DaysBlockedError` com a lista das paradas antes de gravar qualquer coisa, e o formulário mostra a mensagem. Dia aposentado que volta ao intervalo é restaurado (`deleted_at = null`), não recriado, para não perder título e observações.
**Consequência.** Dois aparelhos sem sinal criam o mesmo dia e o `upsert` idempotente resolve; nada é apagado sem ação explícita da pessoa.

### D29 · Semântica do "Agora" e os nós de saída
**Contexto.** O carro fica no último nó concluído, o halo pulsa no próximo, Partiu! põe o carro na estrada. O seed modela as saídas como paradas `origin` e `transit` ("7h saída de Papanduva", "6h50 saída para Montenegro").
**Decisão.** `dayState` (puro): `at` = última com `done_at`; `next` = primeira sem `done_at` e sem `skipped`; "sair às" = horário da próxima menos o deslocamento de `at`, a mesma conta do `due_notifications` da fase 4. Em nó de saída (`origin`, `transit`), Partiu! grava `done_at`, `done_by` e `departed_at` de uma vez: "saímos de Papanduva" é uma ação só, e o nó nunca pede Chegamos!. Quando a próxima é a primeira do dia e não é nó de saída, o cabeçalho diz "próxima às". Na estrada, o anel conta até a chegada. Cada toque mostra um toast com "Desfazer" por 10 s, que devolve as colunas ao valor anterior.
**Consequência.** A fase 5 desenha por cima deste estado sem recalcular nada; a lista acessível é o fallback permanente. O tema noturno (18:30 às 6:00) entra por `data-theme="dark"` no `<html>` só enquanto o Modo Viagem está aberto.

### D30 · Dexie v2: índice `trip_day_id` em `stops` e store `geocode`
**Contexto.** A lápide de um dia remove as paradas por `childrenOf`, que consulta `where(fk)`; o índice composto `[trip_day_id+position]` não serve para isso.
**Decisão.** Versão 2 acrescenta o índice simples `trip_day_id` em `stops` e a store `geocode` (cache do Nominatim por consulta normalizada). As demais stores já existiam na v1.
**Consequência.** Migração automática do Dexie na primeira abertura; a `outbox` não se toca.

### D31 · Nominatim: fila de 1 por segundo, cache local e busca por intenção
**Contexto.** Regras do Nominatim: no máximo 1 requisição por segundo, identificação do uso, sem autocomplete por tecla.
**Decisão.** Uma fila única com 1,1 s entre chamadas; busca por botão, por Enter ou 900 ms depois da última tecla; resultados guardados em `geocode` e reaproveitados sem rede; atribuição do OpenStreetMap onde os resultados aparecem. O navegador manda o `Referer` do app.
**Consequência.** A mesma consulta nunca vai duas vezes à rede e funciona offline depois da primeira vez.

### D32 · Edge Functions fora do `tsc` e do ESLint do app
**Contexto.** `route-day/index.ts` é Deno: globais e import map próprios (`supabase/functions/deno.json`), que o `tsc` do app e o `projectService` do ESLint não entendem. `_shared` continua código dos dois lados.
**Decisão.** `supabase/functions/**` ignorado no ESLint, exceto `_shared/**`; o `config.toml` aponta `import_map` e `entrypoint` da função. O contrato (`_shared/route-schema.ts`) e a geometria (`_shared/geo.ts`) são testados pelo Vitest.
**Consequência.** A função é validada por `supabase functions serve` e pela chamada real; a lógica que importa está em `_shared`, coberta pelos testes.

### D33 · `/` redireciona para o Modo Viagem uma vez por abertura do app
**Contexto.** Durante a viagem, abrir o app tem de cair no "Agora"; mas o link "Viagens" precisa continuar funcionando.
**Decisão.** `HomePage` redireciona quando há viagem em andamento e guarda o id num `Set` de módulo: na mesma abertura, não redireciona de novo.
**Consequência.** Os testes e2e criam viagens com datas sempre no futuro (30 dias à frente), para o redirecionamento nunca pegar a suíte.

## Fase 4 · Uso com a tela apagada (05/11/2026)

### D34 · Payload único: declarativo (Safari) e imperativo (Chrome)
**Contexto.** O iOS 18.4+ lê o Declarative Web Push (`web_push: 8030`, `notification: { title, body, navigate, app_badge, … }`) sem acordar JavaScript; o Chrome entrega o JSON ao service worker e só ele mostra botões de ação. O post da WebKit confirma que, com SW instalado, o `push` ainda é despachado e a parte declarativa vira fallback.
**Decisão.** Um só JSON por aviso: a parte declarativa com `navigate` absoluto e `app_badge` como string (`"1"`, como no exemplo da WebKit), mais `actions` nossas (`departed` → Partiu!, `arrived` → Chegamos!). O SW sempre monta a notificação no `push` (Chrome precisa; no Safari a declarativa segura se o SW falhar ou tiver sido removido pelo ITP). `tag = stop:<id>` para "hora de sair" substituir "sair em 15 min"; `topic` do push service com o mesmo id, para a substituição valer também com o aparelho sem sinal.
**Consequência.** Um código de servidor para as duas plataformas; `_shared/notifications.ts` é a única fonte do texto e é testada pelo Vitest tipo a tipo.

### D35 · `claim_due_notifications`: o dedupe é um insert atômico
**Contexto.** O delta previa `due_notifications` + insert feito pela Edge Function; duas execuções sobrepostas do cron poderiam enviar duas vezes, e um crash da função engoliria o minuto.
**Decisão.** `claim_due_notifications(p_now)` insere em `notifications_sent` tudo o que venceu com `on conflict do nothing` e devolve só o que acabou de reservar, com as assinaturas vivas da pessoa; linhas `queued` sem `sent_at` há mais de 2 min voltam até `attempts = 3`. Os fatos ficam congelados em `data`, para a retentativa escrever o mesmo texto. `due_notifications` mantém o `not exists` para o cron não chamar a função nos 9 minutos seguintes a um envio.
**Consequência.** Nenhum aviso sai duas vezes; `security definer` em `public` com execute só para `service_role`, porque o PostgREST só expõe `public`.

### D36 · Janela de 10 minutos
**Contexto.** Com 2 min, um minuto perdido pelo cron (ou pela função) perderia o aviso.
**Decisão.** `scheduled_at` em `(t1 − 10 min, t1]`. O dedupe impede repetir; acima de 10 min o aviso é velho e não sai.
**Consequência.** Tolerância a atraso sem risco de "hora de sair" chegar meia hora depois.

### D37 · `enable_user_sync` e a policy restritiva de membro
**Contexto.** `notification_prefs` é a primeira tabela do outbox com escopo `user`; a fase 9 traz conquistas e XP.
**Decisão.** Procedimento irmão do `enable_trip_sync`: três policies "só as minhas" (`user_id = auth.uid()`), trigger `b_sync`, índice `(user_id, synced_at)`, registro com escopo `user`, sem broadcast. A exigência "só de viagem em que estou" entra como policy **restritiva** de insert (o `trip_id` é imutável).
**Consequência.** Pelo D16, o `sync_pull` da viagem também devolve a própria linha de preferências (redundância inofensiva); outros aparelhos da mesma pessoa recebem a mudança no próximo pull do usuário.

### D38 · `due_notifications` devolve fatos; o texto nasce no TypeScript
**Contexto.** O delta redigia título e corpo em SQL.
**Decisão.** A função devolve `data jsonb` (nome da parada, horário, deslocamento, lead, dia N de M, quem marcou…) e `_shared/notifications.ts` escreve o pt-BR. A conta do "sair às" é a do `dayState` (D29), com `at` = última concluída por `position` e `next` = primeira sem `done_at` e sem `skipped`; o teste de uma linha composta é `(st.next).id is not null`, porque `is not null` numa linha exige todos os campos.
**Consequência.** A fixture gêmea (`src/test/fixtures/dia-gemeo.ts` e `supabase/tests/07_notificacoes.test.sql`) confere os mesmos horários nos dois lados; redigir e traduzir é trabalho de uma função pura.

### D39 · `@negrel/webpush` e a chave privada em PKCS#8
**Contexto.** `npm:web-push` depende do `crypto` do Node; a edge-runtime é Deno.
**Decisão.** `jsr:@negrel/webpush@0.5.0`, só SubtleCrypto (RFC 8291/8292), testado na edge-runtime local. `VAPID_PRIVATE_KEY` em PKCS#8 base64url: o formato padrão de chave privada, que carrega o ponto público dentro; `_shared/vapid.ts` deriva o JWK e a pública raw, e o script `vapid:generate` confere que a pública derivada é a mesma que vai para o client.
**Consequência.** Uma variável secreta só no servidor, sem polyfill; o par é gerado uma vez e nunca trocado.

### D40 · Cron condicionado e Vault local por script
**Contexto.** Um `net.http_post` por minuto em dias sem viagem seria ruído; o `supabase db reset` apaga o Vault.
**Decisão.** O job roda a cada minuto, mas só chama a função `where private.has_due_notifications(now())`. URL e chave secreta vêm do Vault (`viajei_project_url`, `viajei_secret_key`), criadas uma vez pelo painel no hospedado e, no local, por `pnpm db:vault-local` (encadeado no `db:reset`), que grava `http://host.docker.internal:54321` e a `SECRET_KEY` do `supabase status` pelo psql do container, com o valor no stdin.
**Consequência.** Zero chamadas em dias sem viagem; o ambiente local tem o mesmo caminho cron → pg_net → Kong → edge-runtime que a produção.

### D41 · O service worker escreve pela mesma `mutate`
**Contexto.** Partiu! e Chegamos! pelo botão da notificação, com o app fechado, têm de produzir exatamente o que a tela produz.
**Decisão.** `src/sw/actions.ts` abre o Dexie, recalcula o `dayState`, confere que a parada ainda é a próxima e aplica `depart`/`arrive` (a mesma `mutate`, linha e outbox na mesma transação); depois tenta `pushOutbox` com um client supabase-js próprio sobre a sessão em IndexedDB, sob o Web Lock `viajei:sync` do motor. Estado velho (alguém marcou antes) não marca: abre o "Agora". `isNetworkError` saiu de `connectivity.ts` para `network-error.ts` para o SW não puxar `window` nem React.
**Consequência.** `sw.js` com Dexie, supabase-js e zod: 468 KB minificado, 131 KB gzip (medido no build), sem React. O Dexie propaga o `liveQuery` para a aba aberta.

### D42 · `push_subscriptions.origin`
**Contexto.** O `navigate` declarativo tem de ser uma URL absoluta, e produção, previews da Vercel e `localhost` compartilham o projeto Supabase.
**Decisão.** A assinatura grava a origem do app que assinou; a Edge Function monta o `navigate` por assinatura.
**Consequência.** Nenhuma variável de URL no servidor; cada aparelho volta para a origem que conhece.

### D43 · `team_arrived`: um aviso por parada e destinatário
**Contexto.** `synced_at` muda em qualquer edição da parada (observações de uma parada já concluída dispararia "Ana chegou" de novo); desfazer e marcar de novo também repetiria.
**Decisão.** Para esse tipo, o `not exists` ignora o minuto. O verbo depende do nó: "partiu" em origem e deslocamento, "chegou" no resto; sem artigo ("Ana chegou" · "Casa Valduga · 14:02"), porque o artigo não se deduz do nome.
**Consequência.** Um desfazer em 10 s pode deixar um aviso a mais no time; nunca um aviso repetido.

### D44 · `.ics` à mão
**Contexto.** RFC 5545 é texto; uma dependência só para isso não vale.
**Decisão.** `ics.ts` puro: `VTIMEZONE` de um bloco `STANDARD` (−03:00, o Brasil não tem horário de verão desde 2019), um `VEVENT` por parada com horário (`DTEND` = próxima ou +1 h, `GEO`, `LOCATION`, descrição com fechamento, observações e link do Maps), `VALARM` com `TRIGGER` relativo = −(deslocamento da anterior + 15 min), linhas dobradas em 75 octetos sem partir caractere, CRLF. Entrega por `navigator.share({ files })` quando há folha, senão download.
**Consequência.** Funciona offline e sem permissão de push; o snapshot do dia 1 do seed trava o formato.

### D45 · `travel_state` e `eventsSince`: o contrato do replay (fase 5)
**Contexto.** O carrinho da fase 5 anda do ponto antigo ao atual disparando os eventos do caminho.
**Decisão.** Por dia e aparelho: `{ trip_day_id, trip_id, fraction, at, done_stop_ids, skipped_stop_ids, seen_event_ids, updated_at }`, salvo ao ir para o fundo, a cada 30 s visível e ao sair da tela. `eventsSince(prev, stops, uid, passed)` produz `TravelEvent { id: 'kind:stopId', kind: arrived | departed | skipped | team_arrived | passed, stop_id, stop_name, at, by }`; sem `prev` não há "desde a última vez". Nesta fase a lista vira o card "Desde a última vez", que é o fallback de `prefers-reduced-motion`.
**Consequência.** A fase 5 lê `prev.fraction → position.fraction` e a lista, sem recalcular nada.

### D46 · Trilha: um escritor por linha
**Contexto.** `trip_tracks` tem id `v5(trip_day_id, user_id)`; dois aparelhos da mesma pessoa escreveriam a mesma linha.
**Decisão.** `insert` na primeira vez, `patch` de `points` depois (a outbox funde); os pontos do catch-up entram na mesma trilha. Entre aparelhos da mesma pessoa vence a última escrita da coluna (LWW): modo painel é coisa de um celular por vez.
**Consequência.** Formato `[lng, lat, epoch_s]`, 50 m ou 30 s por ponto, Douglas-Peucker 25 m, gravação a cada 60 s ou 20 pontos.

### D47 · Modo painel: Partiu! só depois de ver o carro na parada
**Contexto.** Um GPS que começa longe da parada "sairia" dela na primeira leitura.
**Decisão.** `panelDecision` só marca saída se alguma leitura dos últimos 15 min esteve a 150 m da parada de origem e a última está a mais de 300 m; chegada pela presença de 3 min (`arrivalAt`); parado 10 min dentro de 100 m → leituras de baixa precisão a cada 60 s. Uma mesma marcação automática não se repete em 10 min (desfazer não dispara de novo).
**Consequência.** Nada que premie velocidade, nada que exija interação de quem dirige; "Desligar" grande e sem animação.

### D48 · Permissões no momento certo e o usuário descartável do e2e
**Contexto.** Permissão de push pedida fora de contexto é negada e não volta; e o D33 (redirecionamento com viagem de hoje) quebraria o e2e do catch-up com os usuários do seed.
**Decisão.** Folha "Avisos da viagem" uma vez por aparelho e viagem (`sync_state['push:asked:<tripId>']`), só com viagem em até 7 dias, nunca na primeira abertura do app (`app:first-open`); posição pedida por uma frase dentro do Modo Viagem, lembrada por 24 h ao recusar. O e2e de dois contextos cria um usuário confirmado pela Admin API do Supabase local (`e2e/helpers/users.ts`) e uma viagem de hoje só dele.
**Consequência.** Os testes dos usuários do seed continuam caindo em "Suas viagens"; o único teste que precisa do Modo Viagem ativo não toca neles.

### D49 · O aparelho só pergunta ao servidor por viagens que ele já conhece
**Contexto.** Encontrado pelo e2e desta fase, sob carga: um ciclo de sync já em andamento (na fase de pull) via a viagem recém-criada no Dexie e chamava `sync_pull` para ela antes de o push acontecer; o servidor respondia "não é membro" (`revoked`) e o aparelho apagava a viagem e a operação pendente, com o aviso "Você saiu de…".
**Decisão.** `tripsKnownToServer`: o motor só puxa as viagens locais já carimbadas pelo servidor (`synced_at`) e as participações que o pull do usuário acabou de confirmar. Uma viagem criada aqui e ainda não enviada espera o próprio push.
**Consequência.** Nenhuma viagem some antes de existir no servidor; `revoked` volta a significar só o que diz.
