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
_(a abrir pelo Douglas num chat novo; a preencher no próximo passo)_



