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

## Laboratório de testes automáticos (05/11/2026)

### D50 · Um agente que testa a produção sozinho, no lugar do roteiro manual
**Contexto.** O teste manual da fase 4 dependia de alguém seguir o roteiro com o celular na mão; o Douglas pediu algo que teste sem depender de ninguém e um painel para acompanhar.
**Decisão.** Um laboratório determinístico (um script Node, não um modelo de linguagem decidindo o que olhar) que faz o papel de dois aparelhos na produção: monta viagens de hoje pelas mesmas RPCs do app, espera o cron real e confere o que chegou em onze cenários. Roda todo dia às 3h07 de Brasília no GitHub Actions (nenhuma máquina nossa para manter) e sob demanda; grava em `lab_runs`/`lab_checks`; o painel `/lab` mostra estado, histórico por cenário e o diagnóstico do servidor quando falha. Migration `0006_laboratorio`; as seguintes renumeram (0007 reservas, anexos e memórias · 0008 listas, contatos e gastos · 0009 progressão · 0010 importação).
**Consequência.** A cadeia inteira do servidor (cron, Vault, pg_net, Edge Function, VAPID, cifra, dedupe, `failed_at`, RLS das preferências) é verificada todo dia, sem celular. O que só um aparelho prova (entrega pela Apple e pelo FCM, o service worker, Wake Lock, GPS) continua no roteiro manual.

### D51 · `push-receiver`: um push service de mentira que confere o VAPID
**Contexto.** Para ver o que o servidor manda é preciso receber como um push service recebe; os push services reais não deixam ler o que entregaram.
**Decisão.** Edge Function sem JWT da plataforma que aceita só POSTs com JWT VAPID assinado pela nossa chave (ES256, `aud` = origem do endpoint, `exp` em até 24 h, `sub` mailto/https), responde 201, 410 (endpoint `/gone`), 413 (acima de 4096 bytes) ou 401, e guarda a mensagem ainda cifrada em `lab_inbox`, legível só pelo dono da assinatura. Endpoint desconhecido responde 404 sem gravar; a caixa guarda só a última semana. A validação mora em `_shared/vapid-jwt.ts`, testada pelo Vitest.
**Consequência.** O VAPID de produção é provado a cada execução; ninguém consegue escrever na caixa de entrada sem a nossa chave privada.

### D52 · O executor nunca tem a chave secreta
**Contexto.** Um agente agendado com a chave secreta do projeto seria o segredo mais exposto do sistema.
**Decisão.** O executor entra como dois usuários de laboratório, com senhas derivadas de um único `LAB_SECRET` (HMAC por e-mail), e faz tudo com RLS: escreve pelo `sync_push`, lê a própria caixa de entrada, grava resultados pela policy de executor e lê o diagnóstico por `lab_diagnostics` (security definer, só para quem está em `private.lab_access`). A chave secreta aparece só no `pnpm lab:setup`, lida na hora pela CLI e mantida na memória do processo. `LAB_SECRET` fica em `~/.config/viajei/lab-secret` (0600) e nos secrets do GitHub; nenhum valor é impresso. Os e-mails usam `.invalid` (RFC 2606): nada sai para eles.
**Consequência.** Vazar o `LAB_SECRET` dá acesso só às viagens de laboratório; o resto do banco continua protegido pela RLS.

### D53 · Viagens fixas, paradas novas, tudo em repouso entre execuções
**Contexto.** Rodar todo dia não pode encher o banco nem disparar avisos fora das execuções.
**Decisão.** Quatro viagens fixas por id determinístico (`v5(lab-a, 'lab:<cenário>')`), redatadas para hoje a cada execução; dias de outras datas e paradas antigas recebem `deleted_at`; as paradas são novas a cada vez (o aviso do time sai uma vez por parada, D43). Cada viagem liga só os tipos do seu cenário. No fim, preferências desligadas e assinaturas apagadas, mesmo se a execução falhar. O dedupe é medido pelo que chegou, e o atraso conta do primeiro cron em que os dados já existiam.
**Consequência.** Algumas linhas soft-deleted por dia (o expurgo da fase 12 as leva); nenhum aviso de laboratório entre uma execução e outra.

### D54 · O laboratório local afrouxa o check de https só no banco local
**Contexto.** Da edge-runtime local, o receptor só é alcançável por `http://host.docker.internal`, e `push_subscriptions.endpoint` exige https, como deve ser em produção.
**Decisão.** `pnpm lab:local` troca esse check por um que aceita http, apenas no container local, com guarda de alvo; `pnpm db:reset` devolve o original. Nada muda no schema de produção.
**Consequência.** O laboratório se testa no local sem enfraquecer a regra de produção; o alvo normal é a produção.

### D55 · O roteiro manual, simulado num navegador de verdade
**Contexto.** O Douglas quer que o laboratório teste também a navegação, como o teste manual faria, e não só o servidor.
**Decisão.** Depois do preparo, o executor abre o app publicado num Chromium (perfil de Pixel 7, pt-BR, fuso de São Paulo, permissões de notificação e posição) e faz o roteiro: entra, abre o "Agora", ativa os avisos pela folha na segunda abertura, confere `/avisos`; fecha o app; entrega ao service worker o "Hora de sair" que o servidor mandou para a assinatura do navegador (DevTools Protocol, `ServiceWorker.deliverPushMessage`), confere a notificação com Partiu!, toca em Partiu! e confere a saída no servidor; reabre, vê "Desde a última vez", deixa a posição no destino marcar Chegamos! e confere no servidor; liga e desliga o modo painel e baixa o `.ics`. Duas peças são substituídas porque não existem num robô: o registro no serviço de push do navegador (`PushManager.subscribe` devolve uma assinatura apontando para o receptor do laboratório) e o dedo (o `notificationclick` é disparado dentro do service worker de verdade, com a notificação que ele mesmo mostrou). Cada passo que falha deixa um print, guardado como artefato do GitHub.
**Consequência.** Folha de avisos, `subscribePush`, o service worker (push, clique, `mutate` e envio da fila com o app fechado), o catch-up, o "Desde a última vez", o modo painel e o `.ics` passam a ser testados todo dia na produção. Continuam só manuais: a entrega pela Apple e pelo FCM, o selo no ícone, Wake Lock e GPS de verdade.

### D56 · Reescrita de SPA na Vercel (bug encontrado pelo laboratório)
**Contexto.** A primeira execução do navegador abriu `/entrar` direto e recebeu 404 da Vercel. Sem `vercel.json`, só `/` servia o app; as outras rotas funcionavam porque, depois da primeira visita, o service worker responde a toda navegação com o `index.html` do precache. Num aparelho novo, links de e-mail (confirmação, nova senha), recarregar uma tela interna e o toque na notificação do iPhone quando o Safari removeu o service worker davam 404.
**Decisão.** `vercel.json` com `rewrites` de `/(.*)` para `/index.html` (a Vercel procura o arquivo estático antes de reescrever, então assets e `sw.js` seguem iguais) e `Cache-Control: no-cache` no `sw.js`, para versão nova do service worker nunca ficar presa em cache.
**Consequência.** Qualquer rota abre do zero; o `navigate` do Declarative Web Push funciona mesmo sem service worker.

## Fase 5 · Mundo 3D: maquete do dia e replay (06/11/2026)

### D57 · Um único three, o build WebGPU, e o R3F como dono do renderer
**Contexto.** O three 0.187 vem em dois builds que não se misturam: `three.module.js` (WebGLRenderer) e `three.webgpu.js` (`WebGPURenderer`, com backend WebGL2 próprio e o sistema de nós TSL). O R3F e os addons importam `'three'`, o que traria o build clássico junto, repetido.
**Decisão.** Alias `three` → `three/webgpu` no Vite e no Vitest: um three só no bundle. `detectSupport()` sonda antes de montar o Canvas (`requestAdapter()` nulo, caso do Chromium sem tela, cai em WebGL2; sem WebGL2, lista). O renderer nasce na fábrica assíncrona do prop `gl` do R3F, que o descarta ao desmontar (`ownsRenderer`), inclusive na dupla montagem do StrictMode. Um `Canvas` por dia visto (o `DayView` troca por `key`), não um por Modo Viagem como o prompt previa: o R3F não religa um renderer pronto ao canvas que ele mesmo cria, e trocar de dia é raro e manual.
**Consequência.** Erro no `init`, chunk que não carrega ou contexto perdido viram a lista, com "Maquete indisponível neste aparelho" e sem mensagem técnica. `@react-three/drei` ficou de fora: `Html` reprojeta a cada quadro, `PerformanceMonitor` e `AdaptiveDpr` supõem laço contínuo, `Instances` duplica o `InstancedMesh`; a fase 6 reavalia para o showroom.

### D58 · O contrato do layout: eixo de km, tocos, S que abre e dia que comprime
**Contexto.** O protótipo lia tudo de uma rota embutida; aqui as paradas podem não ter coordenada, a rota pode não existir e o dia pode ter 480 km.
**Decisão.** `buildLayout` é puro e devolve nós, caminho amostrado, faixas, acidentes, curiosidades, câmera e `terrainAt`. Cada parada ganha um km num eixo próprio: com rota, as com coordenada ficam na quilometragem real dos trechos e as sem coordenada são interpoladas pelos deslocamentos (as anteriores à primeira com coordenada ganham km virtuais a 60 km/h); sem rota, tudo é virtual com mínimo de 15 km. A estrada começa um toco antes do primeiro nó e segue um toco depois do último (é por onde o carro entra na abertura). O z segue o protótipo (`18 + 0,22·km + 0,012·subida`), mas acima de 190 unidades o dia é comprimido para a câmera não se afastar demais, e a meia largura do S abre com o comprimento (17 a 40). A câmera cabe o dia entre as faixas do HUD e desloca o alvo para o centro da área útil; os pesos do cenário vêm dos `segments` com transição de 2 km, e `Segment` ganhou `pop` para dosar as quadras da cidade.
**Consequência.** `fractionToS` converte a fração do comprimento real da rota (o `fraction` do catch-up) para o caminho da cena; a mesma função serve ao replay e ao carro. A amostragem do terreno olha só a vizinhança em z das amostras do caminho (o peso cai com a distância ao cubo), e o heightfield guarda pesos, água e distância por célula para a decoração não amostrar de novo: o primeiro quadro caiu de 5,8 s para 1,2 s no Mac.

### D59 · Render sob demanda de verdade
**Contexto.** O protótipo redesenhava 4 vezes por segundo parado; no celular isso é bateria.
**Decisão.** `frameloop="demand"` com um único `useFrame` (`SceneDriver`), que avança o `MotionController`, roda os atualizadores registrados no `WorldRuntime` e só pede o próximo quadro quando algo se move (movimento, dia/noite, mergulho, abertura, ou um objeto que pediu `requestFrame`). O `WorldRuntime` é uma classe com métodos: o React Compiler trata props e valores de hooks como imutáveis, e esta é a única caixa mutável da maquete. Parado, nenhum quadro; o anel da próxima parada pulsa em CSS na pílula (zero GPU) e em 3D só enquanto a cena já está viva.
**Consequência.** As pílulas são projetadas uma vez por layout e por tamanho (`projectNodes`), com a mesma matemática de câmera da cena (`math.ts`), e usam a propriedade CSS `translate` para ancorar, deixando `transform` livre para a animação do motion.

### D60 · Níveis de qualidade e o rebaixamento automático
**Contexto.** Meta de 30 fps estáveis no iPhone durante o replay.
**Decisão.** Leve (`dpr` 1, sombra 1024, 60% das instâncias, árvores sem sombra) e Alta (`dpr` até 2, 2048, 100%, com sombra). `auto` começa em Alta e rebaixa quando a mediana de fps de 3 s de movimento fica abaixo de 24; nunca sobe sozinho na sessão; a escolha manual e o último nível automático ficam em `localStorage` (`viajei:world:quality`). Os 2 primeiros segundos do Canvas não contam (compilação de shaders) e quadros acima de 250 ms são tranco, não ritmo.
**Consequência.** Sem o aquecimento, o Mac com WebGPU rebaixava para Leve na primeira abertura por causa da compilação.

### D61 · As regras do replay
**Contexto.** O contrato da fase 4 (D45): `travel_state` anterior, `events` já filtrados pelos vistos.
**Decisão.** `planReplay` sai da fração anterior; sem fração, do nó da última concluída de então; sem as duas, do primeiro nó (o prompt dizia "sem replay", mas o dia que acabou de começar é exatamente o caso em que ver o carro sair da origem mais vale). Dura 3 a 8 s pela distância **entre o primeiro e o último nó** (os tocos não contam); avanço abaixo de 3% sem eventos não anima. Deixas de evento no `s` do nó, presas ao intervalo, uma a cada 600 ms, o resto vira "+N paradas"; curiosidades no máximo 3, 1,5 s cada, prioridade descida e subida, mar, ponto mais alto, entrada de cenário. "Rever o dia" usa `planReview` (até 20 s, até 5 curiosidades, eventos construídos das paradas, nada marcado como visto). Quem ficou em casa recebe `planLiveAdvance` quando a posição ou os eventos mudam; a leitura do painel suaviza em 1 s. Quem conta o que aconteceu é um só: com maquete e sem reduzir movimento, a maquete; senão, o card "Desde a última vez".
**Consequência.** A decisão espera `travel_state` lido, rota em cache respondida e leitura do lugar pronta; o avanço ao vivo espera a fila do movimento esvaziar (sem isso ele enfileirava um segundo movimento antes do replay começar).

### D62 · O que foi portado do protótipo, o que foi refeito, e os sons
**Decisão.** Portados: traçado em S por Béziers com o mapa km → s ponderado pela inclinação, mistura do terreno, instanciação embaralhada (o Leve afina o cenário por igual), o `buildCar` como hatch (`src/art/cars`, parametrizado por `car_color`; os outros quatro modelos desenham o hatch até a fase 6), presets dia e noite, `fitDist`, o mergulho das curiosidades, as texturas procedurais. Refeitos: cenário e curiosidades vêm da `lib/geo`; relevo do `DayRoute.elevation`; nós pela quilometragem dos trechos; laço sob demanda; HUD em React; a tela de carregamento virou a abertura do dia. Fora: gestos de arrastar e pinçar (câmera parada), a garagem (fase 6). Sons sintetizados com Web Audio em `lib/audio` (buzina, sino, ronco), zero bytes de arquivo, toggle por aparelho (`viajei:sound`) em Avisos e no chip, mudos sob reduzir movimento; confete com `canvas-confetti` 1.9.4 por import dinâmico.
**Consequência.** No iPhone o som só sai depois de um toque na página (regra do Safari): o ronco do replay ao abrir pode ficar mudo na primeira abertura do dia.

### D63 · `travel_state` não é salvo antes de ser lido (correção na fase 4)
**Contexto.** O `useCatchup` salvava o snapshot ao desmontar. No StrictMode (e em qualquer desmontagem rápida), isso acontecia antes de o Dexie entregar as paradas: um snapshot vazio apagava o anterior, e na abertura seguinte todas as marcações pareciam novas.
**Decisão.** `save()` não grava antes da primeira leitura nem com zero paradas; e grava também em `pagehide`, porque fechar a aba ou o PWA não desmonta nada.
**Consequência.** O replay parte do estado certo; um dia sem paradas não tem snapshot (e não precisa).

### D64 · Números medidos
- Chunk `three` (medido no build com source map): three.core 372 KB + three.webgpu 404 KB + three.tsl 300 KB + R3F com o reconciler 164 KB + addons 6 KB = **1.255 KB minificado, 352 KB gzip**. O build WebGPU do three não é um arquivo só (o `three.webgpu.min.js` do CDN importa `three.core.min.js`), e o TSL não se poda: a estimativa do plano (600 KB) estava errada por isso. O chunk da seção (`WorldSection`, código próprio) tem 78 KB; o da `lib/geo`, 195 KB, já existia. Cabe no precache do service worker (limite de 4 MB) e baixa uma vez. O grupo de chunk precisa de `includeDependenciesRecursively: false`: com o padrão, o React inteiro ia junto e todo chunk do app passava a importar o three.
- Primeiro quadro no Mac (Chrome, WebGPU, servidor de dev): **1,2 s** da montagem do palco ao primeiro `useFrame`, com o dia 1 do seed (479 km).
- fps no Mac durante o replay e o "Rever o dia": 60 em Leve e em Alta, com WebGPU e com WebGL2 forçado.
- fps no iPhone (Alta e Leve) e no Android: pendentes do teste manual do Douglas (`docs/teste-manual-fase-5.md`).

## Fase 6 · Garagem 3D (06/11/2026)

### D65 · A base 3D compartilhada em `src/lib/three`
**Contexto.** A garagem é a segunda cena do app; detecção de motor, criação do renderer, níveis de qualidade, limite de erro e o laço sob demanda viviam dentro da maquete.
**Decisão.** Saíram para `src/lib/three`: `renderer.ts`, `useSupport`, `quality.ts` (o `Tier` comum é só `dpr` e sombra; a maquete estende com o cenário em `features/world/quality.ts`), `useQuality` (recebe quem monta o `Tier`), `prefs.ts` (qualidade e as chaves `?render=list`/`?diag=1`), `ThreeBoundary`, `DiagChip` (noite opcional), `ThreeCanvas` (fábrica `gl` assíncrona, demanda, `dpr`/sombra pelo nível, tone mapping, perda de contexto, limite de erro) e `FrameDriver` (o único `useFrame`). O `useReducedMotion` foi para `src/lib/reduced-motion.ts`, porque não é do 3D: o áudio e o confete tinham cópias próprias e passaram a ler dali. A preferência de qualidade continua uma só por aparelho (`viajei:world:quality`).
**Consequência.** A maquete não mudou de comportamento: os testes dela passaram com a troca só dos imports, e o `WorldCanvas` virou um invólucro do `ThreeCanvas`.

### D66 · O contrato `CarProfile`: um perfil, duas artes
**Contexto.** O hatch da fase 5 era um perfil lateral extrudado escrito à mão; os outros quatro modelos, a vista lateral do card e as âncoras dos acessórios precisavam da mesma fonte.
**Decisão.** Cada modelo é um módulo de dados puro (`src/art/cars/profiles/*`, sem three): o contorno de cima como comandos de caminho (M, L, Q), a soleira, as rodas, os vidros, as luzes e as âncoras (trilho do teto com faixas, para-choque, placa, antena, três espaços de adesivo). `outline()` gera a borda de baixo com os arcos **centrados nas rodas**, e o mesmo contorno vira o `Shape` do three e o `d` do SVG. Medidas (comprimento × altura, vão, roda, entre-eixos, trilho e faixas): hatch 4,62 × 1,56, vão 0,30, roda 0,42, entre-eixos 2,80, trilho 1,80 com 2 faixas · sedã 5,14 × 1,46, 0,28, 0,42, 3,00, 1,43/2 · SUV 5,04 × 1,86, 0,47, 0,52, 2,90, 2,25/2, com para-lamas marcados e estepe · picape 5,68 × 1,82, 0,44, 0,46, 3,30, 1,40/2 sobre a cabine, com caçamba aberta · kombi 4,79 × 2,05, 0,30, 0,40, 2,40, 3,60/3, em saia e blusa. Um construtor genérico (`rig.ts`) monta todos; o que é de um modelo só (caçamba, estepe, para-lamas, saia e blusa, para-brisa dividido) está nos dados. O `CarRig` ganhou âncoras, `attach`/`detach` com animação (cai e assenta com mola; adesivos, calotas e antena crescem), `setPlate`, `update` e `dispose` idempotente.
**Consequência.** Os testes validam o que quebraria o 3D: o contorno fecha na soleira, o arco fica abaixo da chapa com folga, vidros e adesivos ficam dentro da carroceria e longe dos arcos. Essa validação achou dois defeitos do hatch da fase 5. O arco da roda da frente passava da linha do capô (o capô subiu um pouco). E o para-brisa, a vigia e a placa ficavam por dentro do chanfro da extrusão, invisíveis; agora os vidros saem para fora do chanfro.

### D67 · A vista lateral em SVG a partir do mesmo perfil
**Contexto.** O carro tem de aparecer no card da viagem, no topo da visão geral e na garagem sem 3D, rápido e offline.
**Decisão.** `CarSide` desenha o perfil em SVG: carroceria com degradê e o chanfro como traço, saia e blusa por recorte, vidros, rodas com calota, luzes e os cosméticos de teto e de lado, com as mesmas medidas do 3D (`shapes.ts`) e a mesma arte de adesivo (paths de 24 × 24 que viram `<path>` aqui e `Path2D` na textura). O `viewBox` de cada modelo reserva o espaço do acessório mais alto, para o carro não mudar de tamanho ao ganhar um rack. Rejeitada: uma foto do 3D guardada por aparelho, que exigiria carregar 1,2 MB de three na tela inicial ou mostrar um vazio no primeiro acesso.
**Consequência.** Os perfis, as regras e o `CarSide` ficam num chunk de 13,9 KB (5,4 KB gzip) que a tela inicial já carrega, sem three. Snapshots dos cinco, com e sem cosméticos, travam o desenho.

### D68 · Cosméticos, faixas do teto e o encaixe com memória
**Contexto.** A tabela 10.2 traz 15 cosméticos; o teto não comporta todos ao mesmo tempo e os adesivos têm lugar fixo.
**Decisão.** `CAR_ACCESSORIES` e `ACHIEVEMENTS` em `_shared/constants.ts` (rótulo, tipo, conquista, dependência do rack e a frase do que falta). Mala, prancha e bicicleta ocupam uma faixa cada; hatch, sedã, SUV e picape têm 2 faixas, a kombi tem 3 (o prêmio do último nível leva as três coisas). Cabem 3 adesivos, cada um num espaço do modelo. O encaixe (`placement.ts`) segue a ordem gravada e, com o encaixe anterior, quem continua fica onde estava: nada pula de faixa quando outro item entra ou sai. Trocar de modelo reencaixa o teto e avisa o que saiu.
**Consequência.** As chaves antigas (`rack`, `bike`, `board`, `box`) continuam valendo; o banco não tem `check` em `car_accessories`.

### D69 · O progresso do time e a prévia
**Contexto.** XP e conquistas só existem na fase 9, mas a garagem tem de impressionar agora sem fingir progresso.
**Decisão.** `TeamProgress { level, achievements }` em `features/progression/team.ts`: o maior nível e a união das conquistas dos membros aceitos (`combineTeam`). O `useTeamProgress` já lê os membros aceitos da viagem; nesta fase cada um traz nível 1 e nada, e a fase 9 troca só essa fonte. A regra da garagem é uma só (`decide`): o palco é o carro da viagem sempre que tudo nele está liberado; se algo bloqueado entra, é prévia, com o selo, as frases do que falta e "Voltar ao carro da viagem", e nada se grava. O que a viagem já usa e o progresso de agora não libera fica (`kept`) e só não volta a ser escolhido depois de trocado. `?garagem=tudo` libera tudo só em dev: está atrás de `import.meta.env.DEV`, e o build de produção não contém a string.
**Consequência.** Os cinco carros e todos os cosméticos podem ser vistos, girados e experimentados desde já; o card e a maquete nunca mostram o que não foi gravado.

### D70 · Sem migration: normalização na leitura
**Contexto.** As colunas `car_*` existem desde a fase 1; `car_model` e `car_color` têm `check`, `car_accessories` é `text[]` livre, e cada coluna sincroniza sozinha (dois aparelhos podem gravar modelo e acessórios incompatíveis ao mesmo tempo).
**Decisão.** `normalizeCar` resolve na leitura: modelo e cor inválidos viram hatch Pôr do sol, chaves desconhecidas saem, item de teto sem rack ganha o rack, o que passa das faixas ou dos 3 adesivos sai pela ordem. A gravação é só da coluna tocada (`mutate.patch`), offline, e a outbox funde toques seguidos.
**Consequência.** Dado velho nunca quebra a cena. O servidor não confere se o time liberou o que foi gravado; a fase 9, com a 0009 (conquistas no banco), pode pôr esse trigger se fizer sentido.

### D71 · O gesto do disco, não o `OrbitControls`
**Contexto.** Num showroom quem gira é o carro: o cenário, o cone de luz e o piso ficam parados e só o reflexo corre pela lataria.
**Decisão.** `disc.ts` (puro): arrastar na horizontal gira o disco (225° por largura de palco), soltar deixa a inércia dos últimos 100 ms (até 6 rad/s) voltar ao giro lento (0,35 rad/s); na vertical, inclina a câmera entre 6° e 30°; pinçar e a roda do mouse aproximam entre 0,68 e 1,35 da distância que enquadra o carro, que se calcula pela proporção do palco (no retrato, quem limita é a largura). A direção trava nos primeiros 10 px. O giro sozinho começa ao entrar e depois de cada troca e para depois de 20 s sem toque, com a aba escondida e sob reduzir movimento (sem inércia também). O estado vive no `GarageRuntime`, uma classe, como o `WorldRuntime`. Com o `OrbitControls`, a câmera orbitaria e a parede côncava giraria mostrando a abertura, e o amortecimento dele pede `update()` a cada quadro.
**Consequência.** Parado e assentado, zero quadros. A troca de modelo (`swap.ts`, 0,9 s) faz o carro atual sair pela direita da tela, esterçando se não estiver de perfil, e o novo entrar pela esquerda, com as rodas girando pela distância percorrida.

### D72 · drei fora; sombra e reflexo sem shader próprio
**Decisão.** Continua sem drei. A sombra de contato é a sombra real da luz principal no disco (2048 em Alta, 1024 em Leve) mais um plano com degradê radial sob o carro, que anda com ele na troca. Na Alta, o topo do disco reflete o carro com o `reflector()` do TSL (meia resolução, desbotando para a borda), que funciona nos dois backends; na Leve, fica só o brilho do ambiente. Medido no Mac: 60 fps com o reflexo, em WebGPU e em WebGL2.
**Consequência.** Nenhum componente que suponha laço contínuo ou shader só WebGL. O reflexo é o primeiro candidato a cair se o iPhone não segurar 60 fps na Alta.

### D73 · Uma tinta para os cinco e a luz do estúdio
**Contexto.** A tinta da fase 5 (metal 0,5) com a luz do protótipo (220, 70, 110) ficava pastel na garagem: o vermelho satura no tone mapping e a cor puxa para pêssego.
**Decisão.** A tinta é um `MeshPhysicalNodeMaterial` com verniz cujo grafo TSL é o mesmo para os cinco: a divisa da saia e blusa e o V do nariz são uniformes (no carro de uma cor só, a divisa fica acima do teto). Tinta sólida com metal 0,2; dourado e névoa metálicos. Estúdio com luz principal 70, preenchimento 24, contraluz 45 e ambiente 0,4.
**Consequência.** Cor viva com o verniz refletindo; a maquete também ganhou a tinta menos metálica. Um shader só significa que trocar de modelo nunca compila tinta nova (D74).

### D74 · A troca de modelo sem engasgo
**Contexto.** Na primeira versão, cada troca tinha três quadros de 80 a 170 ms (no build de produção também), inclusive ao voltar a um carro já visto.
**Decisão.** A causa principal eram as duas luzes de spot de cada carro (os feixes dos faróis para a noite da maquete): carro entrando ou saindo muda o conjunto de luzes da cena, e o three reconstrói o shader de todos os materiais. O `buildCar` ganhou `beams` (padrão sim) e a garagem monta sem. Somaram-se:
- o grafo único da tinta (D73), porque a kombi compilava a dela de forma síncrona nos passes de sombra e reflexo (451 ms);
- um lote das peças paradas por material (`batch.ts`: o hatch sem acessórios caiu de 32 malhas para 20; o rack e a bicicleta, de 18 peças para 4);
- os carros que já passaram pelo disco ficam estacionados fora de cena e voltam sem remontar;
- o preparo da troca: o carro novo monta abaixo do piso, o `compileAsync` compila e um quadro de aquecimento cria os objetos de render dos três passes antes de a animação começar.
**Consequência.** Medido no Mac, build de produção: trocas a 60 fps, com no máximo um quadro de 32 a 50 ms no instante do toque, em WebGPU e em WebGL2.

### D75 · Números medidos
- Chunks (build de produção): página da garagem 11,9 KB (5,1 KB gzip); palco 3D 16,2 KB (6,4 KB gzip); o carro por código com a base 3D, compartilhado com a maquete, 38,1 KB (14,5 KB gzip); perfis, regras e `CarSide` 13,9 KB (5,4 KB gzip), sem three. O chunk `three` foi de 1.255 KB para 1.287 KB (358 KB gzip) com o `RoundedBoxGeometry` e o `mergeGeometries`; o chunk principal ficou praticamente igual (532,6 KB). O `three` já está em cache desde a maquete.
- Primeiro quadro da garagem no Mac (Chrome, WebGPU, servidor de dev): **0,7 s** da montagem do palco ao primeiro `useFrame`.
- fps no Mac com o disco girando: 60 em Alta, com WebGPU e com WebGL2 forçado (mediana de 3 s; pior quadro 18 ms).
- fps no iPhone (Alta e Leve) e no Android: pendentes do teste manual do Douglas (`docs/teste-manual-fase-6.md`), junto com os da fase 5 (D64).

## Fase 7 · Reservas, anexos e memórias (06/11/2026)

### D76 · A 0007 a partir da DDL base, e o que mudou
**Contexto.** A DDL base do Passo 0 (bloco 0005 de lá) vira a `0007_reservas_anexos_memorias.sql`, com a correção C8.
**Decisão.** As três tabelas entram pelo `enable_trip_sync` (ranks 50, 50 e 60), com as FKs compostas. Diferenças, cada uma com o porquê:
- `reservations.created_by`, imutável e com policy restritiva de insert: o XP `reservation_added` da fase 9 vai para "quem cadastrou", e sem a coluna isso não seria derivável.
- `num_nonnulls(stop_id, trip_day_id) <= 1`: a parada já diz o dia; as duas juntas divergiriam quando a parada muda de dia.
- `end_at` exige `start_at` (na base, `end_at >= null` passava) e limites de texto em todos os campos livres.
- `attachments.placeholder` (thumbhash, D81). Foto é de memória (`stop_id`) e documento é de reserva, por `check`. O caminho é conferido exatamente (`{trip_id}/{id}.{ext do mime}`), e não por `like '…%'`. PDF não tem medidas nem placeholder.
- Medidas, tamanho, tipo e placeholder imutáveis, porque o arquivo é imutável; o nome continua editável.
- Policy restritiva "foto de memória: só quem tirou mexe" (o padrão da D23). O documento de reserva qualquer membro tira, porque a reserva é do time.

**Consequência.** 60 testes pgTAP em `09_reservas_anexos_memorias`; o `sync_pull` devolve as três tabelas pelo D16, sem mudar a RPC.

### D77 · O bucket e as policies do Storage
**Decisão.** Bucket privado `attachments`, 10 MB, sem `image/heic` (C8: o client sempre manda JPEG ou PDF). Membros leem e enviam na pasta da viagem, e o nome do objeto é validado já no envio (`{viagem}/{anexo}.{ext}`). Não há policy de update: o arquivo é imutável. Apagar é só para quem enviou (`owner_id`) ou para o dono da viagem, **e só sem linha viva apontando para o objeto** (`private.attachment_is_live`, security definer).
**Por quê.** Apagar um objeto é imediato e sem volta, enquanto tirar a linha não é. Com a regra da linha viva, o servidor nunca fica com linha sem arquivo, nos dois sentidos: o arquivo sobe antes da linha, e a linha sai antes do arquivo.
**Consequência.** O pgTAP testa o Storage como a API faz: `storage.objects` tem o trigger `protect_delete`, e o teste liga `storage.allow_delete_query` na sessão, como a própria API do Storage.

### D78 · A fila de envio sem sinal (divergência intencional do prompt)
**Contexto.** O prompt v3 diz "upload só online" (4.4) e "o registro nasce depois do upload" (5.3). Mas a cascata não tem sinal, e a foto é tirada lá.
**Decisão.** A foto entra **na hora** na store `uploads` (Dexie v3): Blob comprimido, linha pronta, id do anexo já definitivo. Ela aparece pelo Blob local com o selo "aguardando sinal". Com rede, `MediaQueue` sobe ao Storage (`upsert: false`) e só depois grava a linha pela `mutate`, numa transação com o Blob no cache.
- "Já existe" conta como enviado: o caminho é do anexo, então repetir é idempotente.
- Sem rede, não conta tentativa (D17).
- Erro de servidor: espera 1 s, 2 s… e vai para Pendentes na quinta tentativa. Erro de regra (403, 413, 415) vai direto para Pendentes.
- Viagem criada sem sinal espera chegar ao servidor antes de subir o arquivo.
- Destino apagado descarta o envio. Tirar a foto no meio do envio vira um trabalho de apagar.
- A fila tem Web Lock próprio (`viajei:media`): um Chegamos! nunca espera uma foto, nem a foto espera o sync. Ela acorda no começo e no fim de cada ciclo do motor (o fim pega a viagem recém-confirmada pelo pull).
- No Android, o service worker registra um Background Sync e envia com o app fechado. No iPhone, que não tem Background Sync, sobe na próxima abertura.

**Consequência.** O servidor nunca tem linha sem arquivo. O indicador "N pendentes" e "Sair da conta" contam as fotos não enviadas, e Pendentes mostra cada uma com "Tentar de novo" e "Descartar". Testes: a máquina de estados no Vitest (10 casos) e o e2e "foto sem rede → sobe quando a rede volta".

### D79 · Quem apaga o objeto do Storage
**Decisão.** Tirar uma foto ou um documento grava a lápide pela `mutate`. Se quem tira enviou o arquivo ou é dono da viagem, um trabalho `remove` espera a lápide sair da outbox e então chama `storage.remove`. Negado (alguém descartou a lápide e a linha voltou) ou objeto inexistente: o trabalho some. O resto fica para o expurgo da fase 12.
**Por quê.** Quem tira uma foto espera que ela suma de verdade, não daqui a 30 dias. A regra da linha viva (D77) torna isso seguro, mesmo com a lápide ainda a caminho.
**Consequência.** O expurgo da fase 12 precisa apagar também os objetos sem linha: os de anexos tirados por quem não enviou, e o de um insert descartado em Pendentes.

### D80 · Compressão sem dependência
**Decisão.** `createImageBitmap(file, { imageOrientation: 'from-image' })` decodifica e endireita a foto. A redução é feita em passos de metade (do contrário, serrilha no Safari), sobre fundo branco, e a codificação em JPEG.
- Foto de memória: até 1600 px, e a qualidade é buscada em até 4 codificações para chegar a cerca de 400 KB.
- Print de reserva: até 2400 px, qualidade 0,9.
- PDF: vai como está, até 10 MB.

Tudo roda num worker com `OffscreenCanvas` e cai para a thread principal se o worker não carregar. Recodificar apaga o EXIF, inclusive a localização da foto. O tipo do arquivo é lido pelos primeiros bytes, e HEIC que o navegador não abre vira a frase "Esta foto está em HEIC…". JPEG e não WebP porque o Safari não codifica WebP pelo canvas.
**Por que não a `browser-image-compression` (C8 a citava).** Ela usa o mesmo canvas por baixo, e conferi no pacote 2.0.2 que o worker dela importa o script de `cdn.jsdelivr.net` (`libURL`). Sem sinal, exatamente onde a foto é tirada, o worker não carrega. A biblioteca saiu da tabela da stack, com o ok do Douglas.
**Consequência.** Worker de 4,7 KB, sem dependência. A busca de qualidade e as medidas são testadas com codificador injetado.

### D81 · O borrão antes da foto: thumbhash
**Decisão.** `thumbhash` 0.1.1 (MIT, sem dependências, 13 KB): cerca de 25 bytes por foto, calculados de uma redução a 100 px e guardados em base64 em `attachments.placeholder`. O valor viaja com a linha pelo sync.
**Consequência.** O diário, a folha e o "Rever o dia" mostram o borrão na cor certa antes do arquivo chegar, inclusive offline, num aparelho que só recebeu a linha.

### D82 · O cache de arquivos e a regra de despejo
**Decisão.** `blobs` (Dexie v3, com índice `trip_id`) guarda o arquivo por id do anexo.
- Ao abrir uma viagem em andamento ou futura com rede, o app baixa o que falta, documentos primeiro.
- De viagem passada, baixa sob demanda, quando a foto aparece (assim não baixa e despeja em ciclo).
- Regra pura `planEviction`: anexo de viagem com `end_date` maior ou igual a hoje nunca sai. Das passadas, saem primeiro as fotos menos usadas, depois os documentos, até caber no orçamento.
- Orçamento: o menor entre 1 GB e 40% da cota de `navigator.storage.estimate()`, nunca abaixo de 200 MB.
- `last_used_at` é regravado no máximo uma vez por dia por anexo. O despejo roda depois de cada lote baixado e uma vez por abertura.
- Os arquivos nunca vão para o cache do service worker (bucket privado, arquivo por id). `persistStorage()` é pedido no primeiro arquivo guardado, com o app instalado.
- A lápide de um anexo leva o Blob junto; `wipeTrip` e "sair da conta" levam Blobs e fila.

### D83 · Quando a folha "Como foi?" abre
**Decisão.** Regra pura `memoryPrompt`:
- A folha abre sozinha, 1,2 s depois do confete, só quando o Chegamos! veio de um toque na tela, o modo painel está desligado, a parada não é um nó de saída e a pessoa ainda não respondeu.
- Painel, notificação, catch-up automático, "vocês passaram por…" e marcação de outro membro viram um card discreto no Modo Viagem: um por vez, o mais recente primeiro, com "mais N depois".
- "Agora não" e o ✕ do card dispensam a pergunta naquela parada, neste aparelho (`sync_state`).
- A linha de memória nasce mesmo só com fotos: é o "respondido" que sincroniza entre os aparelhos da pessoa.
- Desfazer o Chegamos! com a folha aberta fecha a folha.
- As fotos escolhidas só entram na fila no "Salvar".

**Consequência.** Nada abre por cima de quem dirige. A memória se edita depois pela lista do dia ("Minha memória") e pelo diário.

### D84 · O PDF no PWA instalado do iPhone: um visualizador próprio
**Contexto.** Abrir um PDF a partir de Blob no modo standalone do iOS é o ponto mais frágil desta fase: `window.open(blob:)` abre em branco, e o `<iframe>` mostra só a primeira página.
**Decisão.** `pdfjs-dist` 6.4.299 (de outubro; a 6.5 tinha 5 dias), num chunk carregado só quando um PDF abre (432 KB, 131 KB gzip, mais o worker de 1,26 MB). Os `.wasm` (JPEG 2000, JBIG2, perfis de cor) saem num caminho fixo (`/pdfjs/wasm/`) por um plugin pequeno no `vite.config.ts`, servidos em dev e emitidos no build. Tudo entra no precache do service worker, para abrir sem sinal. As páginas são desenhadas em canvas na resolução da tela, quando aparecem, com zoom em quatro níveis. "Compartilhar" (`navigator.share({ files })`) fica como segundo caminho (abrir em outro app, salvar em Arquivos).
**Consequência.** O precache foi a 122 arquivos e 5,45 MB; baixa uma vez. O e2e prova o print aberto sem rede depois de recarregar o build; o PDF no iPhone fica no teste manual.

### D85 · O aviso de prazo de cancelamento
**Decisão.** Um ramo novo no `due_notifications` (`create or replace`, mesma assinatura): véspera do `cancel_until` às 10:00 de São Paulo, só reserva viva de viagem viva, respeitando a preferência. Os fatos (nome, data limite, viagem) vão em `data`. Um índice parcial em `reservations (cancel_until)` atende um `between` sobre a janela.
- O texto mudou em relação ao exemplo do delta, com ok do Douglas: "Amanhã é o último dia para cancelar sem custo" · "Vila Suzana Parque Hotel · até 08/12". O aviso chega na véspera, então "último dia" seria falso nesse dia, e "o Vila Suzana" pediria um artigo que não se deduz do nome (D43).
- O toque abre a própria reserva (`/reservas?abrir=<id>`).

**Consequência.** pgTAP com 10:00 de São Paulo (13:00 UTC), 07:00 (10:00 UTC, ainda não), tipo desligado e reserva apagada.

### D86 · O laço do motor de sync (correção de um defeito da fase 2)
**Contexto.** O e2e do catch-up desta fase mostrou o Partiu! parado como pendente por até 60 s. O motor pedia o lock com `ifAvailable`: um pedido que chegava com o lock ocupado (um pull do Realtime, o ciclo anterior) era descartado. A primeira correção criou outro defeito: dois laços na mesma aba se alternando pelo lock, sem rodar ciclo. A segunda criou um terceiro: o laço que terminava sem esperar nada se zerava antes da própria atribuição e ficava preso como resolvido.
**Decisão.** A classe `CycleRunner` (`lib/db/sync/runner.ts`), sem rede e testável:
- um único laço por aba;
- pedido no meio vira mais um ciclo do mesmo laço;
- lock ocupado espera soltar (`lockReleased`) e roda;
- o laço se limpa por `.finally`, que roda sempre depois da atribuição.

Um pull do Realtime que encontra o lock ocupado pede um ciclo completo. `syncNow` usa o mesmo laço.
**Consequência.** Cinco testes cobrem o pedido no meio do ciclo, o lock ocupado, a volta da rede depois de um laço que terminou na hora e a parada do motor.

### D87 · Reservas: horário, telefone, vínculo e o que acontece com o roteiro
**Decisão.**
- Data e hora de parede de São Paulo viram `timestamptz` por `lib/time/zone.ts`. O deslocamento vem do `Intl`, e não de `-03:00` fixo, então vale para datas com horário de verão (2018-2019, testado) e num aparelho em outro fuso.
- Data e hora andam juntas no formulário: data sem hora seria inventar horário.
- O telefone digitado à brasileira vira E.164 em `_shared/phone.ts` (a importação da fase 10 usa o mesmo). Os helpers `tel:` e `wa.me` estão em `lib/links`.
- Excluir uma parada passa a reserva dela para o dia (a hospedagem existe fora do roteiro) e leva a memória e as fotos da própria pessoa.
- Encurtar a viagem bloqueia também por reserva ligada a um dia que sai (D28).
- Na lápide local, a reserva não é filha da parada nem do dia. Se fosse, os documentos sumiriam do aparelho: a reserva volta no mesmo pull, e os anexos, que não mudaram, não voltam.
- O "Ver reserva" aparece quando a parada atual ou a próxima tem reserva, ou quando há uma hospedagem em curso (o check-out do hotel de ontem).

### D88 · As fotos no "Rever o dia"
**Decisão.** O `planReview` ganha deixas `photo`, puras e testadas: uma por nó com foto, no `s` do nó e depois do evento dele, com a primeira foto e "+N". Só entram fotos com arquivo no aparelho; o replay nunca espera rede. O palco mostra um cartão em HTML sobre a pílula por 1,2 s, com o anel na cor de quem tirou. O replay ao abrir não mostra fotos (é sobre o que mudou), e com "reduzir movimento" nada aparece.

### D89 · Os e2e desta fase e o projeto `pwa`
**Decisão.** Os testes que recarregam sem rede rodam num segundo projeto do Playwright (`pwa`), contra o `vite preview` do build, com o service worker de verdade. Em dev não há service worker (D22), e recarregar offline não carrega a casca. Na CI, o build é o passo anterior. Dois testes de uso ganharam prazo maior pelo tamanho da rota do Modo Viagem no Vite de dev: o catch-up (60 s no teste, 15 s no primeiro "Agora") e o da garagem, que espera o primeiro quadro antes do toque (commit `5777e39`).
**Consequência.** 17 testes (1 pulado, o do convite já aceito). Os novos são `reservas.pwa` (print aberto sem rede depois de recarregar) e `memorias` (Chegamos!, "Como foi?", foto sem rede, diário).

### D90 · Números medidos
- Chunks do build: lista de reservas 5,4 KB, formulário 16,5 KB, diário 6,2 KB, Modo Viagem 51,3 KB (17,6 KB gzip), worker de compressão 4,7 KB. O visualizador de PDF fica num chunk próprio de 432,6 KB (130,5 KB gzip), mais o worker do pdf.js de 1,26 MB e 451 KB de `.wasm`, tudo carregado só quando um PDF abre. O chunk principal foi de 532,6 KB para 558,5 KB, o `sw.js` para 474,5 KB e o precache para 122 arquivos e 5,45 MB.
- Testes: 492 Vitest (eram 407), 219 pgTAP (eram 159), 17 Playwright com 1 pulado (eram 15).

## Onde se testa (06/11/2026)

### D91 · Celular só na versão final, nada no Mac, tudo testado na web
**Contexto.** Com a fase 7 pronta na branch, o Douglas decidiu: "eu não vou testar no meu celular, apenas quando tiver na versão final depois de todos os passos, e também não vamos rodar local. Vamos apenas testar executando na web pelo laboratório que criamos que roda todo dia."
**Decisão.**
- O teste nos aparelhos acontece uma vez, na versão final, depois da fase 12. Os roteiros `docs/teste-manual-fase-4.md` a `docs/teste-manual-fase-7.md` ficam guardados para esse dia, e nenhuma fase espera por eles para ir à main.
- Nada roda neste Mac: nem Supabase local, nem Docker, nem Playwright, nem as suítes. Os testes rodam no GitHub Actions.
- A CI (lint, formatação, pgTAP, tipos do banco, tipos, Vitest, build e Playwright) passa a rodar também no push das branches `fase-*`, e é ela que segura a fase antes da produção. A main continua recebendo por fast-forward, com o ok do Douglas.
- O laboratório (D50 a D56) passa a ser o teste de aceitação na produção. A cada fase, os passos do roteiro manual que um navegador consegue fazer entram nele como cenários. Fica para o teste final só o que um aparelho julga: câmera, HEIC, o PDF no app instalado do iPhone, fps da maquete e da garagem, entrega pela Apple e pelo FCM, Wake Lock e GPS de verdade.

**Consequência.** Hoje o laboratório cobre só a tela apagada da fase 4; as fases 5 a 7 ainda não têm cenários nele. A fase 7 é a primeira a passar pela CI na própria branch. Os cenários dela no laboratório são o próximo passo, com plano a aprovar.

## Laboratório: o card e a maquete (07/11/2026)

### D92 · O `app_reabrir` confere o card pela lista; a maquete ganha cenário próprio
**Contexto.** A primeira execução agendada (06/11) ficou vermelha só no `app_reabrir`: o cenário, de antes da fase 5, abria o Modo Viagem sem `?render=list` e esperava o card "Desde a última vez". Desde a D61 quem conta o que aconteceu é um só, e com maquete é o replay; o print mostrou a maquete contando a saída. Não era defeito do app.
**Decisão.** O `app_reabrir` abre a lista (`?render=list`), confere o card e ganha um passo: o Chegamos! pela posição vira o card discreto "Como foi?", sem abrir a folha (D83). Um cenário novo, `app_maquete`, confere a maquete: monta com WebGPU ou WebGL2, as pílulas aparecem por cima e o "Rever o dia" anda até o fim. O "Pular" aparecer prova que o laço de quadros começou o movimento; o "Rever o dia" voltar prova que ele terminou. O movimento é medido pelo relógio, então nada depende de fps; motor e tempos ficam em `data`, só como informação. O replay ao abrir não serve aqui porque o card já mostrou os eventos.
**Consequência.** Os dois caminhos de "o que aconteceu" (card e maquete) são testados todo dia na produção, sem que a lentidão do SwiftShader do GitHub vire falha.

## Fase 8 · Listas, missões, contatos e gastos (07/11/2026)

### D93 · A 0008 a partir da DDL base, e o que mudou
**Contexto.** A DDL base do Passo 0 (bloco 0006 de lá) vira a `0008_listas_contatos_gastos.sql`.
**Decisão.** As três tabelas entram pelo `enable_trip_sync`, com as FKs compostas. Diferenças, cada uma com o porquê:
- `checklist_items.status` ganha `dismissed` (D96). `suggested` fica para o desfazer do "Dispensar" e para a IA da fase 10.
- `created_by` em itens e gastos, com policy restritiva de insert: o XP de quem criou (fase 9) é derivável dos dados. Ele é **preservado** por trigger (`a_keep_creator`), e não recusado pelo `sync_guard` (D95).
- Só missão se liga a parada; missão vale de 10 a 30 pontos e o resto vale 0; `done_by` e `done_at` andam juntos (quem e quando).
- `contacts.type` ganha `restaurant`, que a importação já tinha. As constantes com rótulo (`CONTACT_TYPES`, `EXPENSE_CATEGORIES`, `CHECKLIST_KINDS`, `EMERGENCY_NUMBERS`) moram em `_shared/constants.ts`.
- `expenses.reservation_id` (FK composta, opcional) e o `check` que amarra o id ao `v5(reservation_id, 'expense')` (D97). `reservation_id` fica fora das imutáveis: a FK precisa poder anulá-la; trocar de reserva já cai no `check`.
- As FKs de parada e de reserva usam `on delete set null (coluna)` (Postgres 15+): o expurgo da fase 12 nunca apaga dinheiro nem a missão de alguém em cascata.
- Limite de texto em observações (500).

**Consequência.** O `sync_pull` devolve as três tabelas pelo D16, sem mudar a RPC. pgTAP `10_listas_contatos_gastos` com 64 testes.

### D94 · "Quem pagou é do time": trigger, não a policy da base
**Contexto.** A base tinha uma policy restritiva `for all` conferindo `paid_by`. Ela vale em todo update: se quem pagou sai da viagem, ninguém mais consegue editar nem excluir aquele gasto.
**Decisão.** O trigger `a_paid_by` confere o membro aceito só no insert e quando `paid_by` muda (o padrão da D23).
**Consequência.** O gasto de quem saiu continua editável; trocar para quem não é do time (convite pendente, removido, estranho) é recusado com 42501.

### D95 · `created_by` preservado, não recusado
**Contexto.** Linhas de id determinístico (a sugestão respondida, o gasto de uma reserva) existem justamente para duas pessoas escreverem a mesma linha sem colidir. Com `created_by` nas imutáveis do `sync_guard`, a segunda escrita, de outra pessoa, viraria erro e iria para Pendentes.
**Decisão.** O trigger `a_keep_creator` devolve o valor antigo de `created_by` em qualquer update, em silêncio. A policy restritiva continua recusando um insert com `created_by` de outra pessoa.
**Consequência.** Quem criou primeiro fica (é quem leva o XP de "quem lançou" na fase 9); a última resposta vale para o resto (LWW por coluna). O pgTAP prova a segunda escrita pelo `sync_push`.

### D96 · Sugestões calculadas; "Dispensar" é status, nunca lápide (divergência do prompt)
**Contexto.** O prompt (4.5) diz "sugestões nascem com `status = 'suggested'`". Gravar a sugestão antes da ação faria dois aparelhos criarem a mesma linha, e um ressuscitaria a que o outro dispensou. O prompt da fase propunha "dispensar grava com `deleted_at`", mas a lápide que volta pelo pull **apaga a linha do aparelho** (`apply-pull.ts`): a sugestão reapareceria no próximo sync, até no aparelho que dispensou.
**Decisão.** As sugestões são calculadas por uma tabela de regras pura (`features/checklists/suggestions.ts`) e só viram linha pelo toque, com id determinístico: missão `v5(stop_id, 'quest:' || regra)`, mala `v5(trip_id, 'pack:' || regra)`. "Adicionar" grava `active`; "Dispensar" grava `dismissed`, uma linha viva; desfazer devolve `suggested`, e a linha volta a aparecer como sugestão. Excluir um item nascido de sugestão também vira `dismissed`. O desfazer de uma exclusão comum regrava a linha inteira (`mutate.restore`), porque com rede a lápide some do aparelho antes de um patch alcançá-la.
**Consequência.** Nenhuma lápide em linha de id determinístico; o que um aparelho respondeu vale em todos. As contas (progresso, véspera) só olham `active`.

### D97 · As regras das sugestões
**Decisão.**
- Missão por tipo de parada, uma por parada, nenhuma em parada que já tem missão viva, concluída ou pulada: natureza "Foto do time com a paisagem" (20), vinícola "Registrar o rótulo preferido, com foto" (20, nunca consumo), comida "Provar o prato da casa" (15), cidade "Um cartão-postal na foto" (15), evento "A foto do momento" (10). Origem, deslocamento, hotel e "outro" não ganham.
- Os textos não levam o nome da parada: "na Cascata", "no Park", "nas Cascatas" pediriam deduzir o artigo pelo nome (D43). A parada aparece embaixo da missão, e a de sistema sempre tem parada.
- Mala pela leitura do lugar das rotas guardadas no aparelho (`classifySegments`, import dinâmico): praia, "Protetor solar" e "Roupa de banho"; serra, "Blusa" e "Calçado com aderência"; parada de natureza, "Repelente". Uma linha da mala que já cobre a sugestão por palavra-chave, sem acento ("Blusa fina" cobre "Blusa"), segura a sugestão.
- O seed passou de "Registrar o vinho preferido" para "Registrar o **rótulo** preferido na Casa Valduga", pela regra de nunca falar de consumo.

### D98 · O que vai junto ao excluir uma parada
**Decisão.** `stopRemovalPlan` (puro): a missão de sistema da parada sai; a missão de uma pessoa ou da IA e o gasto ficam, sem o vínculo (o dinheiro foi gasto de verdade); o gasto de uma reserva continua ligado a ela. Na lápide local, itens e gastos não são filhos da parada (nem o gasto da reserva): são filhos da viagem.
**Consequência.** Encurtar a viagem não bloqueia por nada desta fase; um gasto com data fora do novo período aparece num grupo "Fora das datas da viagem".

### D99 · Contatos: emergência constante, telefones das reservas derivados, WhatsApp só para celular
**Decisão.** SAMU 192, Bombeiros 193, Polícia Militar 190 e PRF 191 são constantes no topo da lista, só com ligar: funcionam sem cadastro e sem internet. Os telefones das reservas entram na lista derivados ("da reserva"), sem repetir um E.164 que já é contato (o contato diz "também na reserva"). O botão de WhatsApp só aparece para celular brasileiro (9 na frente) ou número de fora: o `wa.me` de um fixo abre uma conversa que não existe.

### D100 · `.vcf` em vCard 3.0, não 4.0
**Contexto.** O prompt citava a RFC 6350 (vCard 4.0). Os Contatos do iPhone importam o 3.0 sem surpresa; o telefone do 4.0, como URI `tel:`, é o campo que costuma se perder.
**Decisão.** vCard 3.0 gerado à mão, como o `.ics` (D44): FN, N, TEL, ORG (o nome da viagem) e NOTE, com os escapes e a dobra em 75 octetos do `.ics`, que saíram para `lib/text/content-lines.ts`. A entrega (folha de compartilhar ou download) saiu para `lib/files/deliver.ts`, a mesma do `.ics`.
**Consequência.** O teste final nos aparelhos confirma a importação no iPhone e no Android.

### D101 · Gastos: centavos, a barra e o "+ Gasto"
**Decisão.**
- Somas em centavos inteiros: somar reais em ponto flutuante erra no centavo.
- A barra usa os tokens de estado: no horário até 80%, aperta até 100%, atrasado acima, sempre com o valor e a porcentagem em texto. A porcentagem arredonda para baixo antes de 100% (99,6% não vira 100%).
- `expenses` com rank 55, depois das reservas (50): a reserva e o gasto dela criados sem sinal podem subir no mesmo lote.
- O "+ Gasto" do Modo Viagem é um botão discreto ao lado de "Modo painel", que nunca abre sozinho. Parado numa parada, ela e a categoria pelo tipo dela; na estrada, nenhuma parada e combustível.
- "Lançar como gasto" cria o gasto com o valor, a categoria pelo tipo da reserva, a data do check-in em São Paulo (dentro da viagem) e quem tocou como quem pagou. Lançado, o botão diz "Gasto lançado" e leva a ele.

### D102 · O aviso de véspera completo
**Decisão.** A 0008 recria o `due_notifications` inteiro (`create or replace`, mesma assinatura; os outros ramos iguais aos da 0007). O ramo `eve_checklist` conta os itens ativos de "antes" e de "mala" sem `done_at` (`before_left`, `pack_left` em `data`) e só calcula para as viagens que começam amanhã (o `between` do `cancel_deadline`). O texto, em `_shared/notifications.ts`: com itens faltando, "Amanhã é dia de viajar" · "3 itens de antes e 2 da mala faltando" (e as variantes de uma lista só e do singular), e o toque abre a lista que falta (`/checklists?aba=antes`); sem nada faltando, o texto da fase 4.
**Consequência.** A `send-notifications` é republicada, porque o texto mora em `_shared`.

### D103 · "Pronto para partir"
**Decisão.** Antes e Mala, cada uma com pelo menos um item e tudo marcado, antes do `start_date`. O cartão aparece uma vez por viagem e aparelho (`sync_state['ready:<tripId>']`), com confete, sino e vibração (nada disso sob reduzir movimento), e mostra o carro da viagem com a mala de teto em prévia. A marca é gravada e a folha abre a partir dela, sem estado do React escrito dentro de efeito (React Compiler). Na visão geral, os dois anéis e a frase "Fechem as duas listas até 10/12 para ganhar a mala de teto" (no singular para quem viaja sozinho; o prazo é a véspera), e o selo depois; na viagem, o cartão some.
**Consequência.** A conquista `ready_to_go` da fase 9 é derivável dos dados (os `done_at` contra o início).

### D104 · Os tipos do banco vêm da CI
**Contexto.** Sem stack local (D91), `supabase gen types` não roda aqui.
**Decisão.** A CI gera o `database.types.ts` no Supabase dela; se mudou, guarda como artefato `tipos-do-banco`, roda tipos, Vitest, build e Playwright **com o arquivo gerado** e falha só no fim. O arquivo é baixado (`gh run download`) e commitado. As tabelas novas entram à mão primeiro, só para os tipos fecharem localmente.
**Consequência.** Uma volta da CI diz tudo, em vez de parar no primeiro passo.

### D105 · O laboratório das fases 7 e 8, e a exceção à D53
**Contexto.** Pela D91, o laboratório é o teste de aceitação na produção; as fases 7 e 8 ainda não tinham cenários nele. Dois avisos (a véspera às 19h e o prazo de cancelamento às 10h) só se conferem de verdade com horas de espera, e a D53 deixava tudo em repouso entre execuções.
**Decisão.**
- O Douglas aprovou em 07/11/2026 os cenários da fase 7 junto com os da fase 8.
- Duas viagens fixas novas, com A e B no time e os avisos desligados: `listas` (começa em 3 dias; itens novos a cada execução) e `estrada` (hoje, orçamento de R$ 100, com contato, reservas e paradas novas a cada execução). Anexos de execuções anteriores saem do Storage no preparo (D77).
- Um segundo navegador, como `lab-b`, faz o lado do time. Cenários: `app_listas`, `app_contatos`, `app_agora_reserva`, `app_reserva_offline`, `app_missoes`, `app_memoria`, `app_gastos`, `app_sair_pendente`. `app_memoria`, `app_gastos` e `app_sair_pendente` dependem do Chegamos! do `app_missoes` e são pulados com o motivo se ele falhar.
- **Exceção à D53:** `vespera` e `prazo` deixam, de uma execução para a outra, uma viagem e uma assinatura de laboratório vivas, só com aquele tipo de aviso ligado. Cada execução primeiro confere o que a anterior armou (texto, contagens, destino do toque e atraso até 2 min); depois desarma e arma o próximo ciclo. Se o aviso ainda não venceu (o agendamento do GitHub atrasa até 8 h), o cenário é pulado e a armação fica.
- As chaves da assinatura armada são derivadas do `LAB_SECRET` e do rótulo do ciclo (`HMAC` como escalar da P-256, o ponto público pelo ECDH do Node): a execução seguinte refaz as mesmas chaves e decifra a caixa. Nenhum segredo fica guardado em lugar nenhum.

**Consequência.** O job vai a até 30 min. Entre execuções há no máximo duas assinaturas de laboratório e dois avisos por dia, ambos esperados.

### D106 · O laboratório testa a produção, depois do merge
**Contexto.** O preview da Vercel de cada branch fica atrás do login da Vercel. Para o laboratório testar a branch antes do merge, ele precisaria do "Protection Bypass for Automation" (um segredo gerado no painel) e de um segundo alvo no `lab.yml` e nos scripts.
**Decisão.** O Douglas não vai configurar o bypass (07/11/2026). O laboratório testa só a produção: a fase chega a ele depois do merge, e o agendamento diário segue como alarme. O alvo `preview` saiu do `lab.yml` e dos scripts antes de chegar à `main`, porque código que nunca roda nunca é testado: um caminho que dependesse de um segredo que ninguém vai gravar apodreceria em silêncio.
**Consequência.** O portão antes do merge é a CI da branch. O laboratório confirma na produção logo depois do fast-forward, com a migration da fase já no hospedado, porque o banco é o mesmo. Em 07/11 duas execuções chegaram a rodar contra o preview, com um secret `VERCEL_AUTOMATION_BYPASS_SECRET` que estava gravado no repositório. Elas acharam a barra de ferramentas da Vercel cobrindo um botão, coisa que só existe no preview, e o defeito do motor de sync da D109. O secret ficou sem uso.

### D107 · Números medidos
- Chunks do build da CI: listas 23,4 KB (8,5 KB gzip), contatos 12,1 KB (4,8 KB gzip), gastos 10,6 KB (4,4 KB gzip), visão geral 13,4 KB (5,4 KB gzip). O Modo Viagem ficou em 51,6 KB (17,7 KB gzip), quase igual: a folha de gasto e as missões da parada vêm em chunks compartilhados. O chunk principal foi de 558,5 KB para 561,6 KB; o precache, de 122 para 141 arquivos e 5,54 MB.
- Testes: 538 Vitest em 75 arquivos (eram 492), 284 pgTAP (eram 219), 22 Playwright, todos rodando (eram 16 e 1 pulado; o do convite já aceito rodou desta vez). CI verde na `fase-8` em 8 min 41 s.
- A primeira CI da branch gerou o `database.types.ts` igual ao escrito à mão: o artefato `tipos-do-banco` não precisou ser baixado.

### D108 · O deploy das funções empacota no servidor
**Contexto.** A republicação das funções da fase 8 falhou na `route-day`: com o Docker fechado (D91), a CLI empacota no hospedado, e o empacotador de lá não acha o `deno.json` da pasta `functions`. O Deno local o acha subindo de pasta; o do servidor só recebe os arquivos que a CLI manda. O `zod` ficou sem mapa.
**Decisão.** O `remote:functions-deploy` publica as três funções numa chamada só, com `--use-api` (empacota sempre no servidor) e `--import-map supabase/functions/deno.json` (o mapa vai junto). O comentário do `config.toml` explica por quê.
**Consequência.** O deploy dá o mesmo resultado com ou sem Docker, e publicar continua sem pedir stack local.

### D109 · Uma viagem cujo primeiro pull falhou volta no ciclo seguinte
**Contexto.** Achado pelo laboratório da fase 8. Num aparelho novo, o primeiro ciclo grava as participações e o cursor do usuário e depois puxa as viagens uma por uma. As viagens `listas` e `estrada` eram as últimas da fila, e o laboratório navegou logo depois de entrar, o que cortou o fetch em andamento. O ciclo seguinte já tinha o cursor adiante, e a regra da D49 só olhava as viagens locais e as participações recém-chegadas. Resultado: as duas viagens nunca chegaram, e o app mostrou "Página não encontrada" por minutos. O mesmo pegaria um celular novo com rede ruim, ou que recarregasse no primeiro sync. O defeito existia desde a fase 3; o código de aplicar o pull estava certo, conferido com os dados reais do lab-a num IndexedDB em memória.
**Decisão.**
- `tripsKnownToServer` decide tudo pelo que está no aparelho: as viagens carimbadas pelo servidor e as participações aceitas da pessoa que vieram dele (`synced_at`). A participação é gravada antes do pull da viagem, então a viagem que faltou volta no ciclo seguinte.
- A proteção da D49 continua: a participação do dono de uma viagem criada aqui é só projeção, sem `synced_at`, e a viagem apagada aqui fica de fora.
- No ciclo, cada viagem é puxada por si. Um erro de rede para o ciclo, e o resto fica para o próximo. Qualquer outro erro vira `lastError`, sem segurar as viagens seguintes.
- `applyUserPull` devolve só as viagens deixadas, porque as aceitas já estão no Dexie.

**Consequência.** Nenhuma viagem se perde por um pull interrompido. Testes: `known-trips.test.ts` (viagem que faltou, projeção do dono, participação de outra pessoa, pendente, lápide, viagem apagada aqui).

