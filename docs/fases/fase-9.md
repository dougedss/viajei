# Fase 9 · Progressão e retrospectiva

> Você é o agente de implementação da **fase 9** do Viajei. Este chat faz só esta fase. Ao terminar: um commit, resumo curto, `docs/decisoes.md` e a memória do projeto atualizados. O prompt da fase 10 (importação com IA) sai do chat de planejamento; não comece a fase 10.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v3): seções 2 (regras), 4.10 e 4.11, 4.12 (o aviso "retrospectiva pronta"), 5.1 (entidades somente-anexar), 6.4 a 6.7 (replay, garagem, sons, **o filme**), 7, 8 (`achievements`, `xp_events`, ranks e policies), **10 inteira** (XP, níveis, as 15 conquistas e o que cada uma desbloqueia), 11, 12 (linha da fase 9) e 13.
2. `docs/passo-0-2026-11-04.md`, seção 5, bloco `0007_progressao.sql`: é a **DDL base** desta fase, que aqui vira `0009_progressao.sql`. No `docs/passo-0-delta-2026-11-04.md`: a correção C6 (índices por `trip_id`) e a linha `retro_ready` da tabela 5.4.
3. `docs/atualizacao-prompt-3d.md`, seções 4, 5 e 10 (garagem, filme e as conquistas `coast` e `downhill`).
4. `docs/style-tile-v2.html`: a tela 4 (retrospectiva como filme: o título "Viajei!", as fotos e as notas nos nós, o card final com "4 dias · 17 paradas · 18 h de estrada · 1.150 km · R$ 2.741 de R$ 3.000 · dentro do orçamento", as conquistas e os botões "Vídeo · 15 s" e "Cards") e a garagem (o bloqueado diz o que falta).
5. `docs/decisoes.md` inteiro. Em especial: D14 a D17 (outbox), D23 (a própria linha), D45 e D61 (quem conta o que aconteceu), D47 (modo painel), D57 a D64 (maquete, render sob demanda, qualidade), **D65 a D75 (garagem, `TeamProgress`, `rig.attach`, prévia que nunca grava)**, D83 (o que nunca abre sozinho), D88 (fotos no "Rever o dia"), **D91 (onde se testa)**, D95 (`created_by` preservado: é o XP de quem lançou), D96 (dispensar é status), D101 (centavos), D103 (`ready_to_go` derivável) e **D105 (os ciclos de dois dias do laboratório)**. Leia também D106 a D111: o laboratório e o preview, o deploy das funções, os dois defeitos de sync que o laboratório achou e o seed na viagem real.
6. Código que esta fase estende, leia antes de desenhar:
   - Progressão e garagem: `src/features/progression/{team,useTeamProgress}.ts`, `src/features/garage/{rules,actions,swap}.ts` e `scene/runtime.ts`, `src/art/cars/{rig,placement,profile,CarSide}.ts*`.
   - Banco local e sync: `src/lib/db/{schema,registry,mutate,outbox}.ts`, `src/lib/db/sync/{push,apply-pull,runner}.ts`, `supabase/migrations/0001_fundacao.sql` (o carimbo das tabelas somente-anexar), `0003_sync.sql` (`sync_push` com `mode = 'append'`, `sync_pull` com C6, `sync_pull_user`) e o `due_notifications` mais recente (o da 0008), que a 0009 recria.
   - Cena e mídia: `src/features/world/{layout,replay,motion}.ts`, `scene/{runtime,WorldCanvas,CameraRig}.ts*`, `src/lib/three/`, `src/lib/{celebrate,reduced-motion}.ts`, `src/lib/audio/`, `src/lib/media/{hooks,cache}.ts`, `src/lib/files/deliver.ts`.
   - Dados de que as regras dependem: `src/lib/geo/{coast,curiosities}.ts`, `src/features/travel-mode/{actions,events,rules,track-recorder}.ts`, `src/features/{memories,checklists,expenses}/rules.ts`, `src/features/profile/routes/PerfilPage.tsx` e `src/features/trips/components/TripHero.tsx`.
   - Constantes e avisos: `supabase/functions/_shared/{constants,notifications}.ts`.
   - Laboratório: `scripts/lab/{run,app,app-road,arm,armed,evaluate}.ts` e `.github/workflows/{ci,lab}.yml`.
7. A memória do projeto: "Ambiente e armadilhas", "Armadilhas do 3D", "Armadilhas da fase 6", "Armadilhas da fase 7", o que a fase 8 deixou (estado, armadilhas e o levantamento útil à fase 9) e a memória **"Teste só na web"**.

## 1. Estado do repositório ao começar

- **Fase 8 publicada em 07/11/2026:** fast-forward na `main` até `e13139c`, com a CI verde. Commits:
  - `7f71add`, o artefato dos tipos na CI;
  - `a16d2dc` `fase 8: listas, missões, contatos e gastos`;
  - `bf99cf5`, o laboratório das fases 7 e 8;
  - `82844e5`, o deploy das funções (D108);
  - `d79f6db`, a viagem cujo primeiro pull falhou (D109);
  - `e13139c`, o seed na viagem real (D110).

  Migrations 0001 a 0008 estão no hospedado e as funções foram republicadas. A viagem real do Douglas (`0faf1ff2…`) já tem as hospedagens, os contatos, as listas e as missões do seed.
- **Laboratório na produção depois do merge:** 25 de 26. Só o `app_sair_pendente` falhou, por um defeito que a D111 corrige. A véspera e o prazo fecham nas execuções agendadas de 08/11 e 09/11: confira o resultado delas.
- **Pendente da fase 8: a D111**, na branch `fase-8-conexao` (`84d5a36` e `726950b`, CI verde), esperando o ok do Douglas para a `main`. O defeito: uma falha de rede com `navigator.onLine` verdadeiro deixava o app preso em "Sem conexão" até recarregar. A correção trouxe `connectivity.canTry`, `onRetry` com 3/10/30/60 s e o motor rodando com `canTry`.

  **A `fase-9` sai da `main` com a D111 dentro**, porque o `offline_hero` mexe na outbox e na conectividade. Confira com `git log origin/main`. Se ela ainda não entrou, peça ao Douglas o ok para o fast-forward da `fase-8-conexao` antes de abrir a `fase-9`.
- **Assinaturas que a fase 8 mudou:** `tripsKnownToServer(trips, memberships, uid)`, e `applyUserPull` devolve só `{ left }`.
- **Primeira tarefa, num commit próprio antes da fase: o laboratório volta a testar o preview.**
  - **Histórico:** em 07/11 o Douglas respondeu de duas formas sobre o bypass. A resposta final, dada no chat de planejamento, é **sim**. O secret `VERCEL_AUTOMATION_BYPASS_SECRET` está no repositório desde 07/11 às 12:58 UTC, e o bypass está ligado na Vercel. Não há nada para ele configurar.
  - **O código** está no commit `434ae12`, que não está em branch nenhuma (fica no reflog da `fase-8`: `git show 434ae12`):
    - a escolha `alvo` (`producao` ou `preview`) no `lab.yml`;
    - `scripts/lab/preview.ts`;
    - o bypass em `env.ts`.

    O segredo vai só na primeira navegação de cada navegador, como parâmetros que mandam a Vercel gravar um cookie. Nunca vai como cabeçalho, que chegaria ao Supabase (CORS), e nunca nos logs. Traga esse código de volta sobre a `main` atual.
  - **O que as duas execuções no preview acharam:** a barra de ferramentas da Vercel cobria um botão, coisa que só existe no preview. Resolva isso neste commit; a fase 8 pesquisou o assunto (D106). Elas também acharam o defeito de sync da D109 antes da produção.
  - **D106:** reescreva para "o laboratório testa o preview da branch antes do merge e a produção depois", com esse histórico.
  - **Para conferir:** rode `gh workflow run lab.yml --repo dougedss/viajei --ref <branch> -f alvo=preview` numa branch própria. O preview fica em `https://viajei-git-<branch>-qimkt38-gmailcoms-projects.vercel.app`. Espere uma execução verde e leve à `main` com o ok do Douglas.
- **Onde se testa (D91):** nada roda neste Mac (nem Supabase local, nem Docker, nem as suítes, nem Playwright). A CI do GitHub roda em todo push das branches `fase-*` e é ela que segura a fase antes do merge. O laboratório é o teste de aceitação: no preview da branch antes do merge (com o bypass da Vercel, a primeira tarefa acima) e na produção depois. O Douglas testa nos aparelhos uma vez só, na versão final. **Não peça teste manual nesta fase**, mas escreva o roteiro (`docs/teste-manual-fase-9.md`) para esse dia.
- **Já existe e serve a esta fase.**
  - Tabelas, sync e garagem:
    - o Dexie tem desde a v1 `achievements` (`id, user_id`) e `xp_events` (`id, user_id, trip_id`), vazias e sem tabela;
    - o `sync_push` trata `mode = 'append'` (colisão vira `ignored`);
    - o `sync_pull(trip)` já devolve as tabelas de escopo `user` que têm `trip_id` (C6), e o `sync_pull_user` devolve as do próprio usuário;
    - `TeamProgress`, `combineTeam`, `NO_PROGRESS` e `FULL_PROGRESS`;
    - o `useTeamProgress`, que hoje devolve nível 1 e nada para cada membro (`NOT_YET`). **Esta fase troca só a fonte; quem usa não muda**;
    - `LEVELS`, `ACHIEVEMENTS` e `CAR_ACCESSORIES` (cada acessório com a conquista e a frase do que falta);
    - as regras da garagem (`modelState`, `colorState`, `accessoryState`, `toggleAccessory`, `fitToModel`, `saveCar`);
    - o `ProfileRig` com `attach`/`detach` animados, o `GarageRuntime` e o `CarSide` em SVG.
  - Comemoração, cena e mídia:
    - confete, sino, encaixe e vibração;
    - `lib/reduced-motion.ts`;
    - a base 3D em `lib/three` e o `buildLayout` da maquete (um dia por vez);
    - o `planReview` com as deixas de foto (D88);
    - o cache de Blob das fotos;
    - `lib/files/deliver.ts` (folha de compartilhar ou download, a mesma do `.ics` e do `.vcf`).
  - Dados de que as regras dependem:
    - `distanceToCoast` em `lib/geo/coast.ts`;
    - a altitude da rota no `DayRoute`;
    - `trip_tracks`;
    - `created_by` em reservas, itens e gastos;
    - `done_by`/`done_at` nos itens;
    - a marca `ready:<tripId>`.
  - Avisos: `NOTIFICATION_KINDS.retro_ready` (fase 9, `available: false`); o `check` de `notifications_sent` já aceita `retro_ready`.
- **Migration desta fase: `0009_progressao.sql`.** A seguinte: 0010 importação.
- Trabalhe numa branch `fase-9` saída da `main`; a `main` recebe por fast-forward quando o Douglas aprovar (push na `main` = deploy).

### Armadilhas conhecidas (não redescubra)

**Ambiente e comandos**
- Em cada comando: `cd /Users/douglas/Documents/dev/viajei && PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH" pnpm ...`. Começar por `export PATH`, por `mkdir` ou por qualquer comando sem o `cd` no repo dispara um hook do zsh que falha.
- `gh` está em `/opt/homebrew/bin/gh` e precisa de `XDG_CACHE_HOME` gravável (use uma pasta no scratchpad).
- As permissões bloqueiam ler e escrever `.env*`. A checagem do Bash recusa heredocs com `$$`: escreva SQL e scripts com a ferramenta Write.
- **Mutação no Supabase hospedado só com ok explícito do Douglas e `SUPABASE_YES=1 pnpm remote:...`**, com `--dry-run` antes.
- Sem Docker, o deploy das funções empacota no servidor: o `remote:functions-deploy` já usa `--use-api --import-map supabase/functions/deno.json` (D108). Uma função nova entra na lista desse script.

**CI e testes**
- **Os tipos do banco vêm da CI (D104).** Ela gera `database.types.ts`, guarda como artefato `tipos-do-banco` quando muda e falha só no fim. Baixe com `gh run download` e commite. As tabelas novas entram à mão primeiro, só para os tipos fecharem.
- Cada volta na CI leva uns 9 minutos: junte mudanças por volta e leia `gh run view <id> --log-failed` antes de mexer.
- **Teste do Vitest que importa, mesmo por tabela, algo que carrega `lib/supabase/client.ts`** (mutate, actions, `lib/media/index.ts`, motor de sync) **quebra na CI.** Toda regra desta fase mora em módulo puro.
- O `due_notifications` mais recente (o da 0008) tem todos os ramos. A 0009 recria a função inteira com `create or replace`, sem mudar a assinatura nem o `claim_due_notifications`, e republica a `send-notifications`, porque o texto mora em `_shared`.
- O pgTAP `07_notificacoes` não pode ver viagens de hoje deixadas pelos e2e. Na CI o pgTAP roda antes dos e2e; mantenha assim.
- Postgres aplica a policy de SELECT à linha nova em `INSERT ... ON CONFLICT`/`RETURNING` (D12): nas tabelas somente-anexar isso decide o `ignored`.
- Os e2e criam viagens 30 dias à frente, com `e2e/helpers/dates.ts`. Esta fase precisa de viagens **passadas** (a retrospectiva): crie com as mesmas funções de data.
- Teste que não é da maquete abre o Modo Viagem com `?render=list`. `getByRole('heading', { name })` casa por substring: use `exact`.

**React e 3D**
- React Compiler: não mute props, valores de hooks nem locais do render. Estado mutável da cena vai numa classe com métodos (`WorldRuntime`, `GarageRuntime`). `no-non-null-assertion` é erro em `src/`.
- **Luz que entra ou sai da cena recompila todos os materiais.** O `compileAsync` só cobre o passe principal (por isso o quadro de aquecimento). No StrictMode, recurso de GPU nasce e morre no mesmo efeito.
- O Chromium sem tela da CI e do laboratório cai no WebGL2 por SwiftShader, que é lento: nenhum teste pode depender de fps.
- **O laboratório usa o canal `chromium` do Playwright.** Confira se ele codifica H.264: builds sem codecs proprietários não codificam. Isso decide como o laboratório confere a exportação do vídeo (3.9).

## 2. Ações do Douglas nesta fase

1. **Ok no plano**, inclusive nas divergências que você trouxer (seção 4).
2. **Ok para dois fast-forwards antes da fase:** a `fase-8-conexao` (D111), se ainda não entrou, e o commit do laboratório no preview.
3. **Ok para aplicar a 0009 no hospedado** e republicar as funções, com a CI da branch verde.
4. **Ok para o fast-forward da `fase-9` na `main`.**

   Antes de pedir, avise o que muda nas contas reais. Na próxima abertura, os aparelhos dele derivam XP e conquistas de tudo o que já foi marcado, inclusive a viagem "Teste", de 06 a 09/11.

   Se a fase estiver no ar antes de 10/11 às 9h e ele tiver assinatura de push com o aviso ligado, chega "A retrospectiva da viagem está pronta" para a "Teste". Ofereça desligar esse aviso nessa viagem, se ele preferir.

Não há configuração de conta nesta fase.

## 3. Entregas

### 3.1 Migration `0009_progressao.sql` (+ pgTAP `11_progressao.test.sql`)
Parta da DDL base e mostre cada diferença com o porquê. O que eu recomendo considerar:
- **C6:** `create index on ... (trip_id, synced_at)` nas duas tabelas.
- **Pontos amarrados ao tipo**, por `check`, espelhando uma tabela `XP_POINTS` em `_shared/constants.ts`:
  - `quest_done` vale de 10 a 30, os pontos da missão;
  - cada um dos outros tipos tem o valor fixo da seção 10.1.

  Não é antifraude: não há ranking, e quem inflar o próprio XP só ganha cosmético para o carro do time. É consistência entre o banco e a regra.
- **Ninguém ganha XP de viagem de que não é membro:**
  - o insert exige `trip_id` não nulo e `private.is_trip_member(trip_id)`;
  - na conquista, `trip_id` nulo ou de uma viagem de que a pessoa é membro.

  O `on delete set null` continua: o expurgo da fase 12 não apaga o XP de ninguém.
- **Realtime:** veja se o broadcast cobre as tabelas de escopo `user`. Se não cobre, decida se o time precisa ver o nível do outro subir sem recarregar.
- **O ramo `retro_ready` no `due_notifications`, recriado inteiro:**
  - em `end_date + 1`, às 9h de São Paulo, só para viagem com pelo menos uma parada concluída: viagem que não aconteceu não ganha filme;
  - os fatos em `data` (dias, paradas concluídas);
  - o texto em `_shared/notifications.ts`, "A retrospectiva da viagem está pronta" · "4 dias, 17 paradas";
  - o toque abre `/viagens/:tripId/retrospectiva`;
  - `available: true` na constante.
- **O laboratório precisa começar do zero** (3.9), e conquista não se apaga. Proponha uma função que apaga a progressão dos usuários de laboratório, e só deles. Ela fica no padrão do `lab_grant` e do `lab_access`: nenhuma conta real a alcança, e o pgTAP prova isso.

pgTAP:
- só grava o próprio XP e a própria conquista (42501 para outro usuário);
- membro do time lê, estranho não lê;
- viagem de que não é membro é recusada;
- pontos fora da tabela são recusados;
- os `check` de id contra o v5;
- colisão pelo `sync_push` vira `ignored`;
- sem update nem delete;
- o `retro_ready`: data e hora, viagem sem parada concluída, preferência desligada e dedupe;
- a limpeza do laboratório recusada para conta real.

### 3.2 O motor de progressão (`src/features/progression/`)
- **`rules.ts`, puro e testado.** Recebe o retrato do que o aparelho sabe e o usuário, e devolve o conjunto inteiro de eventos de XP e conquistas a que ele tem direito, com ids determinísticos:
  - XP: `v5(user_id, kind || ':' || ref_id)`;
  - conquista: `v5(user_id, 'achievement:' || key)`.

  Desmarcar não tira XP e remarcar não dá de novo: é o somente-anexar que garante, não um código especial.
- **O motor.** Compara com o Dexie e grava o que falta pela `mutate` (rank 90). Roda:
  - ao abrir o app;
  - no fim de cada ciclo do sync (`CycleRunner`);
  - depois de uma escrita local nas tabelas que alimentam as regras.

  Use um Web Lock próprio: os ids já tornam duas abas inofensivas para o banco, mas a comemoração tem de sair uma vez só.
- **"Todo o time":** cada aparelho deriva o fato do estado compartilhado e grava o evento do próprio usuário, porque a policy só deixa cada um gravar o seu. O XP de quem não abre o app chega quando ele abrir.
- **Quem entrou no time depois:** recomendo que leve o XP do que já tinha acontecido, porque a equipe conquista junto e não há ranking. Mostre a alternativa e decida com o Douglas.
- **Primeira derivação de um aparelho, ou ao publicar a fase:** tudo o que já aconteceu vira XP e conquista de uma vez. Isso aparece num resumo calmo ("Vocês já tinham conquistado…"), nunca numa cascata de confete.

Apresente a regra exata de cada tipo de XP e de cada uma das 15 conquistas: o fato, quem recebe, o `trip_id`, o `unlocked_at` e os casos de borda. Os que eu já vejo:
- **`unlocked_at`** é a hora do fato quando ela existe (o `done_at` da parada, o ack do sync), não a hora da derivação: o filme e o perfil contam quando aconteceu.
- **Pontualidade (`departure_on_time`, `early_bird`, `on_time_3`)** só com hora real. Confirme que todo caminho que grava `departed_at` (botão, notificação, modo painel) grava hora real, e que o catch-up nunca grava estimativa. Se algum caminho gravar, a regra precisa de uma marca.
  - "Hora real quando houver posição" quer dizer: a saída que o modo painel viu pela posição vale mais que o toque atrasado.
  - "Sair às" é o mesmo cálculo do "Agora".
  - Recomendo que saída sem hora real ou sem "sair às" seja neutra no `on_time_3`: não conta e não quebra a sequência.
  - Sair antes da hora é pontual. Nada premia velocidade.
- **`offline_hero`:** hoje a outbox não sabe se a escrita nasceu sem sinal (a `mutate` é a mesma online e offline). A D111 mostrou que `navigator.onLine` mente. Recomendo que a marca venha do motor, e não do momento da escrita: a escrita "sem sinal" é a que esperou na fila por uma falha de rede, ou nasceu com `canTry` falso. A conquista sai no `applied` do `sync_push`.
- **`coast`:** a costa embutida erra de 1 a 2 km, e por isso as curiosidades só afirmam o mar a 3 km. "A menos de 1 km do mar" não se afirma com esse dado. Recomendo os mesmos 3 km, com a posição real (leitura do catch-up ou trilha do modo painel), e a frase do acessório ajustada. É divergência do prompt: registre.
- **`downhill`:** recomendo a maior queda da altitude da rota nos trechos rodados de um dia, do ponto mais alto ao mais baixo depois dele, ≥ 500 m. Use a rota guardada no aparelho; sem a rota, a conquista espera.
- **`on_budget`, `trip_completed` e `trip_done`.** Defina "viagem concluída". Recomendo:
  - concluída quando o último dia já passou, no fuso de São Paulo, com pelo menos uma parada concluída. É o mesmo momento do `retro_ready`, e um gasto lançado ao chegar em casa ainda conta;
  - `on_budget` exige orçamento definido e soma em centavos menor ou igual a ele;
  - `trip_done` ("todas as paradas concluídas"): diga se parada pulada impede.
- **Contagens:** `nature_3` e `photographer` somam todas as viagens da pessoa. `winery_2` é no mesmo dia. `chronicler` vale para todas as paradas concluídas de um dia, avaliadas pela própria pessoa.
- **`team`:** alguma viagem da pessoa tem outro membro aceito. Vale para os dois lados.
- **`planner`:** depende da importação (fase 10). A regra existe, mas a entrada fica vazia até lá.

### 3.3 Nível e time
- O nível de cada pessoa sai da soma do próprio XP, por `LEVELS`.
- **Lacuna a resolver.** O `TeamProgress` usa o maior nível e a união das conquistas dos membros aceitos. O XP e as conquistas de um membro vêm de **todas** as viagens dele, mas o `sync_pull(trip)` só traz as linhas com o `trip_id` daquela viagem. Do jeito que está, o aparelho de A calcularia o nível de B só com o que B fez nas viagens que os dois têm em comum. Proponha a fonte certa. Duas saídas que vejo:
  - **Resumo público no `profiles`**, que já viaja para o time pelo `sync_pull`: total de XP e as chaves das conquistas, mantidos por trigger no insert das duas tabelas. São colunas que o client não edita (grant de coluna) e funcionam sem sinal.
  - **O pull trazer as linhas dos membros do time de todas as viagens**, que a policy já deixa ler.

  Recomendo a primeira, com o porquê na decisão.
- **Barra de nível no Perfil e no cabeçalho da viagem.** Ela anima ao subir. Subir de nível libera um modelo de carro (sedã no 2, SUV no 3, picape no 4, kombi no 5), e no 5 vem o dourado.
- **Sem ranking.** A viagem mostra o nível do time, que é o que o carro usa; o Perfil mostra o meu. Nenhuma tela põe membros lado a lado.

### 3.4 A comemoração do desbloqueio
- **O cartão:** animado, com confete, o sino (com o som ligado) e a vibração no Android.
- **O carro da viagem com o acessório encaixando:** `rig.attach`, num palco pequeno com a base de `lib/three`, em chunk lazy.
  - Sem WebGL, ou com reduzir movimento, aparece o `CarSide` já com o acessório.
  - Use o carro com as luzes que ele já tem: luz que entra recompila tudo.
- **"Usar no carro" grava o acessório no carro da viagem**, pelas regras de encaixe (faixas do teto, até 3 adesivos). "Agora não" deixa disponível na garagem. Recomendo não pôr o acessório sozinho no carro: o carro é uma escolha do time.
- **Quando aparece:**
  - nunca sobre o modo painel, nunca pelo toque numa notificação ou pelo service worker, nunca com a folha "Como foi?" aberta;
  - fica numa fila por aparelho e sai no próximo momento calmo: ao fechar a folha "Como foi?", ao abrir a visão geral, a garagem ou o perfil;
  - um por vez, com "mais N", como os cards da D83.
- **Subir de nível** tem o mesmo cartão, com o modelo novo.
- **XP ganho:** um "+10" discreto onde a ação aconteceu (Chegamos!, marcar item, lançar gasto). Com reduzir movimento, sem animação.

### 3.5 A retrospectiva "Viajei!" (`/viagens/:tripId/retrospectiva`, `features/retrospective/`)
- **Quando abre:** do dia seguinte ao fim da viagem em diante. Antes disso, a rota diz quando fica pronta. A visão geral ganha a entrada da retrospectiva.
- **O filme sobre a maquete:**
  - A câmera sobrevoa do início ao fim da viagem. É o único lugar em que a câmera percorre o caminho, como a seção 6.7 permite.
  - A maquete de hoje é por dia (`buildLayout` recebe um dia). Proponha entre um layout da viagem inteira, com as rotas dos dias emendadas num caminho contínuo (cidade → interior → serra → praia), e um corte por dia. Recomendo o contínuo, se o `buildLayout` aceitar a rota emendada sem perder o cenário.
  - A trilha gravada (`trip_tracks`) substitui a rota onde existe, e o resto é a rota real.
  - As fotos aparecem nos nós, pelas deixas da D88: a foto da memória mais bem avaliada da parada.
  - O carro é o da viagem.
- **O roteiro de 15 s**, puro e testado (`planFilm`):
  - abertura com "Viajei!", o nome e as datas;
  - o sobrevoo com fotos, notas e missões;
  - o card final com o carro estacionado: dias, paradas, horas de estrada, km, gasto contra orçamento, as conquistas da viagem e o time.
- **Os números do card final:**
  - horas e km saem da rota dos trechos rodados, nunca de horário inventado;
  - gasto em centavos;
  - paradas são as concluídas.
- **No app:** tocar, "Pular", rever.
- **Com reduzir movimento, ou sem WebGL:** a sequência de cards no lugar do filme.
- **Som opcional:** o ronco discreto e um fecho, pelo toggle de som.
- **Sem sinal:** tudo é local. Ao abrir, a rota busca as fotos da viagem que faltarem no cache.

### 3.6 Exportar: vídeo vertical e cards
- **Vídeo de 15 s em 1080 × 1920.** O prompt diz MediaRecorder sobre o canvas, mas o MediaRecorder grava em tempo real: num celular que desenha a maquete a 40 fps, o vídeo sai engasgado.
  - Avalie e recomende renderizar quadro a quadro, a 30 fps, com o relógio do filme e não o da tela, e codificar com WebCodecs (`VideoEncoder` H.264) num MP4. MP4 é o que stories e WhatsApp aceitam; WebM não entra nos stories do Instagram.
  - Cadeia de reserva: WebCodecs em MP4 → MediaRecorder (MP4 se `isTypeSupported`, senão WebM) → só os cards.
  - Se precisar de biblioteca para montar o MP4, traga a versão exata e o porquê (versão publicada há pelo menos duas semanas), como foi com `thumbhash` e `pdfjs-dist`.
  - Decida se o vídeo tem som.
  - Renderize fora da tela, no tamanho do vídeo e não no da tela, com atenção à memória do iPhone.
- **Cards como imagem**, para o WhatsApp: abertura, números, conquistas e fotos, em tamanhos de feed e stories.
  - Recomendo desenhar em Canvas 2D a partir dos dados: Barlow pelo `FontFace`, o `CarSide` como `Path2D` e as fotos do cache.
  - O `html-to-image` da stack (seção 3) não está instalado, e no Safari o caminho por `foreignObject` costuma perder fontes e imagens. É divergência: registre.
- **Compartilhar:** Web Share com arquivos (`navigator.canShare({ files })`). Sem isso, download pelo `lib/files/deliver.ts`.
- Tudo lazy. Nenhum desses módulos entra no chunk principal.

### 3.7 Testes
- **Vitest:**
  - cada conquista, positiva e negativa, com os casos de borda da 3.2;
  - cada tipo de XP, com o id v5, a idempotência (desmarcar e remarcar) e quem recebe;
  - limiares de nível;
  - o `TeamProgress` com a fonte nova;
  - o `planFilm` (a soma dá 15 s, a ordem dos nós e das fotos, sem foto e sem trilha);
  - os números do card final;
  - a escolha do formato de exportação por detecção (pura);
  - o texto do `retro_ready`;
  - o resumo da primeira derivação.
- **pgTAP:** os itens da 3.1.
- **Playwright:**
  - concluir uma parada → cartão de `first_stop` → "Usar no carro" → a garagem com o rack;
  - a barra de nível andando;
  - uma viagem passada abre a retrospectiva e chega ao card final;
  - exportar um card baixa a imagem;
  - exportar o vídeo no Chromium da CI pelo caminho que ele suportar, com duração e dimensões conferidas.

  A suíte existente continua verde.

### 3.8 Visão geral, perfil e garagem
- **Na visão geral:** a barra do nível do time e a entrada da retrospectiva depois do fim.
- **No Perfil:** o meu nível e as minhas conquistas, com as bloqueadas dizendo o que falta, no tom da garagem.
- **Na garagem:** nada muda de regra. Ela passa a mostrar o que o time ganhou de verdade, e a prévia continua sem gravar.

### 3.9 O laboratório desta fase (D91)
Primeiro no preview da branch, antes do merge, com a 0009 já no hospedado, porque o banco é o mesmo. Depois na produção. Sempre com `lab-a` e `lab-b` na mesma viagem:
- **`app_progressao`.** Parte da progressão zerada dos dois (3.1), porque conquista não se apaga e o laboratório roda todo dia.
  - A conclui uma parada e o cartão de `first_stop` aparece.
  - O servidor tem o XP de A e, depois que o navegador de B abre, o de B.
  - "Usar no carro" põe o rack, e a garagem de B mostra o rack.
- **`app_retrospectiva`.** Uma viagem fixa que terminou ontem, com paradas concluídas, memórias com foto e gastos.
  - O filme chega ao card final com os números certos.
  - O vídeo exportado tem cerca de 15 s e 1080 × 1920, conferidos por um `<video>` na própria página.
  - O card tem as dimensões certas.
  - Se o canal `chromium` não codificar H.264, decida entre rodar esse cenário no canal `chrome` e conferir o caminho de reserva. Diga qual caminho o laboratório cobre.
- **`retro`, em dois dias, pelo mecanismo da D105.** Uma execução arma uma viagem que termina hoje, com assinatura só do `retro_ready`. A seguinte confere o texto, as contagens e o destino do toque, e arma o próximo ciclo. Se o aviso ainda não venceu, o cenário é pulado e a armação fica.

Cada cenário segue o padrão de `scripts/lab/app.ts`, com print a cada passo que falha. Itere no preview com `gh workflow run lab.yml --repo dougedss/viajei --ref fase-9 -f alvo=preview`, e confirme na produção depois do merge. O job tem até 30 min: se não couber, diga.

### 3.10 Documentação
- **`docs/teste-manual-fase-9.md`**, para o teste final nos aparelhos, só com o que um navegador de laboratório não julga:
  - o vídeo exportado no iPhone e no Android (formato, nitidez, sem engasgo);
  - o vídeo nos stories e no WhatsApp;
  - a folha de compartilhar com arquivos;
  - o cartão de desbloqueio com confete, sino e vibração;
  - o fps do filme.
- **`docs/decisoes.md`:** da próxima decisão livre em diante (a fase 8 chegou a D111; confira). Uma entrada por decisão não óbvia:
  - diferenças da DDL e os pontos amarrados ao tipo;
  - a regra exata das conquistas e as divergências (`coast` a 3 km, conclusão da viagem);
  - a fonte do nível do time;
  - a primeira derivação sem cascata;
  - quando o cartão aparece;
  - o layout do filme;
  - o pipeline de exportação e a divergência do MediaRecorder;
  - os cards sem `html-to-image`;
  - a limpeza de progressão do laboratório.
- **README:** seções "Progressão" e "Retrospectiva".

## 4. Como trabalhar nesta fase

1. **Antes de codar**, apresente numa mensagem:
   - a conferência do fechamento da fase 8: a D111 na `main` e o resultado da véspera e do prazo;
   - o plano do commit que devolve o preview ao laboratório;
   - a DDL final da 0009, com as diferenças em relação à base;
   - o ramo `retro_ready`;
   - a tabela de XP, com a regra exata de cada tipo;
   - a tabela das 15 conquistas, com fato, quem recebe e casos de borda;
   - a fonte do nível do time;
   - quando o cartão de desbloqueio aparece e a primeira derivação;
   - o roteiro de 15 s do filme e a escolha do layout;
   - o pipeline de exportação com a cadeia de reserva e qualquer dependência nova (versão exata);
   - os cards com os tamanhos;
   - os cenários do laboratório;
   - um wireframe em texto do cartão de desbloqueio, da barra de nível (Perfil e cabeçalho), do player da retrospectiva, do card final e da folha de exportar.

   **Espere o ok.**
2. **Antes da fase:** a D111 na `main` (se faltar) e o commit do preview, cada um com uma execução verde do laboratório e o ok do Douglas.
3. **Branch `fase-9`:** push, CI e tipos pelo artefato. Com a CI verde e o ok do Douglas:
   - `SUPABASE_YES=1 pnpm remote:db-push` e `SUPABASE_YES=1 pnpm remote:functions-deploy`, com o `--dry-run` antes;
   - o laboratório no preview, até ficar verde;
   - o aviso da seção 2 sobre as contas reais;
   - o fast-forward na `main`, com o ok;
   - o laboratório na produção, cujo resultado você traz;
   - o ciclo `retro` fecha na execução do dia seguinte.
4. **Commit único `fase 9: progressão e retrospectiva`** na branch `fase-9`. O laboratório pode ganhar commit próprio. Depois:
   - resumo curto;
   - `decisoes.md` atualizado;
   - memória atualizada: o estado, as armadilhas novas e o levantamento útil à fase 10.

   O levantamento da fase 10 cobre:
   - a 0010 com `ai_imports` e o limite diário;
   - a Edge Function em streaming com `claude-sonnet-5-5` e saída estruturada;
   - `ANTHROPIC_API_KEY`, que ainda falta nos secrets do hospedado;
   - `import-schema.ts` e o carregador do seed como referência;
   - `partial-json` para o preview progressivo;
   - a conquista `planner`, que passa a ter entrada.
5. **Regras permanentes:**
   - elegância sobre velocidade; experiência acima do custo;
   - não é jogo nem GPS: nada premia velocidade, nada exige interação de quem dirige, o cartão nunca aparece com o modo painel, missão de vinícola registra rótulo e foto e nunca consumo, e não há ranking entre membros;
   - iPhone primeiro, Android igual;
   - offline primeiro: o filme e a exportação funcionam sem sinal;
   - nunca inventar horário: nem nos números do filme, nem na pontualidade;
   - nenhum segredo no client;
   - mutação no hospedado só com ok e `SUPABASE_YES=1`;
   - nada roda no Mac: o teste é na web.
