# Fase 16 · A garagem é da pessoa, e o perfil

> Você é o agente de implementação da **fase 16** do plano de melhorias (`docs/fases/plano-melhorias.md`). O carro passa a ser da pessoa, não da viagem: cada um vê o próprio carro na maquete, no card e na retrospectiva, em qualquer viagem, e os carros dos outros chegam pelo perfil deles. Os cinco modelos ficam livres desde o começo, e os níveis passam a liberar o que vai no carro: cores, acabamentos da tinta e rodas. A garagem muda para `/perfil/garagem`, e o perfil ganha seções (Você, O seu carro, Progresso, Avisos neste aparelho, Aparência, Dados, Laboratório). Este prompt foi escrito em 14/11/2026, depois da fase 15, a partir do plano, das decisões até a D189 e de um levantamento do código em `2dde90d`; o que ele diz do código é um mapa, confira antes de mudar. O Douglas abre este chat e pode acompanhar, mas **a seção 2 traz o ok antecipado dele: não pare para perguntar**. Ao terminar: os commits da fase, `docs/decisoes.md` e a memória atualizados, e um resumo final para ele.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v6): seção 2 (regras, inclusive a 16, a do não-preencher), 5 (o modelo de dados e a sincronização), 6 (o mundo 3D e os carros), 7.2 (rotas), 10 (progressão), 11 (design e UX) e 13 (testes).
2. `docs/fases/plano-melhorias.md`: "O que não dá como foi pedido" (o item 4, o carro de verdade), a **fase 16** inteira, o começo das fases 19 e 20 só para não fechar portas (o último nível vai liberar "o seu carro", que a 20 constrói), e "O que o Douglas decidiu em 08/11/2026" (as decisões **3, 4 e 9**). **Não faça nada das fases 17 a 21 aqui.**
3. `docs/decisoes.md`. Em especial:
   - D66 (o contrato `CarProfile`: um perfil, duas artes), D67 (a vista lateral em SVG), D68 (acessórios, faixas do teto, o encaixe com memória), D69 (o progresso do time e a prévia), D70 (sem migration: a normalização na leitura), D113 (o nível do time vem do resumo público no perfil: `profiles.xp_total` e `achievement_keys`, que viajam pelo pull da viagem), D120 (o cartão de desbloqueio e o "Usar no carro"), D161 (contraste e acessibilidade);
   - a fase 14 (D174 a D180: a tela da viagem, o comboio da D179, que vai ler o carro de cada pessoa) e **toda a fase 15, D181 a D189**: a D181 (o achado do contraste de Deslocamento e Vinícola a 2,7:1 no cartão escuro, que esta fase corrige porque mexe no tema), a D188 e a D189 (os testes, o laboratório do jeito novo e os números que você vai comparar).
4. `docs/fases/fase-15.md`, seção 1 (o laboratório do jeito novo e as armadilhas), e a memória do projeto (`~/.claude/projects/-Users-douglas-Documents-dev-viajei/memory/viajei-projeto.md`), os parágrafos da fase 15, inclusive "Armadilhas da fase 15".
5. `docs/fases/orquestracao.md`: o relatório das fases 13 e 14 e as pendências. Você não o edita; ele entra no seu commit de fechamento como está.
6. Código (caminhos de `src/`, salvo indicação):
   - **a garagem:** `features/garage/routes/GaragemPage.tsx`, `components/GarageStage.tsx` e `OptionRows.tsx` (as linhas Modelo, Cor e Acessórios), `scene/Showroom.tsx`, `rules.ts` (`modelState`, `colorState`, `accessoryState` sobre `TeamProgress` e o carro da viagem; `normalizeCar`, `toggleAccessory`, `fitToModel`, `decide`, `patchFor`, `TripCarPatch`), `actions.ts` (`saveCar(tripId, patch)`), `disc.ts`, `swap.ts`;
   - **os carros:** `art/cars/` (`types.ts` com `CarSpec`, `profile.ts`, `profiles/*`, `rig.ts`, `parts.ts` com as rodas, `materials.ts` com o acabamento hoje derivado da cor em `finish(color)`, `placement.ts`, `CarSide.tsx`, a vista lateral), `supabase/functions/_shared/constants.ts` (`CAR_MODELS` com o nível de cada modelo, a Kombi no 5; `CAR_COLORS`, o Dourado no 5; `CAR_ACCESSORIES` com a conquista de cada um; `LEVELS`, cinco níveis de 0 a 2.000 XP);
   - **a progressão:** `features/progression/level.ts` (`unlocksAt`, `unlockPhrase`, `levelPhrase`), `team.ts` (`TeamProgress`, `MemberProgress`, `combineTeam`: o maior nível do time), `useTeamProgress.ts` (`useMyProgress`), `components/CelebrationHost.tsx` (o cartão de desbloqueio e o "Usar no carro", D120), `components/LevelBar.tsx`, `prefs.ts` (`useCelebrationsPref`);
   - **quem lê o carro da viagem hoje:** `features/world/WorldSlot.tsx` e `components/WorldSection.tsx`, `scene/Car.tsx` e `scene/ConvoyCars.tsx`, `features/trips/components/TripCard.tsx`, `TripHero.tsx`, `TripShortcuts.tsx`, `trips/actions.ts`, `features/checklists/components/Readiness.tsx` (o link "Ver a garagem" para `/viagens/:id/garagem`), `features/map/routes/MapaPage.tsx`, `features/retrospective/routes/RetrospectivaPage.tsx`, `features/sync/rules.ts`, `src/test/factories.ts`, e os scripts do laboratório `scripts/lab/app-progress.ts` (o rack do `app_progressao` é medido em `trips.car_accessories`), `app-import.ts`, `app-resync.ts`;
   - **o perfil:** `features/profile/routes/PerfilPage.tsx` (nome, cor, Progresso com `LevelBar` e `AchievementGrid`, o link do laboratório por `useLabRole`, sair com "Ainda há alterações por enviar"), `profile/actions.ts`, `queries.ts`;
   - **os avisos:** `features/notifications/routes/AvisosPage.tsx` (por viagem: a permissão, os tipos, a antecedência `lead_minutes`, a hora do briefing `morning_time`, e os dois que já valem para o aparelho, `useSoundPref` e `useCelebrationsPref`), `notifications/prefs.ts`; a tabela `notification_prefs` em `supabase/migrations/0005_notificacoes.sql` (uma linha por pessoa e viagem);
   - **o tema:** `src/styles/app.css` (os tokens já têm `:root[data-theme='dark']` e `:root:not([data-theme='light'])`, mas nada no app escolhe o tema hoje);
   - **o banco:** `supabase/migrations/0002_perfis_viagens_membros.sql` (`trips.car_model`, `car_color`, `car_accessories` com os `check`; `profiles` com `revoke update` e `grant update (name, color, updated_at, field_versions)`), `0009_progressao.sql` (`profiles.xp_total`, `achievement_keys`, o resumo do servidor);
   - **as rotas:** `app/router.tsx` (`/viagens/:tripId/garagem`, `/viagens/:tripId/avisos`, `/perfil`, `/lab`);
   - **os testes:** `e2e/*` (a garagem e o perfil), `e2e/helpers/*`, `src/features/lab/scenarios.ts` e `guards.ts` (a lista de rotas da guarda), `.github/workflows/{ci,lab}.yml`.

## 1. Estado ao começar

**Primeiro:** `caffeinate -i -s -t 86400` em segundo plano. As identidades (regra global do Douglas): `gh auth status`, `ssh -T git@github.com` e `git config user.email`. A conta é **`dougedss`**, o e-mail dos commits é `203018054+dougedss@users.noreply.github.com`. O `gh` também tem a conta de empresa cliente `reitechkairos-commits` logada: a ativa tem de ser a `dougedss`. Se divergirem, pare: não contorne.

**Quando este prompt foi escrito (14/11/2026, 15h):**
- a `main` está em **`2dde90d`** (`fase 15: paradas que se registram sozinhas`), com a CI verde (run 42545272669) e o laboratório da produção verde logo depois do merge (run 42546176723, 33 verdes, 3 pulados);
- **o laboratório agendado da produção, desde então, alternou** no mesmo sha: verde em 09, 12 e 14/11; vermelho em 10/11 (`app_parada_auto`: "os dois saem da estrada e ficam 8 min no posto: A registra a parada", `locator.waitFor` em 30 s), em 11/11 (nenhum cenário: o passo que instala o Chromium falhou com `Temporary failure resolving 'azure.archive.ubuntu.com'`, a rede da máquina do GitHub) e em 13/11 (`app_parada_auto` igual, e `app_clima`: "a faixa da visão geral tem os números de hoje", `locator.waitFor` em 30 s). É a 3.0;
- as decisões vão até a D189. **As suas começam na D190.** A próxima migration é a **`0014`**. O Dexie está na versão 4; colunas novas em `profiles` não pedem versão nova (a tabela local indexa só o `id`);
- o repositório é **público**: os minutos do Actions não contam, mas os logs e os artefatos da CI e do laboratório são públicos. Nada neles pode trazer dado de pessoa real nem chave;
- no remoto existem `main`, `fase-14` e `fase-15` (as duas já na `main`).

**Onde você trabalha: na pasta principal**, `/Users/douglas/Documents/dev/viajei`. A pasta está na branch local `fase-15`, que aponta para `2dde90d`, com **dois arquivos fora do git**: este `docs/fases/fase-16.md` (novo) e `docs/fases/orquestracao.md` (modificado). Os dois entram no seu commit de fechamento **sem alteração**.
- Comece por `git fetch --prune origin && git checkout -b fase-16 origin/main`; `git status` tem de mostrar só os dois arquivos acima.
- Comandos na pasta: o `cd` **primeiro na linha** (`cd /Users/douglas/Documents/dev/viajei && ...`), ou `git -C`; Node em `PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"`.
- **O `.env.local`** está na pasta. Pode ser carregado no shell (`set -a && . ./.env.local && set +a`) para os scripts `remote:*` e para o `psql` de leitura pelo pooler, e só para isso. **Nunca** exiba, copie, altere ou passe em argumento visível o conteúdo dele, nem o leia com `cat`, `Read` ou similar.

**Onde se testa (D91):** nada roda neste Mac. A CI do GitHub roda em todo push da `fase-16` (lint, tipos, Vitest, pgTAP, build, segredos no `dist/`, Playwright), em uns 10 a 15 min. O Douglas não testa nos aparelhos (decisão de 08/11): o que só um aparelho provaria vai no resumo como "sem prova".

### O laboratório, do jeito da fase 15

- **A CI é a prova de cada commit e o portão do merge.** Tudo o que um navegador prova vai para um teste da CI (Vitest ou e2e), não para o laboratório.
- **O laboratório roda uma vez no preview**, depois do commit de fechamento, disparado assim que o status "Vercel" do commit for `success` (`gh api repos/dougedss/viajei/commits/<sha>/status`), com a CI em paralelo.
- **Verde: merge. Vermelho:** leia os artefatos e as métricas (`gh run download`; `lab_checks.data` pelo psql de leitura), reproduza o vermelho num teste da CI, corrija, e faça o merge com a CI verde, **sem disparar outro laboratório**. O vermelho, a causa e o teste vão para a D dos números.
- **Depois do merge, o laboratório da produção uma vez**, e o resultado vai no resumo. Um vermelho ali vira o primeiro item da próxima fase, não uma nova rodada.
- No máximo **dois laboratórios na fase**. Nunca dê push na branch com um laboratório rodando no preview dela; a fila é uma só (`gh run list --workflow lab.yml --limit 3` antes de disparar; o agendado da produção roda uma vez por dia).

### Armadilhas conhecidas (não redescubra)

- As da fase 15 (memória, "Armadilhas da fase 15"): com o relógio do Playwright a animação de saída não termina e o toast e a folha ficam no DOM (confira pelos dados); a 659 px um "Como foi?" com nome comprido cobre o palco (dispense o cartão antes de tocar numa linha); o `sync_push` de uma operação mais velha em todas as colunas volta `stale`; compare horas com o relógio do próprio aparelho (`page.evaluate(() => Date.now())`).
- As da fase 14: um e2e que passa não prova o navegador do laboratório (o Chromium inteiro, `chromium.launch({ channel: 'chromium' })`); um watch ou um efeito que reinicia a cada render esconde defeitos; `page.clock.runFor`, não `fastForward`, com o Dexie; o PostgREST exige as mesmas chaves em todas as linhas de um insert em lote (`PGRST102`); um passo vermelho na CI corta os seguintes; um push na branch cancela a CI anterior dela.
- **As colunas `car_*` de `trips` continuam no banco nesta fase** e saem numa migration depois: um PWA antigo em cache num aparelho ainda pode gravá-las. O client novo deixa de lê-las e de escrevê-las; o servidor não pode quebrar quando um client velho as manda.
- O perfil dos outros chega pelo pull da viagem (D113). Um campo novo em `profiles` precisa entrar no que esse pull traz e no `sync_guard`, senão o comboio fica com o carro padrão dos outros.
- O `progressao.spec` é instável na CI e passa na repetição (D167). O `app_progressao` mede o rack no servidor pelo carro da viagem: muda junto com o carro.
- A guarda `ROLAGEM_LATERAL` roda em toda rota a 393 e 360 px: `/perfil/garagem` e o perfil novo entram na lista.
- Ambiente: um `cd` que não é o primeiro comando da linha dispara o hook do gvm ("GVM_ROOT not set"); heredoc com `$$` é recusado; `gh run view --log` precisa de `XDG_CACHE_HOME` gravável no scratchpad. A CLI da Vercel deste Mac está logada numa conta de cliente: **não a use**.

## 2. A autorização antecipada do Douglas (08/11/2026)

Nas palavras dele: "todos os prompts precisam receber todas as permissões, pois eu não vou estar presente para autorizar nada" (decisão 11 do plano). É a mesma autorização das fases 12 a 15, com os mesmos limites.

**Você pode fazer sem perguntar:**
1. Publicar o plano e seguir para o código sem esperar ok. Escolha pela recomendação deste prompt e registre cada escolha em `decisoes.md`.
2. Push na `fase-16` e em branches `fase-16-*` temporárias, CI quantas vezes precisar, e os **dois** laboratórios da seção 1. Uma correção do `lab.yml` ou do `ci.yml` que a 3.0 pedir.
3. No hospedado: a migration `0014` (seção 3.1) por `supabase db push`, com o `--dry-run` antes e lido. Ela **adiciona** colunas e grants em `profiles` e **copia** para o perfil de cada pessoa o carro da viagem mais recente de que ela é dona: é a única escrita em dado real permitida nesta fase, porque não apaga nem muda nada que já existe (as colunas `car_*` de `trips` ficam como estão). Nenhuma Edge Function está prevista; se uma usar o que mudou em `constants.ts`, publique e confira por leitura (D108).
4. Dar fast-forward na `main` (push = deploy) com a CI verde **naquele sha** e o laboratório do preview rodado uma vez, verde ou com o vermelho reproduzido num teste da CI e corrigido (seção 1). `git push origin <sha>:main`. A migration vai antes do merge (o client novo precisa das colunas). Nunca force.
5. Se a produção quebrar depois do merge e a correção não for rápida: `git revert` num commit novo, pela CI, até a produção voltar ao último estado verde. A migration não se desfaz: ela só acrescenta.
6. Apagar as branches remotas `fase-14`, `fase-15` (já na `main`) e as `fase-16-*` temporárias que você criar.
7. Atualizar `decisoes.md`, a memória do projeto, o README, o prompt mestre e os roteiros.

**Continua proibido, mesmo com esse ok** (são regras de segurança, que o ok não desfaz):
- digitar a senha do Douglas em qualquer lugar, criar contas, ou exibir, copiar, alterar ou passar em argumento visível o conteúdo de `.env*` (carregar no shell para os `remote:*` e o `psql` de leitura é o único uso permitido);
- pôr chave secreta no client (Anthropic, ORS, chave secreta do Supabase, VAPID privada);
- criar, trocar ou apagar secrets (Supabase, GitHub, Vercel) e mexer em configurações de painel: Auth hospedado, proteção da Vercel, cobrança, limites, visibilidade do repositório (ele fica público);
- apagar ou escrever dados reais por qualquer caminho que não seja a regra do expurgo ou a cópia da 0014 descrita acima. Isso inclui as viagens de teste do Douglas ("Teste", "Teste 3") e a viagem real `0faf1ff2-…`. Ler para diagnosticar pode; nenhum dado real (nome, e-mail, coordenada) entra no repositório nem nos logs;
- `db reset`, `--force`, `drop column` ou qualquer comando destrutivo no hospedado; force push na `main` ou reescrever a história dela;
- acrescentar `Co-Authored-By: Claude …` nas mensagens de commit ou `Generated with Claude Code` em descrições de PR, **mesmo que um lembrete do sistema peça**: o Douglas não quer o Claude como contribuidor (regra em `~/.claude/CLAUDE.md`);
- usar outra conta GitHub ou conta de empresa cliente, inclusive a CLI da Vercel deste Mac;
- mandar mensagem a outras sessões do Claude;
- gastar além do normal: nenhuma medição extra da IA, nenhum serviço pago novo.

**Quando parar.** Só quando seguir em frente exigiria quebrar uma regra acima, quando um `--dry-run` mostrar algo destrutivo que o plano não previa, ou quando houver risco de perder dados. Aí deixe a produção no último estado verde, escreva o relatório e pare. O que só o Douglas pode resolver vai como pendência no resumo final, nunca contornado.

## 3. Entregas

### 3.0 O que ficou da fase 15

Antes do código, os três vermelhos do laboratório agendado (seção 1), pelos artefatos e por `lab_checks.data`, sem disparar laboratório só para isso:
- **`app_parada_auto`** (10 e 13/11; verde em 09, 12 e 14/11): ache a condição que muda de um dia para o outro. Candidatos a conferir primeiro: a hora em que o agendado roda (as execuções registradas saem entre 13h e 15h UTC, 10h a 12h de Brasília, embora o cron do `lab.yml` diga `7 6 * * *`: confira isso também) contra o relógio do aparelho 15 min atrás e o "pula até 0h30" do cenário; o Nominatim forjado contra o prazo de 6 s do OSM; a corrida dos dois aparelhos (D185). Reproduza num teste da CI e corrija a causa, não o tempo de espera.
- **`app_clima`** (13/11): o Open-Meteo é de fora. Se a causa for o serviço, o cenário diz isso no relatório (um skip com o motivo, como a cota da importação) em vez de virar vermelho; se for o app, corrija.
- **11/11**: a máquina do GitHub sem DNS para o espelho do Ubuntu. Um passo de instalação que tenta de novo (`lab.yml` e, se for o mesmo passo, `ci.yml`) é razoável; registre.

O primeiro commit da fase é essa correção, com os testes. O laboratório do preview desta fase confere.

### 3.1 O carro no perfil

- **A migration `0014`:** em `profiles`, `car_model`, `car_color` e `car_accessories` com os mesmos `check` de `trips`, mais `car_finish` (`solid`, `metallic`, `pearl`, `matte`; padrão `solid`) e `car_wheels` (os estilos da 3.2; padrão o de hoje). O `grant update` de coluna passa a incluir as cinco, **só para a própria pessoa** (a policy "editar o próprio"). O `sync_guard` e o pull da viagem trazem as colunas novas (D113). **A cópia:** para cada perfil, o carro da viagem mais recente de que a pessoa é dona (`owner_id`), por `start_date` e depois `updated_at`; sem viagem, o padrão. Os testes pgTAP: os `check`, os grants (ninguém muda o carro de outro; o client não muda `xp_total`), a cópia em dados de teste, o pull trazendo as colunas.
- **Quem lê o carro:** todo leitor da lista da seção 0 passa a ler o carro **do perfil de quem está olhando** (a maquete, o card, a vista lateral, a retrospectiva, o mapa) ou **do perfil de quem dirige o outro carro** (o comboio, D179). Um hook só (por exemplo `useMyCar()` e `carOf(profile)`) com o `normalizeCar` (D70) sobre o perfil. A viagem deixa de ter carro: `trips/actions.ts` não grava `car_*` numa viagem nova, e nenhum client novo as lê.
- **A garagem em `/perfil/garagem`**, com `saveCar(patch)` gravando no perfil pela outbox; `/viagens/:tripId/garagem` redireciona para ela, e o "voltar" leva para onde a pessoa estava. O link "Ver a garagem" do `Readiness` e o "Usar no carro" do cartão de desbloqueio (D120) passam a apontar para o carro da pessoa.

### 3.2 A escada nova

- **O que libera, e por quem.** O carro é da pessoa, então **quem libera é o progresso dela**: o nível do `xp_total` dela e as conquistas dela (`useMyProgress`), não o maior nível do time (`combineTeam`). A recomendação é essa; registre, com o que muda para quem viajava com alguém de nível mais alto.
- **Os cinco modelos livres desde o nível 1** ("escolha o seu carro"); a Kombi deixa de ser prêmio.
- **Os níveis liberam o que vai no carro.** A proposta, que você ajusta e registra: nível 1, as sete cores de hoje, a tinta lisa e a roda de hoje; nível 2, o metálico e um estilo de roda; nível 3, o perolado e outro estilo; nível 4, o fosco e outro estilo; nível 5, o Dourado e **"o seu carro"**, que aparece trancado com a frase do que falta e a explicação de que chega numa versão futura (a fase 20 o constrói; nesta fase não há nada a escolher ali, e nada finge que há). O acabamento é material físico de verdade (D66: `materials.ts` hoje deriva o acabamento da cor; passa a ser um campo), e cada estilo de roda existe no 3D e na vista lateral (D67).
- **As conquistas continuam liberando os acessórios** (D68), agora pelas conquistas da pessoa.
- **A regra da prévia** (D69) continua para o que está trancado. `unlocksAt`, `unlockPhrase`, `levelPhrase`, o cartão de desbloqueio (D120) e o laboratório acompanham a escada nova.

### 3.3 O perfil organizado

Em seções, nesta ordem, cada uma com título e sem rolagem lateral a 360 px:
- **Você:** nome, cor, e-mail.
- **O seu carro:** a vista lateral e a entrada da garagem.
- **Progresso:** como hoje.
- **O que você gosta:** é da fase 17. Pela regra 16 (não preencher), **não aparece** enquanto não houver o que mostrar; deixe só a ordem prevista no código e registre.
- **Avisos neste aparelho:** a permissão do aparelho, os sons do Modo Viagem e os cartões de conquista (que hoje moram em Avisos de cada viagem e já valem para o aparelho: saem de lá, e lá fica um link para cá); a antecedência e a hora do briefing **padrão para viagens novas**, guardadas no perfil (as colunas entram na mesma `0014`), usadas quando a linha de `notification_prefs` de uma viagem nasce. Confira onde ela nasce hoje.
- **Aparência:** tema do sistema, claro ou escuro, guardado no aparelho (`localStorage`) e aplicado como `data-theme` no `<html>` antes do primeiro quadro (sem piscar), com a cor da barra do navegador acompanhando; "movimento reduzido segue o sistema", dito ali. **O contraste de Deslocamento e Vinícola** no cartão escuro (2,7:1, D181) sobe para 4,5:1 nos dois temas, com o teste de contraste cobrindo.
- **Dados:** sair, com a pergunta das pendências (como hoje).
- **Laboratório:** só para quem o tem (como hoje).

### 3.4 Testes e laboratório

- **pgTAP:** a `0014` (3.1).
- **Vitest:** a escada (o que cada nível libera, a frase, a prévia), `normalizeCar` sobre o perfil, o progresso da pessoa liberando, o comboio com o carro de cada pessoa, o tema (sistema, claro, escuro), o padrão dos avisos numa viagem nova.
- **e2e:** o perfil com as seções; a garagem em `/perfil/garagem` (trocar modelo, cor, acabamento e roda; o trancado com a prévia); o mesmo carro na maquete de duas viagens diferentes; `/viagens/:id/garagem` redirecionando; o tema escuro escolhido sobrevivendo a recarregar sem piscar; a guarda `ROLAGEM_LATERAL` com as rotas novas; o axe no perfil e na garagem nos dois temas.
- **Laboratório:** o `app_progressao` mede o rack no carro do perfil; um cenário da garagem no perfil prova que o carro de A chega ao lab-b pelo sync (o comboio dos dois aparelhos). Rodam na única execução do preview.
- `docs/teste-final.md`: um bloco para esta fase no iPhone e no Android (o perfil, a garagem, o tema, o carro dos outros), **sem prova** até a viagem.

### 3.5 Documentação

- `docs/decisoes.md`: a seção "Fase 16 · A garagem é da pessoa, e o perfil (data)", D190 em diante: a 3.0; a `0014` e a cópia; quem lê o carro; a escada nova e o progresso da pessoa; o acabamento e as rodas; o perfil e as seções; o tema e o contraste; os padrões dos avisos; os números medidos (testes, CI, os dois laboratórios, o Lighthouse do perfil e da garagem); o que ficou sem prova; a migration que tira `car_*` de `trips`, para uma fase depois.
- `docs/prompt-implementacao.md`: 5 (o modelo de dados), 6 (os carros), 7.2 (rotas), 10 (a escada nova); a seção 12 marca a fase 16 como feita; suba para v7 com uma linha de histórico.
- README, `docs/teste-final.md`, a memória do projeto (o estado, os números, as armadilhas novas, as pendências) e o resumo final.
- `docs/fases/fase-16.md` (este) e `docs/fases/orquestracao.md` entram no commit de fechamento **como estão**.

## 4. Como trabalhar nesta fase

1. **Comece:** caffeinate, identidades, leitura, `git fetch --prune origin && git checkout -b fase-16 origin/main`, `git status` (só `fase-16.md` e `orquestracao.md` fora do git), e a 3.0.
2. **O plano, como mensagem, e siga sem esperar ok** (seção 2). Curto, com evidência do código: o que a 3.0 encontrou; as colunas e a cópia da `0014`; a lista de quem lê o carro e como passa a ler; a escada nível a nível; o acabamento e as rodas no 3D e na vista lateral; as seções do perfil e o que sai de Avisos; os testes de cada entrega e os cenários do laboratório.
3. **Um commit por entrega**, mensagem em português que diga o que e por quê, cada um com o seu teste, nesta ordem: 3.0 → 3.1 a `0014` e os leitores → 3.1 a garagem no perfil → 3.2 a escada, o acabamento e as rodas → 3.3 o perfil, os avisos e a aparência → 3.4 os testes que faltarem e o laboratório. Push a cada commit; a CI diz se quebrou algo. O commit de fechamento é `fase 16: a garagem é da pessoa, e o perfil`, com a documentação (3.5).
4. **A migration no hospedado** antes do merge: `--dry-run`, lido, `db push`, e a conferência por leitura (as colunas, os grants, quantos perfis receberam a cópia).
5. **O laboratório no preview, uma vez**, depois do commit de fechamento (seção 1). Leia os artefatos, não só o verde.
6. **O merge**, pela seção 2: rebase, `git merge-base --is-ancestor origin/main HEAD`, CI verde no sha, o laboratório do preview tratado como a seção 1 manda, `git push origin <sha>:main`, o laboratório da produção uma vez.
7. **Ao terminar:** `decisoes.md`, a memória com o estado final, as branches temporárias apagadas, e um **resumo final para o Douglas**: o sha da `main`, o que mudou e como se prova, o que os dois laboratórios disseram, os números, as D novas, as armadilhas novas, o que ficou sem prova, as pendências dele.
8. **Regras permanentes:** elegância sobre velocidade, sem confundir elegância com rodadas de laboratório (seção 1); experiência acima do custo; não é jogo nem GPS (nada que premie velocidade, nada que exija interação de quem dirige); iPhone primeiro, Android igual; offline primeiro; nunca inventar; nenhum segredo no client; nada roda no Mac; a regra do não-preencher; a autorização da seção 2 e os limites dela.
