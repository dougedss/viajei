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

### D106 · O laboratório testa o preview da branch antes do merge e a produção depois (reescrita na fase 11)
**Contexto.** O preview da Vercel de cada branch fica atrás do login da Vercel. Para o laboratório testar a branch antes do merge, ele precisa do "Protection Bypass for Automation" (um segredo gerado no painel) e de um segundo alvo no `lab.yml` e nos scripts. A primeira versão desta decisão (07/11, fase 8) tirava o alvo `preview` porque a resposta do Douglas ainda era não. A resposta final, no mesmo dia, foi **sim**: o secret `VERCEL_AUTOMATION_BYPASS_SECRET` está no repositório e o bypass está ligado na Vercel. O alvo deveria ter voltado na fase 9 e não voltou; volta no primeiro commit da fase 11.
**Decisão.**
- `lab.yml` com a entrada `alvo` (`producao` | `preview`), ao lado da `tarefa` da fase 10. O agendado testa sempre a produção; sob demanda, `gh workflow run lab.yml --ref <branch> -f alvo=preview` abre no navegador o preview daquela branch (`previewOrigin`, puro, em `scripts/lab/preview.ts`).
- **O banco é o mesmo da produção.** Só o app que o navegador abre muda; os avisos, o cron e as funções são os da produção (as funções não têm preview). Por isso o que depende de função nova (o briefing com clima da fase 11) só se confere depois de a função ser publicada.
- O segredo vai uma vez por contexto do navegador, na primeira navegação, como parâmetro que grava o cookie da Vercel (`enterPreview`), e todo navegador do laboratório passa por ali: o principal, o do lab-b, o da progressão, o da retrospectiva e o da importação. Nunca como cabeçalho (iria também ao Supabase e cairia no CORS) e nunca no log. A barra de ferramentas da Vercel (`vercel.live`) fica bloqueada: ela cobria o "Feito" da missão.
- O relatório diz quando o app foi o preview.

**Consequência.** A fase passa pelo laboratório antes do merge, além da CI; depois do fast-forward, ele roda de novo na produção. Uma execução no preview gasta uma leitura real da IA (`app_importar`), dentro do limite de 20 por dia do lab-a. As duas execuções de 07/11 contra o preview (fase 8) já tinham achado a barra da Vercel e o defeito do motor de sync da D109.

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

### D110 · Os dados do seed na viagem real
**Contexto.** Desde a fase 7, a viagem real do Douglas ("RS — concurso em Montenegro", `0faf1ff2-…`) tinha só dias e paradas. O resto do seed esperava a resposta dele.
**Decisão.** O Douglas disse sim em 07/11/2026. Depois da 0008 no hospedado, entraram as 2 hospedagens, os 6 contatos, os 5 itens de Antes, os 6 da Mala e as 4 missões. O caminho foi o do app: as linhas saíram das mesmas funções puras do carregador do exemplo (`reservationFromImport`, `contactsFromImport`, `listItemsFromImport`), e as 23 operações foram montadas como a `mutate.insert` monta. Elas passaram pelo `sync_push` como ele, pelo pooler `aws-1`, com RLS valendo e ensaio em `rollback` antes. A senha dele não foi usada.
**Consequência.** As missões se ligaram às paradas pelo nome: Cascata do Caracol e Casa Valduga com +20, Gramado com +15, e o almoço de domingo, sem parada, com +10. O aviso de prazo do Vila Suzana chega em 07/12 às 10h, e o de véspera em 10/12 às 19h, contando o que faltar nas listas.

### D111 · Uma falha de rede não prende o app em "Sem conexão"
**Contexto.** Achado pelo laboratório na produção, logo depois do merge da fase 8 (cenário `app_sair_pendente`). A rede voltou, alguma requisição falhou na volta, e o app ficou "Sem conexão · 131" por mais de um minuto, com a foto na fila. Uma falha de rede marcava o app offline, e só o evento `online` do navegador ou uma resposta do servidor o traziam de volta. Mas, com o navegador dizendo "online", o evento não vem, e o motor de sync e a fila de fotos não tentavam nada enquanto o app se achava offline. O app ficava preso até recarregar. Na estrada é o caso comum: sinal fraco, túnel, Wi-Fi sem internet, tudo com `navigator.onLine` verdadeiro.
**Decisão.**
- `connectivity` separa duas coisas. Só o "sem rede" do navegador impede tentar (`canTry`). Uma falha de requisição marca o app sem conexão (`isOnline`, que a UI mostra) e agenda uma nova tentativa (`onRetry`) em 3 s, 10 s, 30 s e daí a cada 60 s.
- A primeira resposta do servidor marca online, cancela a tentativa e zera a espera. O evento `offline` do navegador cancela a tentativa, e a volta vem pelo `online`.
- O motor de sync roda sempre que o navegador não diz "sem rede", e atende o `onRetry` com um ciclo. A fila de fotos volta com ele, porque o ciclo bem-sucedido marca online.

**Consequência.** Depois de uma queda, o app se recupera sozinho em segundos, sem recarregar e sem martelar o servidor. Testes: `connectivity.test.ts`.

## Fase 9 · Progressão e retrospectiva (07/11/2026)

### D112 · A 0009 a partir da DDL base, e o que mudou
**Contexto.** A DDL base do Passo 0 (bloco 0007 de lá) vira a `0009_progressao.sql`.
**Decisão.** As duas tabelas entram como somente-anexar (escopo `user`, rank 90), com o carimbo `stamp_synced`. Diferenças, cada uma com o porquê:
- Índices `(trip_id, synced_at)` nas duas (C6): o pull da viagem filtra por elas.
- Pontos amarrados ao tipo por `check`, espelhando a nova `XP_POINTS` em `_shared/constants.ts`: a missão de 10 a 30, os outros com o valor fixo da tabela 10.1 (a base aceitava de 1 a 200 em qualquer tipo). Não é antifraude, não há ranking: é o banco e a regra dizendo o mesmo.
- O formato do `ref_id` conferido: id de linha nos tipos por linha, `<viagem>:before|pack` na lista completa e o próprio id da viagem na viagem concluída, amarrados ao `trip_id`. Com o `trip_id` nulo depois do expurgo, o `check` passa.
- Ninguém grava XP de viagem de que não é membro: o insert exige `trip_id` e `is_trip_member`; a conquista aceita `trip_id` nulo ou de viagem minha. O `on delete set null` continua: o expurgo da fase 12 não apaga o XP de ninguém.
- `unlocked_at` limitado a agora + 2 min (o teto do `sync_guard`): um relógio adiantado não grava o futuro.
- `revoke update, delete, truncate` além da ausência de policy: somente-anexar dito duas vezes.
- `lab_reset_progress()`: apaga a progressão de quem chama, e só de usuário de laboratório (executor em `lab_access` e e-mail `.invalid`). A conta real que está em `lab_access` é `viewer` e não tem e-mail `.invalid`: o pgTAP prova as duas recusas.
- O aviso `retro_ready` no `due_notifications`, recriado inteiro (`create or replace`, mesma assinatura): `end_date + 1` às 9h de São Paulo, só para viagem com parada concluída, com dias e paradas concluídas em `data`. O texto, em `_shared/notifications.ts`: "A retrospectiva da viagem está pronta" · "4 dias, 17 paradas" (e o singular); o toque abre `/viagens/:tripId/retrospectiva`; `available: true`.

**Consequência.** pgTAP `11_progressao` com 59 testes. O `sync_push` já tratava `mode = 'append'` (colisão vira `ignored`) e o `sync_pull` já trazia as tabelas de escopo `user` com `trip_id` (D16): nenhuma RPC mudou.

### D113 · O nível do time vem do resumo público no perfil
**Contexto.** O `TeamProgress` usa o maior nível e a união das conquistas dos membros aceitos, e o XP de cada um vem de todas as viagens dele. O pull da viagem só traz as linhas com o `trip_id` dela: somando as linhas, o aparelho de A calcularia o nível de B só pelas viagens em comum.
**Decisão.** `profiles.xp_total` e `profiles.achievement_keys`, recalculados da fonte por trigger a cada insert (nunca somados: o resumo não se desvia das tabelas). O client não edita essas colunas (o grant de update do perfil continua só em nome e cor). O perfil de cada membro já viaja para o time pelo pull da viagem e funciona sem sinal. Para a própria pessoa, valem as linhas do aparelho, que incluem o que ainda não subiu (com o resumo do perfil por cima, quando ele estiver adiante, vindo de outro aparelho). A barra da viagem mostra o XP de quem está mais adiante, que é quem define o nível, sem nome.
**Alternativa rejeitada.** O pull trazer as linhas dos membros de todas as viagens: o aparelho de cada um guardaria o histórico inteiro dos outros, e uma viagem nova de B mudaria o que A precisa puxar.
**Consequência.** `useTeamProgress` trocou só a fonte (`standingOf`, `teamOf` em `team.ts`); a garagem e o cartão não mudaram. Um perfil puxado antes da 0009 vale zero até mudar de novo no servidor.

### D114 · Realtime nas tabelas de progressão
**Contexto.** O `enable_user_sync` não liga o aviso do Realtime: as tabelas de escopo `user` não avisavam ninguém.
**Decisão.** `d_broadcast` no insert de `achievements` e `xp_events`, pelo `trip_id` da linha.
**Consequência.** Quando B ganha o adesivo de câmera, a garagem de A mostra o adesivo liberado sem recarregar; o nível do cabeçalho anda junto. Um aviso por viagem por transação, como nas outras tabelas.

### D115 · As regras exatas de XP e conquistas
**Decisão.** Em `features/progression/rules.ts`, puro: o retrato do aparelho entra e sai o conjunto inteiro de XP e conquistas a que a pessoa tem direito, com ids `v5(user_id, kind:ref_id)` e `v5(user_id, 'achievement:' || key)`. Desmarcar não tira e remarcar não dá de novo: é o somente-anexar que garante.
- "O time" são os membros aceitos. Cada aparelho grava só o da própria pessoa. **Quem entrou depois leva o que já tinha acontecido** (ok do Douglas): a equipe conquista junto e não há ranking; contar só o que veio depois do aceite exigiria uma coluna de hora do aceite que não existe.
- **Saída:** uma parada com `departed_at`; o nó de saída só conta como saída própria no começo (nenhuma parada antes dele no dia saiu). "Hotel → Saída para Montenegro" é uma saída, a do hotel; a "Chegada em Papanduva" marcada pelo Partiu! não é saída. **"Sair às"** é a conta do "Agora" (D29): a próxima não pulada menos o deslocamento; sem deslocamento e com a próxima sendo nó de saída, o horário dela; num nó de saída, o dele. **Hora real:** todos os caminhos que gravam `departed_at` (botão, Partiu! da notificação, modo painel) usam a hora do toque ou da leitura; o catch-up nunca grava saída. Quando a trilha de alguém mostra o carro saindo do raio (150 m e depois 300 m, o critério da D47) até 60 min antes ou depois do toque, vale a hora da trilha. Sem "sair às", a saída é neutra: não conta nem quebra a sequência. Sair antes da hora é pontual.
- **Viagem concluída:** o dia seguinte ao fim (São Paulo) com pelo menos uma parada concluída, o momento do `retro_ready`.
- `stop_done` para cada parada concluída (inclusive origem e deslocamento); `checklist_item` só em Antes e Mala (a missão vale os pontos dela para o time, sem os 2); `checklist_complete` com a lista não vazia e toda marcada; `memory_photo` uma por parada, pela foto de quem fotografou.
- `first_stop` na primeira conclusão; `early_bird` em saída antes das 7h; `on_time_3` em três pontuais seguidas na mesma viagem; `nature_3` e `photographer` somando as viagens (fotos em 5 paradas diferentes); `winery_2` no mesmo dia; `ready_to_go` com Antes e Mala não vazias e tudo marcado antes do primeiro dia; `on_budget` na viagem concluída com orçamento maior que zero, pelo menos um gasto e a soma em centavos dentro dele (`unlocked_at` = 0h do dia seguinte ao fim); `chronicler` num dia terminado (sem pendente ou já passado) em que toda concluída que não é nó de saída tem nota minha; `trip_done` sem parada pendente e com uma concluída — **parada pulada não impede** (ok do Douglas: pular é como o app registra "não deu" sem apagar a história); `team` com outro membro aceito, dos dois lados; `downhill` com 500 m de queda nos trechos rodados de um dia, pela rota guardada (sem rota, espera); `planner` com a entrada vazia até a fase 10.
- `unlocked_at` é a hora do fato (o `done_at`, a saída, a chegada da foto ao servidor), nunca a da derivação.

**Consequência.** Na viagem do seed, quem fizer tudo chega a uns 797 XP (o prompt previa 790). Cada regra tem teste positivo e negativo.

### D116 · "Pé na areia" a 3 km do mar (divergência do prompt)
**Contexto.** O prompt diz "a menos de 1 km do mar". A costa embutida erra de 1 a 2 km (D26), e as curiosidades só afirmam o mar a 3 km.
**Decisão.** 3 km (`COAST_NEAR_M`, o mesmo `SEA_NEAR_M`), só com posição real (a leitura do catch-up e a trilha do modo painel, que já vão para `trip_tracks`), e a frase da prancha passou a "chegando a menos de 3 km do mar". A trilha de quem não compartilha a posição não entra. Ok do Douglas.

### D117 · A derivação espera a janela do Desfazer
**Contexto.** Conquista não se apaga. Um Partiu! tocado por engano às 6h50 e desfeito em 10 s daria o Madrugador para sempre.
**Decisão.** O motor não deriva enquanto uma linha das regras (paradas, itens, gastos, memórias, reservas) foi tocada há menos de 12 s, aqui ou noutro aparelho (`updated_at`); reagenda para o fim da janela. A trilha não conta (o modo painel grava a cada minuto). O "+10" aparece na hora, pelas regras, e só quando a ação rende XP novo.
**Consequência.** O "Desfazer" desfaz de verdade. O XP chega ao servidor uns 12 s depois da ação.

### D118 · "Sem sinal, sem problema": a marca na outbox
**Contexto.** A `mutate` é a mesma online e offline; a outbox não sabia se a escrita nasceu sem sinal.
**Decisão.** Cada item da outbox ganha `offline`, posto pela `mutate` a partir da conectividade do app (`setOfflineProbe(() => !connectivity.isOnline())`); o service worker, sem React, usa o `navigator.onLine`. A marca sobrevive à fusão. Quando o `sync_push` devolve `applied` para uma escrita marcada numa tabela da viagem (não a trilha, não o XP), o aparelho guarda a hora do envio e a viagem (`progress:offline-synced`), e a regra lê dali. XP ou conquista recusados pelo servidor saem da fila em silêncio, sem ir para Pendentes: a próxima derivação recalcula.

### D119 · Quando a comemoração aparece
**Decisão.**
- Cada aparelho comemora o que a própria pessoa ganhou (conquistas e subida de nível). O que o time ganhou aparece na garagem e no cabeçalho, sem cartão e sem nome.
- **A primeira derivação** de um aparelho (inclusive ao publicar a fase) espera o primeiro ciclo completo do sync (o pull traz o que outros aparelhos já gravaram) e vira um **cartão na própria página**, calmo, sem confete: "Vocês já tinham conquistado 6 conquistas e 420 XP." Não é folha: não cobre nada. O resumo junta só o que aconteceu **antes de o aparelho começar a derivar** (a hora em que o motor ligou nesta sessão); a conquista de um fato posterior (a primeira parada concluída enquanto o primeiro sync ainda corria, sem sinal ou com sinal lento) é novidade para a pessoa e vai para a fila como cartão.
- Depois, uma **fila por aparelho** (`progress:queue`), um cartão por vez, com "mais N", no próximo momento calmo: ao abrir a visão geral, a garagem ou o perfil, ou ao fechar a folha "Como foi?" sem o modo painel. **Cada momento mostra só o que já esperava na fila quando ele começou**: nada salta no meio do que a pessoa está fazendo.
- Nunca por cima de outra folha: a `Sheet` conta as folhas abertas (`sheet-stack.ts`) e o cartão espera. Nunca pelo toque numa notificação (que abre o Modo Viagem, onde o único momento é fechar o "Como foi?").
- "Pronto para partir" já tinha o cartão da lista (D103) no instante em que ela fecha: ele virou a comemoração da `ready_to_go` (com "Usar no carro" quando o rack já está liberado), e a fila não repete.
- Uma preferência por aparelho, "Cartões de conquista" (Avisos, junto do Som), ligada por padrão. Os testes de ponta a ponta antigos e o laboratório a desligam: os usuários do seed são os mesmos em testes paralelos, e um cartão modal que chega de outro teste cobriria um botão.

### D120 · O cartão de desbloqueio e o "Usar no carro"
**Decisão.** O cartão (folha com confete, sino e vibração, nada sob reduzir movimento) mostra o carro da viagem da tela (no Perfil, o da viagem da conquista) no palco da garagem, num chunk que já existe. O palco ganhou o modo `reveal`: monta já com o acessório (ou o modelo novo), para os shaders compilarem na abertura, volta sem ele num instante, e então o encaixe (ou a troca) anima — o mesmo preparo da D74. Sem WebGL ou com reduzir movimento, o `CarSide` já com o acessório. "Usar no carro" passa pelo `decide` da garagem (as faixas do teto, os 3 adesivos); a recusa aparece com "Abrir a garagem". "Agora não" deixa liberado. O nível novo usa o mesmo cartão, com o modelo.
**Sem trigger no servidor conferindo o carro** (a pendência da D70): o carro sobe antes da conquista no push (rank 10 contra 90), e um trigger recusaria o "Usar no carro" feito sem sinal.

### D121 · O filme sobre a viagem inteira
**Decisão.** Um caminho só para a viagem (`spliceTrip`, puro): a rota real de cada dia cortada nas paradas, emendada por uma ponte reta entre o último nó de um dia e o primeiro do seguinte (a noite, fora dos números). Onde a trilha gravada cobre um trecho inteiro (do Partiu! ao Chegamos!), ela substitui a geometria do trecho; a altitude é a da rota. O `buildLayout` aceita isso sem mudança de contrato, com duas opções novas: um teto de comprimento maior (`zMax`, para a viagem não ficar espremida) e a leitura do lugar com até 12 partes. Sem a rota de algum dia, o caminho é estilizado. A cena reaproveita o cenário da maquete (`WorldScene` ganhou `controls`), com a câmera do filme no lugar da câmera parada: desce da viagem inteira até o carro, segue o carro e sobe no fim, com o carro estacionado na metade de cima. É a única câmera que percorre o caminho (6.7).
**Rejeitado.** O corte por dia: montaria quatro cenas dentro de 15 s, engasgaria no celular e perderia o "cidade → interior → serra → praia" contínuo.
**Roteiro (`planFilm`, puro).** Abertura de 2,2 s ("Viajei!", o nome e as datas); sobrevoo de 9,8 s, com o tempo dividido entre os dias pelo comprimento e no mínimo 1,2 s por dia, o chip "Dia 2 · sábado", até 6 fotos (a foto da memória mais bem avaliada de cada parada, 1,4 s cada, sem sobrepor, as de maior nota primeiro) e as missões feitas onde sobra lugar; card final de 3 s. O relógio é um só para a cena e para o desenho por cima. Com reduzir movimento, sem WebGL ou com `?render=list`: a sequência de cards.

### D122 · O vídeo quadro a quadro com WebCodecs (divergência do prompt)
**Contexto.** O prompt dizia MediaRecorder sobre o canvas. O MediaRecorder grava em tempo real: num celular que desenha a maquete a 40 fps, o vídeo sai engasgado. E WebM não entra nos stories do Instagram.
**Decisão.** Cada um dos 450 quadros (15 s a 30 fps) é desenhado pelo relógio do filme, em 1080 × 1920, num alvo fora da tela (`renderer.setOutputRenderTarget`, que aplica o mesmo tone mapping e espaço de cor da tela), lido de volta da GPU (`readRenderTargetPixelsAsync`, igual em WebGPU e WebGL2; o WebGL vem de baixo para cima e é virado), composto com o desenho em Canvas 2D e entregue ao codificador, que dita o ritmo. Cadeia pela detecção (`chooseVideo`, pura): WebCodecs H.264 em MP4 → WebCodecs VP9/VP8 em WebM → MediaRecorder (MP4 se ele souber) → só os cards. O MP4 e o WebM saem da **`mediabunny` 1.62.1** (MPL-2.0; TypeScript puro, sem dependências de execução, sucessora do `mp4-muxer`, que o autor aposentou; publicada em 22/10, a mais nova com duas semanas), num chunk de 223 KB (58 KB gzip) carregado só ao exportar. **Sem som:** nos stories a pessoa põe a música dela, e o ronco sintetizado viraria ruído. O vídeo aparece na própria folha para conferir, e "Compartilhar" é outro toque (o Safari só abre a folha com o gesto).
**Consequência.** O vídeo sai liso em qualquer aparelho; um celular lento só demora mais para gerar. Memória: um buffer de 8 MB reaproveitado por quadro e o arquivo montado na memória.

### D123 · Os cards em Canvas 2D, sem `html-to-image` (divergência)
**Decisão.** Abertura, números, conquistas e fotos, em 1080 × 1350 (feed) e 1080 × 1920 (stories), em JPEG, desenhados em Canvas 2D pelo mesmo código do filme (`draw.ts`): a Barlow pelo `FontFace`, as fotos do cache. O carro sai do próprio `CarSide`, serializado do DOM (`XMLSerializer`) como imagem, e não redesenhado em `Path2D`: é a mesma arte, o carro não tem texto (não depende de fonte) e não há `foreignObject`. O `html-to-image` da stack não está instalado e não entra: no Safari, o caminho por `foreignObject` costuma perder fontes e imagens.

### D124 · Os números do card final
**Decisão.** Paradas são as concluídas; km e horas somam só os trechos da rota real entre duas paradas concluídas (nunca horário inventado); o gasto em centavos contra o orçamento ("R$ 2.741 de R$ 3.000 · dentro do orçamento"). Ao abrir com rede, a tela busca as rotas e as fotos que faltam; sem rede, km e horas contam só o que o aparelho sabe (e sem rota nenhuma, não aparecem).

### D125 · O laboratório da fase 9
**Decisão.**
- `app_progressao` roda antes de tudo, inclusive antes do plano dos avisos (o navegador leva uns dois minutos, e os horários de "Hora de sair" e da assinatura morta se contam depois dele): as paradas concluídas vivas de A ganham lápide, a progressão de A e B é zerada (`lab_reset_progress`), e A conclui a primeira parada de uma viagem fixa nova. O cartão do "Primeiro pé na estrada" aparece na visão geral (de madrugada o Madrugador vem junto e é dispensado), "Usar no carro" põe o rack, o servidor tem o XP de A e, depois que o navegador de B abre, o de B, e a garagem de B mostra o rack.
- `app_retrospectiva` usa uma viagem fixa **do lab-b** (o lab-a precisa começar sem parada concluída), redatada para ter terminado ontem, com três paradas com coordenadas reais, uma memória com foto e um gasto. Roda no canal `chrome` do Playwright (o Chrome do runner, com H.264), o caminho do iPhone; a CI cobre o caminho de reserva no Chromium dela. Sem o Chrome, cai para o Chromium e diz qual canal usou.
- `retro`, em dois dias, pelo mecanismo da D105, também na conta do lab-b: arma para **o próximo 9h que ainda está à frente** (com o agendamento das 3h07, a viagem terminou ontem e o aviso chega hoje às 9h; a execução seguinte confere).
- Os cartões de conquista ficam desligados nos navegadores dos outros cenários (D119). As assinaturas armadas do lab-b passaram a ser poupadas no preparo e no fim.
- As viagens do roteiro (listas e estrada) são zeradas no início, antes de qualquer navegador entrar: a lista que a execução anterior deixou pronta, já no banco do aparelho de A, abria a festa do "Pronto para partir" antes de o preparo do dia chegar a ele, e a folha cobria as caixas.

### D126 · Números medidos
- Chunks do build: a retrospectiva 35,9 KB (14,1 KB gzip); o palco do filme 4 KB (o cenário é o da maquete, já em cache); a exportação do vídeo 223 KB (58,2 KB gzip, quase toda a `mediabunny`), carregada só ao tocar em "Vídeo"; o anfitrião dos cartões 14,6 KB; o Perfil 7,4 KB, a visão geral 15 KB, a garagem 11,6 KB, o Modo Viagem 51,9 KB. O chunk principal ficou em 503 KB (164 KB gzip); o `three`, igual (1.287 KB). Precache: 167 arquivos, 5,85 MB.
- Na CI (Chromium do Playwright, WebGL2 por software): o vídeo pela sequência de cards saiu pelo caminho de reserva, **WebM · VP9** (esse Chromium não tem H.264), com os 450 quadros em 14 s; o arquivo lido no Node tem 15 s e 1080 × 1920. O vídeo em 3D, quadro a quadro, sai no ritmo do WebGL por software: o teste anota o ritmo e cancela, porque os 450 quadros não cabem no tempo da CI.
- Testes: 617 Vitest em 81 arquivos (eram 538), 343 pgTAP (eram 284), 25 Playwright (eram 22).

## Fase 10 · Importação com IA (07/11/2026)

O Douglas disse na abertura que não precisava esperar o ok do plano: as escolhas abaixo seguem a recomendação do prompt da fase, e as paradas dele continuam (a chave no hospedado, a 0010 e a função no hospedado, o merge).

### D127 · O limite da importação pela `edge_call`, com trava e a hora da volta
**Contexto.** A DDL base (bloco 0008 do Passo 0) contava as linhas de `ai_imports` das 24 h, mas deixava o client atualizar as próprias linhas, inclusive o `created_at`: quem quisesse furava o limite. E pedia que duas chamadas simultâneas não furassem o limite, sem dizer como.
**Decisão.** `edge_call('import-itinerary', 20)` (D24), como a `route-day`. A `edge_call` ganhou, na 0010, um `pg_advisory_xact_lock` por pessoa e função: a segunda chamada espera a primeira e conta a linha dela; uma rota nunca espera uma importação. A recusa (54000, mesma mensagem) leva em `DETAIL` a hora em que a cota volta, a da linha que precisa sair da janela (com 20 de 20, a mais antiga). A função devolve 429 com `retry_at` e `Retry-After`, e a tela diz "A próxima leitura libera às 14:32". Acima de 30.000 caracteres, 413 antes de gastar cota.
**Consequência.** pgTAP `12_importacao`: a 20ª passa, a trava aparece em `pg_locks`, a 21ª é recusada e o `detail` é a mais antiga mais 24 h. O teste da 06 não mudou.

### D128 · `ai_imports` só como registro
**Decisão.** A pessoa lê as próprias linhas. A função, rodando como ela (RLS, sem chave secreta), abre a linha em `started` com `trip_id`, `input_chars` e `model` (grant de coluna), e a fecha uma vez com `status`, `model` (o que respondeu de fato: o fallback pode trocar), tokens e um código curto de erro (`check ^[a-z][a-z0-9_:]{0,59}$`: `max_tokens`, `deadline`, `refusal:general_harms`…, nunca texto livre). O trigger `a_close` impede reabrir ou mudar uma linha terminada (nem o dono do banco) e carimba `finished_at`. Entrou `canceled` (a pessoa desistiu no meio) e saiu `rate_limited` (a recusa por limite acontece antes de existir registro). O `trip_id` só aceita viagem de que a pessoa é membro, e fica nulo quando a viagem criada sem sinal ainda não subiu. O job `viajei-ai-imports`, a cada 10 min, fecha como `failed`·`abandoned` o que ficou aberto (o worker morto pela plataforma): nada fica `started` para sempre. O Supabase dá tudo a `authenticated` em tabela nova; o `revoke all` vem antes dos grants de coluna.
**Nunca o texto nem a resposta**, nem no banco, nem no log da função (uma linha por leitura, só com números e o código), nem no laboratório. A tabela não sincroniza.

### D129 · O schema da IA e o formato sem `parse` (divergência da 9.1)
**Contexto.** A 9.1 dizia `messages.parse` com o helper de Zod do SDK. No `@anthropic-ai/sdk` 1.3.0 (a versão com duas semanas; a 1.4.0 só traz APIs de administração), conferido no código: num stream, o `parse` do helper roda em cada bloco de texto e **lança erro** quando o JSON vem cortado (`max_tokens`, prazo) ou dividido por um fallback; e a conversão de schema dele (a mesma da 1.3.0 à 1.6.0) **tira `enum` e `const`**, então o tipo da parada, da reserva e do contato deixaria de ser restrito pela API.
**Decisão.** O schema da IA deriva do `importSchema` sem `lat`/`lng` (coordenada nunca vem da IA), em `_shared/import-ai.ts`. O JSON Schema sai por uma conversão nossa, `structuredSchema` (`z.toJSONSchema` e uma limpeza estrita): mantém `enum`, põe `additionalProperties: false` em todo objeto e tira o que a saída estruturada recusa (`pattern`, `minLength`, `minimum`, `$ref`…); o formato da data e da hora vai na `description`. Vai em `output_config.format` sem `parse`, e quem valida é o `fromAi` → `validateImport`, no texto inteiro, no servidor e de novo no app. O teste compara com o esperado escrito à mão.
**O limite de uniões (achado na primeira medição).** A API aceita no máximo 16 campos com união (lista de tipos ou `anyOf`) por schema, porque cada um multiplica o custo de compilar a gramática, e recusa o pedido inteiro com 400. No arquivo, todo opcional é união com `null`: eram 22, e as sete leituras da medição voltaram `failed`·`bad_request` antes de a IA ler uma linha. A CI não pegava porque nunca chama a IA. Na IA, o texto opcional virou texto: a IA escreve `""` quando o roteiro não diz, e um codec do Zod (`blank`) devolve `null` no `parse` e faz a ida no `toAi`, que gera a resposta gravada dos testes e do e2e. A forma da IA (`aiImportSchema`, `fromAi`, `toAi`) passou para o `import-schema.ts`, porque o app também precisa dela: o `partialImport` (o que chegou antes de um corte) passa pelo mesmo `fromAi` do servidor. Só os dois números (`travel_minutes_to_next`, `amount`) continuam com `null`: duas uniões. O schema sai da entrada do `parse` (`io: 'input'`), que é o que a IA escreve; o formato da data e do horário volta a ser conferido no `validateImport`. O prompt diz "vazio" onde dizia null nos textos, e o preview trata texto vazio como ausente. Um teste conta as uniões do schema contra o limite, e a medição agora reprova o job quando uma leitura termina em `failed` (antes ficou verde com as sete falhas).

### D130 · O prompt de sistema e o texto colado como dado
**Decisão.** O prompt inteiro está em `IMPORT_SYSTEM_PROMPT`, em português, estável (nada da viagem nele): transcrever, não completar; o texto entre `<roteiro>` e `</roteiro>` é dado, nunca instrução ("ignore as instruções" é conteúdo, e o que não couber vai para `unclassified`); horário, telefone, código, valor e data só se estiverem escritos; nada de estimar chegada, completar DDD ou acrescentar rua; telefone em E.164 quando tem DDD; missões do texto primeiro, depois até 8 sugeridas, curtas, sem o nome da parada e nunca sobre beber, comer em quantidade, velocidade ou quem dirige (D97). A mensagem leva antes um bloco `<viagem>` com o nome, o período, cada data com o dia da semana, a origem e a data de hoje em São Paulo, para resolver "sexta", "dia 13", "o terceiro dia". Qualquer `<roteiro>`, `</roteiro>` ou `<viagem>` dentro do texto colado vira `[roteiro]`: um roteiro não fecha a própria tag. Os exemplos do prompt não usam nada do seed (um teste garante), para a medição contra o seed não ser decoreba.

### D131 · Sem cache de prompt
**Decisão.** O prefixo estável (prompt e schema) tem perto de 2.500 tokens, acima do mínimo do modelo, mas gravar o cache custa +US$ 0,0013 por leitura e ler economiza US$ 0,0045: só compensa com mais de ~28% de leituras repetidas em 5 minutos. A repetição é rara (tentar de novo depois de um "inválido"). Sem `cache_control`.

### D132 · O protocolo com o app: SSE, e o prazo
**Decisão.** Erros antes do stream saem como JSON com status HTTP (400, 413, 429), como na `route-day`. Depois, SSE com `start` (o id do registro e o modelo pedido), `delta` (cada pedaço do JSON), `done` (o resultado validado no servidor e os tokens) e `error` (`refused` com a categoria, `truncated` com `max_tokens` ou `deadline`, `invalid`, `failed` com o código), e um comentário a cada 15 s de silêncio (o pensamento da IA) para nenhum proxy fechar a conexão. O codificador e o leitor moram em `_shared/import-protocol.ts`, puro. O app chama pelo mesmo `supabase.functions.invoke` da `route-day`: na `@supabase/supabase-js` 2.118 ele devolve a resposta sem ler quando o tipo é `text/event-stream` e aceita `signal` (o plano dizia `fetch` à mão; não precisou). Cancelar é abortar o pedido: o stream da função é cancelado, ela aborta a Anthropic e registra `canceled` (o `waitUntil` segura o worker para fechar o registro).
**Prazo.** O projeto está no plano Free pelo que se vê (nenhum add-on; o token não deixa ler o plano): 150 s de parede. A função para a Anthropic em 140 s e devolve o que chegou como `truncated`·`deadline`; o `beforeunload` fecha o registro como `failed`·`shutdown` se a plataforma encerrar antes. No Pro (400 s), o prazo é uma constante. `max_tokens` 64.000, como o skill recomenda para streaming: o freio de verdade é o prazo. Erros na cadeia tipada do SDK, do mais específico ao mais geral (`APIUserAbortError`, `RateLimitError`, `AuthenticationError`/`PermissionDeniedError` → `config`, `BadRequestError`, `InternalServerError` → `overloaded`, `APIConnectionTimeoutError`, `APIConnectionError`, `APIError`), e a chave ausente nos secrets vira `config`.

### D133 · O pensamento, por medição
**Contexto.** O `claude-sonnet-5-5` pensa por padrão (adaptativo, com o texto omitido): um silêncio antes do primeiro caractere do JSON, que o preview sente. O `effort` padrão dele é `high`; a decisão do Passo 0 é `medium`, mandado explícito. `{ type: 'disabled' }` dá 400; sem pensar é `{ type: 'between_tools' }`.
**Decisão.** A padrão, até a medição, é o comportamento do modelo: adaptativo com `effort: 'medium'`, e a tela mostra "Lendo o roteiro…" com um pulso até o primeiro dia. A medição roda nas máquinas do GitHub pela função publicada, como o lab-a (`lab.yml`, tarefa `medir-importacao`; a variante só vale para quem tem `runner` no `lab_access`): o texto do seed em adaptativo/`medium`, `between_tools`/`medium` e adaptativo/`low`, duas vezes cada, e um texto de quase 30.000 caracteres uma vez. Mede o tempo até o `start`, o primeiro caractere, a primeira parada e o fim, os tokens, o custo e a extração contra o seed campo a campo, com o que a IA inventou separado do que errou.
**Números** (07/11, run 42418917120: a função publicada, o texto do seed de 2.617 caracteres, duas leituras por variante):

| variante | 1ª parada | fim | campos certos | inventado |
|---|---|---|---|---|
| adaptativo · `medium` | 10,3 s e 2,7 s | 20,6 s e 15,3 s | 80 e 82 de 87 | nada |
| `between_tools` · `medium` | 3,9 s e 3,8 s | 17,2 s e 17,1 s | 82 e 82 de 87 | nada |
| adaptativo · `low` | 3,3 s e 3,7 s | 16,0 s e 16,2 s | 81 e 82 de 87 | nada |

Em todas, as 18 paradas e nenhuma a mais; ~6.050 tokens de entrada e ~3.000 de saída. O adaptativo quase não pensa nesta tarefa: a saída tem os mesmos tokens nas três. O `between_tools` foi o único a converter "Umas 6h30 de estrada" em 390 minutos (2 de 2; os adaptativos, 0 de 4). As diferenças comuns a todas: três "0 minutos" do seed onde o texto não diz nada (a IA deixa vazio, como pede o prompt), o tipo do "Reconhecimento do local da prova" (o seed diz `event`) e o contato "Hotel Niro (plano B)", que não casou pelo nome em nenhuma leitura (a medição não guarda a resposta: não se sabe se faltou ou veio com outro nome).
**Escolha do Douglas.** Fica o adaptativo com `effort: 'medium'`. A recomendação era o `between_tools`, pela latência estável e pela conversão do "6h30"; com duas leituras, os números não separam as duas com folga. A tela continua com "Lendo o roteiro…" até o primeiro dia.

### D134 · Acrescentar sem apagar
**Decisão.** A revisão (`reviewOf`) parte do que a viagem já tem no aparelho: a parada com o mesmo nome no mesmo dia (sem acento, sem caixa), a reserva com o mesmo nome, o contato com o mesmo telefone e o item com o mesmo texto começam desmarcados ("Já está no roteiro"); a repetida dentro do próprio texto é marcada e fica. O plano (`planImport`, puro) só cria e restaura: nunca aposenta dia, nunca toca parada existente, e o título do dia só entra onde estava vazio. Cada parada nova entra depois da última que já existia no dia com horário menor ou igual (sem horário, junto da nova anterior); a ordem do texto nunca se inverte. Um dia fora das datas fica de fora até a pessoa ampliar a viagem, dentro do limite de dias. Cada "não classificado" vira observação de uma parada nova ou de um dia, item de Antes ou de Mala, ou é descartado; o "Salvar" espera todos terem destino. Tudo vai numa transação: `mutate.batch`, nova, grava linhas novas e edições de várias tabelas no Dexie e na outbox de uma vez (ou nada), com um aviso por tabela; sobem no próximo `sync_push`, um broadcast por viagem.

### D135 · O carregador do exemplo pelo mesmo caminho
**Decisão.** "Carregar viagem de exemplo" (só em desenvolvimento) virou uma importação do seed sem IA: `reviewOf` → `planImport` → `mutate.batch`, com tudo mantido e `source: 'user'` (ninguém leu com IA). Rodar duas vezes não duplica, pela mesma revisão. O seed traz as coordenadas, e elas passam (`geo.via: 'file'`).

### D136 · `active` com `source: 'ai'`
**Decisão.** O que a pessoa manteve na revisão já foi revisado: paradas, itens de lista e missões entram `active` (nunca `suggested`, que continua das sugestões da D96), com `source: 'ai'` nos itens (D93) e na parada (D137).

### D137 · O fato da conquista `planner`: `stops.source`
**Contexto.** A regra pura da fase 9 recebe `imports: { trip_id, at }[]` e o motor passava `[]`. O prompt pede que o fato esteja nos dados que sincronizam, para a regra ler sem sinal. `ai_imports` não sincroniza; o item de lista com `source: 'ai'` não serve (uma importação pode não ter lista).
**Decisão.** A 0010 acrescenta `stops.source` (`user` | `ai`, padrão `user`), imutável pelo `sync_guard` como `checklist_items.source`. O motor preenche `imports` com `importsOf`: a parada importada mais antiga de cada viagem, pelo `created_at`. A equipe conquista junto (D115): o Planejador vale para quem importou e para quem viaja junto, como o Primeiro pé na estrada. O `sync_push` e o `sync_pull` são genéricos por coluna e não mudaram.
**Consequência.** A origem de cada parada fica registrada (a tela pode, um dia, mostrar "veio da importação"). O laboratório esvazia a viagem dele no fim (D139): a progressão do dia seguinte não vê parada importada viva.

### D138 · O rascunho e a revisão no aparelho
**Decisão.** O texto colado fica no Dexie (`sync_state['import:draft:<viagem>']`), numa pausa da digitação e ao sair da tela, e não no `localStorage`: o texto tem dados pessoais, e "Sair da conta" apaga o banco local inteiro (D20). A revisão em andamento também (`import:review:<viagem>`): fechar o app no meio da revisão não custa outra leitura. O que a busca de lugar acha sozinha não é gravado (refaz-se do cache do Nominatim, sem rede); só a decisão da pessoa fica (escolher, "nenhum destes", editar). Os dois somem depois de salvar. Sem rede, o botão diz "Precisa de internet para ler o roteiro" e o texto continua.

### D139 · O laboratório da fase 10
**Decisão.**
- `app_importar`, logo depois do `app_progressao`: o lab-a, numa viagem fixa só dele (`v5(lab-a, 'lab:importar')`, de hoje + 30 a hoje + 31), esvaziada no começo e no fim, cola um texto fixo e inventado (dois dias por "primeiro dia" e "segundo dia", um hotel com código e telefone, uma parada "de manhã", sem horário), lê com a IA de verdade, espera a busca de lugar, escolhe a primeira opção onde há escolha, descarta os não classificados e salva. Confere no servidor as paradas com `source: 'ai'`, a parada sem horário, o código exato e o telefone em E.164; guarda em `data` o tempo até a primeira parada e até a revisão, os tokens e o custo, lidos da linha de `ai_imports`. Uma leitura por dia; nenhum secret novo no GitHub (a chave mora na função).
- A tarefa `medir-importacao` do `lab.yml` (D133), só sob demanda.
- O alvo `preview` não voltou na fase 9 (o `lab.yml` só tem a produção, D106): o cenário roda na produção depois do merge.

### D140 · Números medidos e custo
- **Uma importação do tamanho do seed** (2.617 caracteres): US$ 0,042, com ~6.050 tokens de entrada a US$ 2/MTok e ~3.000 de saída a US$ 10/MTok. A parte fixa da entrada (prompt, schema e o bloco `<viagem>`) tem perto de 5.100 tokens, o dobro da conta da D131; o cache gravaria +US$ 0,0026 por leitura para economizar US$ 0,009 numa repetição em 5 minutos, que continua rara: a D131 fica.
- **O texto de 29.800 caracteres:** 19.681 tokens de entrada e 19.473 de saída, US$ 0,23; a primeira parada em 17,1 s e o fim em 90,7 s, dentro do prazo de 140 s.
- **O laboratório diário** (`app_importar`, um texto curto de dois dias): estimado em ~US$ 0,02 por execução, ~US$ 0,60 por mês. O medido sai do `data` do cenário, na primeira execução na produção depois do merge.
- **A chave** `viajei-supabase` está na organização pessoal do Douglas no Console (workspace Default), sem data de expiração (escolha dele). A organização está vinculada ao plano Ultra dele desde 07/11/2026: US$ 200 de crédito de API por ciclo, sem acumular, e sem recarga automática. Se o crédito acabar, a API para até o ciclo seguinte e nada é cobrado; cabem ~4.700 importações do tamanho do seed por mês.
- **A primeira medição** (run 42416818982) falhou inteira com `failed`·`bad_request`, pelo limite de uniões da saída estruturada (D129).
- **Testes:** 715 Vitest em 91 arquivos (eram 617 em 81), 375 pgTAP (eram 343), 28 Playwright (eram 25). A tela de importar é um chunk próprio de ~48 KB (17 KB gzip), carregado só na rota.

## Fase 11 · Mapa e clima (07/11/2026)

O Douglas disse na abertura que não precisava esperar o ok do plano: as escolhas abaixo seguem a recomendação do prompt da fase. Depois, deixou aprovado aplicar a 0011, publicar a `send-notifications` e fazer o fast-forward na `main` sem esperar, com a CI e o laboratório no preview verdes, e rodar o laboratório na produção em seguida. O primeiro commit da fase devolveu o alvo `preview` ao laboratório (a D106, reescrita).

### D141 · Os tiles nunca eram gravados (defeito da rota `osm-tiles`)
**Contexto.** A rota do service worker existia desde a fase 2 e nunca guardou um tile. Sem `cacheWillUpdate`, o Workbox 7.4.1 só grava status 200; o Leaflet, por padrão, cria o `<img>` sem `crossorigin`, o pedido sai em no-cors e a resposta chega opaca (status 0). E o filtro por `hostname.endsWith('tile.openstreetmap.org')` aceitava qualquer subdomínio.
**Decisão.** O `TileLayer` pede com `crossOrigin` (o OSM responde `access-control-allow-origin: *`), a rota filtra por `url.origin === 'https://tile.openstreetmap.org'` e o `CacheableResponsePlugin({ statuses: [200] })` deixa só o 200 entrar. **Nunca `[0, 200]`:** o Chrome conta uns 7 MB de cota por resposta opaca, e um erro opaco ficaria preso no `CacheFirst`. A URL, o zoom máximo (19), a atribuição e o tamanho do cache moram num lugar só (`src/lib/map/tiles.ts`), que o mapa e o service worker leem.
**Consequência.** O e2e do projeto `pwa` e o `app_mapa` conferem pelo menos um tile no cache com status 200, e o mapa sem rede, depois de recarregar, mostra os tiles do cache.

### D142 · Os 30 dias contra o `max-age`, nunca baixar antes, e o tamanho do cache
**Contexto.** A política dos tiles do OSM diz "Offline use is not permitted" nesse servidor; as respostas trazem `max-age` de umas 25 h, `stale-while-revalidate` de 7 dias e ETag. O prompt pede `CacheFirst` de 30 dias.
**Decisão.** O aparelho guarda só o que a pessoa já viu, e nunca baixa antes os tiles da rota nem "salva uma área". Guardar 30 dias vai além do `max-age`: é a leitura desta fase, porque o aparelho pede menos ao servidor e o mapa já visto continua lá na estrada sem sinal. A linha e os pinos vêm do Dexie e aparecem mesmo sem tile, sobre o fundo na cor do app. O limite subiu de 500 para 1.500 entradas: a viagem do seed, com cada dia aberto, duas aproximações e os níveis intermediários do voo entre os dias, passa de 300 tiles, e 500 despejariam tiles da própria viagem. Com `purgeOnQuotaError`.
**Consequência.** Umas quatro viagens como a do seed, uns 25 MB. O número medido está na D153.

### D143 · react-leaflet, a licença e os pinos por portal
**Decisão.** `leaflet` 1.9.4 (BSD-2; a 2.0 está em beta), `react-leaflet` 5.0.0 e `@types/leaflet` 1.9.22, mais `workbox-cacheable-response` 7.4.1, todos publicados há mais de duas semanas. O react-leaflet usa a **Hippocratic-2.1**, uma licença ética que a OSI não aprovou: fica, porque é a stack aprovada; a alternativa seria o Leaflet puro numa classe, como o `WorldRuntime`. As props do `MapContainer` são imutáveis depois de montar: o primeiro enquadramento vai nelas e os seguintes num filho com `useMap()`.
- O ícone padrão do Leaflet quebra com o Vite (os PNGs viram `data:`). Os pinos são `divIcon` cujo `html` é um elemento criado pelo próprio componente, onde o React desenha por portal: o `StopKindIcon`, o número e o estado, com a arte do app e sem `react-dom/server`.
- A classe de um caminho do Leaflet não muda depois de criado (o `setStyle` não mexe em `className`): uma linha que troca de tipo (traço reto → rota) ou de estado (rodada) é outra linha, pela chave.
- As cores das linhas vêm de classes CSS com os tokens: o atributo `stroke` de um SVG não lê `var()`.

### D144 · A tela do mapa
**Decisão.**
- **Fora do Modo Viagem e não é GPS:** sem "você está aqui", sem pedir a posição, sem rota passo a passo. Entra pelo atalho "Mapa" da visão geral (oito atalhos, duas linhas de quatro) e por "Ver no mapa" na página do dia (`?dia=<id>`).
- **Os chips:** "Viagem" e "Dia 1 · sex"… A escolha fica na URL. Abre no dia pedido; senão, durante a viagem, hoje; antes dela, o Dia 1; depois dela, a viagem inteira.
- **"Viagem" é um traço por dia, não o `spliceTrip` (D121).** No filme, a ponte reta da noite entre um dia e o outro funciona; num mapa, ela fingiria um caminho. Cada dia desenha a própria estrada ou o pontilhado. Nessa vista os pinos ficam menores e sem número, porque a numeração recomeça a cada dia.
- **As linhas:** a rota real do Dexie, cortada nas paradas (`splitAtStops`, que saiu da retrospectiva para `lib/geo/split.ts`), vale só se o hash dela é o das coordenadas de agora; senão conta como rota que falta. Sem rota, um traço reto pontilhado em tinta, claramente diferente da estrada. O trecho entre duas paradas concluídas é o rodado: cheio e mais grosso; o que falta, mais fino e mais claro. Uma borda clara por baixo da estrada a deixa legível sobre qualquer tile. Com rede, a tela busca as rotas que faltam (D124), pela mesma regra da retrospectiva (`missingRoutes`, pura), que agora também refaz a rota de hash velho. Cada dia (com o hash das paradas de agora) é pedido uma vez enquanto a tela está aberta, inclusive o que chega depois: o e2e da viagem do seed achou que, abrindo o mapa direto por um link num aparelho novo, a viagem ainda estava no primeiro sync e nenhuma rota era pedida.
- **Os pinos:** numerados na ordem da lista do dia (as paradas sem lugar contam, para o número bater), com os estados da lista: concluída (check verde), pulada (apagada), próxima (anel laranja que pulsa, parado com reduzir movimento; só no dia de hoje), pendente. As sem coordenada viram uma linha abaixo do mapa ("2 paradas sem lugar no mapa"), com "Pôr no mapa" para a página do dia.
- **Para quem ficou em casa:** no dia de hoje, as trilhas da própria pessoa e de quem compartilha a posição, finas, na cor de cada um, e o carro da viagem (`CarSide`) no último ponto, com "Visto às 14:02". Não é posição ao vivo: muda quando a trilha sincroniza.
- **O enquadramento:** `fitBounds` do que está visível, com margem para os pinos, o aviso de sem internet e a atribuição; ao trocar de dia, `flyToBounds` de 0,9 s, e sem animação com reduzir movimento. O mapa é um cartão no fluxo da página, como a maquete: o cabeçalho e os chips ficam fora dele, e a página respeita a área segura embaixo.
- **A folha do pino** (a `Sheet` do app): nome, tipo, dia e posição ("3ª parada" ou "saída"), horário, "fecha às", endereço, a previsão no horário, Google Maps e Waze (os mesmos links do roteiro) e "Ver no roteiro".
- **O tema:** um filtro CSS só na camada dos tiles aproxima o OSM do papel do app; no escuro, a versão invertida e apagada. A atribuição fica numa pílula no canto, longe da curva do cartão, e os botões de zoom no canto oposto.

### D145 · Os lugares do clima (divergência do 4.9)
**Contexto.** O 4.9 dizia "pela primeira parada com coordenadas". Numa viagem de carro, o tempo de onde se acorda e o de onde se dorme diferem: Papanduva, no planalto, e Montenegro, no vale, num mesmo dezembro.
**Decisão.** Puro em `_shared/weather.ts`, o mesmo no app e no aviso:
- **Onde o dia começa e onde termina:** a primeira e a última parada viva, não pulada, com coordenada. O fim só conta a 50 km ou mais do começo, medidos nas coordenadas de verdade.
- **Cada parada com horário escrito**, pela previsão da hora cheia mais perto (13:30 → 14:00; das 23:30 em diante, 23:00). Parada sem horário não ganha previsão por hora: nunca se inventa uma chegada.
- **Duas casas decimais** (uns 1 km), para o mesmo lugar não sair duas vezes. Não uma: o Open-Meteo corrige a temperatura pela altitude do ponto pedido, e 10 km no planalto podem ser 500 m de altitude, uns 3°.
- **O horizonte:** hoje até hoje + 15 no fuso de São Paulo (o Open-Meteo recusa o pedido além disso; conferido); para os dias além, "previsão a partir de" a data menos 15. O dia que passou não mostra nada.
- **Os códigos:** a tabela atual do Open-Meteo, com o 97 (conferida na documentação), em pt-BR, com ícone (lua de noite) e uma gravidade que pesa para quem dirige: neblina sobre nuvem, chuva sobre garoa, trovoada sobre tudo. Código desconhecido tem rótulo de reserva e nunca vence um conhecido.
- **Os textos:** o dia junta os lugares (a menor mínima, a maior máxima, a maior chance de chuva e o código mais grave). A chance de chuva só se diz a partir de 20%, em todas as telas e no aviso: abaixo disso é ruído. A pílula da maquete ganha a nuvem de chuva acima de 50%, quando chover é mais provável que não.

### D146 · O clima no aparelho
**Decisão.**
- **Direto do navegador:** o Open-Meteo não pede chave e tem CORS aberto. O limite dele é por IP, então cada aparelho conta o seu, e nada passa pelo Supabase. **Uma chamada para a viagem inteira**, com todos os lugares dos dias do horizonte e a previsão por hora; a resposta casa com os lugares pela ordem do pedido (a latitude que volta é a do centro da grade do modelo, conferido).
- **O cache:** `WeatherEntry` na store `weather` (a chave `trip_day_id` existe desde a v1: o Dexie fica na v4), com `trip_id`, `date`, `fetched_at`, o `hash` dos lugares e da data, os lugares do dia e a hora de cada parada. O hook (`useTripWeather`) segue o `useDayRoute`: lê o Dexie e, com rede e cache velho, busca pelo TanStack Query e grava. **Velho** é um dia do horizonte sem entrada, outro `hash` ou o prazo: **1 h durante a viagem**, porque o tempo do dia é o que importa e os modelos se refazem a cada hora; **6 h antes**, porque a previsão de daqui a dias muda devagar. A hora do que está guardado entra na chave da busca, e a busca vencida é outra busca.
- **Sem rede**, mostra o que tem, com "atualizado às 07:40", "ontem às 18:10" ou a data. Uma falha do Open-Meteo não mexe na conectividade do app (a internet pode estar boa).
- **O que sai:** a resposta substitui as entradas da viagem (o dia que saiu do horizonte ou ficou sem lugar sai junto); o `wipeTrip` leva o clima da viagem que saiu; e uma varredura por abertura do app tira o dia que já passou e o de viagem que não está mais no aparelho.
- **Onde aparece:** a faixa da visão geral (ícone, máxima, mínima, chuva, "a partir de"), a página do dia ("Papanduva 26° / 15° → Nova Petrópolis 31° / 19° · chuva 60%", com o município pelos dados embutidos e, longe de qualquer centro, o nome da parada), o detalhe pequeno em cada parada com horário, a linha discreta do "Agora", a folha do pino no mapa, e na maquete o chip da abertura (entra com o carro, grande sobre a origem, e voa para a faixa de cima pelo mesmo `layoutId`; com reduzir movimento, já pequeno) e a nuvem nas pílulas. Tudo em HTML, nada na cena 3D; tudo do Dexie, sem rede. Sem previsão, nada aparece: nem traço, nem zero.

### D147 · A 0011
**Decisão.** `0011_clima.sql` recria duas funções com a mesma assinatura (os grants e o `claim_due_notifications` continuam valendo):
- `due_notifications`, com o corpo inteiro da 0009 (a 0010 não o recriou): o `morning_briefing` ganha `last_point` (a última parada com coordenada), e o `first_point`, que era só o gancho da 0009 e ninguém lia, passa a ignorar parada pulada, como os lugares do app.
- `lab_diagnostics`, com o `data.weather` de cada aviso do laboratório: `notifications_sent` é invisível ao client, e o laboratório confere o texto do briefing pelos fatos que a função gravou. Uma divergência do prompt, que previa a 0011 só para o `due_notifications`.

**Consequência.** pgTAP `13_clima` (9 testes): o fim do dia, o dia de uma parada só, as puladas e a sem coordenada fora, o dia sem lugar, os outros fatos iguais, o diagnóstico só das linhas do laboratório e o `due_notifications` continuando só do `service_role`. O expurgo da fase 12 vira a 0012.

### D148 · O clima no aviso: uma chamada, prazo, sem clima quando falha
**Decisão.** A `send-notifications` junta os `morning_briefing` do lote que ainda não têm clima, escolhe os lugares pela regra do app (`dayEnds`, sobre `first_point` e `last_point`) e faz **uma** chamada ao Open-Meteo, só com o resumo do dia, com **prazo de 3 s** (que vale mesmo se o `fetch` ignorar o sinal). Antes de enviar, grava `data.weather` na linha de `notifications_sent`: `{ status: 'ok', places: [...] }` com os números de cada lugar, ou `{ status: 'none', reason }` com um código curto (`no_point`, `no_data`, `timeout`, `network`, `invalid`, `http_<status>`). A nova tentativa de um aviso lê o que ficou gravado: o mesmo texto, sem chamar o Open-Meteo de novo. O aviso nunca espera o clima: sem resposta, sai sem ele. O Open-Meteo vê o IP compartilhado do Supabase, que pode bater no limite; uma chamada por minuto com briefing fica muito abaixo dele.
**O texto**, numa segunda linha (no Android recolhido aparece a primeira; no iPhone, as duas):
- "Dia 1 de 4 · sexta" / "4 paradas · primeira saída às 07:00" / "Parcialmente nublado, 15° a 31°, chuva 60%";
- "Dia 2 de 4 · sábado" / "1 parada · primeira parada às 09:30" / "Céu limpo, 14° a 27°";
- sem clima, o texto de antes.

**Consequência.** Os testes rodam a função com uma resposta gravada de verdade do Open-Meteo (dois lugares em lista, um em objeto) e com ele fora do ar (o prazo, a rede, 429, resposta fora do formato, o dia sem números). Um `data.weather` fora do formato vira null na leitura: o aviso sai sem clima, nunca deixa de sair.

### D149 · As atribuições
**Decisão.** "© OpenStreetMap" com link para a página de copyright, sempre visível no canto do mapa, numa pílula que nada cobre, e o prefixo do Leaflet só com o nome. O Open-Meteo (CC BY 4.0: um link junto de onde o dado aparece) vai com "Dados do tempo: Open-Meteo.com" nas telas com o detalhe: a faixa da visão geral, a página do dia e a folha do pino. O chip da maquete, as pílulas e o "Agora" contam com elas: é a leitura desta fase do "junto de onde o dado aparece", porque um link a mais no HUD de quem dirige é ruído.

### D150 · Os testes sem o mundo de fora
**Decisão.** No Playwright, o navegador inteiro roda com `--host-resolver-rules` que fazem `tile.openstreetmap.org` e `api.open-meteo.com` não resolverem: nenhum teste pede tile nem previsão de verdade, nem os que criam contextos à mão, nem o service worker. Os testes do mapa e do clima fingem os dois com `context.route` (`e2e/helpers/world.ts`: um PNG de 256 × 256 com CORS aberto, uma previsão fixa para cada lugar, e a `route-day` respondendo uma estrada), que pega também os pedidos do service worker no projeto `pwa`. O teste sem rede tira a rota dos tiles antes de ficar sem rede: o que aparece vem do cache.
**Consequência.** `e2e/mapa.spec.ts` (pinos, linha, atribuição não coberta, folha, troca de dia, "Ver no mapa"), `e2e/mapa.pwa.spec.ts` (o tile no Cache Storage `osm-tiles` com 200 e o mapa sem rede depois de recarregar) e `e2e/clima.spec.ts` (a faixa, o resumo do dia, o detalhe da parada, uma chamada só, o "a partir de" e o "atualizado às" sem rede).

### D151 · O laboratório da fase 11
**Decisão.**
- `app_mapa` e `app_clima`, depois do `app_importar`, numa viagem fixa do lab-a (`v5(lab-a, 'lab:mapa')`, de hoje, avisos desligados) com três paradas reais na serra, novas a cada execução (D53). O mapa abre com os tiles de verdade, num viewport de celular e num zoom só, sem arrastar (umas dezenas de tiles, dentro da política), e confere os pinos, a rota real (`route-day`), a atribuição sem nada por cima, pelo menos um tile no cache com 200 e, sem rede, depois de recarregar, os tiles do cache e o aviso. O clima confere a faixa com os números de hoje pelo Open-Meteo de verdade e, sem rede, o "atualizado às".
- O `briefing` passou a montar o texto esperado pelos fatos que a função gravou (`data.weather`, pelo `lab_diagnostics`): com clima, a segunda linha refeita dos números; sem clima, o motivo tem de ser um dos códigos. A parada da viagem do briefing ganhou coordenada, para o servidor buscar o clima de verdade todo dia. Enquanto a função publicada ainda não grava o clima (o preview usa as funções da produção), o cenário confere o texto de antes e diz isso: a função nova se reconhece pela resposta dela, que traz o resumo `weather`.
- Primeiro no preview da branch, depois na produção.
- **O prazo do vídeo da retrospectiva (ajuste no cenário da fase 9).** Os dados gravados mostram que o Chrome da máquina do GitHub também exporta em WebM · VP9 (não tem H.264; a D125 supunha o MP4 do iPhone) e por software: a exportação levou 167 s, 733 s, 767 s e 781 s em 07/11, e uma execução no preview desta fase chegou a 70% nos 15 min de prazo. O prazo foi para 25 min e o do job para 45 min. O cenário continua exportando o vídeo em 3D inteiro, que é o que ele prova.

### D152 · O que ficou fora
- O céu da maquete mudando com o tempo (nuvens, chuva em 3D): o fps no iPhone ainda não foi medido, e a maquete mostra o dia inteiro, enquanto o tempo muda ao longo dele.
- Baixar antes os tiles da rota ou "salvar uma área" (a política do OSM não permite).
- Previsão para parada sem horário, para dia que já passou e alerta de tempo.
- "Você está aqui" ou qualquer pedido de posição no mapa.

### D153 · Números medidos
- **Chunks** (build da CI): o mapa é um chunk só da rota, 170,3 KB (51,7 KB gzip) com o Leaflet e o react-leaflet, mais 18,5 KB de CSS (7,3 KB gzip). Visão geral 17,8 KB (era 14,1), página do dia 13,6 KB, maquete 19,1 KB (era 16,6), Modo Viagem 52 KB (era 51,5). O React saiu para um chunk comum (131 KB), porque o chunk do mapa importa o `react-dom` (o portal dos pinos): o chunk principal foi de 502,8 KB para 304,7 KB, com o mesmo total na abertura. Precache: 201 arquivos e 6,14 MB (eram 174 e 5,92 MB).
- **O primeiro quadro com a viagem do seed inteira** (CI, Chromium, perfil iPhone 15; 18 paradas, 14 trechos, 5.967 pontos de estrada de mentira, um a cada ~150 m): 46 ms da montagem ao primeiro quadro, e tudo na tela 0,75 s depois de recarregar. Na vista da viagem, a simplificação do próprio Leaflet deixa algumas dezenas de pontos no SVG. **O SVG fica**: o canvas não traria nada e tiraria o `data-map-route` dos testes.
- **Tiles por dia** (laboratório, tiles de verdade, Pixel 7, um zoom só): 6 tiles na tela para um dia de três paradas na serra, os 6 no cache com 200 e os 6 de volta sem rede. Um dia de estrada longa enquadra num zoom menor, com o mesmo tanto de tiles; o que enche o cache são as aproximações e os níveis do voo entre os dias, daí as 1.500 entradas (D142).
- **O clima** (laboratório): uma chamada do navegador por viagem; hoje 18° / 10° na faixa; sem rede, "atualizado às 20:50".
- **O laboratório no preview** (run 42431603782, código da fase): 31 de 32 verdes. O `app_mapa` em 23 s, o `app_clima` em 1 s, o `briefing` no texto de antes (a função publicada ainda não grava o clima) e a retrospectiva em 19 min 50 s (o prazo antigo, de 15 min, não teria bastado). O vermelho é o `app_importar`, o defeito da fase 10 ("escolher o local desmarca a parada"), igual na produção desde antes da fase 11; a correção está na `origin/fase-10`.
- **Testes:** 761 Vitest em 96 arquivos (eram 715 em 91), 384 pgTAP (eram 375), 33 Playwright (eram 28).

## Fase 12 · Polish e E2E (07 e 08/11/2026)

O Douglas não estava presente: deu o ok antecipado para seguir sem esperar o plano, terminar a publicação da fase 11 e publicar a 12 (prompt `docs/fases/fase-12.md`, seção 2). As escolhas abaixo seguem a recomendação do prompt; os limites dele (senha, contas, `.env*`, secrets e painéis, dados reais, comandos destrutivos, outras sessões, gasto) continuaram valendo.

### D154 · O fechamento da fase 11
**O que aconteceu.** O chat da fase 11 parou às 22h20 de 07/11, esperando o Douglas: CI verde e o laboratório no preview com 31 de 32, o vermelho sendo o `app_importar`, da fase 10 (escolher o local desmarcava a parada, e só uma chegava ao servidor; falhava igual na produção). A correção estava na branch `fase-10` (`5eeda8c`), com a CI vermelha num teste, e o chat da fase 10 também esperava o Douglas. Pela seção 1 do prompt da fase 12, isso é o estado D (laboratório vermelho no último código e a branch parada há 2 h).
**O que este chat fez.**
- Às 00h21 de 08/11, um commit próprio na `fase-11` (`a689fa6`): o código do `5eeda8c`, sem a parte do `decisoes.md` (a numeração seguiu na fase 11), e o e2e casando o nome exato da caixa ("Cascata do Caracol" também casava "Foto na Cascata do Caracol"; era a falha daquela CI). A `fase-10` fica como está: o conserto entrou pela 11.
- CI verde (763 testes de unidade, 33 de ponta a ponta) e o laboratório no preview verde: 29 cenários, o `app_importar` com as 5 paradas salvas, custo de US$ 0,018.
- A 0011 no hospedado, depois do `--dry-run` (só ela pendente, sem seeds nem papéis), e a `send-notifications` publicada (versão 7), as duas conferidas por leitura.
- O segundo laboratório no preview, com a função nova: o briefing já sai com o clima ("Garoa moderada, 8° a 17°, chuva 98%"). Mas o `app_progressao` falhou: o rack não subia (D164). E o `app_importar` falhou por outro motivo: o lab-a tinha gastado as 20 leituras do dia nas execuções da noite, e o app mostrava, certo, "Limite de leituras do dia".
- Três commits próprios na `fase-11`, cada um com o porquê: o prazo nas chamadas do sync (`1a91064`, D164); a importação do laboratório termina como skip quando o lab-a gastou as leituras do dia, antes ou depois do toque em "Ler o roteiro" (`e5f29c6`, `79b7cfd`); e, quando o rack não sobe, a falha mostra a fila do aparelho com o último erro do servidor (`dc7a04e`).
- O laboratório no preview de `dc7a04e`: 28 cenários verdes e a importação em skip (a próxima leitura do lab-a libera às 18h39 de 08/11). CI verde (767 testes de unidade, 33 de ponta a ponta).
- O fast-forward da `main` para `dc7a04e` às 02h56 de 08/11, sem force, e o laboratório na produção verde: 28 cenários, a importação em skip pelo mesmo limite.
- Foram 6 laboratórios no preview e 1 na produção nesta passagem. Só dois leram roteiro com a IA (US$ 0,018 cada, US$ 0,036 no total); nos outros, o limite do dia já valia. Nenhuma medição extra.

**O chat da fase 11** acordou com a `main` andando, viu o fechamento feito e atualizou só a memória; não mexeu em git, hospedado nem laboratório.

### D155 · O expurgo: o que sai, quando, e por quê cada corte
**Contexto.** A regra do prompt (4.1): exclusão de viagem soft, só o dono, e expurgo por job no servidor depois de 30 dias. As lápides das viagens vivas, os registros do servidor e os arquivos órfãos do Storage cresciam sem fim.
**Decisão.** Uma passada por dia (`private.purge`, com os cortes como parâmetros), na ordem:
- **Viagens excluídas há 30 dias** (`deleted_at` e `synced_at`: uma exclusão feita sem sinal que só chegou ontem conta de ontem) saem inteiras, pela cascata das FKs, conferida no catálogo: dias, paradas, trilhas, reservas, memórias, anexos, listas, contatos, gastos, participações, preferências e avisos enviados. Ficam, sem a viagem (`on delete set null`), o XP e as conquistas de cada pessoa (D112) e o registro das importações (D128). O aparelho que ainda tiver a viagem recebe `revoked` no próximo pull, como quem foi removido.
- **Lápides de viagens vivas com 90 dias**, contadas pelo `synced_at` (há quanto tempo o servidor as mostra a todos), não pelo `deleted_at`. Filhos antes dos pais, e uma lápide só sai quando nenhuma linha aponta para ela por FK em cascata, a não ser outra lápide que sai na mesma passada: o expurgo nunca leva uma linha em cascata. Uma reserva viva numa parada apagada segura a parada; ela sai quando a reserva sair. As FKs `set null` (missões e gastos de uma parada ou reserva, D93) soltam o vínculo, e o `sync_guard` carimba a linha, que chega aos aparelhos.
- **90 dias e não 30 para as lápides:** são pequenas, e o primeiro corte cai em fevereiro de 2027, depois da viagem real de 11 a 14/12. O mecanismo fica pronto e testado (pgTAP, Vitest, e2e e laboratório), e o primeiro `resync` de verdade não acontece no meio da viagem.
- **Registros do servidor com 90 dias:** `notifications_sent` (pelo horário do aviso), `edge_calls`, `ai_imports` encerradas, `lab_runs` (os cenários vão junto), `lab_inbox` e as assinaturas de push mortas (`failed_at`). Conferido que nada depende de mais: o dedupe do `team_arrived` só olha paradas do dia de hoje, e uma viagem tem no máximo 61 dias; o limite da `edge_call` olha 24 h; o ciclo armado do laboratório dura dois dias; o painel `/lab` mostra as últimas execuções. A importação ainda aberta nunca sai (o job da D128 a fecha).
- **`dry_run`** conta exatamente o que a passada de verdade apagaria (o pgTAP compara os dois relatórios) e não apaga nada. O relatório tem, por categoria, quantos se qualificam e o mais novo deles: o laboratório confere todo dia, com o relógio dele, que o mais novo é mais velho que a regra.
**Consequência.** 13 índices novos nas FKs que a cascata e o "nada depende dela" percorrem (os advisors do projeto apontavam 25 FKs sem índice; as 12 para `profiles` ficam sem, porque o app não apaga perfil).

### D156 · O horizonte e o `resync`
**Contexto.** A lápide some do aparelho no pull (D96). Quando o expurgo a apaga do servidor, um aparelho que não puxa há mais tempo que isso nunca saberia da exclusão e guardaria a linha para sempre.
**Decisão.**
- O expurgo grava um horizonte (o corte de 90 dias) por viagem que perdeu lápides (`private.trip_horizons`) e por pessoa que perdeu uma participação (`private.user_horizons`).
- O `sync_pull` e o `sync_pull_user` chamados com um cursor anterior ao horizonte respondem `resync: true` **com o retrato inteiro na mesma resposta** (o cursor vira `-infinity`).
- No aparelho, numa transação Dexie só (`applyTripPull`), saem as linhas da viagem que o servidor já carimbou, que o retrato não trouxe e que não têm operação na outbox; depois o retrato entra como um pull comum (lápides, pendências por cima) e o cursor vai para o `server_time`. Ficam a outbox, a fila de fotos (`uploads`), a projeção local que o servidor ainda não carimbou (D15) e os caches recalculáveis (`blobs`, `routes`, `weather`, `travel_state`). A linha sai sozinha, sem `removeWithChildren`, que levaria o arquivo em cache e o envio da foto; um filho que também sumiu do servidor sai pela própria tabela. Uma tabela ausente da resposta fica como está.
- No pull do usuário, a participação que sumiu vira viagem deixada (o pull da viagem responderia `revoked` de qualquer jeito).
**Divergência do texto do prompt.** O prompt descreve "apaga, zera o cursor e puxa de novo". A resposta já traz o retrato: a tela nunca vê a viagem vazia entre o apagar e o puxar (o `useLiveQuery` só vê o fim da transação), não há segunda ida à rede, e não há laço com o cursor do aparelho novo (`EPOCH`, sempre anterior a qualquer horizonte), que recebe o mesmo retrato que já receberia.
**Consequência.** Testes: Vitest no `apply-pull` (a fantasma sai; a criada sem sinal, a editada sem sinal, o Blob e o envio da foto ficam; a outra viagem fica; uma tabela ausente fica; sem `resync`, nada sai), pgTAP do horizonte, o e2e do aparelho atrasado e o cenário `app_resync` do laboratório.

### D157 · O Storage pela API, e o defeito que o expurgo achou na importação
**Decisão.** A função SQL só lista os objetos (apagar a linha de `storage.objects` por SQL deixaria o arquivo): os das pastas das viagens expurgadas e os sem linha viva há mais de 7 dias, pela D79 (sem linha nenhuma e com o objeto mais velho que o corte, porque o arquivo sobe antes da linha, D78; ou com a linha em lápide há mais que o corte, para um "Desfazer" nunca ficar sem arquivo). A Edge Function `purge` apaga pela API do Storage, em lotes de 100; um lote que falha fica para o dia seguinte, porque continua se qualificando.
**O defeito.** O trigger `a_close` da 0010 recusa qualquer mudança numa importação encerrada, "nem o dono do banco", e numa aberta só aceita o encerramento. Mas o `on delete set null` da viagem é um update: expurgar (ou apagar de vez, por qualquer caminho) uma viagem que teve importação falharia inteiro. Latente desde a fase 10, só o expurgo o alcançaria. A 0012 deixa passar essa mudança em qualquer estado, e só ela: a viagem vira nula e nada mais muda. Em qualquer estado porque o expurgo não deve depender do cron que fecha as importações abandonadas em 10 minutos. O client não chega aqui: o grant de update não inclui `trip_id`.

### D158 · Como o expurgo roda
**Decisão.** Uma Edge Function `purge` com `withSupabase({ auth: ['secret', 'user'] })` e `verify_jwt = false`, chamada pelo `pg_cron` todo dia às 4h de São Paulo (7h UTC) com a chave secreta do Vault, como a `send-notifications` (C9: o `service_role` já tinha `usage` em `private` desde a 0001). Pela chave secreta, `public.purge` (só o `service_role` executa). Pelo JWT de um executor do laboratório, só o `dry_run`, por `lab_purge_preview` (o banco recusa quem não é executor, e a resposta vem sem os caminhos dos arquivos): o laboratório confere o expurgo sem nunca ter a chave secreta (D52). Sem `dry_run` no corpo, é `dry_run`: apagar exige pedir. Corte no futuro é recusado pelo banco. O handler mora em `_shared/purge.ts`, testado pelo Vitest; o log é uma linha só com números.
**O que a CI achou antes do hospedado.** Dois defeitos da 0012: a contagem do que sai com a viagem supunha que toda tabela que aponta para ela mora em `public` (o horizonte mora em `private`; agora o nome vem do `regclass`, com o esquema); e a tabela de trabalho era limpa com `delete` sem `where`, que o `safeupdate` do PostgREST recusa mesmo dentro de uma função. O pgTAP roda como `postgres` e não via o segundo; o e2e do aparelho atrasado, que chama o expurgo pela API como o job vai chamar, viu.
**No hospedado, em 08/11.** A 0012 aplicada depois do `--dry-run` (só ela, sem seeds nem papéis) e a `purge` publicada (versão 1, `verify_jwt` desligado). A primeira chamada foi em `dry_run`, pelo próprio banco e pelo caminho do job (`net.http_post` com a URL e a chave secreta do Vault): 200 em 398 ms, e nada se qualifica (zero viagens, lápides, registros e arquivos), como esperado de um app que existe desde 04/11. O job `viajei-purge` (`0 7 * * *`) nasceu com a migration e roda pela primeira vez em 09/11 às 4h, depois desse `dry_run`. As quatro viagens de teste excluídas na conta do Douglas ("Test", "Test 2") saem de vez entre 04 e 05/12, pela regra; a viagem real e as de teste vivas não se qualificam.

### D159 · `/viagens` é a lista; `/` é a abertura do app
**Contexto.** O redirecionamento da D33 (viagem em andamento: `/` cai no Modo Viagem) vale uma vez por carregamento do app, por um `Set` em memória. Recarregar a lista durante a viagem levava de novo ao Modo Viagem, e o Lighthouse não conseguia medir a lista com o lab-a, que sempre tem viagem de hoje.
**Decisão.** A rota `/viagens` mostra a mesma lista e nunca redireciona; os links "Início" (o logo), "Voltar" da visão geral e da nova viagem e o "Página não encontrada" levam a ela. `/` continua sendo a abertura (o ícone do app, o login, a nova senha): durante a viagem, cai no Modo Viagem.
**Consequência.** Quem foi até a lista fica nela, mesmo recarregando.

### D160 · O Playwright completo e o projeto WebKit
**Decisão.** Comparada com a seção 13 do prompt, a suíte já cobria criar sem sinal, a foto sem sinal e o print aberto sem rede. Entraram:
- `fluxo.spec.ts`: o fluxo principal num spec só, como uma pessoa (viagem de hoje, roteiro, Partiu! e Chegamos!, "Como foi?", "+ Gasto", um item da mala, o servidor com tudo, e no dia seguinte, sem rede, a retrospectiva pronta com os números certos). O dia seguinte vem do relógio do navegador (`page.clock`), e sem rede: com o relógio adiantado, o token parece vencido e o supabase-js o renovaria a cada requisição.
- `offline.spec.ts`: sem sinal no meio do uso, pela navegação do app (roteiro, lista, contato, gasto, a observação da viagem), o chip "Sem conexão · N", Pendentes, a volta da rede e o servidor com tudo.
- `offline.pwa.spec.ts`: recarregar o app inteiro sem rede (precache, `navigateFallback`, IndexedDB), e a edição sem sinal sobrevivendo à recarga.
- Os projetos `webkit` e `webkit-pwa`, com o perfil do iPhone 15 (o motor do Safari), só para esses três: são o que mais depende do motor (IndexedDB, Web Locks, service worker, datas). Sem WebGL, o Modo Viagem vai pela lista. O `--host-resolver-rules` da fase 11 é do Chromium; no WebKit, o contexto recusa o OSM e o Open-Meteo (`semMundoDeFora`).
- O e2e do aparelho atrasado roda num projeto próprio, por último: o expurgo com corte de agora mexe no banco inteiro dos testes.
**O recorte, medido.** Um reporter do Playwright imprime no fim da CI o tempo de cada projeto, somando as tentativas. Numa CI verde de 08/11: `iphone` 12 min 49 s, `webkit` 1 min 27 s, `pwa` 32 s, `webkit-pwa` 18 s (e o `expurgo`, o aparelho atrasado, uns 57 s). O WebKit soma 1 min 45 s de testes, mais a instalação do navegador, num passo do Playwright que foi de 9 min (a CI da fase 11) para 15 min com tudo o que a fase 12 trouxe (a acessibilidade é a maior parte). O recorte fica como está: o fluxo principal e o offline nos dois motores. A suíte inteira no WebKit não entra: a maquete e o filme pedem WebGL, e o resto não depende do motor.

### D161 · Acessibilidade
**Decisão.**
- `@axe-core/playwright` 4.14.0 em todas as telas (24 rotas, com e sem sessão, mais o Modo Viagem de dia e de noite), nos dois temas, com dados de verdade (uma viagem completa dentro da janela da previsão e uma que terminou ontem, gravadas direto no banco local, e o mapa e o clima pelos falsos da fase 11). Zero `serious` e `critical`; `moderate` só com explicação no próprio spec.
- Alvos de toque de 48 px por uma verificação própria: o axe só confere os 24 px do WCAG 2.2. Links no meio de um texto corrido ficam de fora, como no 2.5.8.
- Contraste AA nos tokens por um Vitest que lê o próprio `app.css`, nos dois temas: o `accent-ink` do tema claro sobre o `accent-soft` dava 4,44:1 e foi de `#b8471f` para `#b4451e` (4,62:1; o mesmo matiz, 1% mais escuro). O branco sobre o pôr do sol dá 3,31:1, só em texto grande. Os templates de e-mail do Auth, com o laranja antigo sobre branco (5,3:1), ficam: moram no Auth hospedado.
- **Texto do Modo Viagem ≥ 17 px de dia e 10% maior à noite.** O `font-size: 110%` da noite não alcançava nenhum texto: todos tinham tamanho fixo em px (de 12 a 16 px em uns 30 lugares). Uma utility do Tailwind, `mv-text-N`: fora do Modo Viagem é exatamente N px; dentro da raiz dele, que define `--mv-min` (17 px, ou 18,7 px à noite) e `--mv-scale` (1, ou 1,1), vale `max(N × escala, mínimo)`. O mesmo componente serve aos dois lugares (os botões, a previsão da parada, as missões, o calendário), sem duplicar. As folhas que abrem por cima (gasto, "Como foi?", reserva) herdam a regra no título e na descrição; os campos dentro delas seguem o tamanho dos formulários do app.
- **Nenhuma tela rola para o lado** (WCAG 1.4.10), conferido em todas as rotas pelo mesmo spec, com a viagem de nome longo ("Serra gaúcha, Campos de Cima da Serra e o Litoral Norte com a família"). Com o texto de 17 px, o topo do Modo Viagem (o nome da viagem e os botões "Avisos" e "Roteiro") passou da largura do iPhone: a coluna automática de um `grid` cresce até o texto sem quebra mais largo, mesmo com o nome em `truncate`, e a página inteira, folhas e avisos incluídos, rolava para o lado. Na CI, isso apareceu como um toque no "Salvar" da folha "Como foi?" que caía no campo de cima. A raiz do Modo Viagem e o cabeçalho dela passaram a `grid-cols-1` (uma coluna que nunca passa da tela), e o nome encurta com reticências. Num celular de verdade, bastava um nome de viagem comprido.
- **A garagem:** o nome de cada item é o que está escrito nele ("SUV", como quem usa a voz diria; na pintura, a cor); o que falta para liberar ("SUV: no nível 3 (Explorador). Toque para ver a prévia") virou a descrição acessível, lida logo depois. Antes, o `aria-label` trocava o nome inteiro e o "nv 3" visível não estava nele (2.5.3).
- Os botões de zoom do mapa tinham 30 px: a regra de toque do Leaflet (`.leaflet-touch .leaflet-bar a`) vencia a nossa por ordem dos arquivos. A nossa passou a ter uma classe a mais.
- **Alvos de 48 px:** o botão `sm` tinha 40 px de altura e é o mais usado nos cabeçalhos; passou a 48 px, como o "Voltar" do cabeçalho e os dois botões do aviso ("Desfazer" e fechar, que tinham 36 px: o "Desfazer" é o toque mais importante do Modo Viagem). Os links soltos das telas de entrar, que tinham 23 px, também.
- O foco visível (`:focus-visible` global) e o `prefers-reduced-motion` (CSS global, áudio, confete e a maquete) já existiam. Faltava o `motion`: ele anima em JS e não passa pela regra do CSS, então a folha subia deslizando e o aviso entrava escalando mesmo com reduzir movimento. As duas passaram a `MotionConfig reducedMotion="user"`: com reduzir movimento, só o fade. Fica no componente, não na raiz do app, para o `motion` continuar fora do primeiro carregamento (D162). Fica para o aparelho: VoiceOver, TalkBack e o texto ampliado do sistema (roteiro final).

### D162 · Lighthouse sem a categoria PWA
**Contexto.** O prompt pedia "PWA e Performance acima de 90". A categoria PWA saiu do Lighthouse na versão 12; a 13.5.0 (a 13.6.0 tinha 11 dias) tem `performance`, `accessibility`, `best-practices`, `seo` e `agentic-browsing`, conferido no pacote.
**Decisão.** No laboratório (`lighthouse`), no preview e na produção, com a sessão do lab-a e o perfil de celular padrão do Lighthouse, nas rotas `/entrar`, `/viagens`, a visão geral, o roteiro do dia e o Modo Viagem com `?render=list`: desempenho, acessibilidade e boas práticas ≥ 90 pela mediana de 3 execuções. No lugar da categoria PWA, os critérios de instalação pelo DevTools Protocol (`Page.getInstallabilityErrors` vazio, o manifest sem erro e o service worker controlando a página). O Lighthouse mede no mesmo navegador em que o lab-a entrou (a sessão e o bypass da Vercel intactos). A maquete em WebGL por software não representa um celular e fica fora da meta. Como cada carga é medida está abaixo.
**O primeiro carregamento.** Antes de medir, o build mostrava a tela de entrar baixando 13 arquivos e ~1,08 MB de JS minificado (~330 KB comprimidos): o layout de quem entrou (motor de sync, Dexie, progressão, fila de fotos, clima) era importado de forma estática pelo roteador, e o `motion` entrava pela pilha de avisos. O layout autenticado passou a ser lazy (o roteador carrega em paralelo o layout e a tela, sem espera em série para quem já entrou), e os avisos animados viraram um chunk de 1,7 KB carregado no primeiro aviso; a região `aria-live` continua desde o começo, porque o leitor de tela só anuncia mudança numa região que já existia. O primeiro carregamento foi a 3 arquivos, 581 KB minificados e 171 KB comprimidos.
**O que o primeiro laboratório mostrou** (preview, 08/11, frio em todas as rotas): entrar 98, a lista 72, a visão geral 46, o roteiro do dia 78, o Modo Viagem 55. Acessibilidade de 96 a 100, boas práticas 96, instalável. Para medir sem os 40 minutos do laboratório inteiro, a tarefa `medir-desempenho` (lab.yml) entra como o lab-a e roda só o Lighthouse, com os relatórios inteiros nos artefatos e o porquê de cada rota no `data` (o elemento do LCP, o que mexe o layout, o JS que mais roda).
**O que mudou, medido a cada passo:**
- O `three` (344 KB comprimidos) entrava na visão geral e no Modo Viagem pela detecção do 3D (`useSupport` importava o `renderer.ts`). A detecção só usa APIs do navegador e foi para `support.ts`; a visão geral caiu de 767 para 409 KB comprimidos, o Modo Viagem de 727 para 369.
- O `motion` (44 KB) entrava em toda tela de dentro pelo chip de pendências do cabeçalho (a folha fechada importava o `motion`). A folha virou uma casca leve e o desenho animado (`SheetFrame.tsx`) só baixa quando alguma folha abre; no dev, sem o precache, o chunk é pedido logo.
- Os dados geográficos (110 KB) chegavam inteiros na abertura: o motor da progressão pedia o `lib/geo` todo só para a distância até o mar. Cada conjunto de dados mora no seu módulo; a costa sozinha tem 15 KB.
- A visão geral lê tudo numa leitura só (`useTripOverview`) e pinta inteira; o dia do Modo Viagem espera as paradas e as reservas. O cartão do resumo e a linha "Ver reserva" chegavam depois e empurravam o resto (0,36 e 0,12 de CLS).
- Medido e desfeito: o HTML pedir as fontes da primeira tela e os chunks de cada rota. Zerou o CLS da troca de fonte, mas, no 4G simulado, os bytes adiantados disputaram a banda com o JS principal: o LCP da tela de entrar foi de 2,2 s para 3,7 s (98 para 89) e o das outras piorou.
- A primeira renderização numa transição (`startTransition`): o React a faz em fatias e devolve a vez ao navegador entre elas. Com o app instalado, o bloqueio (TBT) caiu de 450–600 ms para 210–320 ms; frio, de 330–430 ms para 130–160 ms.
- O laboratório inteiro, numa máquina mais lenta (índice de CPU 2.350 contra 2.900 a 3.000 da medida rápida), deu 83, 88 e 88 na visão geral, no roteiro e no Modo Viagem, e mostrou o que a medida rápida não pegou: com o cartão do resumo na visão geral (que a progressão do laboratório cria), a troca de fonte mexia o layout mesmo com o app instalado (0,12), e todas as telas tinham centenas de milissegundos de script sem arquivo. Dois ajustes: as fontes com `font-display: fallback` no lugar do `swap` do @fontsource (com o app instalado, a fonte vem do precache dentro dos 100 ms de espera e o texto já pinta na Barlow); e o Zod sem a compilação de cada schema com `new Function` no primeiro parse (`zod-config.ts`, o primeiro import do app), que era o script sem arquivo.
**As telas de dentro, com o app instalado.** Frias, depois de tudo isso, ficaram em 71 a 74: o LCP fica em uns 4,8 s porque o 4G simulado (1,6 Mbps) leva uns 3 s só para baixar os 460 a 600 KB das telas de dentro, e a tela só pinta depois do JS. Mas essa carga fria não acontece no app: só se chega às telas de dentro depois de entrar, e entrar instala o service worker com o precache de tudo. A meta passou a valer para elas como abrem de verdade, com o service worker no lugar (o Lighthouse sem o reset); a tela de entrar continua fria, porque é a primeira visita. As frias seguem medidas, uma vez por rota, e ficam no `data` (`frias`). Com o app instalado, o LCP é de ~0,9 s, e o que pesava era o bloqueio do JS (o React montando a tela inteira de uma vez, que a transição resolveu). Esta é uma divergência do que o prompt previa. O Douglas confirmou em 08/11 que fica assim: a meta fria pediria outra arquitetura (pintar do IndexedDB antes do supabase-js e do motor de sync), dias de trabalho com risco, a um mês da viagem real; fica para depois dela, se ele quiser.
**As notas** (preview, 08/11, mediana de 3; a meta é 90): entrar 98 (fria); a lista 96, a visão geral 90, o roteiro do dia 95 e o Modo Viagem 94 (com o app instalado). Acessibilidade de 96 a 100, boas práticas de 96 a 100, instalável. Frias, só para registro: 86, 78, 82 e 80. A visão geral fica no limite: é a tela que mais monta de uma vez.

### D163 · Segurança e revisão
- **Varredura do `dist/` na CI** (`scripts/security/scan-dist.ts`): reprova o build com chave secreta do Supabase, da Anthropic ou do ORS, JWT com `service_role` ou chave privada (PKCS#8 ou JWK com `d`). Diz o arquivo e o tipo, nunca o valor; as chaves de mentira do teste são montadas em tempo de execução, para nenhuma ficar escrita no repositório. Antes de ligar, rodou no build: 145 arquivos, nenhum achado.
- **`supabase db lint`** no hospedado (só leitura): um aviso, o `'[]'` sem cast no `sync_push`, que a 0012 corrige. A CI passou a rodar o lint das funções de `public` e `private` e reprova o primeiro aviso.
- **Advisors do hospedado** (Management API, leitura): as FKs sem índice (D155); as `security definer` executáveis por `authenticated` são as RPCs de convite e do laboratório, que conferem a pessoa por dentro (de propósito); `notifications_sent` sem policy é de propósito (invisível ao client); as duas policies permissivas de update em `trip_members` são a D23. A proteção contra senha vazada é do painel do Auth e exige o plano Pro do Supabase: o Douglas decidiu em 08/11 não ligar agora (seria cobrança nova). O app já está pronto para ela: a senha vazada vem como `weak_password` com o motivo `pwned`, e a tela diz "Essa senha já apareceu em vazamentos conhecidos. Escolha outra." em vez de pedir 8 caracteres. O aviso de poucas opções de MFA fica explicado: o app não tem telas de segundo fator, e ligar um método no painel não protegeria ninguém; MFA seria uma funcionalidade a construir.
- **`pnpm audit`:** três avisos, todos de ferramentas de lint e build (nada vai ao app nem ao servidor): `minimatch` (eslint) e `glob` (workbox-build), com a correção publicada em 27/10 (abaixo das duas semanas da regra) e numa versão maior fora da faixa do pacote pai; e `deepmerge` (workbox-build), cuja versão corrigida não existe no npm. Nada atualizado; reavaliar a partir de 10/11.
- **O aviso `THREE.Clock`:** o R3F 9.8 (a 9.8.2, de 14/10, é a mais nova) cria um `THREE.Clock` em cada Canvas, e o three 0.187 o declara deprecado. Até o R3F trocar pelo `Timer`, só esse aviso sai do console, pelo gancho do próprio three (`setConsoleFunction`), em `lib/three/renderer.ts`; o resto passa como o three escreveria.
- **O ESLint não lia o `_shared`.** A D32 dizia que o `_shared` é lintado, mas o `eslint.config.js` ignorava `supabase/functions/**` e tentava reabrir `!supabase/functions/_shared/**`: uma pasta ignorada por `**` não se reabre. Agora as funções saem pasta a pasta (`supabase/functions/*`) e o `_shared` volta. Apareceram 12 erros de estilo (asserções de tipo onde cabia um teste, um `any` no log do erro da Anthropic, um valor inicial nunca lido), corrigidos sem mudar comportamento.

### D164 · O prazo das chamadas do sync
**Contexto.** Nos laboratórios no preview da fase 11 de 08/11, depois de 7 execuções verdes seguidas do `app_progressao`, duas falharam do mesmo jeito (01h15 e 01h30): o "Usar no carro" gravou o rack no aparelho, o chip ficou em "1 pendente" girando (a fase `syncing`: um ciclo começou e não terminou) e nada chegou ao servidor em 2 minutos. O servidor confirmou: a versão de `car_accessories` era a do preparo do laboratório. O código do app era o mesmo da execução verde, e o que mudou no hospedado entre elas (a 0011 e a `send-notifications`) não toca nada que o app chama. A causa exata não ficou provada de fora. O que o código mostra: o ciclo do sync roda com o lock `viajei:sync`, e nenhuma chamada tinha prazo. Uma resposta que nunca vem (a rede que troca de antena no meio, ou a sessão presa renovando o token antes de o fetch sair) segura o lock para sempre, e nada mais sobe até o app ser reaberto. Na estrada, isso é plausível.
**Decisão.** Cada chamada do sync (o `sync_push`, inclusive o do service worker, e os dois pulls) tem prazo de 45 s (`deadline.ts`, puro e com teste): o fetch é cancelado pelo `AbortSignal`, e a espera acaba mesmo que ele nem tenha saído. O erro sobe como erro de rede: o motor marca sem conexão, solta o lock e tenta de novo, como já fazia. 45 s dão folga ao retrato inteiro de uma viagem (o `resync`) numa rede ruim. Entrou pela `fase-11` (`1a91064`), como correção do estado D.
**Consequência.** O pior caso de um envio parado passa de "até reabrir o app" para menos de um minuto. Com o prazo, o `app_progressao` passou em 4 de 5 laboratórios, mas todos lentos (de 1 min 44 s a 2 min 10 s, contra uns 30 s antes): o envio agora volta sozinho, e o que o atrasa segue sem explicação. Para a próxima vez, a falha desse passo mostra a fila do aparelho (a tabela, o estado, as tentativas e o último erro do servidor; `dc7a04e`).

### D165 · O laboratório da fase 12
- `expurgo`: o `dry_run` diário pela função, com o JWT do lab-a: a função responde, nada sai do Storage, e o mais novo de cada categoria é mais velho que a regra.
- `app_resync`: numa viagem fixa só do lab-a (40 dias à frente, sem avisos), o aparelho puxa a viagem, perde o sinal, e o laboratório o transforma no aparelho atrasado direto no IndexedDB (uma parada fantasma, como uma lápide expurgada que ele nunca viu, e o cursor em janeiro); sem sinal, a pessoa marca um item e cria outro; `lab_mark_horizon` marca o horizonte só desta viagem de laboratório (o executor só marca viagem dele); a rede volta: a fantasma sai, as duas edições sobem. Sem mexer no horizonte de nenhuma viagem de verdade.
- `lighthouse` (D162), e a tarefa `medir-desempenho`, que roda só ele, com os relatórios inteiros nos artefatos.
- O `app_mapa` traz a atribuição do mapa para a tela antes de conferir que nada a cobre: com os alvos de 48 px, o canto do mapa ficou abaixo da dobra (o `elementFromPoint` só enxerga a área visível).
- O job do laboratório vai a 45 min.

### D166 · Números medidos
- **Testes:** 817 Vitest (eram 767), 430 pgTAP em 14 arquivos (eram 384; 46 do expurgo), 43 Playwright (eram 33), com o WebKit e o aparelho atrasado.
- **CI:** uns 21 minutos (era 15); o Playwright, uns 15 (era 9). Por projeto, numa volta verde de 08/11: `iphone` 12 min 07 s, `webkit` 1 min 19 s, `pwa` 31 s, `expurgo` 21 s, `webkit-pwa` 15 s.
- **Acessibilidade:** zero achados (axe `serious`, `critical` e `moderate`, alvos de 48 px, rolagem lateral e texto do Modo Viagem) nas 24 rotas e no Modo Viagem de dia e de noite, nos dois temas.
- **JS antes de pintar** (comprimido, do build): a tela de entrar, 116 KB do principal mais a tela; as de dentro, a lista 261 KB, o roteiro do dia 298, o Modo Viagem 325 e a visão geral 365 (eram 305, 342, 727 e 767).
- **Lighthouse** (preview, mediana de 3): 98, 96, 90, 95 e 94 (D162); frias, 86, 78, 82 e 80.
- **O expurgo no hospedado:** o primeiro `dry_run`, em 398 ms, com nada a apagar (D158).

### D167 · A publicação da fase 12
**Contexto.** O commit final (`642089c`) passou na CI (817 Vitest, 430 pgTAP, 44 Playwright; um instável que passou na segunda tentativa, o `progressao.spec`) e, no laboratório no preview, deu 33 de 35: o `expurgo` e o `app_resync` verdes com a 0012 no hospedado, e dois vermelhos. O Lighthouse da visão geral ficou em 86 numa máquina lenta (índice de CPU 2.330; as outras telas de 90 a 93). E o `app_progressao` falhou de novo no rack: a fila do aparelho mostrou a operação com zero tentativas e sem erro, ou seja, o ciclo do sync nem chegou a enviá-la. Não é rede nem servidor (o prazo da D164 teria cortado e marcado sem conexão): é o ciclo parado em outro ponto, e a mudança só sobe quando o app é reaberto.
**Decisão do Douglas (08/11).** Publicar assim, com os dois registrados, e tratar o defeito do sync como o próximo trabalho.
**O que aconteceu.** Fast-forward da `main` para `642089c` às 07h24 de 08/11, sem force, e o laboratório na produção verde: 31 cenários, nenhuma falha (a importação em skip pela cota do lab-a). O Lighthouse, numa máquina rápida (índice 4.000 a 4.400), deu 98 na tela de entrar e de 97 a 99 nas de dentro, acessibilidade de 96 a 100 e boas práticas 100; frias, de 80 a 86. O `app_progressao` passou em 36 s.
**O próximo passo do defeito do sync.** Na falha do rack, registrar quem segura o lock `viajei:sync` (`navigator.locks.query()`), a fase do motor e o console do aparelho. O `progressao.spec`, instável na CI, é o mesmo fluxo e guarda o trace na segunda tentativa.

## Fase 13 · Correções (08/11/2026)

O Douglas não estava presente: a autorização antecipada (`docs/fases/fase-13.md`, seção 2) valeu para tudo, com os mesmos limites. A fase 12 já estava na `main` (`9af8580`) quando este chat começou: nada a publicar por ela. As escolhas seguem a recomendação do prompt da fase; o que o prompt deixou em aberto está decidido aqui. O teste nos aparelhos não aconteceu nem vai acontecer antes da viagem (decisão do Douglas de 08/11): a entrega 3.5 ficou vazia, e o que só um aparelho prova entra como "sem prova".

### D168 · O mapa por cima da folha: cada caixa com HUD é um contexto de empilhamento
**Contexto.** No mapa da viagem, tocar num pino abria a folha da parada por baixo do mapa (o print do Douglas). A caixa que envolve o Leaflet (`relative … overflow-hidden`) era posicionada, mas não criava contexto de empilhamento; as camadas dele (tiles 400, pinos 600 e mais, controles 1000) competiam na raiz do documento com a folha (`SheetFrame`, `fixed z-50`) e venciam.
**Decisão.** `isolate` na caixa do mapa e em toda caixa com HUD por cima de um canvas: a maquete (as pílulas com `zIndex` 10 e mais e o chip do clima em `z-40`), a garagem, o palco do cartão de conquista e a retrospectiva (`z-10` por dentro). O que tem z-index lá dentro empilha só lá dentro; o aviso de sem internet do mapa (`z-[1001]`) continua acima dos tiles por ser de dentro. Toast e folha tinham o mesmo `z-50` e decidia a ordem no DOM; o toast passa a `z-[60]`, de propósito: o "Desfazer" do Chegamos! mora nele e a folha "Como foi?" abre 1,2 s depois (desfazer com a folha aberta fecha a folha, D83), então o toque tem de continuar alcançável. Acima dos dois ficam o visualizador de fotos (`z-[60]`, tela inteira, antes do toast no DOM) e o "+10" de XP (`z-[70]`, sem toque).
**Consequência.** `e2e/helpers/folha.ts`: a prova por `elementFromPoint` de que o título, o corpo e qualquer pino sob a folha pertencem ao `dialog`, nos projetos `iphone` e `pwa` (no build, com o CSS do Leaflet no chunk do mapa). No aparelho: o bloco 1.16 do roteiro final, sem prova até lá.

### D169 · O texto das pessoas nunca alarga a página; a guarda a 360 px e todo dia na produção
**Contexto.** O Douglas viu a tela do roteiro rolar para o lado no celular, na produção que ainda era a fase 11, e não estaria para dizer qual tela nem qual celular. Nos dados dele (só leitura, pelo pooler): 7 viagens e nenhuma palavra sem espaço com 18 caracteres ou mais em nome, endereço, observação, código, link ou memória. Mas a viagem real tem um nome de 27 caracteres, e no cabeçalho do Modo Viagem da fase 11 (a coluna automática de um `grid`, o nome em `truncate` e dois botões) isso passava dos 393 px e a página inteira rolava: é o defeito que a D161 corrigiu na fase 12, já na produção. O que ele viu está corrigido; não há outro caso reproduzível nos dados dele.
**Decisão.** O que a guarda da D161 não cobria (uma palavra mais larga que a tela e a largura de 360 px) fica coberto. `overflow-wrap: anywhere` no `main` e nos diálogos: um link, um código ou um endereço colado quebra onde for preciso. `anywhere`, e não `break-word`: só ele entra na conta do tamanho mínimo do elemento, que é o que uma coluna automática de `grid` ou `flex` usa para crescer até o texto; `break-word` só quebra depois que a coluna já cresceu. Nada de `overflow-x: hidden` no corpo; as faixas que rolam de propósito têm `nowrap` e continuam. A viagem de teste ganha um link de 88 caracteres sem espaço e um endereço colado numa observação, e uma reserva com código comprido e o mesmo endereço; a guarda roda em toda rota a 393 px e, só para a rolagem, também a 360 px. `ROLAGEM_LATERAL` mora em `src/features/lab/guards.ts`, que a suíte e2e e o laboratório importam: o `app_extras` a avalia todo dia na produção, nas telas da viagem do lab-a e na lista.
**Consequência.** A mesma regra vale na CI (com o texto que ninguém digitaria de propósito) e na produção (com o que o laboratório de fato tem). O que ficou sem reproduzir: qual celular e qual tela o Douglas usou; sem o aparelho, fica a conta acima. Pelo caminho, o axe pegou uma vez o "Atualizar rota" da página do dia abaixo de 4,5:1 no tema claro: o botão em `loading` fica desabilitado (o axe o ignora), mas a classe base animava tudo com `transition`, inclusive a opacidade de `disabled:opacity-60`, e nos 150 ms em que ela voltava a 1 o botão já era clicável com o texto a 60%. Os botões passam a animar só o toque (`transition-transform`); o estado desabilitado troca de uma vez.

### D170 · O Lighthouse cobrado só numa máquina normal, e a visão geral sem o schema da importação
**Contexto.** A nota da visão geral oscilava com a máquina do GitHub, não com a tela: 86 num índice de CPU (`benchmarkIndex`) de 2.330, 98 num de 4.200, com o mesmo código (D162, D167); numa máquina de 2.318, o relatório quente diz FCP 0,3 s, LCP 1,0 s, CLS 0, Speed Index 1,9 s e **TBT 580 ms**, quase todo na avaliação do chunk principal (uma tarefa de 459 ms). Um laboratório vermelho todo dia por isso é ruído, e ruído esconde defeito. Pelo caminho, a visão geral importava estaticamente o carregador da viagem de exemplo (só em desenvolvimento), que puxa o schema da importação (o chunk `schemas`, 94 KB) e o plano da importação para a tela de produção.
**Decisão.** Duas frentes. A tela: o carregador vira import dinâmico, no toque; o que mais pesa (a avaliação do JS do app) é arquitetura e fica fora, como a D162 já tinha decidido com o Douglas. A régua: o cenário registra o índice de CPU de cada execução (`indice_cpu`, a mediana das execuções que contam) e cobra os 90 só com o índice em 2.800 ou mais, o das medidas da D162; abaixo disso, uma nota aquém da meta é "medido, não cobrado": o cenário fica pulado, com as notas e o índice no detalhe, e o laboratório só fica vermelho quando a tela piorou. Falha de instalação é falha em qualquer máquina. A régua é pura (`verdict`, em `lighthouse-score.ts`) e testada; o README diz o que fazer quando o aviso aparecer.
**Consequência.** A meta continua a mesma. O número medido depois da mudança está na D de números desta fase.

### D171 · O rack que não subia: a thread travada pelo palco 3D e a escrita que esperava o ciclo inteiro
**Contexto.** No `app_progressao`, "Usar no carro" gravava o rack e o chip ficava em "1 pendente" girando; em 2 minutos nada chegava ao servidor (D164, D167). A fila dizia só: `trips patch pending`, zero tentativas, sem erro, `next_at` zerado. Nos laboratórios de 08/11 o envio levou de 30 a 36 s nas máquinas rápidas do GitHub (índice de CPU ~4.200) e de 1 min 44 s a 2 min 17 s nas lentas (~2.300), e falhou quando passou de 90 s. O print da falha, aos 90 s, mostrava a fase `syncing` com o app online (o prazo de 45 s da D164 nunca disparou, logo nenhuma chamada ficou presa) e o segundo cartão de conquista aberto com o palco 3D.
**O que faltava ver.** O motor ganhou um rastro dos últimos passos com hora e duração (`trace.ts`, puro; `viajeiDiag.sync()` e `viajeiDiag.locks()` no console do aparelho), e o cenário passou a ler, no acerto e na falha, o rastro, os Web Locks, as tarefas longas da thread principal, a fila e os erros da página, além do índice de CPU da máquina do dia e do tempo de cada passo. A tarefa `medir-sync` roda só isso, três vezes, em minutos.
**O que a medição mostrou** (run 42477691508, máquina de índice ~3.800). O toque em "Usar no carro" caía no meio de um ciclo de 10 s que puxava as doze viagens do lab-a, e o pedido esperava o ciclo acabar: o push só saiu no ciclo seguinte, 2,4 s depois, atrás dos onze pulls restantes. E o primeiro pull desse ciclo, da própria viagem da progressão (40 paradas, 30 kB), "durou" 7,8 s, terminando exatamente no instante em que o toque do Playwright resolveu: a thread principal estava travada desde que a visão geral abriu, pelo palco 3D do cartão compilando os programas da cena no primeiro `render()` (o link de cada um é uma ida e volta síncrona ao processo da GPU; em WebGL por software, segundos; numa máquina lenta, dezenas; o Madrugador, logo depois, compilava tudo de novo). Nenhum lock em disputa (`held: viajei:sync`, `pending: []`), nenhum token renovando, nenhum backoff. Hipóteses descartadas pelos dados: o lock `viajei:sync` (nunca pendente), a sessão (o motor ligou em 30 a 50 ms e o push respondeu em 160 ms), o Realtime (nenhum pull de broadcast no rastro), o backoff (zero tentativas).
**Decisão.** Três correções, cada uma de pé por si:
- **Uma escrita no meio dos pulls sobe antes do pull seguinte** (`cycle.ts`, o ciclo puro com as peças injetadas; o motor só o chama). Entre um pull e outro, se chegou um pedido, a outbox é enviada; um push no meio que fica sem rede para o ciclo, como antes. Na estrada: um Chegamos! marcado enquanto o app puxa as viagens não espera o ciclo inteiro. Seis testes em `cycle.test.ts`.
- **Os shaders compilam antes do primeiro quadro, sem travar a thread** (`ThreeCanvas`): a cena nasce com `frameloop="never"`, o `compileAsync` do three compila em paralelo onde há `KHR_parallel_shader_compile` (e no WebGPU por natureza), e só então o laço sob demanda liga e pede o primeiro quadro (o R3F não invalida sozinho ao trocar o `frameloop`). Teto de 20 s; sem compilação paralela, o custo é o de antes. Vale para a maquete, a garagem, o cartão e o filme.
- **O palco do cartão de conquista em Leve, com giro de 4 s** (`card` no `GarageStage`; `idleMs` no `DiscEnv`, testado): 220 px não pedem reflexo nem sombra de 2048, e cada passe a menos é compilação e quadro a menos; o cartão não mede fps nem mexe na preferência do aparelho.
**Consequência.** Os números depois da correção estão na D de números desta fase. Uma armadilha nova do laboratório: um push na branch enquanto um laboratório roda no preview dela troca o deploy no meio da execução, e o `index.html` antigo pede chunks que o deploy novo não tem (a repetição 2 da primeira medição caiu na tela "Algo deu errado por aqui" por isso); nunca dar push com um laboratório rodando no preview.

### D172 · O laboratório na fase 13: medir em minutos, dizer o que a página fazia
**Decisão.**
- **`medir-sync`** (tarefa do `lab.yml`): só a progressão de A até o rack chegar ao servidor, três vezes seguidas (`--vezes`), sem o laboratório inteiro e sem IA; cada repetição traz o índice de CPU da máquina (a receita do `benchmarkIndex` do Lighthouse), o tempo de cada passo, o rastro do motor, os Web Locks, as tarefas longas da thread principal antes e depois do toque, a fila e os erros da página. Foi com ela que a causa do rack apareceu em dois ciclos de cinco minutos, em vez de horas de laboratório.
- **Os cenários do app guardam o tempo de cada passo** (`passos[].ms`), e o contexto do navegador de A registra as tarefas longas e os erros da página (exceções e `console.error`, menos a barra da Vercel que o próprio laboratório bloqueia). Na falha do rack e na do toast "Avisos ativados", o detalhe diz o que o app via; a folha "Avisos da viagem" que não aparece diz o estado do service worker, a permissão e as marcas de primeira abertura e de "já perguntei".
- **`app_extras` avalia a `ROLAGEM_LATERAL`** nas telas da viagem do lab-a e na lista, todo dia na produção (D169).
- **A cota da importação que chega entre o botão ligar e o toque.** O `app_importar` falhou uma vez com o toque esperando 20 s por um botão que a cota do dia tinha acabado de desligar; o toque passa a esperar 5 s e, se "As leituras de hoje acabaram." apareceu nesse meio, é o mesmo skip de antes.
- **O Lighthouse registra o índice de CPU e cobra os 90 só com índice ≥ 2.800** (D170).

**O toast que vivia dentro de um congelamento.** O `app_avisos` falhou em três laboratórios da fase esperando o toast "Avisos ativados" por 20 s depois do toque em "Ativar avisos" (e passou num quarto, em 7,8 s). Com a instrumentação, a terceira falha disse o que acontece: a folha fecha (a assinatura terminou), a permissão fica concedida, não há erro, e logo depois do toque a thread principal passa uns 6 s travada montando a maquete em WebGL por software (tarefas de 3,1, 1,9 e 1,0 s). O toast dura 4 s: nasce e morre dentro do congelamento, onde a espera do Playwright não enxerga nada. Não é defeito do app (num celular a maquete monta em cerca de 1 s e o toast sobrevive): o cenário passa a provar a ativação pelo que fica, a folha fechada ou o toast, o que vier primeiro, e `/avisos` dizendo "Avisos ligados" no passo seguinte (o push de verdade usa a assinatura logo depois); o detalhe anota qual sinal veio.

**Armadilhas novas do laboratório.** Um push na branch enquanto um laboratório roda no preview dela troca o deploy no meio da execução, e o `index.html` antigo pede chunks que o deploy novo não tem (a repetição 2 da primeira medição caiu em "Algo deu errado por aqui" por isso): nunca dar push com um laboratório rodando no preview. E o laboratório no preview depende do deploy, não da CI: dispara-se assim que a Vercel publica o sha (conferido pelo status "Vercel" do commit na API do GitHub; a CLI da Vercel deste Mac está logada numa conta de cliente e não se usa), com a CI correndo em paralelo; o merge confere os dois no mesmo sha.

### D173 · Números medidos
- **O rack (`app_progressao`, laboratório no preview, máquinas do GitHub).** Antes da correção, com o mesmo código do sync desde a fase 9: 104 s a 137 s nas máquinas lentas (nove execuções de 08/11 entre 02h05 e 06h34) e falha quando passava de 90 s (cinco falhas em 08/11); 30 a 36 s nas rápidas. Depois (`a656eb3` em diante), cinco laboratórios seguidos: **31,9 s, 32,7 s, 32,4 s, 32,1 s e 31,8 s** (`ccc845d`, `5a51c57`, `d324f23`, `78dc566`, `c65b371`; índices de CPU de 3.211 a 3.768), com o rack no servidor **2,6 a 3,3 s depois do toque**. Na `medir-sync`: antes, 2,4 e 2,7 s depois do toque numa máquina rápida, mas com a thread travada 7,8 s antes dele (o toque esperava); depois, 0,5, 3,1 e 3,1 s, e o que sobra é uma tarefa de 2,7 s logo depois do toque (o palco do cartão montando enquanto a folha fecha).
- **A maquete:** primeiro quadro em 4,6 s nos laboratórios da fase (`d324f23`, `c65b371`), contra 5,1 a 10,9 s nas execuções do mesmo dia antes dela.
- **Lighthouse** (desempenho, mediana de 3, as de dentro com o app instalado; entrar · lista · visão geral · roteiro do dia · Modo Viagem): `c65b371` (índice 3.050) 96 · 99 · 97 · 98 · 99; `78dc566` (2.908) 96 · 99 · 96 · 99 · 99; `d324f23` (3.018) 96 · 99 · 98 · 99 · 99; `5a51c57` (2.464) 96 · 97 · 94 · 96 · 96; `ccc845d` (2.635) 93 · 99 · 93 · 97 · 95. Antes, nas máquinas de 2.330 a 2.400: visão geral 83 a 86, lista 90, roteiro 88 a 90, Modo Viagem 88 a 90. Nos cinco laboratórios a régua da D170 não precisou agir (tudo ≥ 90 mesmo a 2.464); ela fica para o dia em que a máquina for lenta de verdade. Acessibilidade de 96 a 100, boas práticas de 96 a 100, instalável.
- **O laboratório:** 35 cenários; nas execuções verdes, 31 verdes e 4 pulados (a importação pela cota do lab-a, gasta nas execuções da madrugada; véspera, prazo e retrospectiva, que são de dois dias). Nenhuma leitura real da IA nos laboratórios da fase (a cota já estava gasta): custo de IA zero. Os minutos do Actions não contam mais (repositório público desde 08/11).
- **CI:** 834 Vitest em 105 arquivos (eram 817: o ciclo, o rastro, o disco do cartão e a régua do Lighthouse), 430 pgTAP, 44 Playwright (7,4 min: `iphone` 11 min 34 s, `webkit` 1 min 30 s, `pwa` 31 s, `expurgo` 20 s, `webkit-pwa` 16 s), nenhuma tentativa repetida; a CI em 13 min.
- **A visão geral** deixou de carregar o chunk `schemas` (94 KB, o schema da importação) e o plano da importação: só no toque de "Carregar viagem de exemplo", em desenvolvimento.
- **O que só um aparelho provaria, sem prova nesta fase** (decisão do Douglas de não testar): a folha por cima do mapa no dedo (`teste-final.md`, 1.16), a rolagem a 360 px num Android de verdade, o congelamento da maquete e do cartão num celular fraco antes e depois da compilação antecipada.


## Fase 14 · A viagem abre no mapa (08/11/2026)

O Douglas não estava presente: a autorização antecipada (`docs/fases/fase-14.md`, seção 2) valeu para tudo, com os mesmos limites. A `main` estava em `fa100cd` (a fase 13 inteira, história reescrita às 13h30 sem a coautoria): daqui em diante os shas citados são só da história nova. As escolhas seguem a recomendação do prompt da fase; o que ele deixou em aberto está decidido aqui. Nenhuma migration, nenhuma função publicada, nada no hospedado.

### D174 · As rotas: a viagem é o mapa, a visão geral vira Detalhes
**Contexto.** Tocar na viagem abria a visão geral, e a maquete morava em `/viagens/:tripId/viagem`, atrás de um botão "Abrir o Modo Viagem". O caderno do Douglas (decisão 10 de 08/11) diz o contrário: a viagem é o mapa.
**Decisão.** `/viagens/:tripId` é a tela da viagem (`travel-mode/routes/ViagemPage.tsx`, o `ModoViagemPage` de antes) e `/viagens/:tripId/detalhes` é a visão geral (`trips/routes/DetalhesPage.tsx`), sem o botão do Modo Viagem. A rota antiga `/viagem` tem um `loader` que devolve `replace()` do React Router (8.5.1): troca a entrada do histórico e preserva a query (`?render=list`, `?diag=1`, `?dia=`), sem renderizar nada; o `redirect()` comum empurraria uma entrada nova e o "voltar" cairia de novo na rota antiga. Quem volta para onde: as telas de detalhe (roteiro, reservas, gastos, listas, contatos, mapa 2D, diário, garagem, avisos, membros, editar, importar, retrospectiva) voltam para Detalhes, que é o centro delas; o "Voltar" de Detalhes vai ao mapa; na tela do mapa o nome pequeno leva à lista `/viagens` (como o "Voltar" da visão geral fazia, D159) e "Detalhes" leva a Detalhes; nada mais na tela do mapa é link. Criar e editar a viagem levam a Detalhes: uma viagem nova não tem paradas (o mapa estaria vazio) e a visão geral é quem tem "Colar roteiro". A abertura do app durante a viagem (D33) cai em `/viagens/:id`; o card da lista já apontava para lá.
**O que fica.** `navigatePath()` em `_shared/notifications.ts` continua apontando para `/viagem`: o redirecionamento resolve, e mudar o padrão exigiria publicar a `send-notifications`, que esta fase não toca. Fica para a próxima fase que publicar funções. O `sw.ts` não muda.
**Consequência.** O Lighthouse do laboratório mantém as chaves da D162 para os números continuarem comparáveis: `visao_geral` mede `/viagens/:id/detalhes` e `modo_viagem` mede `/viagens/:id?render=list` (a lista do dia na tela nova). A suíte e2e e o laboratório abrem a URL nova (o redirecionamento os manteria passando, mas o teste descreve o produto); `rotas.spec.ts` prova a tela, o redirecionamento com a query e o histórico, Detalhes sem o botão e o card que abre o mapa.

### D175 · A tela inteira: o que fica fixo, o que aparece e some, onde foi cada coisa
**Decisão.**
- **A estrutura.** A tela ocupa a altura da janela (`h-svh`, com as áreas seguras), em coluna, sem rolagem: a barra do dia com altura fixa (duas linhas: o nome pequeno com os botões de ícone à direita; "‹ sáb, 12 dez · Dia 2 ›" com o chip "Hoje") e a maquete em `flex-1 min-h-0`, dentro da caixa `isolate` (D168). A rota pede a tela inteira por um `handle: { fullscreen: true }` que o layout autenticado lê com `useMatches`: nesta tela não há o cabeçalho do app (logo, chip do sync, perfil), que ficam em Detalhes; os avisos, as folhas e o "+N" de XP continuam por cima. Nada de `overflow-x: hidden` no corpo (D169): o `overflow-hidden` fica na raiz desta tela. O dia da semana da barra é o do app (`WEEKDAYS_SHORT`, "sáb"): no date-fns em pt-BR `EEE` é o nome inteiro e `EEEEEE` perde o acento.
- **Que dia e quando "Hoje" aparece** (`screen.ts`, puro, com testes): o dia escolhido pelas setas, senão o de hoje (ou o próximo, ou o último: `currentDay`); "Hoje" só quando há um dia de hoje na viagem e não é ele que está na tela.
- **O "Agora" compacto** (`NowBar`), sobre a maquete, embaixo: a frase ("A caminho de · Parque · chega às 10:00 · 12 min"; "sair às" parado; "Dia concluído" no fim), a ação principal grande por `state.primary` e, só quando existem, os chips "Ver reserva" (uma por reserva da parada atual, da próxima e da hospedagem em curso, D29), a outra marcação quando as duas cabem (parado numa parada, Partiu! é a principal e Chegamos! na seguinte ainda vale) e "Pular parada". O `h2` "Agora" fica só para o leitor de tela: a região continua sendo a mesma para o VoiceOver e para os testes. A frase do fechamento ("fecha às 17:00 · faltam 40 min") e a linha da posição entram embaixo da frase.
- **"Detalhes":** botão flutuante acima da barra, à direita, sempre visível, com ícone e texto, 48 px.
- **Um cartão por vez** acima da barra (`overlayCard`, puro): "Desde a última vez" › "Vocês passaram por…" › o pedido de posição › "Como foi?" › "Viajei!" (depois da viagem, dispensado por aparelho em `localStorage`, leva à retrospectiva). O que acabou de acontecer vem antes da pergunta que espera resposta; o pedido de posição antes do "Como foi?", porque sem posição o resto do dia não anda sozinho; a retrospectiva por último, porque não tem pressa. Os toasts (Desfazer, `z-[60]`) e as folhas continuam toasts e folhas. O cartão de instalação do iPhone fora da Tela de Início (a oferta dos avisos quando o app não está instalado, D48) é um cartão em linha e entra no mesmo lugar, só quando não há outro cartão; a folha "Avisos da viagem" continua folha, na raiz da tela (`usePushOffer` separa a regra da forma). A lista do dia, no lugar da maquete, termina onde começa o que está sobre ela (o cartão da vez, "Detalhes", o "Agora"): a altura disso é medida por um `ref` de callback, porque o primeiro render da tela é um esqueleto sem a barra e um `useRef` lido num efeito de montagem ficava em zero para sempre. A caixa do que está sobre a maquete ocupa o palco inteiro e empilha de baixo para cima (`justify-end`): não se move quando um cartão chega depois dos dados (presa ao pé e crescendo para cima, ela dava 0,12 de CLS na tela, D180); a altura coberta é a do topo do filho mais alto com altura (`useOverlayInset`), e a lista do dia e as pílulas terminam nela.
- **Onde foi cada coisa do `ModoViagemPage`:** Avisos e Roteiro → Detalhes (já estavam lá); `AgoraHeader` → a barra compacta; `SinceLastTime`, `PositionAsk`, `PassedQuestion`, `MemoryPromptCard` → o cartão da vez; `CalendarExport` do dia e "+ Gasto" → uma linha de ações em Detalhes durante a viagem (o gasto com a parada e a categoria de agora, pelo `dayState` de hoje) e "+ Gasto" também na folha da parada (D178); `PanelBar` e `PanelToggle` deixam de existir (D176); `WeatherChip` continua no HUD; "Fora da rota", "+N paradas" e o "Pular" do replay sobem para a faixa de cima do palco, no lugar do "Rever o dia" quando há replay, porque a barra do "Agora" ocupa o pé da maquete; a `DayList` ocupa a área da maquete e rola dentro dela, sem o toggle de recolher, atrás do botão "Lista/Maquete" da barra do topo (a preferência `viajei:world:render` e `?render=list` continuam; sem WebGL, a lista no lugar e o botão some).
- **As pílulas** viram botões de 48 px de alto (o alvo do toque, a regra do projeto; a pílula visível fica embaixo dele), com o nome e o horário no rótulo acessível.
**Consequência.** `tela.spec.ts` prova que nada rola a 393 e a 360 px, com a lista e com a maquete, que "Hoje" volta, e que a ação principal e "Detalhes" são o que o dedo encontra (`elementFromPoint`, D168), e que a lista termina acima do que está sobre a maquete, com a última linha sob o dedo; a `acessibilidade.spec` ganha Detalhes e a tela nova nos dois temas; o `catchup.spec` sai da tela por "Detalhes" (o botão Roteiro não existe mais); o `fluxo.spec` e o `contatos-gastos.spec` lançam o gasto em Detalhes. `HUD_BOTTOM` passa a ser o espaço da barra (136 px) na conta do quadro largo.

### D176 · O GPS sempre que o mapa está aberto; o painel vira "Tela acesa"
**Contexto.** A marcação automática só existia com o "Modo painel" ligado (D47) e na leitura única ao abrir. Decisão 2 do Douglas (08/11): Partiu! e Chegamos! automáticos pelo GPS sempre que o mapa está aberto.
**Decisão.** `liveEnabled({ visible, isToday, ongoing, consent })` (puro): com a tela visível (`document.visibilityState`), o dia mostrado sendo hoje, a viagem em andamento e a posição permitida pela pessoa (a pergunta do app, D48), `useLivePosition` (`live.ts`, o `panel.ts` de antes) chama `watchPosition` de alta precisão, grava a trilha e marca sozinho pelas regras da D47, agora em `live-rules.ts` (`liveDecision`): ver o carro na parada antes de sair, 3 min no raio para chegar, 10 min sem repetir a mesma marcação, leituras de baixa precisão a cada 60 s depois de 10 min parado; sempre com o Desfazer de 10 s. Fora dessas condições, nada acompanha; fora do mapa (Detalhes e as outras telas), idem; a D144 continua valendo para o mapa 2D. A hora de cada leitura é a de quando ela chega ao app (`Date.now()`), não o carimbo do aparelho: um relógio só, que o relógio de mentira do Playwright também controla. Com a posição negada no navegador, a frase da barra diz isso uma vez ("Posição negada no navegador: os botões continuam valendo"), sem insistir; a pergunta do app (D48) continua sendo o cartão. Um ponto "GPS" na frase diz que a posição está sendo acompanhada ("GPS econômico" parado).
- **"Tela acesa"** (`useWakeLock`) é o que sobrou do painel: um botão de ícone na barra do topo, só no dia de hoje da viagem em andamento e só onde há Wake Lock, lembrado por aparelho (`viajei:screen-awake`), que mantém a tela acesa enquanto a tela está visível e pede o lock de novo ao voltar à aba. Bateria: o GPS contínuo só existe com a tela acesa, que já é o que mais gasta; sem ela, o sistema apaga a tela e corta o GPS, e está tudo bem (o catch-up repõe ao abrir). "Painel" deixa de existir como conceito no app e nos textos.
- **As marcações automáticas** passam pelo mesmo `run()` das marcações por toque, com `at: null` (sem o "+10" visual, que é só do toque; o XP de verdade vem do motor de progressão, que deriva `stop_done` de qualquer `done_at`) e fonte `live`: a folha "Como foi?" só abre no toque, que é de quem está olhando para a tela (D83, decidido em 08/11); `memoryPrompt` perde `panelOn`, e `ArrivalSource` troca `panel` por `live`. O `placeCar` perde `panelOn`: a posição deste aparelho é uma fonte só (`gps`), seja a leitura única ou o acompanhamento. O `autoArrive` do catch-up continua, pela leitura única: com o acompanhamento ligado, a leitura única é a primeira leitura dele depois de abrir, de permitir ou de voltar à tela (sem um `getCurrentPosition` à parte); `readPosition` só quando não há acompanhamento. A segunda consulta foi o `app_reabrir` vermelho em três laboratórios (`3d6a95c`, `9a7d433`, `21f1219`): nas condições do laboratório, com o acompanhamento já ligado, a leitura do watch chega e a leitura única nunca volta. O `gps.spec` reproduz o laboratório como ele monta o navegador (o Chromium inteiro, canal `chromium`; a posição posta ao abrir e sem permissão; a permissão dada só antes do toque; a posição mais velha que o `maximumAge` de 60 s) e, na falha, diz o que a tela sabe da posição: sem a correção ele falhou nas três tentativas com a leitura do acompanhamento presente, a leitura única ausente e a permissão concedida (branch temporária `fase-14-prova`, CI 42528420267), e com ela passou (CI 42528431167). No headless shell dos outros testes, com a permissão desde o começo, ele passava sem a correção, até com a posição envelhecida: qual das condições prende a segunda consulta não foi isolado. Até `66b9eb0` o watch reiniciava a cada render, cada reinício pedia a posição de novo, e isso escondia o defeito. Num aparelho a próxima leitura do GPS viria; uma consulta só é o desenho certo de qualquer jeito. A hora de toda leitura é a de quando chega ao app. O `save` do estado da viagem lê a posição do mesmo `ref` que lhe dá o estado e a rota: com a posição nas dependências dele, cada leitura do acompanhamento refazia o efeito de montagem do catch-up, que lia a posição de novo, e o Chegamos! do catch-up vinha sem os 3 min (a CI de `3d6a95c` pegou no `gps.spec`).
**Consequência.** `gps.spec.ts`, no projeto `iphone`: `grantPermissions(['geolocation'])`, `setGeolocation` e `page.clock.install()` + `fastForward` para os 3 min; a viagem de hoje, a posição na Casa, "Usar posição", a posição a 2 km (Partiu! com Desfazer, sem "+10"), 3 min dentro do raio do Parque (Chegamos! com Desfazer, o "Como foi?" como cartão e não folha) e o Desfazer desfaz. Nenhum e2e usava geolocalização até aqui. No laboratório, o `app_extras` passa a provar o ponto "GPS" com o mapa aberto (a pessoa permitiu a posição no `app_reabrir`) e "Tela acesa" ligando e desligando; o `.ics` do dia é baixado em Detalhes.

### D177 · A câmera: alta e atrás do carro, olhando a próxima parada
**Contexto.** A câmera era um quadro parado do dia inteiro (`fitCamera`, 64°, FOV 30) e o carro, pequeno, com escala por distância. O caderno pede o carro grande e a estrada serpenteando à frente, em retrato.
**Decisão** (`camera.ts`, puro, com testes).
- **Direção.** A câmera fica atrás do carro olhando para a próxima parada (a reta do carro ao próximo nó; sem ele, ou a menos de 3 unidades dele, a tangente da estrada): o carro aparece a três quartos pela própria curva do S, e a pessoa vê para onde vai. Um `yaw` fixo não serviu: com o S alternando os lados, a próxima parada caía fora da cena pela lateral (o campo de visão horizontal de um celular em retrato tem uns 19°). O `CameraFrame` ganha `yaw` (opcional: 0 é o quadro parado de antes; o filme da retrospectiva não muda).
- **Números.** Inclinação 50°; parada, distância 55, com o carro no terço de baixo da tela (`CAR_SCREEN_Y = −0,4`, pela geometria do raio: o alvo fica `d·(cos t − sin t / tan a)` à frente do carro) e ocupando cerca de um quinto da altura (o teste projeta a caixa do hatch na escala 1,3 e cobra entre 15% e 27%); em movimento ou fora de um nó, recua até 1,9× a distância em `s` ao próximo nó, com teto em 150 (com estes ângulos a câmera vê o chão até ~0,58 da distância à frente do carro, e o caminho entre dois nós é pouco maior que a reta); a curiosidade mergulha para 40 e 38° e volta. A escala do carro é fixa de perto (1,3) e cresce até 2,2 quando a câmera recua; os anéis e a sombra seguem a vista; a névoa, a distância dela.
- **A abertura** começa larga (`fitCamera`, o dia inteiro, com `HUD_BOTTOM` = 136 px) e desce até o carro quando ele entra (o passo `car`, 1,8 s); `opening.ts`, `motion.ts` e `replay.ts` não mudam de regra. O `CameraRig` só suaviza (`approachFrame`, k = min(1, dt·2,6)) e corta com reduzir movimento; grava a vista atual no `WorldRuntime` (`view`, `viewport`, `project()`).
- **As pílulas pelo laço.** Com a câmera em movimento, projetar as pílulas uma vez por layout não serve mais: um atualizador do laço da cena as põe no DOM a cada quadro em movimento (`data-pill`, `left`/`top`), sem redesenhar o React (o React só muda o que muda de verdade: estado, chips). Só os nós em cena têm pílula; a da próxima parada fica presa à borda de cima quando está fora (com uma seta), para a pessoa saber para onde vai. Nenhuma pílula fica por baixo do que está sobre o pé do palco: a regra do "em cena" desconta a altura medida da D175, não um número. O chip do clima grande se prende à origem do mesmo jeito (`useWorldAnchor`).
- **O cenário.** A decoração só até 45 unidades da estrada (o relevo quieto, sem enfeite longe); as quadras de cidade só em volta das paradas de cidade, hotel e comida (raio 16; a densidade pela população do lugar quando a leitura a dá), nunca ao longo da faixa de cidade sem parada; a estrada na largura natural; a caixa do terreno com folga para onde a câmera que segue olha (30 antes do primeiro nó, 70 depois do último).
**Consequência.** `camera.test.ts`: o quinto da altura e o terço de baixo em todos os nós dos dois layouts de teste, a direção, o recuo e o teto, o próximo nó na cena quando cabe no recuo e fora dela (à frente) quando não cabe, o mergulho, a suavização (corte com k = 1, fração com k = 0,5, parada perto). Os números medidos nos laboratórios estão na D de números.

### D178 · As miniaturas e a folha da parada
**Decisão.**
- **Uma miniatura por tipo** (`src/art/stops/`, `buildMiniature(kind, seed)`): casa (origem, 3,2 × 2,6 × 2,6), um marco baixo (deslocamento, 0,8 × 1,0 × 0,8), um grupo de árvores (natureza, 4,0 × 3,2 × 4,0), a parreira com o barril (vinícola, 3,6 × 1,8 × 2,4), o hotel de dois andares com o letreiro (3,4 × 3,2 × 2,4), o restaurante com toldo listrado e a mesa com guarda-sol (3,6 × 2,4 × 3,0), o palco com a cobertura e as caixas de som (evento, 4,2 × 2,6 × 3,4), um quarteirão de três torres (cidade, 4,4 × 4,2 × 4,4) e a placa (outro, 1,0 × 2,2 × 0,4), em unidades da cena (largura × altura × profundidade). Low-poly, sombreamento chapado, os materiais dos carros (`carMaterials`: vidro, cromado, borracha, plástico escuro) mais uma paleta própria; a semente só varia o que não muda a caixa. O Posto (`fuel`) é da fase 15. A miniatura instanciada do hotel sai do cenário.
- **Onde ficam:** o layout põe cada uma do lado de fora do S, a `roadHalfWidth + 1,2 + d/2` do eixo (a caixa inteira fora da estrada), 1,5 à frente do nó, virada para a estrada com um giro pequeno pela semente. Na abertura, cada uma cresce no instante do pino dela.
- **Os testes** conferem o que quebraria o 3D (como a D66 fez com os carros): cabe na caixa do tipo, assenta no chão, fica centrada (é pela meia caixa que o layout a afasta da estrada) e descarta uma vez só; o `layout.test` confere o lado, a distância da estrada e a frente virada para ela.
- **Tocar abre a folha.** As miniaturas entram no R3F como `primitive` (o raio do ponteiro acha a malha) e, pelo mesmo caminho, a pílula do HUD (botão) e a linha da lista do dia (o nome vira botão) abrem a mesma folha: a do pino do mapa 2D, extraída para `itinerary/components/StopSheet.tsx` (nome, tipo, dia e posição, horário, "fecha às", endereço, a previsão no horário, Google Maps e Waze, "Ver no roteiro"), mais Chegamos! quando a parada é a que se pode marcar (`arriveAvailable` e é a próxima) e "+ Gasto", que é onde um gasto acontece (o gasto nasce com a parada e a categoria pelo tipo dela). Por cima do canvas, dentro da caixa `isolate` (D168). `stopRole` ("saída", "3ª parada") vira regra única em `stop-kinds.ts`, para o mapa e para a folha.
**Consequência.** `maquete.spec`: tocar na pílula abre a folha com o tipo, o dia e a posição, "Ver no roteiro" e "Gasto"; na lista, a linha abre a mesma folha. No mapa 2D a folha continua a mesma (`mapa.spec`, pela marca `data-stop-sheet`). O laboratório toca na pílula e guarda a captura da maquete (`maquete.png`, `maquete-folha.png`) como artefato em toda execução (`if: always()`), para o Douglas ver os ícones e as miniaturas lado a lado; o `app_gastos` lança o gasto pela folha da cascata.

### D179 · O comboio entrou: o carro do time na estrada, só quando há outro carro
**Contexto.** O plano sugeria, se coubesse sem poluir: quando alguém do time está em outro carro, o carro dele pequeno na estrada, na última posição que mandou; juntos, nada; nada de nomes nem rastros. O prompt da fase condicionou a renderização ao laboratório verde nas entregas anteriores e ao fps.
**Decisão.** A regra é pura e testada (`convoy.ts`): em outro carro é estar a mais de 500 m de mim (D23: `share_position`, as trilhas dos outros); o ponto é o último da trilha de cada pessoa, com até 30 min; projetado na rota do dia (fora da rota não entra); sem a minha posição não se decide se estamos juntos, então nada aparece. A renderização entrou (`ConvoyCars`): um carro por pessoa pelo mesmo `buildCar`, em névoa, sem os feixes dos faróis, a 0,85 do tamanho, na faixa da direita, olhando para a frente; a especificação do carro vem por membro (`carFor`), hoje o carro da viagem, para a fase 16 trocar pelo carro de cada pessoa. O critério do fps fica satisfeito por construção: na maquete de todo dia não há carro nenhum a desenhar (o lab-b não compartilha posição; na viagem real os dois carros andam juntos quase sempre), e quando há é um carro low-poly a mais, sem luzes. Nenhum cenário do laboratório tem dois carros a 500 m um do outro: a renderização fica **sem prova** além dos testes da regra, e é o que o resumo diz.
**Consequência.** Quem fica em casa continua vendo o carrinho da viagem pela trilha (D61); o comboio é só de quem está na estrada com a posição ligada.

### D180 · Números medidos
Os laboratórios citados são os do preview desta fase (máquinas do GitHub, Chromium com WebGL por software, o índice de CPU do dia entre parênteses). O laboratório no sha do merge e o da produção vêm depois do commit de fechamento: estão no resumo final da fase e na memória do projeto.
- **A tela da viagem (`app_maquete`).** Primeiro quadro com a câmera nova e as miniaturas: 5,2 s (4.321, `b83df3c`), 6,0 s (2.471, `b32f686`), 10,9 s (2.461, `3d6a95c`), 10,7 s (2.465, `9a7d433`) e 8,3 s (2.989, `21f1219`), contra 4,6 s da fase 13 nas máquinas normais (5,1 a 10,9 s antes dela): o quadro largo da abertura compila os shaders das miniaturas junto com os do cenário, e o número acompanha o índice. Em cena, 2 pílulas (`pilulas_em_cena`: o destino e a parada seguinte; a origem fica atrás da câmera, por desenho). O "Rever o dia" do roteiro de duas paradas andou em 9,4 s, 8,1 s e 7,5 s (`rever_ms`, os três últimos), contra 19 a 22 s na fase 13 com a câmera parada; a causa não foi isolada (a cena desenha menos longe da estrada, D177). O fps não é medido no laboratório (D172: o movimento se mede pelo relógio); num aparelho, fica sem prova.
- **O rack (`app_progressao`):** 30,4 s, 34,2 s, 29,2 s, 38,9 s, 36,8 s e 34,9 s (`b83df3c` a `21f1219`; índices de 3.341 a 5.091), com o rack no servidor de 2,3 a 5,0 s depois do toque: a tela nova não mexeu no motor (D171).
- **Lighthouse** (desempenho, mediana de 3, as de dentro com o app instalado; entrar · lista · Detalhes · roteiro do dia · a tela da viagem com a lista, `?render=list`, porque o Lighthouse sem GPU não mede a maquete): `b83df3c` (4.321) 96 · 100 · 99 · 100 · 96; `66b9eb0` (4.410) 96 · 100 · 99 · 100 · 96; `21f1219` (2.989) 93 · 98 · 97 · 98 · 95; abaixo da régua da D170 (medido, não cobrado): `b32f686` (2.471) 96 · 97 · 94 · 96 · 91, `3d6a95c` (2.461) 93 · 96 · 94 · 95 · 90, `9a7d433` (2.465) 96 · 97 · 94 · 96 · 92. Detalhes (a visão geral de antes, na rota nova) e a lista valem o que valiam na fase 13 (D173: 93 a 98 e 97 a 99). Boas práticas 96 em entrar e 100 nas de dentro; instalável.
- **Acessibilidade:** 100 em todas as rotas, menos a tela da viagem com a lista, que deu 96 desde `3d6a95c`, como na fase 13 inteira (D173); de `b83df3c` a `66b9eb0` ela deu 100, com a folha "Avisos da viagem" presa atrás do cartão da vez (o defeito da D175), o que aponta para a folha. O laboratório passa a dizer qual regra falha (`porque.a11y` de cada rota), para a próxima fase decidir com o nome da regra.
- **CLS da tela da viagem com a lista:** 0,116 a 0,125 em todos os laboratórios da fase até `21f1219`, contra 0,002 a 0,035 na fase 13, sempre a caixa do que está sobre a maquete, que crescia para cima quando o cartão da vez chegava depois dos dados. Corrigido pela caixa que ocupa o palco e empilha de baixo para cima (D175, `7d315a8`); o `tela.spec` soma os layout shifts e cobra menos de 0,05.
- **Os chunks** (build da CI): `three` 1.287 kB (358 kB gzip), sem mudança de ordem de grandeza (as miniaturas, a câmera e o comboio são código do app); a tela da viagem (`ViagemPage`) 53,5 kB e o palco (`WorldSection`) 19,7 kB antes do gzip, carregados só nessa rota; Detalhes continua sem o schema da importação (D170).
- **CI:** 886 Vitest em 109 arquivos (eram 834 em 105: a tela, a câmera, as miniaturas, o comboio, as regras do GPS, a conectividade), 430 pgTAP, 48 Playwright (eram 44: `rotas.spec`, `tela.spec` e os dois do `gps.spec`; o da leitura única abre o Chromium inteiro, como o laboratório, e espera a posição envelhecer 62 s); a CI em 11 a 18 min (Playwright de 6,9 a 13 min). O `progressao.spec` continua instável (D167); o `retrospectiva.spec` passou na repetição uma vez (`b77184d`, o botão "Gerar vídeo"); o `maquete.spec` tocava a pílula do Parque durante o quadro largo da abertura, que depois sai de cena (D177), e era instável: agora toca a pílula da parada do carro até a folha abrir (no SwiftShader a pílula ainda anda quando o Playwright a acha estável, e a folha demora a montar).
- **O laboratório:** 35 cenários; 4 pulados em todas as execuções (a importação pela cota do lab-a, gasta de madrugada; véspera, prazo e retrospectiva, que são de dois dias). `b83df3c`: 25 verdes e 6 vermelhos (os seletores da tela nova em `app_extras`, `app_listas`, `app_maquete` e `app_reabrir`, mais dois arrastados por eles); `b32f686`: 30 e 1 (`app_maquete` esperava a pílula da origem, que a câmera nova deixa para trás); `66b9eb0`: 28 e 3 (a folha dos avisos no lugar errado e a lista por baixo do cartão, D175); `3d6a95c`, `9a7d433` e `21f1219`: 30 e 1 (`app_reabrir`: a leitura única que vencia o tempo, D176). Nenhuma leitura real da IA: custo zero.
- **O que só um aparelho provaria, sem prova nesta fase** (decisão do Douglas de não testar): o comboio renderizado (D179); Partiu! e Chegamos! pelo GPS no carro de verdade e a bateria com "Tela acesa" e o mapa aberto (o Wake Lock e o `watchPosition` de alta precisão só existem num aparelho); a leitura única num GPS de verdade (a falha da D176 foi vista com a posição emulada do Chromium; a correção dispensa a segunda consulta em qualquer caso); o fps da câmera que segue num celular; o toque na miniatura 3D (o raio do ponteiro no canvas: no e2e e no laboratório a folha abre pela pílula e pela linha da lista, o mesmo caminho); a tela inteira num iPhone com as áreas seguras (`h-svh`). Os blocos 1.24 e 2.14 do `teste-final.md` ficam para a viagem.
