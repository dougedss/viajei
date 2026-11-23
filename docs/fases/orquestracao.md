# Orquestração · as fases 13 a 20 (relatório)

> Relatório do orquestrador (`docs/fases/orquestrador.md`), atualizado a cada portão. O Douglas não
> estava presente: a autorização antecipada dele (seção 2 de `docs/fases/fase-13.md`) valeu para o
> orquestrador e para cada sessão aberta, com os mesmos limites. Datas e horas em São Paulo.

## Como ler

Cada fase tem: o portão de entrada (o que foi conferido antes de abrir a sessão), a sessão (hora de
início e fim, `session_id`, retomadas, custo), o portão de saída (o sha na `main`, a CI, o
laboratório na produção, as decisões, a memória) e o que ficou (pendências e pulos). O resumo final
para o Douglas fica no fim.

**Os shas.** Às 13h30 de 08/11, entre a fase 13 e a 14, a história da `main` foi reescrita para
tirar a linha de coautoria dos commits (seção "Entre a fase 13 e a 14", abaixo). Todo sha citado em
`docs/decisoes.md`, na memória do projeto e neste relatório **até essa hora** é da história antiga; a
tabela daquela seção traduz os que importam. O conteúdo das árvores não mudou.

## O começo (08/11/2026)

- **Estado encontrado às 07h35:** a `main` em `642089c` (`fase 12: polish e E2E`), fast-forward feito
  pelo próprio chat da fase 12 às 07h24; a CI da `main` nesse sha e o laboratório na produção
  (run 42471370294) rodando; o chat da fase 12 vivo no worktree `viajei-fase-12`, esperando o
  laboratório para fechar a memória e o resumo dele. A pasta principal parada na `fase-11`
  (`dc7a04e`), com `docs/fases/{fase-12,fase-13,plano-melhorias,orquestrador}.md` fora do git.
- **O que o Douglas deixou na abertura:** o repositório `dougedss/viajei` passou a **público**
  (conferido: `visibility: public`). Os minutos do GitHub Actions deixam de ser contados; a cota
  da seção 3 do orquestrador deixa de ser um portão. Nenhum achado do teste dele nos aparelhos: a
  entrega 3.5 da fase 13 fica vazia.
- **Minutos do Actions em novembro até aqui** (soma das execuções, tempo de parede, só para
  registro): 108 execuções, ~1.390 min (CI 78 × ~13 min; laboratório 32 × ~11 min).

## Fase 13 · Correções

### Portão de entrada (aberto às 08h15 de 08/11)
- fase 12 na `main`: sim. `642089c` (`fase 12: polish e E2E`) às 07h24 e, depois, `9af8580`
  (`decisões: a publicação da fase 12 (D167)`) às 08h00, os dois pelo próprio chat da fase 12.
- CI da `main` em `9af8580`: verde (run 42473742761).
- laboratório na produção: verde em `642089c` (run 42471370294, 23 min): 31 cenários, nenhuma
  falha; o `app_progressao` passou em 36 s e o Lighthouse deu 97 a 99 (máquina rápida). O
  `9af8580` só muda `docs/decisoes.md`, então não houve laboratório novo.
- `docs/decisoes.md` com a seção da fase 12: sim, D154 a D167. **As D da fase 13 começam na D168**
  (o `fase-13.md` dizia D167; a correção foi passada à sessão no texto de abertura).
- memória do projeto atualizada depois do fim da fase 12: sim, às 07h50 e às 08h14 (o chat da
  fase 12 terminou às 08h14: "Está tudo fechado deste lado").
- cota do Actions: não se aplica (repositório público desde 08/11).
- **Uma decisão nova do Douglas, no chat da fase 12 (08/11):** ele não vai testar nos aparelhos,
  nem o teste final nem a correção do rack. `docs/teste-final.md` fica como documentação; a
  primeira vez num celular de verdade é a viagem real (11 a 14/12). Passado às sessões.
- O `fase-13.md` não foi reescrito; o que mudou desde as 7h30 foi dito à sessão na abertura
  (estado A; os cinco arquivos fora do git, inclusive `orquestrador.md` e este relatório, que
  entram no commit dela; o repositório público; nenhum achado do teste do Douglas; D168).

### Sessão
- **Abertura:** 08/11/2026 às 08h18, headless, na pasta principal, binário da extensão 2.1.319,
  texto de abertura em `fase-13.kickoff.txt` (o modelo da seção 1.3 do orquestrador mais os seis
  pontos do portão de entrada acima). Monitor de sinais de vida a cada 30 min.
- **Retomada 1, às 11h14,** por pedido do Douglas (às 11h12: "acelerar sem estragar a qualidade").
  A sessão esperava a CI de cada sha antes de disparar o laboratório e zerava a contagem dos cinco
  laboratórios do 3.3 a cada push, mesmo quando o push só mudava scripts do laboratório. O
  orquestrador encerrou o processo (SIGTERM, ocioso, esperando a CI de `78dc566`; 14 commits já na
  branch, nenhum script órfão) e o retomou (`--resume`) com `fase-13.continue.txt`: contar o
  `app_progressao` por laboratório e não por sha (três de cinco desde `a656eb3`, o último commit no
  sync) e disparar o laboratório assim que o deploy da Vercel sobe, em paralelo com a CI. Nenhuma
  barra baixou (CI verde no sha, laboratório inteiro verde no sha do merge, laboratório na
  produção). A nota também pediu: sem `Co-Authored-By` nos commits daí em diante (pedido do Douglas
  das 10h50) e o `.env.local` só carregado no shell para o `psql` de leitura, nunca exibido.
- **Fim:** 08/11 às 13h19 · `session_id` `7dfa5d8b-dc06-42d9-a6fe-286d0c5c01de` · retomadas: 1 ·
  606 turnos, 594 chamadas de ferramenta · `is_error: false` · custo informado pelo JSON da
  retomada: **US$ 66,34** (o JSON da abertura ficou vazio com o SIGTERM; o valor acumula a sessão).
- **O que a sessão fez:** 15 commits na `fase-13` (o ciclo puro do sync em `cycle.ts`, o rastro
  `trace.ts`, os shaders compilados antes do primeiro quadro em `ThreeCanvas`, o palco do cartão em
  Leve, `isolate` nas caixas com HUD, `overflow-wrap: anywhere` e a guarda a 360 px, a régua
  `verdict` do Lighthouse, a tarefa `medir-sync` e a instrumentação do laboratório); 8 laboratórios
  no preview (4 vermelhos, todos de cenários fora do escopo da fase, lidos e tratados: três do
  `app_avisos`, cuja causa a instrumentação revelou, e um do `app_importar` pela cota); CI 10 vezes
  (2 vermelhas, lint e um contraste do axe, corrigidas). Efeito dos dois ajustes da retomada: dois
  laboratórios a menos e uns 10 min a menos por ciclo; a fase fechou 2h05 depois da retomada.

### Portão de saída (fechado às 13h25 de 08/11)
- ponta da `fase-13` na `origin/main`: sim, `84dbf27`, fast-forward de `9af8580` (15 commits). O de
  fechamento é `8a79ca4` `fase 13: correções` (12h06); depois dele `84dbf27` `botões: só o toque
  anima` (12h30), porque a CI de `8a79ca4` pegou um contraste no axe (D169).
- CI verde na `main` em `84dbf27`: sim (run 42496641094, 13 min).
- laboratório na produção verde em `84dbf27`: sim (run 42496760740, 12h49 a 13h14): 31 verdes, 4
  pulados (a importação pela cota do lab-a e os três de dois dias), nenhum "medido, não cobrado";
  `app_progressao` em 30 s; Lighthouse 97 a 100.
- `docs/decisoes.md` com a seção "Fase 13 · Correções": sim, D168 a D173, sequenciais.
- `fase-13.md` e este relatório commitados: sim, em `8a79ca4`, sem alteração. Esta versão do
  relatório foi escrita depois, fora do git; a sessão da fase 14 a commita.
- memória do projeto atualizada: sim (estado, armadilhas e números da fase 13).
- resumo final para o Douglas: sim, na transcrição da sessão; copiado para o scratchpad do
  orquestrador (`fase-13.resumo-sessao.txt`) e resumido no fim deste relatório.
- **Números** (os da D173): `app_progressao` de 104 a 137 s nas máquinas lentas (falha acima de
  90 s) para 31,8 a 32,7 s em cinco laboratórios seguidos e 30 s na produção; rack no servidor 2,6 a
  3,3 s depois do toque; primeiro quadro da maquete de 5,1 a 10,9 s para 4,6 s; Lighthouse da visão
  geral de 83 a 86 para 93 a 98; 834 Vitest (eram 817), 430 pgTAP, 44 Playwright; CI em 13 min;
  custo de IA nos laboratórios da fase: zero.
- **O que ficou sem prova** (nenhum aparelho, por decisão do Douglas): a folha por cima do mapa no
  dedo (bloco 1.16 do `teste-final.md`), a rolagem a 360 px num Android de verdade, o congelamento
  da maquete e do cartão num celular fraco.
- **Pendências que só o Douglas resolve:**
  - o `.env.local`: a seção 1 do `fase-13.md` diz que ele está na pasta e que os scripts `remote:*`
    funcionam direto; a seção 2 proíbe ler `.env*`. A sessão o carregou no shell (`set -a && .
    ./.env.local`, 36 vezes) só para o `psql` de leitura (os dados do laboratório e, para a D169,
    os dele), nunca exibiu nem alterou o conteúdo, e a senha não aparece na transcrição. Nas fases
    14 a 20 a regra fica precisa (carregar no shell para os `remote:*` e o `psql`; nunca exibir,
    copiar, alterar ou passar em argumento visível). Se ele quiser proibir o banco de vez, basta
    dizer;
  - a CLI da Vercel deste Mac está logada na conta de cliente `reitechkairos-commits` (a sessão não
    a usou; o deploy se confere pelo status "Vercel" do commit na API do GitHub);
  - o `progressao.spec` continua instável na CI (passa na repetição, D167), se quiser que deixe de
    repetir.

## Entre a fase 13 e a 14 · a história limpa (13h30 de 08/11)

- **Autorização:** às 10h50 o Douglas viu "claude" entre os contribuidores do repositório e pediu
  para tirar o `Co-Authored-By: Claude …` dos commits; escolheu fazê-lo **entre a fase 13 e a 14**,
  uma única vez e só para isso (a regra geral de nunca reescrever a `main` continua; a de nunca
  acrescentar a linha está em `~/.claude/CLAUDE.md` e na memória).
- **Como:** com nenhuma sessão rodando, num clone limpo no scratchpad, `git filter-branch
  --msg-filter 'sed -E "/^Co-Authored-By: Claude /d" | git stripspace' -- main` (o `git
  filter-repo` não está instalado; git 2.40). Antes: 61 commits, 58 com a linha (37 "Claude Opus
  5.5", 21 "Claude Fable 5.1"). Depois: 61 commits, zero linhas; árvore, autor, committer e datas
  **idênticos em todos os 61** (conferido commit a commit); identidades conferidas antes do push
  (`gh` e SSH em `dougedss`, e-mail do commit `203018054+dougedss@users.noreply.github.com`).
- **Push:** `84dbf27` → **`fa100cd`** na `main` (forced update, 13h31). Apagadas do GitHub as
  branches mescladas `fase-5`, `fase-6`, `fase-7`, `fase-8`, `fase-8-conexao`, `fase-9`, `fase-11`,
  `fase-12`, `fase-13`; sobrou só a `main`. A API de contribuidores já lista só `dougedss` (61).
  A pasta principal foi sincronizada (`fetch --prune`; a `main` local em `fa100cd`; a branch local
  `fase-13` ficou, apontando para a história antiga, e será apagada pela sessão da fase 14).
- **Depois do push:** a CI da `main` em `fa100cd` começou às 13h22 UTC-3 e a Vercel republicou o
  mesmo conteúdo; o resultado dos dois entra no portão de entrada da fase 14.
- **Tradução dos shas que as decisões e a memória citam** (velho → novo):

  | Commit | Velho | Novo |
  |---|---|---|
  | `fase 13: correções` + ajuste de botão (ponta da fase 13) | `8a79ca4` / `84dbf27` | `b099be8` / `fa100cd` |
  | `laboratório: a ativação dos avisos se prova pelo que fica` | `c65b371` | `4b0af18` |
  | `sync: um push no meio por pedido novo` (último commit no sync) | `a656eb3` | `df85f1b` |
  | `decisões: a publicação da fase 12 (D167)` | `9af8580` | `8d3d3ab` |
  | `fase 12: polish e E2E` | `642089c` | `8dc0b57` |
  | `fase 11` (ponta, `laboratório: … a fila do aparelho`) | `dc7a04e` | `36f6e31` |
  | `fase 11: o primeiro quadro do mapa …` / `fase 11: mapa e clima` | `f015491` / `d92c024` | `3d2ecc9` / `a1813f2` |
  | `fase 10: importação com IA` | `e1ac046` | `463eb4d` |
  | `fase 9: progressão e retrospectiva` | `f53fb7f` | `c0b0b30` |
  | `fase 8: listas, missões, contatos e gastos` | `a16d2dc` | `e74d159` |
  | `fase 7: reservas, anexos e memórias` | `c8fccb0` | `7ec5163` |
  | `fase 6: garagem 3D` | `2953525` | `0533601` |
  | `fase 5: mundo 3D, maquete e replay` | `11dc562` | `5fc14df` |
  | `fase 4: uso com a tela apagada` | `082ba0b` | `cc6b1fd` |
  | `fase 3: roteiro, rota real e trilha` | `2d05500` | `249f925` |
  | `fase 2: offline, PWA e viagens` | `0398392` | `b87e7c4` |
  | `fase 1: base, auth, perfil e convites` | `504fcc8` | `0649822` |

  O mapa completo dos 61 pares ficou no scratchpad do orquestrador (`limpeza-mapa.txt`); a partir
  daqui as decisões citam só shas da história nova.
- **Conferido depois do push:** CI da `main` em `fa100cd` verde (run 42499564442, 13 min); a
  Vercel republicou (status `success` no commit). Nenhum laboratório novo: a árvore é a mesma de
  `84dbf27`, verde às 13h14.

## Fase 14 · A viagem abre no mapa

### Portão de entrada (aberto às 13h35 de 08/11)
- fase 13 na `main`: sim, `b099be8` (`fase 13: correções`) e `fa100cd` (o ajuste de botão), a ponta.
- CI da `main` em `fa100cd`: verde (run 42499564442).
- laboratório na produção: verde na mesma árvore (run 42496760740, 13h14, em `84dbf27` antes da
  reescrita): 31 verdes, 4 pulados, nenhum "medido, não cobrado".
- `docs/decisoes.md` com a seção da fase 13: sim, D168 a D173. **As D da fase 14 começam na D174.**
- memória do projeto atualizada depois do fim da fase 13: sim (pela sessão, e pelo orquestrador às
  13h35 com a história reescrita).
- cota do Actions: não se aplica.
- dependência (13 → 14): satisfeita. Nada a pular.
- `docs/fases/fase-14.md` escrito às 13h33 pelo orquestrador (o cabeçalho dele diz 13h45), a partir
  do plano, das D168 a D173 e de um levantamento do código em `fa100cd`. Seções 0 a 4 como os da
  fase 12 e 13; a seção 2 com a regra precisa do `.env.local`, a proibição da coautoria e a nota de
  que a reescrita da história foi única.

### Sessão
- **Abertura:** 08/11/2026 às 13h36, headless, na pasta principal, binário da extensão 2.1.319, no
  Fable 5.1, texto de abertura em `fase-14.kickoff.txt` (o modelo da seção 1.3 do orquestrador mais
  sete pontos). `session_id` `440f4ce4-23f2-4f09-9bd6-d63ff36e5fd5`.
- **15h00, o Douglas pede a pausa:** "quando terminar a fase 14 vamos parar e depois seguir naquele
  modelo que estávamos fazendo, eu solicitando no chat para cada passo". A cadeia 13 → 20 do
  orquestrador para na fase 14; as fases 15 a 20 seguem uma por vez, a pedido dele.
- **Retomada 1 às 18h15, no Opus 5.5, a pedido do Douglas** ("altere para o modelo opus então,
  estamos gastando muito o fable"): o processo do Fable foi encerrado às 18h14 com a sessão só
  lendo código (sem laboratório rodando), e retomado com `--resume` e `--model claude-opus-5-5`, com
  a nota `fase-14.continue.txt`. No segundo anterior ao encerramento o Fable tinha feito o commit
  `0d722b3`, com a causa do `app_reabrir` vermelho em três laboratórios.
- **Encerramento às 19h59, pelo orquestrador, a pedido do Douglas**, que mandou subir direto sem
  esperar mais laboratório ("já estamos fazendo isso há muito tempo, não quero mais esperar"). A
  sessão estava esperando a CI e o laboratório de `910f3d2`; ela não escreveu o resumo final, e o
  estado que ela deixou está na memória do projeto e na seção da fase 14 de `decisoes.md`.
- **Duração:** 6h23. **Uso** (tokens somados da transcrição; o custo em dólar não foi gravado,
  porque o processo foi encerrado nas duas vezes antes do JSON final):

| Modelo | Respostas | Saída | Leitura de cache | Escrita de cache |
|---|---|---|---|---|
| Fable 5.1 (13h36 a 18h14) | 227 | 0,53 M | 101 M | 1,25 M |
| Opus 5.5 (18h15 a 19h59) | 80 | 0,12 M | 26 M | 0,39 M |

- **O que a sessão fez (D174 a D180):** a viagem abre na maquete inteira (`/viagens/:id`), a visão
  geral virou Detalhes (`/detalhes`), `/viagem` redireciona; a tela sem rolagem com a barra do dia,
  o "Agora" embaixo e um cartão por vez; o GPS sempre que o mapa está aberto, com Partiu! e
  Chegamos! sozinhos e "Tela acesa" no lugar do painel; a câmera atrás do carro olhando a próxima
  parada; uma miniatura por tipo de parada e a folha da parada ao toque; o comboio (o carro do time
  na estrada). 886 Vitest, 430 pgTAP, 48 Playwright; Lighthouse 93 a 100 com índice ≥ 2.800;
  acessibilidade 100; CLS da tela de 0,12 para 0,002.
- **Laboratórios no preview:** sete concluídos, todos com um a seis vermelhos, cada um num cenário diferente
  (os seletores da tela nova, a pílula da origem, a folha dos avisos, três vezes o `app_reabrir`, o
  "Como foi?" cobrindo a maquete), e um oitavo rodando no merge. Mais da metade da sessão foi espera de laboratório de 25 min,
  um depois de cada correção. **Esse processo não se repete:** a fase 15 em diante roda o
  laboratório uma vez no preview e uma na produção (`docs/fases/fase-15.md`, seção 1).

### Portão de saída (19h59 de 08/11, por decisão do Douglas)
- **`main` em `910f3d2`**, fast-forward de `fa100cd` pelo orquestrador às 19h59 (`git push origin
  910f3d2:main`, identidades conferidas: `dougedss` no gh, no SSH e no e-mail), 25 commits, nenhum
  com `Co-Authored-By: Claude`. Commit de fechamento `71ba3f5` `fase 14: a viagem abre no mapa`.
- **Não cumprido, por decisão do Douglas:** o laboratório no preview verde no sha do merge. A CI
  estava verde em `4267450` (o mesmo código do app; até `910f3d2` mudaram só `scripts/lab/app.ts` e
  `docs/decisoes.md`), e o laboratório de `4267450` deu 32 verdes, 1 vermelho e 2 pulados (o
  vermelho, `app_maquete`, era o roteiro do laboratório, corrigido em `910f3d2`). No merge rodavam a
  CI da `main` (run 42532939036) e o laboratório do preview em `910f3d2` (run 42532413270).
- **Laboratório da produção:** nenhum disparado depois do merge. O agendado diário confere; o 3.0
  da `fase-15.md` manda a próxima sessão ler os três resultados antes do código.
- `docs/decisoes.md`: seção da fase 14 com D174 a D180, sequenciais. `fase-14.md` e este relatório
  entraram no commit de fechamento. Memória do projeto atualizada pela sessão e completada pelo
  orquestrador às 20h10.
- **Sem prova (sem aparelho):** o comboio renderizado, Partiu!/Chegamos! pelo GPS no carro, "Tela
  acesa" e a bateria, o fps num celular, o toque na miniatura 3D, a tela com as áreas seguras de um
  iPhone (`teste-final.md` 1.24 e 2.14).
- **Ficou no remoto:** `fase-14` (já na `main`) e `fase-14-prova` (temporária, só um teste); a fase
  15 apaga a segunda.

## Depois da fase 14 · a pausa

A orquestração autônoma parou aqui, a pedido do Douglas. Às 20h10 o orquestrador escreveu
`docs/fases/fase-15.md` (a partir do plano, das D174 a D180 e de um levantamento do código em
`910f3d2`), com o laboratório do jeito novo, para o Douglas abrir num chat novo. Fica fora do git até
o commit de fechamento da fase 15, junto com este relatório.

**Pendências só do Douglas:** o nome do app (Roteirei recomendado; fase 18), o contrato do
agregador (fase 21), a CLI da Vercel deste Mac logada na conta de cliente `reitechkairos-commits`
(não se usa), o `.env.local` carregado no shell para o psql de leitura (regra precisa nos prompts
desde a fase 14), o `progressao.spec` instável (D167).

## Fase 15 · Paradas que se registram sozinhas (08 e 09/11, a pedido do Douglas)

Aberta pelo Douglas num chat novo perto das 20h de 08/11, com o `fase-15.md` escrito pelo
orquestrador, no Opus 5.5. Fechada pela própria sessão: fast-forward de `910f3d2` para
**`2dde90d`** (`fase 15: paradas que se registram sozinhas`) às 22h22 de Brasília, 9 commits, sem
coautoria. O laboratório rodou do jeito novo, duas vezes: no preview em `2dde90d` (run
42542616612: 33 verdes, 0 vermelhos, 3 pulados pelo horário) e na produção depois do merge (run
42546176723: 33 verdes, 0 vermelhos, 3 pulados). CI do fechamento verde (run 42542536826: 999
Vitest, 444 pgTAP, 50 Playwright) e CI da `main` verde (run 42545272669). Decisões D181 a D189; a
migration `0013_paradas_auto` no hospedado; `import-itinerary` v3 e `send-notifications` v8
publicadas (o aviso push abre a tela da viagem: a pendência do `navigatePath` da fase 14 fechou).
O que a sessão deixou está na memória do projeto e na seção da fase 15 de `decisoes.md`.

**Depois do merge, o laboratório agendado da produção alternou no mesmo sha:** verde em 09, 12 e
14/11; vermelho em 10/11 (`app_parada_auto`), 11/11 (a máquina do GitHub sem DNS para o espelho do
Ubuntu, nenhum cenário rodou) e 13/11 (`app_parada_auto` e `app_clima`). É a 3.0 do `fase-16.md`.

## Fase 16 · A garagem é da pessoa, e o perfil

### Portão de entrada (aberto às 15h de 14/11, a pedido do Douglas: "proximo")
- fase 15 na `main`: sim, `2dde90d`, a ponta.
- CI da `main` em `2dde90d`: verde (run 42545272669).
- laboratório da produção: verde no sha logo depois do merge (run 42546176723) e no agendado de
  14/11 (36 cenários verdes); os vermelhos de 10, 11 e 13/11 vão para a 3.0 da fase, não bloqueiam.
- `docs/decisoes.md` com a seção da fase 15: sim, D181 a D189. **As D da fase 16 começam na D190.**
- memória do projeto atualizada depois da fase 15: sim (pela sessão), completada pelo orquestrador
  em 14/11.
- dependência (13 → 16): satisfeita (a 16 não depende da 14 nem da 15, mas as duas estão na `main`).
- `docs/fases/fase-16.md` escrito às 15h de 14/11 pelo orquestrador, a partir do plano (a fase 16
  e as decisões 3, 4 e 9 do Douglas), das D181 a D189 e de um levantamento do código em `2dde90d`
  (a garagem, os carros, a progressão, o perfil, os avisos, o tema, `profiles` e `trips` no banco).
  Com a 3.0 (os três vermelhos do agendado), a `0014` (o carro no perfil, com a cópia da viagem
  mais recente de que a pessoa é dona, a única escrita em dado real permitida), a escada nova
  (modelos livres; cores, acabamentos e rodas por nível; "o seu carro" no 5, trancado até a fase
  20), o perfil em seções, o tema, o laboratório do jeito da fase 15. Fora do git até o commit de
  fechamento da fase, junto com este relatório.

### Sessão
- **Abertura:** 14/11/2026 às 15h, pelo Douglas, num chat novo, no Opus 5.5, com o `fase-16.md`.
- **Regra permanente nova do Douglas, no meio da fase (14/11):** no Mac só os testes rápidos sem
  Docker (prettier, `tsc -b`, eslint, Vitest); pgTAP e Playwright só na CI; e **push em lote**, uma
  vez com tudo pronto, nunca a cada mudança (a fase 16 deu oito pushes, cada um com 13 a 16 min de
  CI). Está na memória (`feedback-push-em-lote.md`) e nos prompts a partir da fase 17.
- **Fechamento pela própria sessão:** merge às 18h40 de Brasília, fast-forward de `2dde90d` para
  **`9945f35`** (`0fbc011` `fase 16: a garagem é da pessoa, e o perfil`, mais a correção do
  laboratório do preview), sem coautoria. Decisões D190 a D200. A `0014_carro_e_perfil` no
  hospedado (3 perfis, nenhum mudado pela cópia). `fase-14` e `fase-15` apagadas no remoto.
- **O que a fase 16 fez:** a 3.0 (o `app_parada_auto` vermelho era o relógio de mentira
  atropelando o prazo do sync: o condutor `e2e/helpers/relogio.ts`; o `app_clima` guarda o
  Open-Meteo e pula com motivo; o apt com três tentativas; o agendado chega 7 a 10 h depois do
  cron); o carro no perfil e `useMyCar`; `/perfil/garagem`; os modelos livres e a escada por nível
  (acabamentos e rodas; "o seu carro" trancado até a fase 20); quem libera é o progresso da pessoa;
  o perfil em seções, os avisos do aparelho, o tema; 1.034 Vitest, 471 pgTAP, 55 Playwright.
- **Laboratórios:** o do preview (run 43635863918, em `0fbc011`) **cortado no limite de 60 min**
  com dois vermelhos (o condutor do relógio esperava todos os pedidos da página e um de fora nunca
  fechava; a retrospectiva lida no instante de uma remontagem), corrigidos sem outro laboratório;
  o da produção (run 43643182699, 18h45 a 19h00) **verde**: 33 cenários, `app_garagem` novo verde,
  Lighthouse "medido, não cobrado" com índice 2.324 (perfil 76 e garagem 79: fica para a 17).

### Portão de saída (conferido às 19h20 de 14/11 pelo orquestrador)
- ponta da `fase-16` na `origin/main`: sim, `9945f35`, com o commit `fase 16: …` (`0fbc011`).
- CI da `main` em `9945f35`: verde.
- laboratório da produção: verde no sha (run 43643182699).
- `docs/decisoes.md` com a seção da fase 16: sim, D190 a D200, sequenciais.
- `fase-16.md` e este relatório no commit de fechamento: sim. Memória atualizada pela sessão.
- **Para a fase 17 (3.0):** o Lighthouse do perfil e da garagem (TBT 267 e 246 ms) e os 8 pedidos
  do app que o condutor vê abertos há mais de 30 s também na produção (a hipótese da barra da
  Vercel na D200 enfraqueceu). Fica a `fase-16` no remoto (a 17 apaga).

## Fase 17 · Criar a viagem conversando

### Portão de entrada (aberto às 19h30 de 14/11, a pedido do Douglas: "proxima")
- fase 16 na `main`: sim, `9945f35`, a ponta.
- CI da `main` em `9945f35`: verde. Laboratório da produção: verde no sha (run 43643182699).
- `docs/decisoes.md` com a seção da fase 16: sim, D190 a D200. **As D da fase 17 começam na D201.**
- memória do projeto atualizada depois da fase 16: sim (pela sessão), completada pelo orquestrador.
- dependência (16 → 17): satisfeita.
- `docs/fases/fase-17.md` escrito às 19h30 de 14/11 pelo orquestrador, a partir do plano (a fase 17
  e as decisões 6 e 10 do Douglas), das D124 a D140 (a importação da fase 10) e D190 a D200, e de
  um levantamento do código em `9945f35` (a porta de entrada de hoje, a importação e a função, o
  schema, a cota, o clima, as memórias, o perfil, os testes e o laboratório). Com a 3.0 (o perfil e
  a garagem lentos; os pedidos abertos), o campo e os três caminhos, a viagem que nasce no fim, o
  formato `viajei/1` com leitor e escritor, a função da conversa (dois passos, até 3 perguntas,
  `ai_imports.kind` na `0015`), a conferência no OSM (Nominatim pela fila; Overpass uma vez por
  conversa), a saída de hoje, "O que você gosta" (`profiles.interests`), a regra do push em lote e
  o laboratório uma vez no preview e uma na produção. Fora do git até o commit de fechamento da
  fase, junto com este relatório.

### Sessão
- **Aberta pelo Douglas às 08h19 de 15/11** (11h19 UTC) num chat novo, no **Opus 5.5**, pela autorização
  antecipada da seção 2; ele não interveio até o resumo final. Uma sessão só, com um resumo automático
  de contexto no meio (10h41). A conta pela transcrição: 1.109 respostas, 1,63 M tokens de saída,
  525 M de cache lido, 2,68 M de cache criado.
- **Os commits:** 12 entre 08h35 e 12h49 (3.0 → 3.2 → 3.1 → 3.4 → 3.3 → 3.5 → `fase 17: criar a viagem
  conversando` em `56d055d` às 10h04; depois cinco de CI, laboratório e documentação). **Os pushes:** 4,
  pela regra do push em lote: o primeiro com tudo (CI 43717119821 vermelha no Vitest: o teste dos gostos
  carregava o client do Supabase, que exige `VITE_SUPABASE_URL`; no Mac o Vitest lê o `.env.local`, na CI
  não); o segundo (CI 43718292273 vermelha no Playwright, 59 de 61: a conversa mandava as perguntas a
  uma rota `plan-trip-ask` que não existe, e o StrictMode do desenvolvimento apagava o rascunho do campo);
  o terceiro (`5af8241`, CI 43722286623 verde: 1.115 Vitest, 493 pgTAP, 62 Playwright, 15 min); o quarto
  (`6894c7c`, a conferência com o Overpass ao lado da fila e os docs, CI 43731998697 verde).
- **No hospedado**, pela autorização: a `0015_conversa` por `db push` com o `--dry-run` lido e a
  conferência por leitura; a `import-itinerary` v4 e a `plan-trip` v1 (depois v2, a constante
  `PLAN_ASK_QUOTA`) publicadas pelo CLI do projeto, com `verify_jwt`. Nenhum secret novo.
- **As leituras reais da IA**, contadas (seção 2, item 4): a tarefa `medir-conversa` do `lab.yml` duas
  vezes (run 43718519057, vermelha: a rota `plan-trip-ask` e o Overpass 406 ao Node sem identificação;
  run 43731264589, verde), cinco leituras que somaram US$ 0,153. Uma conversa inteira custa de US$ 0,035
  a 0,057 (as perguntas US$ 0,004); uma saída de hoje de US$ 0,029 a 0,035.
- **O laboratório do preview, uma vez** (run 43718568623, em `23ab69b`, 10h21): todos os cenários
  verdes; ao ler os dados, dois achados corrigidos sem outro laboratório (o Lago Negro saía da viagem
  como "não encontrado", porque o Nominatim classifica lagos como `water`; e os 6 "pedidos travados" eram
  os três pedidos de logo depois de entrar, contados no documento errado pelo condutor do relógio).
- **O merge** por fast-forward às 13h06 (`git push origin 6894c7c:main`; CI da `main` 43733632964 verde;
  Vercel `success` às 13h07). **O laboratório da produção, uma vez** (run 43734636122, 13h17 a 13h47):
  38 cenários, 35 verdes, 3 pulados por horário (véspera, prazo, retrospectiva), **nenhum vermelho**;
  `pedidos_travados` vazio; a Cascata e o Lago Negro confirmados em 2,8 s pelo Nominatim, o Overpass
  público sem resposta de novo; Lighthouse do app instalado: perfil 91 (era 76), garagem 95 (era 79),
  viagem nova 93. O agendado das 10h51 (run 43721163525, ainda em `9945f35`) ficou vermelho só no
  Lighthouse do perfil e da garagem: o que a 3.0 desta fase corrigiu.
- **O resumo final** às 13h48; a sessão deixou esta seção em branco (preenchida pelo orquestrador às 14h50,
  pelos registros do GitHub e pela transcrição) e deixou de fora dos commits, por prudência, o
  `docs/fases/plano-melhorias.md` que o orquestrador editou às 10h50 (abaixo).
- **15/11, 10h50, com a sessão em andamento:** o Douglas trouxe do balcão de ideias
  `docs/ideias/2026-11-15-mapa-do-dia-inteiro.md` e pediu ao orquestrador para encaixá-la no plano sem
  abrir fase nem sessão. O plano ganhou as **fases 22 (O dia inteiro na tela) e 23 (Os cartões-postais)**
  e a ordem nova (17 → 22 → 18 → 23 → 19 → 20 → 21), com as oito decisões dele de 15/11 e o que elas
  mudam na D175, na D177, na D178 e na 6.1 do prompt mestre. O plano e a ideia ficaram fora do git até o
  commit de fechamento da fase 22.

- **Completado às 21h09 de 15/11 pelo orquestrador, com a nota que a própria sessão mandou pelo Douglas à
  noite:** chat do VS Code, `session_id` `205cc4ba-e62a-492a-ab8d-cd17538f6f2e`, 11h19 a 16h50 UTC; sem o
  JSON do `claude -p`, o custo em dinheiro não foi medido. Actions: ~130 min em 9 execuções (5 CI, 1
  laboratório no preview, 1 na produção, 2 medições). **Um desvio de regra:** a sessão rodou uma vez
  `vercel whoami` (só leitura; nada mudou). As armadilhas da fase estão na memória do projeto.

### Portão de saída (conferido às 14h50 de 15/11 pelo orquestrador, a pedido do Douglas)
- ponta da `main`: `6894c7c`, com o commit `fase 17:` (`56d055d`) e os cinco seguintes; fast-forward de
  `9945f35`; 12 commits, nenhum trailer de coautoria.
- CI verde no sha (branch 43731998697; `main` 43733632964). Laboratório do preview uma vez, verde
  (43718568623); da produção uma vez, verde (43734636122). Dentro dos dois da regra.
- `decisoes.md`: D201 a D213, sequenciais, na seção da fase 17. `fase-17.md` e `orquestracao.md`
  commitados em `56d055d`. Memória do projeto atualizada pela sessão (o parágrafo "Estado em 15/11
  (tarde)" e as armadilhas da fase 17). Resumo final entregue ao Douglas.
- **O que o Douglas disse que vê depois** ("a 17 tem umas pendências que vou ver depois"): o nome do
  app (Roteirei recomendado); a CLI da Vercel deste Mac na conta de cliente; o `progressao.spec`
  instável (D167); a migration que tira `trips.car_*`; quem subiu um Supabase local no Mac em 15/11
  (parou ~12h39); o Overpass público, que não respondeu nenhuma vez em 15/11 (o app não depende dele);
  o `.claude/commands/ideia.md` fora do git (se entra no repositório público é decisão dele). Nenhuma
  trava a fase seguinte.
- a `fase-17` remota ainda existe: a fase 22 apaga.

---

## Fase 22 · O dia inteiro na tela

### Portão de entrada (aberto às 14h50 de 15/11, a pedido do Douglas: "vamos para o próximo")
- fase 17 na `main`: sim, `6894c7c`, a ponta.
- CI da `main` em `6894c7c`: verde. Laboratório da produção: verde no sha (run 43734636122).
- `docs/decisoes.md` com a seção da fase 17: sim, D201 a D213. **As D da fase 22 começam na D214.**
  Nenhuma migration nesta fase (a próxima continua sendo a `0016`, de quem precisar dela).
- memória do projeto atualizada depois da fase 17: sim (pela sessão), completada pelo orquestrador
  (o parágrafo da fase 22).
- dependência (14 → 22): satisfeita (a 14 está na `main` desde 08/11). A 22 vem antes da 18 pela ordem
  do plano de 15/11: conserta a tela principal, que o dono do app não reconheceu.
- `docs/fases/fase-22.md` escrito às 14h50 de 15/11 pelo orquestrador, a partir do plano (a fase 22 e
  as decisões de 15/11), da ideia e dos esboços (o artifact), das D174 a D180 e D57 a D64, e de um
  levantamento do código em `6894c7c` (o layout e o `fitCamera`, a câmera e o rig, a abertura, o HUD e
  a altura medida, as miniaturas e as caixas, o cenário e a luz, a qualidade, as cidades da leitura do
  lugar, a retrospectiva, os testes e o `app_maquete`). Com a 3.0 (quase nada: a `fase-17` remota e os
  quatro arquivos de documentação fora do git), a câmera A pela altura medida e fora do layout, o carro
  maior andando com a câmera parada, o modo de perto ao toque com a volta sozinha, o traçado em retrato,
  a maquete de mesa (base cortada, sombra suave, desfoque de CSS, noite por emissão, vegetação da
  região), as miniaturas na escala nova com a porta para a 23, até três cidades de passagem por dia, os
  testes e o laboratório (`pilulas_em_cena` = paradas do dia, as capturas de dia, de noite e de perto),
  nenhuma leitura de IA e nada no hospedado. Fora do git até o commit de fechamento da fase, junto com
  este relatório, o plano modificado e `docs/ideias/`.

### Sessão
- **Aberta pelo Douglas às 15h16 de 15/11** (18h16 UTC) num chat novo do VS Code, `session_id`
  `45b6c7cf-d183-47c5-85c0-1fe60335f2e2`, com o prompt de colar do orquestrador, pela autorização antecipada
  da seção 2. **No Fable 5.1** (o modelo com que o chat foi aberto; o pedido de 08/11 era o Opus 5.5), com
  as 12 últimas respostas, as da conferência final, no Opus 5.5. Uma sessão só, sem resumo automático de
  contexto. A conta pela transcrição: 332 respostas, 1,53 M tokens de saída, 176 M de cache lido, 6,45 M
  de cache criado; sem o JSON do `claude -p`, o custo em dinheiro não foi medido.
- **Os commits:** 13 entre 16h12 e 17h40, todos sem coautoria: sete das entregas às 16h12 (3.3, 3.1, 3.5,
  3.4, 3.2, 3.6 e `fase 22: o dia inteiro na tela` em `f7b493b`, com a 3.7 e os quatro documentos que
  estavam fora do git: este relatório, o plano, `docs/ideias/2026-11-15-mapa-do-dia-inteiro.md` e o
  próprio `fase-22.md`), depois três de CI, um do laboratório do preview e dois de números (D223).
- **Os pushes na branch:** cinco, pela regra do push em lote (um deles cancelou a CI do anterior um minuto
  depois): `f7b493b` (CI 43751134754 vermelha: o texto da folha), `202e219` (CI 43754133765 vermelha, a
  43753985002 de `209c1d1` cancelada: o plano distante da câmera e a suavização presa a 50 ms),
  `2915247` (CI 43756050024 vermelha: a faixa fixa de busca do alvo), `72d233a` (CI 43757882155 **verde**:
  a 360 px com o cartão de posição não há espaço para o dia inteiro, teste relaxado e registrado) e
  `f8b7563` (CI 43759372096 verde: 1.161 Vitest em 125 arquivos, 493 pgTAP, 62 Playwright).
- **No hospedado:** nada, como a seção 2 mandava. **Leituras de IA:** nenhuma.
- **O laboratório do preview, uma vez** (run 43751240397, em `f7b493b`, 16h13, índice de CPU 4.438):
  37 de 38 verdes; o `app_maquete` verde com o cenário novo (primeiro quadro 3.820 ms, 2 pílulas de 2 com o
  "Como foi?" na tela, `perto` em 1,3 s e a volta em 9,4 s); as capturas `maquete.png` e
  `maquete-noite.png` batem com os esboços A e N; o `app_parada_auto` vermelho por um toast de 10 s que já
  tinha sumido (a prova virou toast ou a linha da lista, `registro_por`), corrigido em `209c1d1` **sem
  segundo laboratório**, pela regra; a faixa de desfoque de cima borrava o fim do dia e saiu. Lighthouse
  96–100 / 100 / 96–100.
- **O merge** por fast-forward às 17h55 (`f8b7563` na `main`; CI da `main` 43760733057 verde). **O
  laboratório da produção, uma vez** (run 43761590255, 18h04 a 18h42, índice de CPU 2.475, máquina lenta):
  38 cenários, 34 verdes, 4 pulados por horário (véspera, prazo, retrospectiva, e o Lighthouse de
  `viagens` 86 "medido, não cobrado" pela régua da D170), **nenhum vermelho**. `app_maquete` verde
  (primeiro quadro 7.720 ms na máquina lenta, 2 de 2 pílulas, `perto` em 3,0 s, a volta em 15,4 s, a
  noite com as pílulas); `app_parada_auto` verde pelo toast. **A captura `maquete-perto.png` da produção
  saiu igual ao repouso:** o atributo já dizia `perto`, mas numa máquina de segundos por quadro o canvas
  não tinha apresentado o quadro 1,5 s depois; a D223 diz que essa captura valeria ao lado do esboço Z e
  está errada nisso (a sessão registrou no resumo final: a correção é da próxima fase).
- **O resumo final** às 18h44. A sessão deixou esta seção em branco (preenchida pelo orquestrador às
  21h09 pelos registros do GitHub e pela transcrição) e não apagou a `origin/fase-22`.

### Portão de saída (conferido às 21h09 de 15/11 pelo orquestrador, a pedido do Douglas: "terminei a 22 e vamos para a proxima")
- ponta da `main` = `f8b7563`, fast-forward de `6894c7c`, com o commit `fase 22: o dia inteiro na tela`
  (`f7b493b`): sim.
- CI verde na `main` nesse sha: sim (43760733057). Laboratório do preview uma vez (um vermelho, corrigido
  pela CI sem segundo laboratório) e da produção uma vez, verde: sim.
- `docs/decisoes.md` com a seção "Fase 22 · O dia inteiro na tela", D214 a D223 sem buraco: sim. A D221
  diz o que mudou na D175, na D177 e na D178. **As D da próxima fase começam na D224.** Nenhuma migration
  (a próxima continua sendo a `0016`, de quem precisar dela). Prompt mestre na v9.
- `docs/fases/fase-22.md` e este relatório commitados em `f7b493b`, com o plano e `docs/ideias/`: sim. Memória
  do projeto com o estado final, os números e as armadilhas da 22: sim (pela sessão). Resumo final: sim.
- **O que ficou (para a 3.0 da próxima fase):** apagar a `origin/fase-22`; corrigir a frase da D223 sobre a
  `maquete-perto.png` da produção (e fazer a captura esperar o quadro de perto apresentado, não só o
  atributo); ler o agendado de 16/11, o primeiro com a 22 na `main`; `docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`
  (fora do git desde a noite de 15/11) e este relatório entram no commit de fechamento. Registradas pela
  22, sem dono ainda: as pílulas de um dia de oito paradas se sobrepõem a 393 px; um palco baixo com um
  cartão alto deixa pouco para o dia inteiro (um cartão compacto a 360 px); o CLS da lista passou de 0,05
  uma vez (0,063); o aviso "PCFSoftShadowMap has been removed" vem do `shadows` do R3F.
- **Pendências só do Douglas**, que ele disse que vê depois: o `progressao.spec` instável (D167; passou nas
  CIs da 17 e da 22, só observar); a migration que tira `trips.car_*` (a partir de ~21/11, com o
  `--dry-run` lido; se a próxima fase abrir antes, fica para a seguinte); o `pnpm audit` (D163, baixa);
  quem subiu o Supabase local no Mac em 15/11; trocar ou não a instância do Overpass (o app não depende
  dela); o `.claude/commands/ideia.md` fora do git. **Resolvidas por ele na noite de 15/11:** o nome fica
  Viajei até o app estar pronto e disponível; o e-mail da 18 vai num subdomínio de `reitechia.com.br`; a
  CLI da Vercel saiu da conta de cliente (no viajei fica sem login; a regra de não usá-la continua).
- **15/11, noite, com a 22 fechada:** o balcão de ideias fechou com o Douglas
  `docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md` (um teste realista na produção: a viagem nasceu sem o
  café colonial pedido) e pediu ao orquestrador o encaixe no plano. O plano ganhou a **fase 24 (As opções
  vêm do mapa)**, grande, dependente da 17 e da 15; a 23 passa a depender da 22 e da 24; a ordem proposta
  é 24 → 18 → 23 → 19 → 20 → 21, à espera da palavra do Douglas. A decisão em aberto, dele: a fonte da
  busca por tipo (um Overpass próprio ou uma API comercial atrás de uma Edge Function).

## Fase 24 · As opções vêm do mapa

### Portão de entrada (aberto às 21h36 de 15/11, a pedido do Douglas: "terminei a 22 e vamos para a proxima")
- **A escolha da fase:** perguntado às 21h10 ("24 agora ou 18 agora?"), o Douglas escolheu a **24**, e, para a
  fonte da busca por tipo, **a API comercial atrás de uma Edge Function** (a Places da Geoapify; a chave no
  servidor, que ele cria), contra o Overpass próprio e contra cortar a fase em duas. A ordem do plano fica
  24 → 18 → 23 → 19 → 20 → 21.
- fase 22 na `main`: sim, `f8b7563`, a ponta. CI da `main` nesse sha: verde (43760733057). Laboratório da
  produção: verde no sha (run 43761590255, nenhum vermelho).
- `docs/decisoes.md` com a seção da fase 22: sim, D214 a D223. **As D da fase 24 começam na D224.**
  Nenhuma migration (a próxima continua sendo a `0016`, de quem precisar dela); no hospedado, uma função nova
  (a busca no mapa) e a `plan-trip` republicada, compatível com o app da produção; um secret novo
  (`GEOAPIFY_API_KEY`), **que só o Douglas cria**.
- memória do projeto atualizada depois da fase 22: sim (pela sessão), completada pelo orquestrador (as notas
  da noite de 15/11 e o parágrafo da fase 24).
- dependências (17 e 15 → 24): satisfeitas (as duas na `main`). A 24 vem antes da 18 pela ordem proposta em
  15/11 à noite e confirmada pelo Douglas às 21h36.
- `docs/fases/fase-24.md` escrito às 21h36 de 15/11 pelo orquestrador, a partir do plano (a fase 24 e as
  decisões da noite de 15/11), da ideia, das D201 a D213, da D29 e da D223, da memória do defeito
  (`viajei-defeito-lugares-reais.md`), da documentação pública da Geoapify (a Places API: o POST com o corredor
  de uma linha e o `buffer`, as categorias, o plano gratuito de 3.000 créditos por dia com atribuição
  obrigatória) e de um levantamento do código em `f8b7563` (a conversa e a `plan-trip`, a conferência no OSM,
  a revisão e a escolha de local, a `route-day` como molde, o modo viagem e a projeção na rota, os e2e e o
  laboratório). Com a 3.0 (a `fase-22` remota; a D223 e a espera do quadro apresentado na captura de perto; o
  agendado de 16/11), a intenção no `ask`, a função nova com a tabela de tipos e os cartões das opções, a
  confirmação por nome revista com a escolha, a rota e as sugestões desligadas numa só leitura `plan`, a
  regra de ouro em código, a viagem sem lugar que não é sucesso, os quatro consertos do modo viagem, os
  testes (um e2e de GPS de ida e volta), o `app_conversa` novo e a medição com o pedido de Pomerode, a
  documentação (D29, D207 e D208 revistas; prompt mestre v10). Fora do git até o commit de fechamento da fase,
  junto com este relatório, o plano modificado e `docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`.

### Sessão
- **Aberta pelo Douglas às 21h46 de 15/11** (00h46 UTC de 16/11) num chat novo do VS Code, `session_id`
  `061393b9-23af-4872-9d05-096269acd917`, com o prompt de colar do orquestrador, pela autorização antecipada
  da seção 2. **No Opus 5.5** (as 770 respostas). Uma sessão só, sem resumo automático de contexto, em
  duas sentadas: a noite de 15 para 16/11 (até o commit `fbed2f2` às 07h33 de 16/11) e a manhã de 20/11
  (o fechamento, até o resumo final às 08h47 UTC). A conta pela transcrição: 770 respostas, 1,15 M tokens
  de saída, 444 M de cache lido, 5,50 M de cache criado; sem o JSON do `claude -p`, o custo em dinheiro não
  foi medido.
- **Os commits:** 15 entre 22h01 de 15/11 e 07h33 de 16/11, todos sem coautoria: 3.0 (`81e6b8f`), 3.5
  (`0bf186a`), 3.1, 3.2, 3.3, 3.4, 3.6 e `fase 24: as opções vêm do mapa` (`54f7378`, 22h48), depois um de
  CI (`b20b5c0`), dois do que a CI mostrou (`891669a`, `d1eb161`), um do laboratório da produção
  (`aa0cbcd`, a cena para de desenhar quando a câmera chega), um de números (`5a22f98`, D237) e a correção
  da medição (`fbed2f2`, D238).
- **Os pushes na branch:** seis, pela regra do push em lote: `b20b5c0` (CI 43788674571 vermelha: 61 de 65,
  o modo de perto no SwiftShader, o `tela.spec` à noite, o axe nos cartões), `891669a` (CI 43791561969
  vermelha: 62 de 65, a câmera que não chegava perto, o contraste das sugestões, o CLS com o relógio de
  mentira), `d1eb161` (CI 43793793985 **verde** na segunda tentativa: a primeira cruzou a meia-noite de São
  Paulo nos e2e de GPS, a armadilha registrada), `aa0cbcd` (CI 43830276646 verde), `5a22f98` (CI 43839885190
  verde) e `fbed2f2` (CI 43849871077 verde, 16/11 10h33 UTC). Testes: 1.261 Vitest em 136 arquivos, 493
  pgTAP, 66 Playwright.
- **No hospedado:** a `find-places` (v1, depois republicada com a correção da D238 em 20/11; a lista do CLI
  mostra v3) e a `plan-trip` (v3), pelo CLI com a lista explícita das duas; nenhuma migration, nenhum
  secret pela sessão. **A `GEOAPIFY_API_KEY` o Douglas cadastrou na manhã de 16/11**, depois do laboratório
  da produção (a D237 registra "ainda não existe"); ele colou a chave no chat de 15/11, e a sessão
  recomendou gerar outra.
- **O laboratório do preview, uma vez** (`d1eb161`, run 43797405990, 03h18–03h57 UTC de 16/11, índice de
  CPU 2.715): 35 verdes, 3 pulados (prazo, retrospectiva, e o `app_conversa` com o motivo `no_source`: a
  chave ainda não existia), **nenhum vermelho**; a captura `maquete-perto.png` ainda igual ao repouso
  (corrigido em `aa0cbcd`).
- **O merge** por fast-forward em dois passos: `aa0cbcd` na `main` às 08h39 UTC de 16/11 (CI 43832997456
  verde) e `5a22f98` às 09h46 UTC (CI 43842732968 verde). **O laboratório da produção, uma vez**
  (`aa0cbcd`, run 43834440413, 08h50–09h24 UTC): 33 verdes, 5 pulados (véspera, prazo, retrospectiva;
  `app_conversa` por `no_source`; `app_clima` com o Open-Meteo fora), **nenhum vermelho**; a
  `maquete-perto.png` enfim de perto; Lighthouse 94–98 / 100 / 100.
- **A medição com leituras reais:** a primeira (run 43848591567, 16/11 10h24 UTC, em `5a22f98`, disparada
  pelo Douglas com a chave) **vermelha pelo que ela cobra** (a busca funcionou, US$ 0,056 em 5 leituras e 9
  buscas, mas faltaram o Torten Paradies nas opções, `amenity=cafe` com `cuisine=…regional` e sem
  "colonial" no nome, e o Bioparque nas sugestões, atrás de vinte bustos e casas mais perto); a correção
  `fbed2f2` (D238: a `cuisine` do OSM na resposta da função, a busca pela cozinha, os marcos em busca
  própria, os memoriais fora) teve a CI verde em 16/11 e **a sessão parou antes de publicar e medir de
  novo**. Em 20/11, retomada pelo Douglas: a `find-places` republicada às 08h43 UTC, a `main` levada a
  `fbed2f2` (deploy da Vercel às 08h44 UTC) e **a segunda medição verde** (run 44705028598, 08h45–08h46
  UTC: em Pomerode, 4 opções com o Torten Paradies e o Mahlzeit; 6 sugestões com o Bioparque Zoo Pomerode,
  dois museus e um mirante; US$ 0,0525 em 5 leituras, 16 buscas; as duas medições, US$ 0,109, dentro do
  teto de US$ 0,25).
- **Os agendados** de 16, 17, 18 e 19/11 (em `5a22f98`) terminaram com sucesso; o de 16/11, o primeiro com a
  chave, teve o `app_conversa` verde com a Geoapify de verdade (6 opções em 2,3 s, 6 sugestões desligadas).
- **O resumo final** às 08h47 UTC de 20/11. A sessão deixou esta seção em branco (preenchida pelo orquestrador
  às 09h08 UTC de 20/11 pelos registros do GitHub e pela transcrição) e não apagou a `origin/fase-24`.

### Portão de saída (conferido às 09h08 UTC de 20/11 pelo orquestrador, a pedido do Douglas: "proxima")
- ponta da `main` = `fbed2f2`, com o commit `fase 24: as opções vêm do mapa` (`54f7378`): sim.
- CI verde nesse sha na branch: sim (43849871077). CI da `main` nesse sha: verde (run 44704864787). Laboratório do preview
  uma vez e da produção uma vez, verdes: sim. A medição: duas, a segunda verde pela regra (a primeira
  vermelha por um defeito que a CI passou a cobrir).
- `docs/decisoes.md` com a seção "Fase 24 · As opções vêm do mapa", D224 a D238 sem buraco: sim. A D235 diz o
  que mudou na D29, na D207 e na D208, e as três têm a linha "Revista na fase 24"; a D223 também. **As D da
  próxima fase começam na D239.** Nenhuma migration (a próxima continua sendo a `0016`). Prompt mestre na
  v10, com a 9.5 (`find-places`) e a tabela "(24)". `teste-final.md` com o 1.29.
- `docs/fases/fase-24.md`, este relatório, o plano e `docs/ideias/2026-11-15-quero-ir-num-cafe-colonial.md`
  commitados: sim (`git status` limpo fora de `.claude/`). Memória do projeto com o fechamento de 20/11,
  o estado, os números e as armadilhas: sim (pela sessão). Resumo final: sim.
- **O que ficou (para a 3.0 da próxima fase):** apagar a `origin/fase-24`; ler a CI da `main` em `fbed2f2`
  se ainda não tiver terminado; ler o agendado de 20/11, o primeiro com a correção da medição; um pedido
  sem tipo de lugar ("Serra Gaúcha em dezembro") dá opções genéricas em volta da área (visto na medição,
  sem correção; para a 23 ou uma correção própria).
- **Pendências só do Douglas:** gerar outra chave na Geoapify e cadastrá-la de novo (a cadastrada passou pelo
  chat); a linha `GEOAPIFY_API_KEY=` no `.env.example` (a permissão deste Mac impede as sessões de ler
  `.env*`; **não conferi** se a linha está lá); o `.claude/` fora do git; o `progressao.spec` (D167); a
  migration de `trips.car_*` (liberada a partir de ~21/11, com o `--dry-run` lido); o Supabase local de
  15/11; a instância do Overpass (o app não depende mais dele); o `pnpm audit` (D163).

## Fase 18 · Reservas e gastos sem digitar

### Portão de entrada (aberto às 09h08 UTC de 20/11, a pedido do Douglas: "proxima")
- fase 24 na `main`: sim, `fbed2f2`, a ponta. CI da `main` nesse sha: verde (run 44704864787). Laboratório da produção:
  verde (run 43834440413, em `aa0cbcd`); a segunda medição verde em `fbed2f2` (run 44705028598).
- `docs/decisoes.md` com a seção da fase 24: sim, D224 a D238. **As D da fase 18 começam na D239.** A
  migration `0016` é desta fase, provavelmente (o tipo de aviso novo, o `kind` novo em `ai_imports`, o
  código do endereço por pessoa, a reserva recebida, o anexo do gasto); no hospedado, funções novas e
  republicadas; **os secrets novos (`RESEND_API_KEY` para as funções, `RESEND_WEBHOOK_SECRET`), o MX na
  GoDaddy e o webhook no Resend são do Douglas.**
- memória do projeto atualizada depois da fase 24: sim (pela sessão), completada pelo orquestrador (o
  parágrafo da fase 18).
- dependência (17 → 18): satisfeita. A 18 é a próxima pela ordem confirmada em 15/11 (24 → 18 → 23 → 19 →
  20 → 21).
- `docs/fases/fase-18.md` escrito às 09h08 UTC de 20/11 pelo orquestrador, a partir do plano (a fase 18 com a
  decisão do e-mail de 15/11), das D76 a D90, D93 a D107, D127 a D140, D11, D130, D224 a D238, da memória,
  da documentação pública do Resend (o recebimento: o MX pelo painel, o evento `email.received` só com
  metadados, o conteúdo e os anexos pela API, a assinatura svix, o Free com recebimento e 1 webhook), da
  BrasilAPI (conferida com uma chamada real) e da Anthropic (PDF e imagem como `document` e `image`), e de
  um levantamento do código em `fbed2f2` (reservas, gastos, anexos e a fila, o motor da importação, as
  funções sem JWT e o admin, os avisos e o `due_notifications`, o perfil e o sync por pessoa, o manifest,
  os testes e o laboratório). **Marcado como não conferido** pelo orquestrador, para a sessão conferir:
  o layout da chave da NFC-e, o limite da BrasilAPI, o estado do WebKit 194593, o `BarcodeDetector` no
  Safari, o tamanho máximo de anexo no Resend. Com a 3.0 (a CI da `main`, o agendado, a `fase-24` remota, a
  `0016`), a leitura da confirmação (colar e anexar; a função sobre o motor da importação que lê o anexo do
  Storage), "Procurar hotel perto de", o `share_target` no Android, o e-mail encaminhado (o código por
  pessoa, a função `inbound-mail` com a assinatura e RPCs estreitas, Reservas recebidas por pessoa, o aviso
  por um ramo do `due_notifications`), a nota (a foto como anexo do gasto, o QR da NFC-e e a BrasilAPI), os
  testes, três cenários novos e a medição `medir-leitura`, a documentação (D77, D78, D87 e D101 revistas;
  prompt mestre v11). Fora do git até o commit de fechamento da fase, junto com este relatório.

### Sessão
_(preenchido pelo orquestrador em 20/11, ~19h50 UTC, a partir do transcript, do git, do GitHub, de `decisoes.md` e da memória; a sessão deixou este bloco em branco, como as anteriores)_
- **Sessão** `c0987885-b1c8-4847-81b4-12d27e083efd`, de 09h09 UTC a ~17h UTC de 20/11 (a última entrada do transcript às 19h26 UTC); **modelo `claude-fable-5-1`** (223 respostas; a regra de 08/11 pedia o Opus 5.5: desvio, registrado aqui), 24 mensagens do Douglas; 643 mil tokens de saída, 100,9 M lidos do cache, 3,41 M criados no cache; 13 chamadas de ferramenta com `git commit` e 12 com `git push` no transcript. **Um chat paralelo do Douglas** (`c088c511…`, Opus 5.5, 11h11–15h14 UTC, 140 respostas) fez os painéis do Resend, da GoDaddy, do Supabase e do GitHub; o resultado está na D253 (a nota dele de 15h14 UTC).
- **Commits na `main`:** 15, de `17d8650` (3.0: a 0016) a `8e3e89c` (o e-mail de ponta a ponta), sem coautoria: 3.0 `17d8650`, 3.1 `590161d`, 3.4 `f267c0e`, 3.3 `4049dad`, 3.2 `a664c96`, 3.6 `962ba08`, fechamento `84daf5f`; CI `828f116`, `84339a6`, `8481571`; a nota da medição `802cf53`; os números `da0af64`, `5211c16`; a chave com nome próprio e a tarefa `email` `b1b2d1b`; `8e3e89c`.
- **CI (`ci.yml`):** vermelha em `84daf5f` (44734190487, o lint do banco), `828f116` (44734683187, `page.evaluate` com string e o `expect.poll`) e `84339a6` (44738923419, o `grant` no pgTAP); **verde em `8481571`** (44741753890, 16,6 min), `802cf53` (44750490012), `b1b2d1b` (44762119624) e `8e3e89c` (44768073334, na 2ª tentativa: a 1ª estourou os 32 min instalando os navegadores); na `main`: `802cf53` (44753534673) e **`8e3e89c` (44777817524, 16h53 UTC) verdes**. Duas canceladas por push novo (44761270251, 44761583456).
- **Laboratório (`lab.yml`):** preview em `8481571` (44744567223, 13h28–13h59 UTC) **verde**, 40 verdes e 1 pulado (`app_email_recebido`, sem o secret do Actions); medição 1 (44749475872) vermelha por dois defeitos da nota (telefone E.164, `notes` livre); **medição 2 (44752939949) verde**, 11/11 ×3 e 7/7, US$ 0,041 (as duas: US$ 0,082, teto US$ 0,30); **produção em `802cf53` (44753738805, 14h28–15h08 UTC, índice de CPU 2.415) vermelha em 1: `app_maquete`**, no passo da noite pela URL (o print mostra o `RouteError` do app; os da fase verdes); **o agendado de 20/11 (44762276405, 15h20 UTC) vermelho em 1 de 41: `app_parada_auto`** ("a saída medida fecha a parada: a saída não chegou ao servidor"; o `app_maquete` passou nele); **a tarefa `email` em `b1b2d1b` (44767615466) verde**: a recebida em 22,6 s, o aviso em 16,9 s.
- **Hospedado (pela D252 e pela D253; o orquestrador não tem como ler o banco):** a `0016` aplicada às 13h27 UTC com o `--dry-run` lido; `read-document`, `inbound-mail` e `send-notifications` publicadas; ao fechar, as versões eram `inbound-mail` v4, `read-document` v3, `send-notifications` v12 (mais altas que as dos deploys da sessão: "alguém publicou entre 13h27 e 15h50 UTC; não conferi quem"). **O Douglas** cadastrou `RESEND_INBOUND_API_KEY` e `RESEND_WEBHOOK_SECRET` (14h56 UTC), a `GEOAPIFY_API_KEY` nova (15h04) e, no Actions, `RESEND_API_KEY` de envio (15h01); o recebimento numa conta própria do Resend, `sa-east-1`; o MX e o DKIM de `reservas.reitechia.com.br` na GoDaddy.
- **Merge:** `802cf53` → `main` às 14h26 UTC (fast-forward) e `8e3e89c` → `main` às ~16h55 UTC; a `fase-18` apagada (remota e local). Resumo final para o Douglas na sessão.
- **Desvios:** o modelo (Fable 5.1 em vez do Opus 5.5); o nome da chave mudou no meio (`RESEND_API_KEY` → `RESEND_INBOUND_API_KEY`, pela decisão do Douglas na D253); a chave do recebimento passou pelo chat (ele decidiu manter e trocar depois).

### Portão de saída (conferido às ~19h50 UTC de 20/11, a pedido do Douglas: "proxima")
- `main` em **`8e3e89c`**, a ponta; CI da `main` nesse sha **verde** (run 44777817524). Laboratório do preview verde; **o da produção vermelho no `app_maquete`** (vai para a 3.0 da 23, junto com o agendado vermelho no `app_parada_auto`); a tarefa `email` verde; a segunda medição verde.
- `docs/decisoes.md` com a seção da fase 18: sim, **D239 a D253**. Prompt mestre **v11**. `docs/fases/fase-18.md` e `orquestracao.md` commitados em `84daf5f` como estavam. Memória atualizada pela sessão (o parágrafo "Estado em 20/11/2026 (12h20 UTC)…", completado até o fechamento).
- **O que ficou (para a 3.0 da 23):** o `app_maquete` na produção (o `RouteError` ao abrir a noite pela URL numa máquina lenta); o agendado de 20/11 (`app_parada_auto`, 1 de 41); a observação da D238 (pedido sem tipo de lugar); a migration de `trips.car_*` a partir de 21/11; o `progressao.spec` (D167) e o `pnpm audit` (D163) continuam fora.
- **Pendências só do Douglas:** commitar o `.env.example` (modificado na pasta, fora do git; as sessões não o leem nem o adicionam); o `.claude/` fora do git; trocar a chave do recebimento que passou pelo chat (D253); conferir quem publicou as versões v3/v4/v12 entre 13h27 e 15h50 UTC; **as sessões de fase no Opus 5.5** (a regra de 08/11; a 18 rodou no Fable 5.1); o `progressao.spec`; o `pnpm audit`; o Supabase local de 15/11. A instância do Overpass deixou de ser pendência: o app não depende dele (D235).

## Fase 23 · Os cartões-postais

### Portão de entrada (aberto às ~19h50 UTC de 20/11, a pedido do Douglas: "proxima")
- fases 22 e 24 na `main`: sim (D214 a D223 e D224 a D238); a fase 18 fechada em `8e3e89c`. A porta `pieceFor(kind, seed)` em `Miniatures.tsx` existe e devolve sempre a peça do tipo (D219); as cidades de passagem só têm o nome em HTML (D220); o `Place` da `find-places` traz o objeto do OSM, mas `stops` não tem coluna para ele (conferido no `schema.ts` e nas migrations).
- `docs/decisoes.md` até a D253. **As D da fase 23 começam na D254.** A migration `0017` é dela (o catálogo, a fila, o refazer, o `kind` `landmark`, talvez a coluna do OSM na parada); a `0018` tira `trips.car_*` a partir de 21/11. **Nenhum secret novo** (o Wikimedia não pede chave; a Anthropic existe).
- memória do projeto atualizada depois da fase 18: sim (pela sessão), completada pelo orquestrador (o parágrafo da fase 23).
- dependências (22 e 24 → 23): satisfeitas. A 23 é a próxima pela ordem confirmada em 15/11 (24 → 18 → 23 → 19 → 20 → 21).
- `docs/fases/fase-23.md` escrito às ~19h50 UTC de 20/11 pelo orquestrador, a partir do plano (a fase 23 e as decisões 2 a 6 e 8 de 15/11), da ideia `2026-11-15-mapa-do-dia-inteiro.md` (a estufa como régua; o artifact com `img/m-jardim.jpg` e a `modelScene`), das D66, D67, D178, D207, D214 a D238, D242, D245, D252, D253, da memória, de **uma chamada real a cada serviço** (o Nominatim: `lookup` com `extratags` e `polygon_geojson` do Jardim Botânico → `Q94923` e a planta com 63 pontos; a estufa é outro objeto do OSM, `way 261127581`, sem `wikidata`; o Wikidata: `Special:EntityData/Q94923.json` com P18, P625 e P373, sem medidas; o Commons: `imageinfo` com `extmetadata` (`LicenseShortName`, `Artist`, `Credit`, `LicenseUrl`…) e `categorymembers`), da política de User-Agent do Wikimedia (403 para agentes genéricos; requisições em série; `maxlag`), da documentação da Anthropic (visão: formatos, 10 MB, `url`, ⌈w/28⌉×⌈h/28⌉ tokens, 1.568 px; saída estruturada: `output_config.format`, sem `oneOf`, sem min/max, 16 uniões por pedido; preços de 20/11: Sonnet 5.5 US$ 2/10, Opus 5.5 US$ 4/20, Fable 5.2 US$ 8/40) e de um levantamento do código em `8e3e89c` (`art/stops`, `Miniatures.tsx`, `layout.ts`, `props-builder.ts`, `nominatim.ts`, `places-schema.ts`, `structured-schema.ts`, o `app_maquete`, o `lab.yml`). **Marcado como não conferido:** a política de uso do Nominatim para chamadas do servidor, se o buscador da API da Anthropic aceita o `thumburl` do Commons, o tempo máximo de uma Edge Function, a lei 9.610/98, o artifact da ideia. Com a 3.0 (o `RouteError` do `app_maquete`, o console no artefato, o agendado, o pedido sem tipo, a `0017` e a `0018`), o vocabulário da receita e o construtor com a estufa à mão como régua (o corte natural se a fase precisar ser quebrada), a peça na maquete e a da cidade de passagem, a função `landmarks` e o trabalhador `build-landmark` pelo cron (identificar no OSM e no Wikidata, as fotos do Commons só com licença livre, a receita pela IA, a conferência pelo aparelho), refazer com escolha obrigatória e tirar do ar, os testes, o `app_maquete` com a peça semeada e a medição `medir-cartao-postal` (teto US$ 3,00), a documentação (D178, D219 e D220 revistas; prompt mestre v12). Fora do git até o commit de fechamento da fase, junto com este relatório.

### Sessão
- **Chat do VS Code aberto pelo Douglas**, `session_id` `428d8338-b259-48d1-8995-269e381cbf45`, das 19h52 UTC de 20/11 ao
  resumo final às 01h45 UTC de 21/11 (o chat continuou aberto: às 08h08 UTC ainda respondia a ele). Pela transcrição:
  **174 mensagens no Fable 5.1 e 187 no Opus 5.5** (começou no Fable, contra a regra de 08/11; o Douglas trocou para o
  Opus no fim, pela memória da sessão), 9 mensagens do Douglas, 596 mil tokens de saída, 149,6 M lidos do cache, 2,6 M
  criados; 8 chamadas de Bash com `git commit` e 11 com `git push`. **17 commits** na `main`, de `d7ddb7d` (a 3.0) a
  `e64ee9d`, com o de fechamento `c69d503` `fase 23: os cartões-postais`. Sem o JSON do `claude -p`, o custo em dinheiro
  não foi medido.
- **CI:** vermelha em `c69d503` (44816699384), `f14a238` (44817085343), `ccc3cc6` (44817568018) e `f911c99`
  (44818663863): o prettier do README, o lint do banco, o Vitest da CI sem as variáveis, o pgTAP 19 (D255, D266, D267);
  verde em `c48da00` (44820905918), `2ac2447` (44833058916), `9decb4d` (44841300328), `c163ed5` (44845021869) e
  `e64ee9d` (44850204130); na `main`, 44846622801 (`c163ed5`) e 44851988176 (`e64ee9d`, 01h45 UTC).
- **Laboratórios e medição:** o preview em `c48da00` (44825825962, 22h04 UTC) **39 de 41** (o `app_maquete` corrigido
  e o `app_missoes` não reproduzido, D268); a primeira medição (44825846647) caiu por um 522 do Cloudflare na API do
  Supabase; um laboratório cancelado (44835376096, `2ac2447`); **a medição (44843680151, `9decb4d`, 00h26 UTC) verde:
  a peça do Jardim Botânico publicada (v1, 19 formas), conferência `ok`, US$ 0,093**; **o da produção (44847796028,
  `c163ed5`, 01h03 UTC) 37 verdes, nenhum vermelho, 5 medidos sem cobrança.** Toda a IA da fase: US$ 0,13 do teto de
  3,00 (D267).
- **No hospedado:** a `0017_cartoes_postais` e a `0018_fila_resiliente` aplicadas com o `--dry-run` lido; `landmarks`
  v4 e `build-landmark` v4; o cron `viajei-build-landmark`; nenhum secret; o User-Agent `Viajei/0.23
  (https://github.com/dougedss/viajei)` (D263). **A retirada de `trips.car_*` não aconteceu:** a `0018` virou a fila
  resiliente e a retirada passou a ser a `0019` (D268), que fica para a 25.
- **Desvios de regra:** a sessão começou no Fable 5.1 (a regra é o Opus 5.5); o Nominatim público recusou as Edge
  Functions e o OSM do servidor passou para a Geoapify (D268, dentro da chave que já existia); durante o laboratório do
  preview alguém com a viagem real abriu o app no preview e enfileirou sete lugares reais (US$ 0,014, D268). O que a
  sessão não conferiu: a causa do `RouteError` da produção (D254), o vermelho do `app_missoes` no preview, o corpo do
  erro do hotel e de Caxias do Sul (provável `maxlag`).

- **20/11 à noite (00h40 UTC de 21/11), com a sessão em andamento** (a `fase-23` em `9decb4d`, CI
  44841300328 e laboratório do preview 44843680151 verdes, ainda sem merge; `docs/decisoes.md` até a
  D269 na branch): o balcão de ideias fechou com o Douglas
  `docs/ideias/2026-11-20-o-passeio-um-passo-de-cada-vez.md` (um uso real dele e uma bateria de dez
  pedidos de leigo na produção: "em Mafra" foi para Portugal, "pra Joinville" para a França, "Litoral"
  para Camarões; o campo livre que se apaga; "1:30" não lido e o raio padrão em silêncio) e pediu ao
  orquestrador o encaixe no plano, sem mexer no prompt da 23 nem abrir fase. O plano ganhou as **fases 25
  (Correções da conversa, pequena, depende da 24) e 26 (O passeio um passo de cada vez, grande, depende
  da 24 e da 25)**, os itens 5 e 6 de "O que não dá" (a nota de avaliação, que a Places da Geoapify não
  tem, conferido na documentação em 21/11; as regiões que não são lugar do mapa), as sete decisões dele
  de 20/11 e o que elas mudam na D225, na D228 e na D230 (de leve na D227 e na D208). A ordem
  23 → 25 → 26 → 19 → 20 → 21 é a recomendação do balcão, adotada à espera da palavra do Douglas. O
  plano, este relatório e a ideia ficam fora do git até um commit de fechamento (o da 23, se a sessão os
  incluir; senão o da fase seguinte), como em 15/11.

### Portão de saída (conferido às ~08h10 UTC de 21/11 pelo orquestrador, a pedido do Douglas: "proxima")
- a ponta da `fase-23` está na `origin/main`: sim, `e64ee9d`, com o commit `fase 23: os cartões-postais` (`c69d503`) e
  o dos números (`e64ee9d`); a branch remota `fase-23` ainda existe (não é da 25: o Douglas ou a sessão da 23 a apagam).
- CI verde no sha da `main` (44851988176); o laboratório da produção verde (44847796028, em `c163ed5`; o `e64ee9d`
  só mudou duas linhas de `decisoes.md`): sim.
- `docs/decisoes.md` tem a seção "Fase 23 · Os cartões-postais (20/11/2026)", D254 a D269, em sequência: sim.
  `docs/fases/fase-23.md` e `docs/fases/orquestracao.md` commitados em `c69d503`: sim (a nota do encaixe de 20/11,
  acima, ficou fora do git, como o plano e a ideia).
- a memória do projeto atualizada depois do fim: sim (`viajei-projeto.md` às 01h26 UTC, "Fechamento da fase 23");
  a linha do `MEMORY.md` ficou com o orquestrador.
- o resumo final (01h45 UTC): o sha, o que mudou, os dois laboratórios e a medição, as D254 a D269, o que mudou na
  D178, na D219 e na D220, as armadilhas (o `--yes`/`--read-only` do Supabase em modo agente, o Node 18 do PATH, a
  Vercel sem deployments no GitHub, a guarda do SDK para `max_tokens` alto sem stream), o que ficou sem prova (a peça
  de um lugar real num aparelho, a cidade de passagem com peça, o Refazer, o leitor de tela na folha).
- **Pendências do Douglas:** o `.env.example` (modificado, não lido); o User-Agent, se quiser trocar; tirar uma peça
  do ar (`landmark_retire`); apagar a branch remota `fase-23`; o commit dos quatro documentos fora do git (a sessão da
  23 ofereceu às 08h08 UTC; senão, a 25 os commita no fechamento); a pasta `.claude/`.
- **O que fica para a 25 (a 3.0 dela):** o agendado de 21/11 (ainda não tinha rodado às 08h10 UTC); a `0019`
  (`trips.car_*`); o pedido sem tipo de lugar (D238, D254: "é a conversa").

## Fase 25 · Correções da conversa

### Portão de entrada (aberto às ~08h30 UTC de 21/11, a pedido do Douglas: "proxima"; refeito às ~09h17 UTC de 21/11 com os ajustes dele)
- fase 24 na `main`: sim (D224 a D238, desde 16/11); a 23 fechada em `e64ee9d`. A dependência (24 → 25) está
  satisfeita. **A ordem, depois dos ajustes de 21/11: 23 → 25 → 27 → 26 → 28 → 29 → 19 → 20 → 21**, a
  recomendação do balcão adotada pelo orquestrador (a decisão 1 de 21/11: a pesquisa e o roteiro são a
  prioridade); a confirmação é do Douglas, a cada "próxima".
- `docs/decisoes.md` até a D269. **As D da fase 25 começam na D270.** A próxima migration é a **`0019`**
  (`trips.car_*` fora, D199 e D268), autorizada com a leitura e o `--dry-run`; nenhuma outra migration (a conversa
  mora no aparelho); o Dexie na v7; a `plan-trip` republicada (os prompts do `ask` e da escrita); **nenhum secret
  novo** (a chave do Google é da 27 e do Douglas).
- memória do projeto atualizada depois da fase 23: sim (pela sessão, às 01h26 UTC), completada pelo orquestrador (os
  parágrafos da 25 e dos ajustes de 21/11).
- **Os ajustes de 21/11** chegaram pelo texto do balcão colado pelo Douglas: duas ideias fechadas de manhã
  (`docs/ideias/2026-11-21-a-pesquisa-e-o-roteiro-refeitos.md`, que completa e em parte substitui a de 20/11, e
  `docs/ideias/2026-11-21-o-mapa-por-trechos.md`). O plano ganhou as **fases 27 (A fonte e o planejador), 28 (O mapa
  por trechos) e 29 (O chat que continua)**, as 25 e 26 revistas, os itens 7 e 8 de "O que não dá" (os termos do
  Google e a decisão 4 do Douglas, que ninguém reabre; "a feirinha"), o item 5 revisto (a nota vem com o Google), a
  seção "O que o Douglas decidiu em 21/11/2026" (as oito decisões da pesquisa e as cinco do mapa, o descartado, o
  que muda na D176, D203, D208, D225, D226, D227, D228, D230, D231 e na D215, D216, D217, D220, D233, D234, D258, D265
  e na decisão 1 de 15/11). **O que mudou na 25:** saem o nome que casa sem ser o tipo e os tipos que faltam (remendos
  da tabela e da Geoapify, que a 27 troca); entram o GPS na conversa com a origem à vista e editável e o conserto do
  `lastOrigin` (3.1), e "nada some em silêncio; o texto só fala do que existe" (3.8: os três estados de cada coisa
  pedida; o bloco `<pendentes>` e a proibição no prompt da escrita); a cidade conferida fica na forma mínima (3.7); a
  medição ganha o pedido de Canoinhas. **Em aberto, para o Douglas:** os 10 pedidos da bateria (fase 27) são novos a
  cada rodada ou fixos (a recomendação do balcão: novos). **Pendência só dele, antes da 27:** a conta do Google
  Cloud com faturamento, a Places API (New) ligada e a chave em `supabase secrets`.
- `docs/fases/fase-25.md` escrito às ~08h30 UTC e **reescrito às ~09h17 UTC** de 21/11 pelo orquestrador, a partir do
  plano (a fase 25 revista; as decisões 4 a 7 de 20/11 e 2 e 8 de 21/11), das ideias de 20 e 21/11, das D48, D176,
  D199, D203, D208, D225 a D232, D238, D254, D267 a D269, da memória e de um levantamento do código em `e64ee9d`
  (`flow.ts`, `nominatim.ts`, `QuestionsStep.tsx`, `OptionsStep.tsx`, `today.ts`, `places.ts`, `plan-ai.ts`,
  `plan-protocol.ts`, `gather.ts`, `new-trip.ts` (`lastOrigin` ordena por `start_date` decrescente: conferido),
  `useConversation.ts`, `conversation.ts`, `nova-viagem.spec.ts`, `measure-conversa.ts`). **Marcado como não
  conferido:** a documentação do Nominatim (`viewbox` sem `bounded` como preferência; a política para apps de usuário
  final) e as chamadas do balcão (não repetidas); a versão da `plan-trip` no hospedado; os campos de `Trip` para "a
  viagem mais recente"; como os e2e do mapa dão o consentimento do app. Fora do git até o commit de fechamento da
  fase, junto com este relatório, o plano e as três ideias.

### Sessão
- **21/11, ~08h50 UTC, antes de abrir o chat:** o Douglas pediu para **esperar**: "estamos definindo mais uns ajustes e vou esperar para iniciar o 25; talvez alguma coisa do 25 vai ser alterado, e você ajusta as demandas todas de uma vez". O `fase-25.md` fica escrito e **não deve ser colado** até ele trazer os ajustes; o orquestrador então revisa o plano (as fases 25 e 26) e o prompt numa passada só, e refaz este portão se mudar.
- **21/11, ~09h17 UTC:** os ajustes chegaram (as duas ideias de 21/11, acima). O plano foi revisto e o `fase-25.md`
  reescrito numa passada só; **a 25 está pronta para abrir quando o Douglas pedir**; nenhuma fase foi aberta.
- **Chat do VS Code aberto pelo Douglas**, `session_id` `0767f156-46ff-4051-8a35-f30b48eb15c9`, das 09h23 UTC de 21/11
  ao resumo final às 15h26 UTC (o laboratório da produção lido às 15h55; a última resposta às 17h47, a "fechou
  aqui?"). Pela transcrição: **58 respostas no Fable 5.1 e 182 no Opus 5.5** (começou no Fable, contra a regra de
  08/11; o Douglas trocou para o Opus com `/model` às 10h21), uma compactação (13h03), 6 mensagens do Douglas, 379
  mil tokens de saída, 100,2 M lidos do cache, 1,69 M criados; 19 chamadas de Bash com `git commit` e 9 com `git
  push`. **18 commits** na `main`, de `6d6a6ca` (a 3.0) a `aca13be`, com o de fechamento `53071f8` `fase 25:
  correções da conversa`. Sem o JSON do `claude -p`, o custo em dinheiro da sessão não foi medido.
- **CI na `fase-25`:** vermelha só em `53071f8` (44894539154); verde em `1195648` (44896059799), `eb794a6`
  (44898358249), `e82bd35` (44900768409), `246f2c1` (44902315763), `de6f9a0` (44918426737) e `aca13be`
  (44921681780); na `main`, 44916861543 (`246f2c1`), 44918432708 (`de6f9a0`) e 44921685622 (`aca13be`, 15h54 UTC).
- **Laboratórios e medição:** a medição 1 (44897815194, lab-a) vermelha, que levou à D282; a 2 (44899822777) não
  mediu (o login falhou); a 2b (44899974593) não mediu o mapa (a cota de buscas do lab-a, D283); **a 3 (44902017111,
  lab-b) verde em todas as cobranças**; **o preview (44914384227, `246f2c1`) 39 verdes, 0 vermelhos, 2 pulados**;
  **o da produção (44919029673, `de6f9a0`, 15h25–15h53 UTC) 37 verdes, 1 vermelho, 3 pulados**: o vermelho é o
  Lighthouse da `nova_viagem` (performance 88; o CLS de 0,016 para 0,136, sempre o mesmo `div.rounded-card`; a causa
  não conferida), registrado na D281 como o primeiro item da próxima fase. O agendado de 21/11 (44914556412),
  preso no sha da 23, cancelado na fila. **Toda a IA da fase: US$ 0,3426** do teto de 1,00 (D281).
- **No hospedado:** a `0019` (`trips.car_*` fora) aplicada às 11h08 UTC com o `--dry-run` lido; a `plan-trip` na v8
  (11h35 UTC); nenhum secret.
- **Desvios de regra:** a sessão começou no Fable 5.1; o merge foi às 15h00 UTC, antes de o laboratório do preview
  terminar, com a liberação do Douglas no chat ("ok, pude subir e fazer o merge msm assim"). O que a sessão não
  conferiu: a causa do login que falhou na medição 2; se um quadrado de busca menor ordenaria melhor as cidades; o
  Nominatim além das consultas que a medição registrou; a causa do CLS.

### Portão de saída (conferido às ~10h00 UTC de 22/11, a pedido do Douglas: "fechar", no chat da chave do Google)
- a ponta da `fase-25` está na `origin/main`: sim, `aca13be` (o código é o de `246f2c1`; `de6f9a0` e `aca13be` são só
  documentação), com o commit `fase 25: correções da conversa` (`53071f8`); as branches remotas `fase-23` e
  `fase-25` ainda existem.
- CI verde no sha da `main` (44921685622): sim. O laboratório da produção (44919029673): vermelho só no Lighthouse
  da `nova_viagem`, registrado na D281 pela regra da seção 1 do prompt (o vermelho da produção vira o primeiro item
  da próxima fase). O agendado de 22/11 ainda não tinha rodado às 10h00 UTC (o cron é às 06h07 UTC e costuma sair
  por volta das 16h UTC).
- `docs/decisoes.md` tem a seção "Fase 25 · Correções da conversa (21/11/2026)", D270 a D283, em sequência: sim.
  `docs/fases/fase-25.md`, `docs/fases/orquestracao.md`, o plano e as ideias de 21/11 commitados em `53071f8`: sim.
  Este fechamento, a decisão da bateria no plano e na ideia de 21/11 ficam fora do git até o commit de fechamento
  da próxima fase.
- a memória do projeto atualizada depois do fim: sim (`viajei-projeto.md` às 15h54 UTC de 21/11, "Fechamento da
  fase 25"); completada em 22/11 (a chave do Google, a bateria, este portão).
- o resumo final (15h26 UTC, completado às 15h55 com o laboratório da produção e às 17h47): o sha, o que mudou por
  entrega, os testes (1.484 Vitest, 655 pgTAP, 79 Playwright), as medições e os laboratórios, a `0019` e a
  `plan-trip` v8, as D270 a D283 e o que mudou na D176, D203, D208, D225, D228 e D231, as armadilhas (a cota de
  buscas vale para as contas do laboratório; os homônimos do Nominatim; o `stale` do `sync_push`; "o dia" só antes
  das 11h; o agendado preso no sha de quando nasce; push na `main` cancela a CI anterior; os nomes reais proibidos
  nos exemplos dos prompts) e o que ficou sem prova (o cartão da posição num aparelho).
- **Decisões do Douglas de 22/11:** a bateria da 27 tem **10 pedidos novos a cada rodada**, com os padrões de pedido
  mudando (no plano, na seção de 21/11, e na ideia de 21/11); **a chave do Google existe**: conta qimkt38, projeto
  `viajei-515509`, a Places API (New) ligada, a chave restrita a ela, o secret `GOOGLE_PLACES_API_KEY` no Supabase
  de produção (o nome conferido no painel; a chave não testada numa chamada real). A dougeds.contato ficou de fora
  (a conta de faturamento dela pedia um pré-pagamento de R$ 150, que o Douglas não quis).
- **Pendências do Douglas:** o `.env.example` (modificado, não lido); apagar as branches remotas `fase-23` e
  `fase-25`; a pasta `.claude/`; girar ou não a chave do Google (ela passou pelo chat em 22/11).
- **O que fica para a 27 (a 3.0 dela):** o Lighthouse da `nova_viagem` (o CLS de 0,136), o primeiro item; o
  nome `GOOGLE_PLACES_API_KEY` no `.env.example` e no `remote:secrets-push`; ler o agendado de 22/11.

## Fase 27 · A fonte e o planejador

### Portão de entrada (aberto às ~10h17 UTC de 22/11, a pedido do Douglas: "proxima")
- fase 25 na `main`: sim, `aca13be` (o código em `246f2c1`; D270 a D283), com o portão de saída conferido às ~10h00 UTC
  de 22/11 pelo chat da chave do Google (acima). A dependência (25 → 27) está satisfeita. A ordem 23 → 25 → 27 → 26 →
  28 → 29 → 19 → 20 → 21 (a recomendação do balcão, no plano desde 21/11): o Douglas pediu "proxima" às ~10h05 UTC de
  22/11 sem objeção, e o orquestrador abriu a 27.
- o último laboratório na produção (44919029673): vermelho só no Lighthouse da `nova_viagem` (o CLS de 0,136),
  registrado na D281 como o primeiro item desta fase (a 3.0 do prompt). O agendado de 22/11 ainda não tinha rodado
  às 10h05 UTC.
- `docs/decisoes.md` até a D283. **As D da fase 27 começam na D284.** A próxima migration é a **`0020`** (o `place_id`
  do Google em `stops`, o `kind` novo em `ai_imports`, o que a bateria pedir), só acrescentando; o Dexie na v7 (a
  próxima é a v8); uma função nova (o planejador, `plan-search` na recomendação); **nenhum secret da sessão: o
  `GOOGLE_PLACES_API_KEY` foi criado pelo Douglas em 22/11** (conta `qimkt38`, projeto `viajei-515509`, Places API
  (New), chave restrita; o nome conferido no painel pelo chat da chave; a chave **não testada numa chamada real**: a
  primeira é da sessão, e conta no teto).
- memória do projeto atualizada depois da fase 25: sim (pela sessão em 21/11 e pelo chat da chave em 22/11),
  completada pelo orquestrador (o parágrafo da fase 27).
- **A decisão da bateria** (o Douglas, 22/11): dez pedidos **novos a cada rodada, com os padrões de pedido mudando**;
  "os que falharam voltam" não comentado: o prompt manda registrar como em aberto e não adotar sem perguntar.
- `docs/fases/fase-27.md` escrito às ~10h17 UTC de 22/11 pelo orquestrador, a partir do plano (a fase 27 e as decisões
  1, 3, 4, 5, 6 e 8 de 21/11 e a de 22/11), das ideias de 21 e 20/11, das D127 a D133, D211, D224 a D238, D260, D268,
  D270 a D283, da memória (`viajei-prioridade-pesquisa-e-roteiro.md`, `viajei-google-cloud.md`,
  `feedback-chave-nova-comando-env.md`), da documentação pública **do Google** (a Places API (New), lida por agente em
  21 e 22/11: Text Search `POST places:searchText` com `textQuery`, `locationBias` círculo até 50 km ou retângulo,
  `locationRestriction` só retângulo, `includedType`, `openNow`, `minRating`, `pageSize` ≤ 20 e até 60 resultados, o
  field mask obrigatório; Place Details `GET /v1/places/{id}`; os SKUs: id/location/formattedAddress Essentials,
  displayName/primaryType/businessStatus/googleMapsUri Pro, rating/userRatingCount/opening hours/websiteUri
  Enterprise; cobra-se pelo SKU mais alto; faturamento obrigatório), **do Supabase** (os limites das Edge Functions:
  150 s de parede no Free e 400 s nos pagos, 2 s de CPU por worker, 256 MB, 504 sem resposta em 150 s) e **da
  Anthropic** (o uso de ferramentas: `tools` com `input_schema`, `strict`, `tool_use`/`tool_result`, `stop_reason`
  `tool_use`; **`tool_choice` `any` e `tool` devolvem 400 no Sonnet 5.5 e no Opus 5.5**; `disable_parallel_tool_use`;
  o `toolRunner` do SDK TypeScript com stream) e de um levantamento do código em `aca13be` (`places-schema.ts`,
  `places-handler.ts`, `find-places/index.ts`, `import-ai.ts`, `import-handler.ts`, `plan-handler.ts`, `plan-ai.ts`,
  `flow.ts` com os três estados, `locate.ts`, `useConversation.ts`, `measure-conversa.ts` como lab-b, `lab_runs` e
  `lab_checks`, `LabPage.tsx`, `conversa.spec.ts`). **Marcado como não conferido:** os preços em dinheiro do Google
  (só a leitura do balcão); se `tools` e `output_config.format` vão no mesmo pedido (por isso a entrega é uma
  ferramenta estrita); a lista de tipos do Google (a "Tabela A"); se a Text Search da cidade devolve o `viewport`; se
  o `locationRestriction` vale para uma consulta com texto; a busca ao longo de uma rota (não achada: círculos ao
  longo da linha); o plano do Supabase deste projeto (desenhar para 150 s); se o `import` de subcaminho do SDK
  funciona no Deno. Com a 3.0 (o CLS, o agendado de 22/11, os nomes nos scripts, o pedido sem tipo), a fonte (o
  handler do Google com `fetch` injetado, o field mask Enterprise registrado, "em Canoinhas" dentro da cidade pelo
  app, os cartões com a nota e o aberto agora, `stops.google_place_id` na `0020`, a primeira chamada real), o
  planejador (a função `plan-search` com o laço de ferramentas `procurar_lugares`, `localizar_nome`,
  `tempo_de_carro` e a entrega `entregar_passeio`, `tool_choice: auto`, teto de 6 turnos e 8 chamadas, o prazo de
  140 s, o app julgando as `ref`s, as cotas), a bateria (a tarefa `bateria` sob pedido, dez pedidos gerados pela IA a
  partir de padrões que rodam, as cobranças objetivas e o juiz, gravada em `lab_runs`/`lab_checks`, o painel), a
  Geoapify nas sugestões até a medição, os testes, a rodada da bateria como medição (teto da fase US$ 5,00, IA mais
  Google), a documentação (D225, D226, D227, D228, D230 e D231 revistas; prompt mestre v14; 9.10). Fora do git até o
  commit de fechamento da fase, junto com este relatório, o plano e a ideia de 21/11.

### Sessão
- **Chat do VS Code aberto pelo Douglas**, `session_id` `be5c7d02-a894-4652-acfe-628e173b2664`, das 11h38 UTC de 22/11
  (o prompt colado) ao resumo final (lido por ele às 18h59 UTC); a última resposta às 19h01 UTC (a dos laboratórios,
  abaixo). Pela transcrição: **667 respostas, todas no Fable 5.1** (contra a regra de 08/11; o Douglas não trocou de
  modelo e não comentou), duas compactações (13h13 e 18h06 UTC), 5 mensagens do Douglas ("fechamos aqui?" às 15h31;
  "seguir ate o fim" às 15h32; "aindaz?" às 16h05; "ok, ja vou pedir a proxima tarefa para gerar o prompt e iniciar"
  às 16h16; a dos laboratórios às 18h59), 2,23 M tokens de saída, 295,7 M lidos do cache, 8,39 M criados; 11
  chamadas de Bash com `git commit` e 9 com `git push` (contagem por expressão, aproximada). **11 commits** na
  `main`, de `6613956` (a 3.0: o CLS era a troca de fonte) a `0460200`, com o de fechamento `16e076e` `fase 27: a
  fonte e o planejador` (o push com tudo), seguido de cinco commits de correção (os e2e do planejador, a gravação da
  bateria, a cota do laboratório na `plan-trip`) e dos números. Sem o JSON do `claude -p`, o custo em dinheiro da
  sessão não foi medido.
- **CI na `fase-27`:** vermelha em `16e076e` (45027015535: três e2e do planejador, o teste errado e dois defeitos da
  tela) e em `c623998` (45030087147: o e2e de Canoinhas por substring); verde em `b94b0c3` (45031823960), `e41921f`
  (45041294100), `60c6771` (45044321552) e `0460200` (45046277618); na `main`, 45040361350 (`b94b0c3`) e
  45047805186 (`0460200`, 17h09 UTC). 1.566 Vitest, 669 pgTAP, 79 Playwright.
- **Laboratórios e medições:** a `medir-desempenho` (45019395883, `aca13be`, 11h52 UTC), que leu a causa do CLS da
  `nova_viagem` (as fontes carregando depois do primeiro texto); o agendado de 22/11 (45032989466, `aca13be`,
  14h28–15h07 UTC) **40 verdes** contra a produção da 25; **o preview (45033575599, `b94b0c3`, 15h08–15h48 UTC) 37
  verdes, 0 vermelhos, 4 pulados, a `nova_viagem` com CLS 0**; a bateria 1 (45036576355, lab-b, 15h48–15h52 UTC) 8
  de 10, juiz 7,0, US$ 1,21, os dez pedidos perdidos num 522 ao gravar (defeito da bateria, corrigido em
  `e41921f`); **a produção (45040801438, `b94b0c3`, 15h54–16h20 UTC) 37 verdes, 1 vermelho, 3 pulados**: o
  vermelho é **o Lighthouse da lista de viagens (performance 89, CLS 0,16 sem elemento identificado)**, intermitente
  desde 18/11; a `nova_viagem` com CLS 0,001 e performance 95 (a 3.0 provada); a bateria 2 (45041293979, `e41921f`,
  16h21–16h24 UTC) **10 de 10 nas cobranças, juiz 7,0, US$ 1,06, nenhuma escrita rodou** (a cota da `plan-trip` para
  a conta do laboratório, corrigida em `60c6771` sem rodada nova). **Toda a IA da fase: US$ 1,0554; o Google, 37
  buscas** (as 1.000 grátis do mês), do teto de US$ 5,00 (D296).
- **No hospedado:** a `0020` às 14h33 UTC com o `--dry-run` lido; a `plan-search` v1 e a `find-places` v7 às 14h33;
  **a primeira chamada real ao Google** (200, 20 lugares em Canoinhas: a chave vale); a `plan-trip` v10 às 16h52;
  nenhum secret.
- **O merge:** `git push origin b94b0c3:main` às 15h48 UTC, com o preview verde e antes do laboratório da produção
  (a regra da seção 1 de então); os três commits seguintes por fast-forward depois da CI verde de cada um.
- **Desvios de regra:** a sessão rodou inteira no Fable 5.1; **a segunda rodada da bateria** pela cláusula da seção
  1 ("uma segunda só se a primeira ficou vermelha por um defeito que a CI passou a cobrir"), aplicada a um defeito
  do próprio instrumento. **Às 18h59 UTC o Douglas, lendo a tabela do resumo, deu a regra nova:** "pq que parece
  que se repete, deveria so rodar um de cada, ainda mais oq tem custo.. Apenas deveria rodar producao". O chat da
  27 respondeu às 19h01 (nada rodou duas vezes por acidente; o custo foi a segunda bateria), **gravou a regra na
  memória** (`feedback-laboratorio-uma-vez.md`: um laboratório por fase, na produção, depois do merge; nenhum no
  preview; a bateria e qualquer medição com custo uma vez) e ofereceu corrigir as três linhas do plano com a regra
  antiga; às 19h10 UTC seguia aberto, sem resposta dele. O que a sessão não conferiu está na D298.

### Portão de saída (conferido às ~19h10 UTC de 22/11 pelo orquestrador, a pedido do Douglas: "proxima")
- a ponta da `fase-27` está na `origin/main`: sim, `0460200` (o código até `60c6771`; `0460200` é só documentação),
  com o commit `fase 27: a fonte e o planejador` (`16e076e`); as branches remotas `fase-23`, `fase-25` e `fase-27`
  ainda existem.
- CI verde no sha da `main` (45047805186): sim. O laboratório da produção (45040801438, em `b94b0c3`): vermelho só no
  Lighthouse da lista de viagens, registrado na D296 pela regra da seção 1 (vira o primeiro item da próxima fase);
  depois de `b94b0c3` só entraram a bateria, a cota do laboratório na `plan-trip` e a documentação.
- `docs/decisoes.md` tem a seção "Fase 27 · A fonte e o planejador (22/11/2026)", D284 a D298, em sequência: sim.
  `docs/fases/fase-27.md`, `docs/fases/orquestracao.md` (o portão de entrada), o plano e a ideia de 21/11 commitados
  em `16e076e`: sim. Este fechamento fica fora do git até o commit de fechamento da próxima fase.
- a memória do projeto atualizada depois do fim: sim (`viajei-projeto.md`, "Fase 27 fechada em 22/11/2026", pela
  sessão; `viajei-google-cloud.md` com a chave testada; `feedback-laboratorio-uma-vez.md` reescrita às 19h01 UTC
  com a regra nova); completada pelo orquestrador (a 26 aberta).
- o resumo final foi dado (o Douglas o leu e comentou a tabela dos laboratórios às 18h59 UTC); o orquestrador
  conferiu os números pela D296, pelo git e pelas execuções do GitHub, não pelo texto do resumo.
- **Decisão do Douglas de 22/11, à noite:** a regra do laboratório (acima), já no prompt da 26.
- **Pendências do Douglas:** o `.env.example` (modificado, não lido); apagar as branches remotas `fase-23`, `fase-25`
  e `fase-27`; girar ou não a chave do Google (passou pelo chat em 22/11); a bateria no cron e com que teto (D293:
  US$ 32 a 37 por mês a cheio, uns US$ 15 na prática); "os que falharam voltam" (em aberto); as três linhas do
  plano com a regra antiga do laboratório (a sessão da 27 ofereceu corrigir); as sessões no Fable (a regra de
  08/11 pede o Opus: se mudou, dizer ao orquestrador).
- **O que fica para a 26 (a 3.0 dela):** o Lighthouse da lista de viagens (CLS 0,16); a escrita da bateria não
  medida pelo planejador; os achados da D296 (a cidade chutada a partir de uma região, os candidatos fora do tipo,
  o horário da feira que o roteiro não avisou).

## Fase 26 · O passeio um passo de cada vez (sobre o planejador)

### Portão de entrada (aberto às ~19h15 UTC de 22/11, a pedido do Douglas: "proxima")
- fase 27 na `main`: sim, `0460200`, com o portão de saída conferido acima. A dependência (27 → 26) está
  satisfeita. A ordem 23 → 25 → 27 → 26 → 28 → 29 → 19 → 20 → 21 (o plano, desde 21/11): o Douglas pediu "proxima"
  às ~19h00 UTC de 22/11 sem objeção (às 16h16 UTC tinha dito ao chat da 27 que ia pedir a próxima), e o
  orquestrador abriu a 26.
- o último laboratório na produção (45040801438): vermelho só no Lighthouse da lista de viagens (performance 89,
  CLS 0,16 sem elemento identificado), registrado na D296 como o primeiro item desta fase (a 3.0 do prompt).
- `docs/decisoes.md` até a D298. **As D da fase 26 começam na D299.** Nenhuma migration prevista (a conversa mora
  no aparelho; a parada de cidade já existe pelo tipo); se precisar, a **`0021`**, só acrescentando; o Dexie na v8;
  a `plan-search` (v1) a republicar compatível com o app em cache; nenhum secret; a chave do Google testada.
- memória do projeto atualizada depois da fase 27: sim (pela sessão), completada pelo orquestrador (o parágrafo da
  fase 26).
- **A regra nova do laboratório** (o Douglas, 22/11, 18h59 UTC) **está no prompt**: um laboratório por fase, na
  produção, depois do merge; nenhum no preview; a bateria uma vez, sem segunda rodada; a `medir-desempenho` uma
  vez, só para a 3.0 (sem custo), se os artefatos do laboratório não bastarem.
- `docs/fases/fase-26.md` escrito às ~19h15 UTC de 22/11 pelo orquestrador, a partir do plano (a fase 26, as sete
  decisões de 20/11 e o que foi descartado, o item 7 de 21/11, as fases 28 e 29), das ideias de 20 e 21/11, das
  D284 a D298 (em especial a D286, a D287, a D288 a D291, a D293, a D296 a D298), D270 a D283, D224 a D238, D208,
  D129, D130, D133, D162, D180, D211, da memória (`feedback-laboratorio-uma-vez.md` com a regra nova,
  `viajei-prioridade-pesquisa-e-roteiro.md`, `viajei-google-cloud.md`) e de um levantamento do código em `0460200`
  (`plan-search-protocol.ts`, `plan-search-ai.ts`, `plan-search-tools.ts`, `plan-search-handler.ts`,
  `google-places.ts`, `drive.ts`, `places-schema.ts`, `plan-protocol.ts`; `intake/plan-search.ts`, `flow.ts`,
  `search.ts`, `reach.ts`, `today.ts`, `hours.ts`, `assemble.ts`, `conversation.ts`, `useConversation.ts`,
  `OptionsStep.tsx`, `QuestionsStep.tsx`, `CriarViagemPage.tsx`, `ReviewStep.tsx`; `HomePage.tsx`,
  `RequireSession.tsx`, `lighthouse.ts`, `tela.spec.ts`; `bateria.ts`, `bateria-padroes.ts`, `app-conversa.ts`,
  `lab.yml`; `e2e/helpers/planner.ts`). **O desenho recomendado:** a IA planeja uma vez e procura só o passo 1 (um
  campo `passo_a_passo` no pedido, compatível com o app em cache; quando vai perguntar, não procura), a entrega
  ganha `busca`, `centro` e `tempo_min` preenchidos pela função (os schemas das ferramentas continuam sem opcional),
  **o app procura o passo seguinte pela relação** (a `find-places` do Google; `routeCircles` e `withinCity` puros,
  reaproveitados no app) e diz nos cartões o que cada lugar acrescenta (o desvio), a pergunta da ordem ("O que vem
  primeiro?", "Tanto faz"), a ordem final a dos passos (`bestOrder` só dentro do passo), a tela um passo por vez
  com "Voltar um passo", a pergunta do tempo do passeio todo pelo planejador (lida por `readReach`), a conta
  (a estrada, a permanência, os horários do Google) com o total à vista e o que estoura marcado, a janela da hora
  do dia e o aviso antes de criar, o destino como parada de cidade (o objetivo da 28), seis cobranças novas na
  bateria e a rodada única, teto US$ 3,00. **Marcado como não conferido:** se a IA de hoje pergunta a ordem quando
  não dita; o custo de uma conversa de dois passos; o nome `kindOfGoogleTypes` da D291; as partes do dia em minutos
  (suposição do orquestrador); a causa do CLS da lista (só a hipótese: as seções que chegam depois empurram a
  lista). Fora do git até o commit de fechamento da fase, junto com este relatório.

### Sessão
- Sessão `c5864832-489e-45cb-8e01-dff34ed65f68`, aberta pelo Douglas com o prompt colado às 19h21 UTC de 22/11, nesta
  pasta, na branch `fase-26` (de `origin/main` em `0460200`). Às 23h38 UTC ainda estava aberta, esperando a CI da
  `main` em `42bafc1`. **597 respostas: 275 no Fable 5.1** (até o `/model opus` do Douglas às 20h11 UTC) **e 322 no
  Opus 5.5**; uma compactação (23h10 UTC). Saída: 1,10 M de tokens no Fable e 0,39 M no Opus; cache lido 130,5 M +
  240,3 M; criado 4,78 M + 2,02 M. 319 chamadas Bash, 10 `git commit`, 11 `git push`.
- Mensagens do Douglas (4): o prompt (19h21); **às 19h30 UTC, uma regra nova, entregue no meio de um turno**: "Sempre e
  registre essa regra, quando vc terminar a parte de escrever o codigo e entrar nos teste. Deve me avisar para eu
  alterar o modelo. pois preciso tirar do fable e colocar para o opus, para nao gastar atoa" (a sessão a gravou na
  memória `feedback-avisar-troca-de-modelo.md` às 19h33 UTC e avisou na passagem do código aos testes); o `/model opus`
  (20h11); "ok, pode seguir" (23h34, depois de a sessão avisar que outra sessão estava escrevendo na pasta; ela
  respondeu que não abre a fase seguinte, que não existia `fase-28.md`, e que a 26 só tinha a CI da `main` em aberto).
- Commits (10, de `d56296f` a `42bafc1`; 49 arquivos, +4.996/−332 sobre `0460200`): `d56296f` 3.0 (20h23 UTC),
  `ee0e904` 3.1, `bfe2df4` 3.1 a 3.4, `231cb67` 3.5, **`d435dc2` `fase 26: o passeio um passo de cada vez`** (20h25, o
  fechamento com a documentação: o push em lote com tudo), `5a41486` 3.6 (20h47, os dois e2e novos com os dados certos),
  `10f7d0b` 3.2 (21h07, "Continuar" nunca pinta o passo seguinte sem as opções), `2a1d478` 3.5 (21h24, o que a rodada
  única da bateria mostrou, corrigido com teste), `ec2301c` 3.0 de novo (22h33, o convite de instalar no primeiro
  retrato), `42bafc1` D307 (23h08, só documentação).
- A CI na branch: `d435dc2` run 45066483493 **vermelha** (os dois e2e novos, por dados dos próprios testes);
  `5a41486` run 45068460466 verde com 1 instável (o e2e de dois passos: um defeito do app, corrigido em `10f7d0b`);
  `10f7d0b` run 45070293973 verde; `2a1d478` run 45071970043 verde; `ec2301c` run 45078367265 verde; `42bafc1` run
  45081636527 verde. Na `main`: `2a1d478` run 45073685622 verde; `ec2301c` run 45080021764 verde; `42bafc1` run
  45083522783 verde (23h29–23h49 UTC). Os números de testes estão na D307 (1.617 Vitest em 177 arquivos; 82 Playwright).
- O hospedado (pela D307; o orquestrador não conferiu no painel): a `plan-search` **v2 às 21h07 UTC e v3 às 21h43 UTC**;
  a `find-places` (v7) e a `plan-trip` (v10) sem mudança; nenhuma migration; nenhum secret.
- **A bateria, uma rodada** (run 45070487237, em `10f7d0b`, 21h09–21h16 UTC, semente `2026-11-22#3`): 10 de 10 nas doze
  cobranças objetivas, juiz 4,6/10 (três vereditos `invalid`), US$ 1,43 contado a cheio (IA US$ 0,76; 19 buscas do
  Google, das quais 14 chegaram ao Google). **O passo seguinte pelo app não foi medido:** a conta do laboratório tinha
  gastado as 60 chamadas da `find-places` das 24 h nas duas rodadas da 27 (`daily_limit`), e a bateria não contava a
  recusa. Mediu que a IA procura só o passo 1, pergunta a ordem quando não dita (4 de 4) e não pergunta quando dita
  (1 de 1), que o destino entra como parada e que a escrita roda (a primeira rodada em que ela rodou pelo planejador).
  Os defeitos que a rodada mostrou foram corrigidos com teste em `2a1d478`, **sem segunda rodada** (a regra nova).
- **Os merges** (fast-forward, com a CI verde no sha): `2a1d478` às 21h43 UTC; `ec2301c` às 22h51 UTC; `42bafc1` às
  23h29 UTC.
- **O laboratório da produção, uma vez** (run 45074657940, em `2a1d478`, 21h54–22h29 UTC, máquina que conta): **40
  verdes, 1 vermelho: o Lighthouse da lista de viagens, performance 81 e CLS 0,212 nas três execuções** (a 3.0 piorou o
  que queria tirar: o convite de instalar entrava sempre um render depois, porque o `useSyncExternalStore` lia o retrato
  antes do `start()`). Corrigido depois do laboratório (`ec2301c`), **sem outro laboratório**: o número fica para o
  agendado de 23/11. Nenhum laboratório no preview. A `medir-desempenho` rodou uma vez (run 45060951865, 19h28 UTC) para
  a 3.0, pela exceção da seção 1 do prompt.
- Desvios do prompt: nenhum de regra. A sessão começou no Fable 5.1 (o Douglas a abriu assim) e passou ao Opus às 20h11
  UTC, pela regra nova dele; a 3.0 precisou de uma segunda correção depois do laboratório, provada só pela CI, como a
  regra manda. Às 23h08 UTC o Douglas abriu outro chat na mesma pasta (abaixo); a sessão da 26 viu as mudanças dele no
  `git status` e não tocou nelas.

### Portão de saída (conferido às ~23h50 UTC de 22/11 pelo orquestrador, a pedido do Douglas: "proxima")
- fase 26 na `main`: sim, **`42bafc1`** (o código até `ec2301c`; o `42bafc1` só a D307), igual à `origin/fase-26` e à
  pasta. A CI da `main` verde em `ec2301c` (run 45080021764) e em `42bafc1` (run 45083522783, verde às 23h49 UTC).
- o último laboratório da produção (run 45074657940, em `2a1d478`): vermelho só no Lighthouse da lista de viagens
  (CLS 0,212), corrigido depois em `ec2301c` **sem laboratório novo**. **Vira o primeiro item da fase 28 (a 3.0): ler o
  agendado de 23/11** (o cron é `7 6 * * *`, 06h07 UTC, e o lab.yml diz que ele costuma disparar 7 a 10 h depois; o de
  22/11 rodou às 14h28 UTC). Até as 23h50 UTC de 22/11 não havia laboratório depois de `ec2301c`.
- `docs/decisoes.md` até a **D309** (D299 a D309, conferidas pelos títulos; a D307 traz os números, a D309 o que ficou
  sem prova e sem conferir); o prompt mestre **v15** (a linha da 26 "feita" na seção 12; a regra 17 "na dúvida,
  perguntar"); `docs/teste-final.md` 1.34; o README (3 linhas em `d435dc2`); `fase-26.md` e `orquestracao.md`
  commitados em `d435dc2` como estavam.
- memória do projeto atualizada depois da fase 26: sim, pela sessão (`viajei-projeto.md`: o parágrafo "Fase 26 fechada"
  e a descrição, 23h29 UTC; `MEMORY.md`) e a regra nova `feedback-avisar-troca-de-modelo.md`; completada pelo orquestrador
  (o parágrafo "Fase 28 aberta").
- o custo da fase (D307): US$ 0,78 de IA e 14 buscas do Google (US$ 0,49 a cheio, dentro das 1.000 grátis do mês), do
  teto de US$ 3,00.
- **O que ficou sem medir** (D309): o CLS da lista na produção depois de `ec2301c`; a busca do passo seguinte pelo app
  com o Google de verdade (e por isso o custo de uma conversa de dois passos); o efeito das correções da rodada
  (provadas só pela CI); `'onbeforeinstallprompt' in window` num Android de verdade; as horas de cada parte do dia
  (a tabela da D303 é a suposição do orquestrador, decidida pela sessão e não pelo Douglas).
- **Pendências do Douglas:** a cota da `find-places` para a conta do laboratório (precisa republicar a `find-places`;
  ficou fora da seção 2 da 26, D307: sem ela, uma rodada da bateria no mesmo dia de outra não mede o passo seguinte);
  o `.env.example` (modificado desde 22/11, não commitado; não lido); apagar `fase-23`, `fase-25`, `fase-27` e `fase-26`
  no remoto; a bateria no cron; "os que falharam voltam"; girar ou não a chave do Google. As três linhas do plano com a
  regra antiga do laboratório (13, 170 e 240), que a sessão da 27 ofereceu corrigir e não corrigiu, o orquestrador
  corrigiu neste passo (a 13 com a regra nova; a 170 e a 240 marcadas como a regra da época).
- **Outra sessão na pasta, que não é fase:** às 23h08 UTC o Douglas abriu o chat `4c49a9fe` (Fable 5.2) com três
  capturas da tela das opções e da revisão de uma ida a um sushi em Canoinhas (a conta dava 4 h 10 e chegada às 22:10
  para 25 min de estrada) e, às 23h17, disse "pode, aceito sugestões. pode fazer aqui! e a estimativa deveria vir da
  api do google e nao calculo com chute". Esse chat está escrevendo **na pasta, na branch `fase-26`, sem commit até as
  23h50 UTC**: uma função nova `drive-times` (a Routes API do Google: `_shared/drive-handler.ts`, `drive-schema.ts`,
  `google-routes.ts`, `functions/drive-times/`), mudanças em `plan-search-*.ts`, `plan-ai.ts`, `config.toml`,
  `secrets.ts`, `package.json`, e no app (`intake/assemble.ts`, `flow.ts`, `locate.ts`, `outing-time.ts`,
  `reschedule.ts`, `search.ts`, `useConversation.ts`, `drive-times.ts`, `useReviewDrive.ts`, `OptionsStep.tsx`,
  `CriarViagemPage.tsx`, `import/plan.ts`, `ReviewStep.tsx`, `lab/forged-stop.ts`), nos scripts do laboratório
  (`bateria.ts`, `app-conversa.ts`, `measure-conversa.ts`) e no `e2e/helpers/places.ts`; ele mesmo chama a decisão de
  "D310". Pelo que ele disse ao Douglas às 23h12, a regra da D304 (a cidade de destino como parada, 1 h 30) também está
  em revisão ali. **A fase 28 não pode começar nesta pasta enquanto esse trabalho não estiver commitado e fora dela**
  (o portão de entrada abaixo e a seção 1 do `fase-28.md` dizem como conferir).

## Fase 28 · O mapa por trechos

### Portão de entrada (aberto às ~00h00 UTC de 23/11, a pedido do Douglas: "proxima")
- fase 26 na `main`: sim, `42bafc1`, com o portão de saída conferido acima. As dependências da 28 (a 22 e a 24) estão
  na `main` desde 15/11 e 16/11; o objetivo que ela lê vem da 26 (D304: a cidade de destino como parada `city`, pela
  `PlacePick` do slot `destination`; **nada disso sobrevive na viagem salva**: na parada fica só o `kind`). A ordem
  23 → 25 → 27 → 26 → 28 → 29 → 19 → 20 → 21 (o plano, desde 21/11): o Douglas pediu "proxima" às ~23h40 UTC de
  22/11 sem objeção, e o orquestrador abriu a 28.
- o último laboratório na produção (45074657940, em `2a1d478`): vermelho só no Lighthouse da lista de viagens (CLS
  0,212), corrigido depois em `ec2301c` sem laboratório novo: **é a 3.0 do prompt** (ler o agendado de 23/11; a
  `medir-desempenho` uma vez só se ele não tiver rodado até o merge).
- `docs/decisoes.md` até a D309. **As D da fase 28 começam na primeira D livre na `origin/main` da hora** (o chat da
  correção do tempo de carro, abaixo, já chama a dela de D310). Migration: **só se o objetivo for guardado na parada**
  (o prompt recomenda guardar: uma coluna booleana em `stops`, a whitelist do `sync_push`, o pgTAP, o Dexie v9), a
  primeira livre (a `0021`, se a correção não criou uma). **Nenhuma função republicada, nenhum secret, nada de IA nem
  de Google; teto US$ 0,50** (o laboratório da produção, uma vez).
- memória do projeto atualizada depois da fase 26: sim (pela sessão; o orquestrador acrescentou o parágrafo "Fase 28
  aberta" e a nota do chat da correção).
- **As duas regras de 22/11 estão no prompt:** o laboratório uma vez, na produção, depois do merge (`feedback-laboratorio-
  uma-vez.md`) e **o aviso ao Douglas para trocar o modelo do Fable para o Opus na passagem do código aos testes**
  (`feedback-avisar-troca-de-modelo.md`, dita por ele às 19h30 UTC de 22/11 ao chat da 26).
- **A pasta não está livre:** o chat `4c49a9fe` (a correção do tempo de carro pela Routes API do Google, Fable 5.2,
  aberto às 23h08 UTC de 22/11) estava escrevendo nela, na branch `fase-26`, sem commit, às 23h50 UTC (24 arquivos
  modificados e 9 novos, entre eles `intake/assemble.ts`, `flow.ts` e `lab/forged-stop.ts`, que a 28 também toca). **O
  prompt da 28 manda conferir o `git status` antes de tudo e parar se houver trabalho de outra sessão**; o Douglas só
  deve colá-lo quando esse chat tiver commitado, dado push e mergeado (ou quando ele decidir fechar aquele trabalho).
  A 28 parte da `origin/main` da hora, inclusive do que a correção mudar no destino (`destinationIsStop()`).
- `docs/fases/fase-28.md` escrito às ~00h00 UTC de 23/11 pelo orquestrador (160 linhas), a partir do plano (a fase 28;
  os itens 9 a 13 de 21/11 e o descartado; a decisão 1 e a 8 de 15/11; "A ordem"), da ideia
  `docs/ideias/2026-11-21-o-mapa-por-trechos.md` (inteira), das D215, D216, D217, D220, D222, D233, D234, D258, D265,
  D266, D304, D299 a D309, D174 a D180, D47, D29, da memória (as duas regras de 22/11) e de um levantamento do código
  em `42bafc1` por um agente de varredura (`world/layout.ts`, `camera.ts`, `WorldSection.tsx`, `WorldHud.tsx`,
  `car-position.ts`, `replay.ts`; `lib/geo/segments.ts`, `municipalities*.ts`, `project.ts`, `catchup.ts`;
  `travel-mode/rules.ts`, `actions.ts`, `ViagemPage.tsx`, `live-rules.ts`, `NowBar.tsx`, `CatchupCards.tsx`,
  `AgoraHeader.tsx`; `memories/rules.ts`; `itinerary/*`; `intake/flow.ts` e `assemble.ts` em edição; os e2e
  `ida-e-volta.spec`, `maquete.spec`, `tela.spec`; `scripts/lab/app.ts`, `run.ts`, `lab.yml`). **O desenho
  recomendado:** um módulo puro `legsOf(stops)` (o objetivo dito; a volta como último trecho; sem objetivo, a regra de
  reserva: dois trechos divididos na parada mais longe de casa, ou um só sem volta; "cachoeira e café" cai na regra de
  reserva); **o objetivo guardado na parada** (a coluna booleana, gravada pelo app em `assemble.ts` a partir do slot
  `destination`, sem mudar a `plan-trip`; a importação não aprende o campo); o `WorldSection` monta o `buildLayout` do
  trecho da vez com a rota cortada (`routeSlice`, pelos `legs` guardados; sem `legs` que batam, sem rota) e a leitura
  do lugar do trecho, de modo que a câmera de repouso enquadra o trecho sozinha e a casa aparece uma vez por tela; a
  fração do carro é a do trecho; a troca de trecho derivada do `done_at` do objetivo e segurada enquanto o "Como
  foi?" está aberto (`legToShow`), o desfazer volta; o indicador "ida · volta" / "1 de 3" com o espiar e
  `data-world-leg`; a `PositionLine` fala do trecho com o total do dia menor; o "Rever o dia" toca os trechos em
  sequência; a cidade de passagem "a que a estrada atravessa" como "a rota passa a até R do centro" (R pela população,
  2 km + 1 km por 100 mil, entre 2 e 10 km; ou 3 km fixo), uma vez por nome e UF no trecho, até três por trecho; o
  e2e `trechos.spec` no molde do `ida-e-volta.spec`; o `app_maquete` com uma ida e volta e as capturas dos dois
  trechos; o laboratório da produção uma vez. **Marcado como não conferido:** se os `legs` guardados bastam para
  cortar a rota em toda viagem; como o `useLandmarkSync` lida com chave de cidade repetida; o corpo do `assemble()` e
  do `useConversation.ts` (em edição); que a casa e a cidade entram duas vezes **na tela** (leitura do código e o
  print do Douglas, não uma renderização); a distância da câmera num trecho de duas paradas; a hora em que o agendado
  de 23/11 roda; as populações dos municípios do caso de teste (o prompt manda ler o dado embutido). Fora do git até o
  commit de fechamento da fase, junto com este relatório e o plano.

### Sessão
_(a abrir pelo Douglas num chat novo, quando a pasta estiver livre; a preencher no próximo passo)_
