# Fase 13 · Correções

> Você é o agente de implementação da **fase 13**, a primeira do plano de melhorias (`docs/fases/plano-melhorias.md`). Ela corrige o que está errado hoje antes de qualquer coisa nova: o mapa que cobre a folha, a rolagem horizontal, o envio do rack que às vezes não sobe, a nota do Lighthouse da visão geral, e o que o Douglas achou no teste dele. Ela também leva ao repositório o plano das fases 13 a 21 e a regra nova do prompt mestre. **O Douglas não vai estar presente:** a seção 2 traz o ok antecipado dele e o que continua proibido mesmo assim. Se a fase 12 ainda não tiver sido publicada, este chat termina a publicação dela (seção 1). Ao terminar: os commits da fase, `docs/decisoes.md` e a memória atualizados, e um resumo final para quem volta depois de horas fora.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v3): seção 2 (regras), 11 (design e UX) e 13 (testes). Esta fase o leva à v4 (seção 3.6).
2. `docs/fases/plano-melhorias.md` inteiro: a regra do não-preencher, a ordem das fases, "O que não dá como foi pedido", a fase 13 e as decisões do Douglas de 08/11. É o mapa do que vem depois; não faça nada das fases 14 a 21 aqui.
3. `docs/decisoes.md` inteiro. Em especial:
   - D91 (onde se testa), D104 a D106 (tipos da CI, avisos de dois dias, o preview do laboratório), D108 (deploy das funções);
   - D143 e D144 (react-leaflet, os pinos por portal, a tela do mapa);
   - D159 a D166 (tudo da fase 12), com atenção à D161 (acessibilidade, inclusive a guarda da rolagem lateral), à D162 (Lighthouse: o que foi medido, o que foi desfeito, a meta com o app instalado) e à **D164 (o prazo das chamadas do sync e o rack que não sobe)**.
4. Os commits `1a91064` (`sync: prazo em cada chamada…`) e `dc7a04e` (`laboratório: quando o rack não sobe, a falha mostra a fila do aparelho`), com as mensagens inteiras (`git log -1 --format=%B <sha>`).
5. `docs/fases/fase-12.md`, seção 1, "Armadilhas conhecidas": o ambiente desta máquina (o `cd` do gvm, o `gh`, o heredoc, o pooler de leitura). Vale tudo aqui.
6. Código:
   - o mapa: `src/features/map/routes/MapaPage.tsx`, `src/features/map/components/TripMap.tsx`, `src/features/map/map.css`, `src/components/ui/Sheet.tsx` e `SheetFrame.tsx`;
   - a largura: `src/app/layouts/AppLayout.tsx`, `src/features/itinerary/routes/{RoteiroPage,DiaPage}.tsx`, `src/features/itinerary/components/{StopCard,RouteCard}.tsx`, `src/app.css`;
   - o sync: `src/lib/db/sync/{engine,runner,push,pull,deadline,status}.ts` e os testes ao lado, `src/lib/db/` (a `mutate` e a outbox), `src/sw.ts` (o push do service worker), `scripts/lab/app-progress.ts` (o cenário `app_progressao` e a fila do aparelho que ele imprime na falha);
   - os testes: `e2e/acessibilidade.spec.ts` (a guarda `ROLAGEM_LATERAL` e a lista de rotas), `e2e/mapa.spec.ts`, `e2e/helpers/viagem.ts` (as viagens de verdade dos testes), `playwright.config.ts`;
   - o laboratório: `scripts/lab/run.ts`, `scripts/lab/lighthouse.ts` e `lighthouse-score.ts`, `src/features/lab/scenarios.ts`, `.github/workflows/{ci,lab}.yml`.

## 1. Estado ao começar, e a fase 12

**Primeiro, antes de qualquer outra coisa:**
- `caffeinate -i -s -t 86400` em segundo plano, para o Mac não dormir no meio.
- As identidades (regra global do Douglas): `gh auth status`, `ssh -T git@github.com` e `git config user.email`. A conta é **`dougedss`**, e o e-mail dos commits é `203018054+dougedss@users.noreply.github.com`. Se divergirem, pare: não contorne.

**Quando este prompt foi escrito (08/11/2026, 7h30):**
- a `main` estava em `dc7a04e` (a fase 11 e as correções que o chat da fase 12 trouxe pela `fase-11`: a importação, o prazo do sync, a fila do rack no laboratório);
- a `fase-12` estava em `642089c` `fase 12: polish e E2E`, com a CI verde e o laboratório no preview em 33 de 35; a 0012 e a função `purge` **já estavam no hospedado**;
- os dois vermelhos do laboratório: o **Lighthouse da visão geral em 86** (meta 90; a D162 mostra que varia com a máquina do GitHub) e o **rack do "Usar no carro" que às vezes não sincroniza** (defeito anterior à fase 12; D164 e `dc7a04e` deixaram o diagnóstico armado). Os dois são desta fase (3.3 e 3.4);
- o chat da fase 12 tinha acabado de perguntar ao Douglas se publicava ("Publicar agora" era a recomendação) e esperava a resposta. **Ele não vai responder: a publicação é sua** (estado B, abaixo). Ela é só o fast-forward da `main` para a ponta da `fase-12` e o laboratório na produção; nada falta no hospedado;
- as decisões vão até a D166. **As suas começam na D167.**

**Onde você trabalha: na pasta principal**, `/Users/douglas/Documents/dev/viajei`. O chat da fase 11, que morava nela, terminou. Ela está na branch `fase-11` em `dc7a04e`, com três arquivos fora do git: `docs/fases/fase-12.md` (igual ao que a `fase-12` já commitou), `docs/fases/plano-melhorias.md` e este `fase-13.md`. Os dois últimos entram no seu commit.
- Antes do primeiro checkout, guarde a cópia solta de `fase-12.md` no scratchpad e apague-a da pasta: o `git checkout` de uma branch que já tem o arquivo recusaria sobrescrevê-la. Confira antes que são iguais (`git show origin/fase-12:docs/fases/fase-12.md | diff - docs/fases/fase-12.md`).
- Os worktrees `viajei-fase-12` (do chat da fase 12) e `viajei-fase-11-fix` não são seus: não os use nem os remova.
- Comandos na pasta: `cd /Users/douglas/Documents/dev/viajei && ...`; Node em `PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH"`; o `.env.local` está aqui, e os scripts `remote:*` funcionam direto (esta fase não deve precisar deles).

**A fase 12 e a sua branch.** Faça `git fetch` e veja onde ela está:

| Estado | Como reconhecer | O que você faz |
|---|---|---|
| **A · na `main`** | `git merge-base --is-ancestor origin/fase-12 origin/main` | `git checkout -b fase-13 origin/main`. Leia o que ela deixou em `decisoes.md` e na memória. |
| **B · pronta e parada** | a `fase-12` não está na `main`, a CI do último sha dela está verde e a branch não muda há 30 min ou mais | **Termine a publicação dela** (abaixo). Depois, `git checkout -b fase-13 origin/main`. |
| **C · ainda mudando** | commits novos na `fase-12` ou CI rodando nela (o chat dela acordou) | Espere. Enquanto isso, `git checkout -b fase-13 origin/fase-12` e planeje; rebaseie sobre a `origin/main` quando ela entrar. Não dispare o laboratório enquanto o dela roda (a fila é uma só; veja as armadilhas). |

**Terminar a fase 12 (estado B).** Antes de cada passo, confira que ele ainda não foi feito.
1. `git merge-base --is-ancestor origin/main origin/fase-12`: se a `main` não for ancestral, pare e entenda por quê antes de qualquer coisa (não rebaseie a branch de outro chat sem necessidade).
2. A CI verde **naquele sha** (`gh run list --branch fase-12 --workflow ci.yml`).
3. O último laboratório no preview **naquele sha** verde, ou vermelho só nos dois conhecidos: o `lighthouse` da visão geral e o `app_progressao` do rack. Qualquer outro vermelho é motivo para parar e diagnosticar antes de publicar.
4. Só leitura no hospedado: `supabase migration list` com o env carregado mostra a 0012 aplicada, e `supabase functions list` mostra a `purge`. Nada a aplicar; se faltar algo, pare.
5. O fast-forward: `git push origin <sha da fase-12>:main`. Nunca force.
6. O laboratório na produção (`gh workflow run lab.yml --repo dougedss/viajei`). Se ele achar defeito que não seja um dos dois conhecidos, corrija pela CI ou reverta (seção 2).
7. Uma nota curta no começo das decisões da fase 13 (o que você fez pela fase 12, com os números do laboratório) e o estado na memória. **Não mande mensagem ao chat da fase 12.**

O merge da fase 13 só acontece depois da fase 12 na `main`.

**Onde se testa (D91):** nada roda neste Mac. A CI do GitHub roda em todo push da `fase-13` (lint, tipos, Vitest, pgTAP, build, segredos no `dist/`, Playwright com os projetos `iphone`, `webkit`, `pwa`, `expurgo` e `webkit-pwa`). O laboratório é o teste de aceitação: no preview da branch antes do merge (`gh workflow run lab.yml --repo dougedss/viajei --ref fase-13 -f alvo=preview`) e na produção depois. Cada laboratório faz uma leitura real da IA, de uns US$ 0,04.

### Armadilhas conhecidas (não redescubra)

- **A fila do laboratório é uma só** (grupo `laboratorio`, sem cancelar o que roda): o GitHub **cancela a execução que estava na fila** quando outra chega. Antes de disparar, `gh run list --workflow lab.yml --limit 3`; se há uma rodando ou na fila, espere.
- O preview da Vercel leva uns minutos para subir depois do push; o laboratório no preview antes disso mede o deploy anterior. Confira o deploy (`vercel ls` ou a URL do preview com o commit) antes de disparar.
- `gh run view <id> --log-failed` às vezes volta vazio para o laboratório: o relatório inteiro está nos artefatos (`gh run download <id>`), inclusive os relatórios do Lighthouse e a fila do aparelho da falha do rack.
- A guarda da rolagem lateral da D161 roda no viewport do iPhone 15 (393 px) com uma viagem de nome longo. O que ela não tem: palavras sem espaço mais largas que a tela (um link numa observação, um endereço colado) e a largura de 360 px dos Android menores.
- `elementFromPoint` só enxerga a área visível (D165): ao provar que a folha está por cima do mapa, role o alvo para a tela antes.
- Começar um comando por `export` ou `mkdir` dispara o hook do zsh que falha; `gh` precisa de `XDG_CACHE_HOME` gravável no scratchpad; heredoc com `$$` é recusado (escreva arquivos com a ferramenta Write).

## 2. A autorização antecipada do Douglas (08/11/2026)

Nas palavras dele: "todos os prompts precisam receber todas as permissões, pois eu não vou estar presente para autorizar nada". Vale para este chat, nesta fase e no fechamento da fase 12, e é a mesma autorização da fase 12 (`docs/fases/fase-12.md`, seção 2), com os mesmos limites.

**Você pode fazer sem perguntar:**
1. Publicar o plano e seguir para o código sem esperar ok. Escolha pela recomendação deste prompt e registre cada escolha em `decisoes.md`.
2. Terminar a publicação da fase 12 (estado B da seção 1).
3. Push na `fase-13`, CI e laboratório, no preview e na produção, quantas vezes precisar. Cada laboratório faz uma leitura real da IA, de uns US$ 0,04.
4. No hospedado, **só se o defeito do rack exigir** (uma RPC, um índice): `db push` com o `--dry-run` antes e lido, nada destrutivo; funções publicadas e conferidas por leitura (D108). Nenhuma migration ou função está prevista nesta fase.
5. Dar fast-forward na `main` (push = deploy) com a CI verde **naquele sha** e o laboratório no preview verde **naquele sha**, ou vermelho só no que esta fase decidiu medir sem cobrar (3.4), registrado. `git push origin <sha>:main`. Nunca force.
6. Se a produção quebrar depois de um merge e a correção não for rápida: `git revert` num commit novo, pela CI, até a produção voltar ao último estado verde.
7. Atualizar `decisoes.md`, a memória do projeto, o README, o prompt mestre (3.6) e os roteiros.

**Continua proibido, mesmo com esse ok** (são regras de segurança, que o ok não desfaz):
- digitar a senha do Douglas em qualquer lugar, criar contas, ou ler ou escrever `.env*`;
- pôr chave secreta no client (Anthropic, ORS, chave secreta do Supabase, VAPID privada);
- criar, trocar ou apagar secrets (Supabase, GitHub, Vercel) e mexer em configurações de painel: Auth hospedado, proteção da Vercel, cobrança, limites;
- apagar dados reais por qualquer caminho que não seja a regra do expurgo. Isso inclui as viagens de teste do Douglas ("Teste", "Teste 3") e a viagem real `0faf1ff2-…`. Ler os dados dele para diagnosticar (3.2) pode; escrever, nunca;
- `db reset`, `--force` ou qualquer comando destrutivo no hospedado; force push na `main` ou reescrever a história dela;
- usar outra conta GitHub ou conta de empresa cliente;
- mandar mensagem a outras sessões do Claude;
- gastar além do laboratório normal: nenhuma medição extra da IA e nenhum serviço pago novo.

**Quando parar.** Só quando seguir em frente exigiria quebrar uma regra acima, quando um `--dry-run` mostrar algo destrutivo que o plano não previa, ou quando houver risco de perder dados. Aí deixe a produção no último estado verde, escreva o relatório e pare. O que só o Douglas pode resolver vai como pendência no resumo final, nunca contornado.

## 3. Entregas

### 3.1 O mapa por cima da folha (o print do Douglas)

**O que acontece.** Em `/viagens/:tripId/mapa`, tocar num pino abre a folha da parada **por baixo do mapa**: os pinos, a rota e os tiles aparecem por cima do cartão branco.

**A causa, pelo código.** A caixa que envolve o `TripMap` em `MapaPage.tsx` (`relative h-[clamp(…)] overflow-hidden rounded-card bg-stage shadow-card`) é posicionada mas **não cria contexto de empilhamento**. As camadas do Leaflet dentro dela têm `z-index` 400 (tiles), 600 (pinos; os `zIndexOffset` dos nossos pinos vão além) e 1000 (controles), e competem na raiz com a folha (`SheetFrame`: `fixed z-50`, e o fundo `z-40`). Qualquer `z-index` maior que 50 dentro da caixa vence a folha.

**A correção.** `isolate` (ou `z-0`) na caixa do mapa, para o Leaflet empilhar só dentro dela. O aviso "Sem internet" (`z-[1001]`, dentro da caixa) continua acima dos tiles por estar dentro. Confira o mesmo defeito em toda caixa que contém Leaflet ou um canvas do three com HUD por cima (`WorldSection`, `GarageStage`, a retrospectiva): o que tem `z-index` lá dentro não pode escapar para a raiz. Veja também a ordem entre `Toast` (`z-50`) e a folha (`z-50`): hoje decide a ordem no DOM; se a folha abrir sobre um toast, diga o que vale e deixe explícito.

**O teste.** Em `e2e/mapa.spec.ts`: tocar num pino, trazer o título da folha para a tela e provar que o ponto central dele pertence à folha (`document.elementFromPoint(...)` dentro de `[data-map-sheet]`), nos projetos `iphone` e `pwa`. Uma linha em `docs/teste-final.md`, no bloco 1.16, para o aparelho.

### 3.2 A rolagem horizontal

**O que o Douglas viu.** A tela do roteiro rola para o lado no celular, na produção (que ainda era a fase 11). Ele não estará para dizer qual tela, qual viagem ou qual celular: use o que a mensagem de abertura trouxer e, sem isso, o código e os dados. **Os dados dele você pode ler, nunca escrever:** pelo pooler de leitura (fase-12.md, armadilhas), procure nas viagens dele (`trips`, `stops`, `reservations`, `contacts`) os textos com uma palavra sem espaço mais larga que a tela (uns 30 caracteres ou mais: links, códigos, endereços colados) e reproduza o mesmo conteúdo na viagem de teste do e2e. Não copie texto dele para o repositório; use um equivalente do mesmo tamanho. O que não se reproduzir, registre como não reproduzido, com o que foi tentado.

**O que já existe.** A D161 pôs em `e2e/acessibilidade.spec.ts` a guarda `ROLAGEM_LATERAL` em todas as rotas, com uma viagem de nome longo, e corrigiu o topo do Modo Viagem (uma coluna automática de `grid` que crescia até o texto sem quebra). Ela passa a 393 px. Então o que o Douglas viu ou já foi corrigido pela fase 12, ou é um caso que a guarda não cobre.

**Onde procurar.** Palavras sem espaço mais largas que a tela: um link ou um código numa observação (`whitespace-pre-line` em `StopCard.tsx` preserva as quebras, mas não quebra uma palavra comprida), um endereço sem espaços, o nome de um lugar; colunas de `grid`/`flex` sem `min-w-0`; a página de um dia com o cartão da rota. E a largura de 360 px, que o iPhone 15 não exercita.

**A correção, estrutural.** O texto que vem das pessoas (nomes, endereços, observações, códigos, links) nunca pode alargar a página: `overflow-wrap: anywhere` no `main` (em `app.css`), e `min-w-0` onde uma coluna automática segura texto. Corrija a causa que você achar; não esconda com `overflow-x: hidden` no corpo. As faixas que rolam de propósito (os chips dos dias, com `snap-x overflow-x-auto`) continuam.

**A guarda, estendida.** Em `acessibilidade.spec.ts`: a viagem de teste ganha uma parada com observação contendo um link de 80 caracteres sem espaço e um endereço colado, e uma reserva com código comprido; a guarda roda também a 360 px (um `page.setViewportSize` na mesma volta, só para a rolagem lateral, para não dobrar o tempo do axe). No laboratório, `app_extras` passa a avaliar a mesma `ROLAGEM_LATERAL` (exporte-a de um módulo que os dois importem) nas telas que ele já visita: a guarda passa a valer todo dia, na produção, com as viagens do lab-a.

### 3.3 O rack que não sobe (o defeito do sync)

**O que acontece.** No cenário `app_progressao`, depois do cartão "Primeiro pé na estrada", "Usar no carro" grava o rack no aparelho; o chip fica em "1 pendente" e `car_accessories` não chega ao servidor em 2 min. Aconteceu em 2 de 9 laboratórios no preview da fase 11 e em mais 3 depois, com ou sem o prazo nas chamadas (D164). Nas execuções que passam, o envio demora de 1 min 44 s a 2 min 10 s, contra uns 30 s antes: **algo atrasa o envio mesmo quando ele acaba subindo.** É um defeito do app, anterior à fase 12, e é o mais importante desta fase: na estrada, um Chegamos! que não sobe é o que o time não vê.

**O que já foi feito.** D164: prazo de 45 s em cada chamada (`deadline.ts`), que transformou "para sempre" em "menos de um minuto". `dc7a04e`: na falha, o cenário imprime a fila do aparelho (a outbox: tabela, operação, estado, tentativas, próxima tentativa e o último erro do servidor). **Comece pelos artefatos dos laboratórios vermelhos da `fase-12`** (`gh run list --workflow lab.yml --branch fase-12`; `gh run download <id>`): a fila está no detalhe do `app_progressao` e diz se o item estava esperando (`next_attempt_at` no futuro, com que erro), em curso, ou nem na fila.

**Hipóteses a provar ou descartar, pelo código e pelos dados:**
- o backoff da outbox depois de um erro transitório (um 5xx, o prazo estourado) espera demais, ou o erro que volta não é tratado como transitório;
- o lock `viajei:sync` (Web Locks) em disputa entre a página e o service worker (o push do `sw.ts`), ou um ciclo que termina sem soltar o lock num caminho de erro;
- a coalescência da outbox com `car_accessories` (um `text[]` que a `mutate.patch` grava inteiro) e os `field_versions`: um `sync_guard` que descarta a escrita como velha depois que o preparo do laboratório gravou a mesma coluna segundos antes (D70: "duas colunas que sincronizam sozinhas");
- a sessão renovando o token (o supabase-js segura as chamadas durante o refresh) no momento do envio;
- o Realtime: o pull disparado pelo broadcast do próprio push, concorrendo com o ciclo seguinte.

**O que entrega.** A causa provada, com um Vitest que a reproduz em `runner.test.ts`, `push.test.ts` ou um novo, e a correção; se a causa for no servidor (`sync_push`, `sync_guard`), um pgTAP. Critério de aceite: `app_progressao` verde em **5 laboratórios seguidos** no preview, com o envio de volta aos ~30 s. Se depois de um esforço honesto a causa não se provar, deixe o diagnóstico mais perto da próxima vez (o que a fila ainda não mostra: o estado do lock, a fase do motor, a hora de cada tentativa) e registre o que foi descartado e por quê. Não finja uma correção.

### 3.4 O Lighthouse da visão geral

**O que acontece.** A meta da D162 é ≥ 90 na mediana de 3, com o app instalado. A visão geral fica no limite: 90 na medida rápida, 83 a 88 na máquina mais lenta do laboratório inteiro (índice de CPU ~2.350 contra ~2.900). O último laboratório deu 86. A fase 14 vai transformar essa tela em "Detalhes", mas o laboratório vermelho todo dia por variação de máquina é ruído, e ruído esconde defeito.

**Duas frentes, as duas:**
1. **A tela.** A D162 diz o que pesa: é a tela que mais monta de uma vez (`useTripOverview` lê tudo e pinta inteira; a transição ajudou). Pelos relatórios do Lighthouse nos artefatos (o elemento do LCP, o que bloqueia, o que mexe o layout), veja o que ainda cabe sem mudar a arquitetura: o cabeçalho e o roteiro pintam primeiro e o resto (a barra do time, as listas, os avisos, o clima) entra numa segunda fatia; nada que a D162 já tenha medido e desfeito. Meça com a tarefa `medir-desempenho` (só o Lighthouse, com os relatórios), não com o laboratório inteiro.
2. **A régua.** O relatório do Lighthouse traz o `benchmarkIndex` da máquina. O cenário passa a registrar a nota e o índice, e a cobrar os 90 **só numa máquina normal** (índice ≥ 2.800, o das medidas da D162); abaixo disso, o resultado é "medido, não cobrado" (o status de pulado, com os números no detalhe). É honesto: a meta continua a mesma, e o laboratório só fica vermelho quando a tela piorou, não quando a máquina era lenta. Registre em `decisoes.md` e no README (o calendário de manutenção explica o que um "medido, não cobrado" quer dizer).

### 3.5 O que o Douglas achou no teste dele

Se a mensagem de abertura trouxer a lista dele (tela, celular, o que fez, o que esperava), cada item vira: a causa, a correção, um teste que a prova (Vitest, e2e ou laboratório, o que couber) e uma D. O que for melhoria, e não defeito, vai para a fase certa do plano, com uma linha em `plano-melhorias.md`; não entra aqui. Se a abertura não trouxer nada, esta entrega fica vazia: não invente itens.

### 3.6 Documentação

- `docs/fases/plano-melhorias.md` e `docs/fases/fase-13.md` entram no repositório como estão (sem reescrever).
- `docs/prompt-implementacao.md` passa a **v4**: na seção 2, o item 16, **a regra do não-preencher**, com o texto do plano ("O app nunca pede que a pessoa preencha o que ele pode ler, descobrir ou perguntar numa frase. Formulário é a última opção, nunca a primeira. Quando precisar perguntar, diz antes quantas perguntas são, oferece opções e aceita texto livre."); na seção 12, o título vira "Plano por fases (21)" e a tabela ganha as linhas 13 a 21, uma por fase, no mesmo formato (entrega, migrations, testes), a partir do plano. Nada mais muda no prompt mestre.
- `docs/decisoes.md`: a seção "Fase 13 · Correções (data)", com uma D por defeito (contexto, causa, decisão, consequência), a D da régua do Lighthouse, e os números medidos (os tempos do `app_progressao` antes e depois; as notas).
- `docs/teste-final.md`: a linha do bloco 1.16 (3.1) e o que mais esta fase mudar de visível.
- README: só o que mudar (a régua do Lighthouse).
- A memória do projeto, ao terminar: o estado (o que está no ar), o que foi corrigido, os números e as armadilhas novas.

## 4. Como trabalhar nesta fase

1. **Comece:** caffeinate, identidades, leitura, o estado da fase 12 (A, B ou C) e, se for B, a publicação dela; a branch `fase-13`. Baixe os artefatos dos laboratórios vermelhos da `fase-12` antes de planejar o 3.3.
2. **O plano, como mensagem, e siga sem esperar ok** (seção 2). Curto e concreto, com evidência:
   - o que você fez pela fase 12;
   - 3.1: a linha da caixa, a correção, o teste;
   - 3.2: o que a guarda cobre e não cobre, o que a abertura trouxe, o que os dados dele mostram, a correção estrutural e a guarda estendida;
   - 3.3: o que a fila do aparelho dos laboratórios vermelhos mostra, as hipóteses em ordem de probabilidade, como vai provar cada uma;
   - 3.4: o que os relatórios mostram da visão geral e a régua;
   - 3.5: os itens dele, se vieram, classificados em defeito desta fase ou melhoria de outra;
   - 3.6: a v4 do prompt mestre.
3. **Um commit por correção**, mensagem em português que diga o que e por quê (como `1a91064` e `dc7a04e`), cada um com o seu teste. Push a cada commit: a CI diz se quebrou algo. O commit de fechamento é `fase 13: correções`, com a documentação (3.6).
4. **O laboratório no preview** depois do último commit, e cinco vezes para o 3.3 (um de cada vez, pela fila). Leia os artefatos, não só o verde.
5. **O merge**, pela seção 2, só depois da fase 12 na `main`: rebase, `git merge-base --is-ancestor origin/main HEAD`, CI verde no sha, laboratório no preview verde no sha, `git push origin <sha>:main`, o laboratório na produção.
6. **Ao terminar:** `decisoes.md`, a memória com o estado final (o que está no ar, os números, as armadilhas novas, as pendências que só o Douglas resolve) e um **resumo para o Douglas, escrito para quem volta depois de horas fora:** o que foi publicado da fase 12 e da 13, o que foi corrigido e como se prova, o que o laboratório da produção disse, o que ficou (se ficou) e o que ele confere no celular.
7. **Regras permanentes:** elegância sobre velocidade; experiência acima do custo; não é jogo nem GPS; iPhone primeiro, Android igual; offline primeiro; nunca inventar; nenhum segredo no client; nada roda no Mac; a autorização da seção 2 e os limites dela.
