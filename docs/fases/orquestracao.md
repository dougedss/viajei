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
