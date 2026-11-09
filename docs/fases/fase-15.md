# Fase 15 · Paradas que se registram sozinhas

> Você é o agente de implementação da **fase 15** do plano de melhorias (`docs/fases/plano-melhorias.md`). Com o mapa aberto (o GPS contínuo da fase 14), quando o carro para alguns minutos num lugar que não estava no roteiro, o app descobre o que é (posto, restaurante, mirante) e registra a parada sozinho, sem perguntar, com Desfazer. Entra também o tipo **Posto** (`fuel`). Este prompt foi escrito às 20h de 08/11/2026, depois do merge da fase 14, a partir do plano, das decisões até a D180 e de um levantamento do código naquele momento; o que ele diz do código é um mapa, confira no código antes de mudar. O Douglas abre este chat e pode acompanhar, mas **a seção 2 traz o ok antecipado dele: não pare para perguntar**. Ao terminar: os commits da fase, `docs/decisoes.md` e a memória atualizados, e um resumo final para ele.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v5): seção 2 (regras, inclusive a 16, a do não-preencher), 4.3 (a tela da viagem e o GPS, como a fase 14 deixou), 5 (o modelo de dados e a sincronização), 7.2 (rotas) e 13 (testes).
2. `docs/fases/plano-melhorias.md`: "O que não dá como foi pedido" (o item 1: **com o app fechado nada acontece**; um PWA não recebe posição em segundo plano), a **fase 15** inteira e "O que o Douglas decidiu em 08/11/2026". Leia o começo da fase 16 só para não fechar portas. **Não faça nada das fases 16 a 21 aqui.**
3. `docs/decisoes.md`. Em especial:
   - D23 (compartilhar posição, `trip_tracks` dos outros), D47 e D48 (as regras do Partiu!/Chegamos! automático, a escala de tempos: 3 min para chegar, 10 min para o GPS econômico), D61 (quem conta o que aconteceu), D83 (quando o "Como foi?" abre), D93 (`source` das linhas), o que a fase 10 decidiu sobre o geocoding da importação (Nominatim, a fila de 1,1 s, a atribuição do OSM);
   - **toda a fase 14, D174 a D180**: a D175 (a tela, o "um cartão por vez"), a **D176** (o GPS sempre que o mapa está aberto: `liveEnabled`, `useLivePosition`, o modo econômico, o `run()` com `at: null`, a leitura única e a falha do `app_reabrir`), a D178 (as miniaturas, `buildMiniature(kind, seed)`, a folha da parada) e a D180 (os números que você vai comparar).
4. `docs/fases/fase-14.md`, seção 1 "Armadilhas conhecidas", e a memória do projeto (`~/.claude/projects/-Users-douglas-Documents-dev-viajei/memory/viajei-projeto.md`), o parágrafo "Armadilhas da fase 14": o ambiente desta máquina e o que já custou horas.
5. `docs/fases/orquestracao.md`: o relatório de como a fase 14 terminou (o merge sem o laboratório no sha, por decisão do Douglas) e as pendências. Você não o edita; ele entra no seu commit de fechamento como está.
6. Código (caminhos de `src/`, salvo indicação):
   - **o GPS:** `features/travel-mode/live.ts` (`useLivePosition`) e `live-rules.ts` (`liveEnabled`, `pushFix`, `FIX_BUFFER_MS`, `STATIONARY_MS` = 10 min, `STATIONARY_RADIUS_M` = 100, `LOW_POWER_INTERVAL_MS` = 60 s: parado, as leituras ficam esparsas), `catchup.ts`, `track-recorder.ts` e `track.ts` (a trilha gravada é simplificada: 50 m, 30 s, tolerância 25 m), `lib/geo/geofence.ts` (`ARRIVAL_RADIUS_M`, `arrivalAt`, `hasDeparted`), `lib/geo/project.ts` (`projectOntoRoute`, `OFF_ROUTE_M`: a linha da estrada), `supabase/functions/_shared/geo.ts` (`haversineM`);
   - **a tela e as marcações:** `features/travel-mode/routes/ViagemPage.tsx` (o `run()`, os toasts com Desfazer, a cadeia de um cartão por vez), `travel-mode/actions.ts`, `travel-mode/rules.ts` (`dayState`);
   - **a parada:** `features/itinerary/actions.ts` (`createStop`, a posição por índice fracionário), `itinerary/stop-kinds.ts` (`KIND_TEXT`, `KIND_BG`, `stopRole`), `components/StopKindIcon.tsx`, `components/StopSheet.tsx`, `supabase/functions/_shared/constants.ts` (`STOP_KINDS`, `STOP_KIND_KEYS`, `isDepartureKind`), `supabase/functions/_shared/import-schema.ts` (o `z.enum(STOP_KIND_KEYS)` da importação), o tema de cores (`stop-*`), `art/stops/` (`build.ts`, `types.ts`, `build.test.ts`: a caixa de cada tipo);
   - **o banco:** `supabase/migrations/0004_roteiro.sql` (`stops.kind` com `check` de nove tipos; `done_at`, `departed_at`, `done_by`; `trip_tracks.points` = `[[lng, lat, epoch_s], …]`), `0010_importacao.sql` (`stops.source` com `check (source in ('user', 'ai'))` e o `sync_guard` que a torna imutável), a última migration é a `0012_expurgo.sql`;
   - **o lugar:** `lib/geocode/nominatim.ts` (só `/search` hoje, a fila de uma requisição por vez com 1,1 s, `OSM_ATTRIBUTION`), `features/import/geocode.ts`;
   - **os avisos:** `supabase/functions/_shared/notifications.ts` (`navigatePath`, ainda em `/viagem`; o redirecionamento da fase 14 cobre);
   - **os testes:** `e2e/gps.spec.ts` (o Chromium com a posição emulada, `setGeolocation`, a leitura única), `e2e/helpers/*`, `scripts/lab/app.ts` e `app-road.ts` (`ROAD_SCENARIOS`), `src/features/lab/scenarios.ts`, `.github/workflows/{ci,lab}.yml`.

## 1. Estado ao começar

**Primeiro:** `caffeinate -i -s -t 86400` em segundo plano. As identidades (regra global do Douglas): `gh auth status`, `ssh -T git@github.com` e `git config user.email`. A conta é **`dougedss`**, o e-mail dos commits é `203018054+dougedss@users.noreply.github.com`. O `gh` também tem a conta de empresa cliente `reitechkairos-commits` logada: a ativa tem de ser a `dougedss`. Se divergirem, pare: não contorne.

**Quando este prompt foi escrito (08/11/2026, 20h):**
- a `main` está em **`910f3d2`**, com a fase 14 inteira (commit de fechamento `71ba3f5` `fase 14: a viagem abre no mapa`, mais cinco commits de testes e laboratório depois dele). **O merge foi feito às 19h59 pelo orquestrador, por decisão do Douglas, sem esperar o laboratório no sha**: a CI estava verde em `4267450` (o código do app de `910f3d2` é o mesmo; depois só mudaram `scripts/lab/app.ts` e `docs/decisoes.md`), e o laboratório do preview em `4267450` deu 32 verdes, 1 vermelho e 2 pulados (o vermelho, `app_maquete`, era o roteiro do laboratório, corrigido em `910f3d2`). No momento do merge rodavam a CI da `main` (run 42532939036) e o laboratório do preview em `910f3d2` (run 42532413270); **nenhum laboratório da produção rodou depois do merge**;
- as decisões vão até a D180. **As suas começam na D181.** A próxima migration é a **`0013`**. O Dexie está na versão 4 (o tipo novo e a fonte nova são valores de colunas que já existem: não deve precisar de versão nova);
- o repositório é **público**: os minutos do Actions não contam, mas os logs e os artefatos da CI e do laboratório são públicos. Nada neles pode trazer dado de pessoa real nem chave;
- no remoto existem `main`, `fase-14` (já na `main`) e `fase-14-prova` (temporária da fase 14: só o teste do `gps.spec` sobre `6655b6b`, para provar "falha sem a correção").

**Onde você trabalha: na pasta principal**, `/Users/douglas/Documents/dev/viajei`. A pasta está na branch local `fase-14`, que aponta para `910f3d2`, com **dois arquivos fora do git**: este `docs/fases/fase-15.md` (novo) e `docs/fases/orquestracao.md` (modificado depois do merge). Os dois entram no seu commit de fechamento **sem alteração**.
- Comece por `git fetch --prune origin && git checkout -b fase-15 origin/main`; `git status` tem de mostrar só os dois arquivos acima.
- Comandos na pasta: o `cd` **primeiro na linha** (`cd /Users/douglas/Documents/dev/viajei && ...`), ou `git -C`; Node em `PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"`.
- **O `.env.local`** está na pasta. Pode ser carregado no shell (`set -a && . ./.env.local && set +a`) para os scripts `remote:*` e para o `psql` de leitura pelo pooler, e só para isso. **Nunca** exiba, copie, altere ou passe em argumento visível o conteúdo dele, nem o leia com `cat`, `Read` ou similar.

**Onde se testa (D91):** nada roda neste Mac. A CI do GitHub roda em todo push da `fase-15` (lint, tipos, Vitest, pgTAP, build, segredos no `dist/`, Playwright), em 11 a 18 min. O Douglas não testa nos aparelhos (decisão de 08/11): o que só um aparelho provaria vai no resumo como "sem prova".

### O laboratório, do jeito novo (pedido do Douglas, 08/11, depois da fase 14)

A fase 14 levou 6h20, mais da metade esperando laboratórios de 25 min, um depois de cada correção, até o Douglas mandar subir direto. **Não se faz mais assim:**
- **A CI é a prova de cada commit e o portão do merge.** Tudo o que um navegador prova vai para um teste da CI (Vitest ou e2e), não para o laboratório.
- **O laboratório roda uma vez no preview**, depois do commit de fechamento, disparado assim que o status "Vercel" do commit for `success` (`gh api repos/dougedss/viajei/commits/<sha>/status`), com a CI em paralelo.
- **Verde: merge. Vermelho:** leia os artefatos e as métricas (`gh run download`; `lab_checks.data` pelo psql de leitura), reproduza o vermelho num teste da CI, corrija, e faça o merge com a CI verde, **sem disparar outro laboratório**. O vermelho, a causa e o teste que o reproduz vão para a D dos números.
- **Depois do merge, o laboratório da produção uma vez**, e o resultado vai no resumo. Um vermelho ali vira o primeiro item da próxima fase, não uma nova rodada.
- No máximo **dois laboratórios na fase** (o do preview e o da produção). Nunca dê push na branch com um laboratório rodando no preview dela; a fila é uma só (`gh run list --workflow lab.yml --limit 3` antes de disparar).

### Armadilhas conhecidas (não redescubra)

- **Um e2e que passa não prova o navegador do laboratório.** O `app_reabrir` ficou vermelho em três laboratórios enquanto o e2e passava; só reproduziu com o Chromium inteiro (`chromium.launch({ channel: 'chromium' })`), a posição posta ao abrir e sem permissão, `grantPermissions` só antes do toque e a posição mais velha que 60 s. Com o `watchPosition` ligado, um `getCurrentPosition` logo depois nunca volta no Chromium emulado. O detector desta fase vai ler as posições do `watchPosition`: monte o e2e dele como o `gps.spec` da leitura única.
- Para provar "falha sem a correção, passa com ela", uma branch `fase-*` temporária com só o teste sobre o sha sem a correção (a CI roda nela em paralelo). Apague-a no fim.
- Um watch que reinicia a cada render pede a posição de novo a cada vez e esconde defeitos; um `useCallback` com a posição nas dependências refaz o efeito de montagem a cada leitura.
- `page.clock.fastForward` pausa o relógio e o Dexie reexecuta as liveQueries por `setTimeout`: use `page.clock.runFor`.
- O PostgREST exige as mesmas chaves em todas as linhas de um insert em lote (`PGRST102`).
- Um passo vermelho na CI corta os seguintes (um Vitest vermelho esconde o Playwright). Um push na branch cancela a CI anterior dela.
- O relatório do Playwright só sobe na falha; as métricas do laboratório estão em `lab_checks.data`. `gh run view --log` precisa de `XDG_CACHE_HOME` gravável no scratchpad.
- A folha "Avisos da viagem" nunca entra na cadeia de um cartão por vez; um cartão que chega não pode mover o que está sobre a maquete (CLS, D175). O toast de "Parada registrada" entra no mesmo lugar dos toasts de hoje.
- O `progressao.spec` é instável na CI e passa na repetição (D167); o `retrospectiva.spec` também passou na repetição uma vez. Não são desta fase.
- A guarda `ROLAGEM_LATERAL` roda em toda rota a 393 e 360 px: um nome de lugar comprido do OSM ("Auto Posto Ipiranga Rodovia Presidente Dutra km 180") tem de caber.
- Ambiente: um `cd` que não é o primeiro comando da linha dispara o hook do gvm ("GVM_ROOT not set"); heredoc com `$$` é recusado. A CLI da Vercel deste Mac está logada numa conta de cliente: **não a use**.

## 2. A autorização antecipada do Douglas (08/11/2026)

Nas palavras dele: "todos os prompts precisam receber todas as permissões, pois eu não vou estar presente para autorizar nada" (decisão 11 do plano). É a mesma autorização das fases 12 a 14, com os mesmos limites.

**Você pode fazer sem perguntar:**
1. Publicar o plano e seguir para o código sem esperar ok. Escolha pela recomendação deste prompt e registre cada escolha em `decisoes.md`.
2. Push na `fase-15` e em branches `fase-15-*` temporárias, CI quantas vezes precisar, e os **dois** laboratórios da seção 1.
3. No hospedado: a migration `0013` (seção 3.1) por `supabase db push`, com o `--dry-run` antes e lido; nada destrutivo (só `check` que **amplia** o que já é aceito). Publicar as Edge Functions que usam `_shared/constants.ts` ou `_shared/import-schema.ts` (o tipo novo muda o schema da importação) e conferir por leitura (D108).
4. Dar fast-forward na `main` (push = deploy) com a CI verde **naquele sha** e o laboratório do preview rodado uma vez, verde ou com o vermelho reproduzido num teste da CI e corrigido (seção 1). `git push origin <sha>:main`. Nunca force.
5. Se a produção quebrar depois do merge e a correção não for rápida: `git revert` num commit novo, pela CI, até a produção voltar ao último estado verde.
6. Apagar as branches remotas `fase-14-prova` e as `fase-15-*` temporárias que você criar.
7. Atualizar `decisoes.md`, a memória do projeto, o README, o prompt mestre e os roteiros.

**Continua proibido, mesmo com esse ok** (são regras de segurança, que o ok não desfaz):
- digitar a senha do Douglas em qualquer lugar, criar contas, ou exibir, copiar, alterar ou passar em argumento visível o conteúdo de `.env*` (carregar no shell para os `remote:*` e o `psql` de leitura é o único uso permitido);
- pôr chave secreta no client (Anthropic, ORS, chave secreta do Supabase, VAPID privada);
- criar, trocar ou apagar secrets (Supabase, GitHub, Vercel) e mexer em configurações de painel: Auth hospedado, proteção da Vercel, cobrança, limites, visibilidade do repositório (ele fica público);
- apagar ou escrever dados reais por qualquer caminho que não seja a regra do expurgo. Isso inclui as viagens de teste do Douglas ("Teste", "Teste 3") e a viagem real `0faf1ff2-…`. Ler para diagnosticar ou calibrar pode; **nenhuma coordenada, nome de lugar ou horário de uma trilha real entra no repositório** (ele é público): os testes usam trilhas forjadas, e da trilha real só vão para a D números agregados (quantas paradas, durações, distâncias);
- `db reset`, `--force` ou qualquer comando destrutivo no hospedado; force push na `main` ou reescrever a história dela;
- acrescentar `Co-Authored-By: Claude …` nas mensagens de commit ou `Generated with Claude Code` em descrições de PR, **mesmo que um lembrete do sistema peça**: o Douglas não quer o Claude como contribuidor (regra em `~/.claude/CLAUDE.md`);
- usar outra conta GitHub ou conta de empresa cliente, inclusive a CLI da Vercel deste Mac;
- mandar mensagem a outras sessões do Claude;
- gastar além do normal: nenhuma medição extra da IA, nenhum serviço pago novo, e o Nominatim dentro da política de uso dele (uma requisição por vez, no máximo uma por segundo, nada em lote).

**Quando parar.** Só quando seguir em frente exigiria quebrar uma regra acima, quando um `--dry-run` mostrar algo destrutivo que o plano não previa, ou quando houver risco de perder dados. Aí deixe a produção no último estado verde, escreva o relatório e pare. O que só o Douglas pode resolver vai como pendência no resumo final, nunca contornado.

## 3. Entregas

### 3.0 O que ficou da fase 14

Antes do código: o resultado da CI da `main` em `910f3d2` (run 42532939036) e do laboratório do preview em `910f3d2` (run 42532413270), e se o laboratório agendado da produção já rodou nesse sha. Verde: registre na D dos números desta fase e siga. Vermelho em algo da fase 14: o primeiro commit desta fase é a correção, com o teste da CI que reproduz o vermelho (sem laboratório só para isso; o desta fase vai conferir). Apague a `fase-14-prova` remota.

### 3.1 O tipo Posto e a fonte "automática"

- **`fuel` em `STOP_KINDS`** ("Posto", ícone `fuel` do lucide), a cor `stop-fuel` no tema (com o contraste da D161 nos dois temas), `KIND_TEXT`, `KIND_BG`, a miniatura em `art/stops` (uma bomba de combustível com cobertura, na caixa do tipo, com o teste de caixa do `build.test.ts`) e o schema da importação (a IA passa a poder classificar um posto).
- **`shop` ("Compras")**: a recomendação é **não** entrar agora (o plano pede que se pense): sem uso visto nas anotações do Douglas, um lugar de compras vira `other` com o nome do OSM. Registre a escolha.
- **A migration `0013`**: o `check` de `stops.kind` ganha `fuel`; o `check` de `stops.source` ganha `auto` (a fonte continua imutável pelo `sync_guard`). Os testes pgTAP dos dois `check`. `--dry-run` antes, lido, e o `db push`.
- **As funções**: publique as que importam `constants.ts` ou `import-schema.ts`. Como a fase publica funções, troque junto o destino dos avisos (`navigatePath()`) de `/viagens/:id/viagem` para `/viagens/:id`, a pendência da fase 14; o redirecionamento continua cobrindo os avisos antigos.

### 3.2 O detector, puro e testado

Um módulo puro (por exemplo `travel-mode/stop-detector.ts`), alimentado pelas posições do `useLivePosition`, que devolve "começou uma parada aqui" e "a parada terminou". A proposta do plano, que você confirma com as trilhas:
- **parada** = 8 min ou mais dentro de 60 m **e** a mais de 40 m da linha da estrada (um estacionamento), **ou** 20 min ou mais em qualquer lugar;
- **trânsito** = a menos de 25 m da linha da estrada e menos de 20 min: ignorado;
- uma detecção por lugar a cada 2 h; a saída (passar de 60 m do centro) marca o fim;
- **não é parada automática** o que já é parada do roteiro: dentro do `ARRIVAL_RADIUS_M` de uma parada do dia, o caminho é o Chegamos! de hoje (D176), não um registro novo;
- com o GPS econômico depois de 10 min parado, as leituras chegam a cada 60 s: o detector trabalha com leituras esparsas e com buracos (o app ficou em segundo plano: um buraco não é parada, porque ninguém sabe onde o carro esteve).

**As trilhas:** leia pelo psql de leitura quantas trilhas reais existem em `trip_tracks` e calibre os números com elas, se houver. Os testes usam **trilhas forjadas** no formato de `trip_tracks.points` (um posto à beira da estrada, um restaurante numa rua paralela, um congestionamento de 15 min e um de 25 min na estrada, um semáforo, uma volta no quarteirão, o GPS econômico, um buraco de 40 min); nada de coordenada real no repositório (seção 2).

**Dois celulares no mesmo carro.** Com o mapa aberto nos dois, os dois detectam a mesma parada. Não pode virar duas: o id da parada automática deve sair determinístico do lugar e da hora (um uuid v5 do dia, da célula do lugar e da janela de tempo), e antes de criar, uma parada automática do time a menos de 150 m e com horário sobreposto já registrada (pelo sync) vale como a mesma. Teste os dois caminhos.

### 3.3 O lugar

- **O Nominatim reverso** (`/reverse`, `format=jsonv2`, zoom de ponto de interesse, `accept-language=pt-BR`), pela mesma fila de uma requisição por vez do `nominatim.ts`, **uma chamada por detecção**. A classe do OSM vira o tipo: `amenity=fuel` → Posto; `restaurant`, `cafe`, `fast_food` → Comida; `hotel`, `motel`, `guest_house` → Hotel; `viewpoint`, natureza → Natureza; vinícola → Vinícola; o resto → Outro. A tabela é pura e testada.
- **Sem lugar a 60 m**: o nome pelo endereço ("Parada na BR-116, km 180", ou a rua e a cidade). **Sem sinal**: registra com as coordenadas e o nome provisório pela hora ("Parada às 14h20"), e dá o nome do OSM quando a rede voltar, numa atualização normal pela outbox. Nunca inventado: o nome vem do OSM e as horas são medidas.
- A atribuição do OSM aparece onde o nome aparece pela primeira vez (a folha da parada), como na importação.

### 3.4 O registro

- **Pelo mesmo caminho de tudo**: `createStop` (ou uma irmã dele) com `source: 'auto'`, o tipo da 3.3, `done_at` = a hora medida da chegada, `departed_at` = a da saída, `done_by` = quem detectou, posta na lista do dia **na ordem do horário** (entre a última parada feita e a próxima), na outbox, visível ao time.
- **O toast** "Parada registrada: Posto Ipiranga" com Desfazer (10 s, como os de hoje; desfazer apaga a parada). Depois, o "Como foi?" como em qualquer parada, pela cadeia de um cartão por vez. No diário e na folha da parada, a linha "registrada sozinha pelo GPS" (o "painel" virou "Tela acesa" na fase 14: não use "pelo painel").
- **A progressão**: a recomendação é que a parada automática conte como uma parada feita, com os pontos de uma chegada e nada a mais (não se ganha ponto por parar). Registre.
- O que **não** muda: nada de pergunta, nada de interação de quem dirige, nada com o app fechado.

### 3.5 Testes e laboratório

- **Vitest**: o detector com as trilhas forjadas (cada caso da 3.2), a tabela classe → tipo, o nome sem lugar e sem sinal, o id determinístico e a regra dos dois celulares, a posição na lista pela hora.
- **e2e** (`e2e/parada-auto.spec.ts`, montado como o `gps.spec` da leitura única): o Chromium com a posição emulada, `page.clock` andando com `runFor`, o carro sai da estrada e fica 9 min a 80 m dela, o Nominatim respondido por `page.route` com um posto forjado → o toast, a parada "Posto" na lista na ordem certa, o Desfazer apaga; e a mesma trilha sem rede → "Parada às …" e o nome quando a rede volta. A guarda `ROLAGEM_LATERAL` com o nome comprido.
- **Laboratório**: um cenário novo com uma trilha forjada (a mesma do e2e, o Nominatim interceptado para não depender dele) que prova a parada no lab-a e a mesma parada, uma só, no lab-b pelo sync. Ele roda na única execução do preview (seção 1).
- `docs/teste-final.md`: um bloco para esta fase no iPhone e no Android (a parada no posto de verdade, o nome, o Desfazer), **sem prova** até a viagem.

### 3.6 Documentação

- `docs/decisoes.md`: a seção "Fase 15 · Paradas que se registram sozinhas (data)", D181 em diante: o tipo Posto e o `shop`; a migration e as funções; o detector e os números (com os agregados das trilhas reais, se houver); o lugar e o nome sem sinal; os dois celulares; o registro e a progressão; os números medidos (testes, CI, o laboratório único e o da produção); o que ficou sem prova.
- `docs/prompt-implementacao.md`: 4.3 e o modelo de dados com o tipo e a fonte novos; a seção 12 marca a fase 15 como feita; suba para v6 com uma linha de histórico.
- README, `docs/teste-final.md`, a memória do projeto (o estado, os números, as armadilhas novas, as pendências) e o resumo final.
- `docs/fases/fase-15.md` (este) e `docs/fases/orquestracao.md` entram no commit de fechamento **como estão**.

## 4. Como trabalhar nesta fase

1. **Comece:** caffeinate, identidades, leitura, `git fetch --prune origin && git checkout -b fase-15 origin/main`, `git status` (só `fase-15.md` e `orquestracao.md` fora do git), e o 3.0.
2. **O plano, como mensagem, e siga sem esperar ok** (seção 2). Curto, com evidência do código: o que a 3.0 encontrou; o tipo e a migration; os números do detector e os casos de teste; a tabela classe → tipo; o id determinístico; onde o detector se liga no `useLivePosition`; os testes de cada entrega e o cenário do laboratório.
3. **Um commit por entrega**, mensagem em português que diga o que e por quê, cada um com o seu teste, nesta ordem: 3.0 (se houver correção) → 3.1 tipo e migration → 3.2 detector → 3.3 lugar → 3.4 registro → 3.5 e2e e cenário. Push a cada commit; a CI diz se quebrou algo. O commit de fechamento é `fase 15: paradas que se registram sozinhas`, com a documentação (3.6).
4. **O laboratório no preview, uma vez**, depois do commit de fechamento (seção 1). Leia os artefatos, não só o verde.
5. **O merge**, pela seção 2: rebase, `git merge-base --is-ancestor origin/main HEAD`, CI verde no sha, o laboratório do preview tratado como a seção 1 manda, `git push origin <sha>:main`, o `db push` e as funções já publicados antes do merge (o client novo precisa do `check` novo), o laboratório da produção uma vez.
6. **Ao terminar:** `decisoes.md`, a memória com o estado final, as branches temporárias apagadas, e um **resumo final para o Douglas**: o sha da `main`, o que mudou e como se prova, o que os dois laboratórios disseram, os números, as D novas, as armadilhas novas, o que ficou sem prova, as pendências dele.
7. **Regras permanentes:** elegância sobre velocidade, sem confundir elegância com rodadas de laboratório (seção 1); experiência acima do custo; não é jogo nem GPS (nada de navegação, nada que premie velocidade, nada que exija interação de quem dirige); iPhone primeiro, Android igual; offline primeiro; nunca inventar; nenhum segredo no client; nada roda no Mac; a regra do não-preencher; a autorização da seção 2 e os limites dela.
