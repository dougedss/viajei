# Orquestrador · as fases 13 a 20, em sequência

> Você é o **orquestrador** das fases do plano de melhorias (`docs/fases/plano-melhorias.md`). Você não implementa nada: para cada fase, você escreve o prompt dela (`docs/fases/fase-N.md`) a partir do plano, das decisões e do código como ele está naquela hora, abre **uma sessão nova do Claude Code** para executá-la, espera, confere os portões e passa à seguinte. É o mesmo que o Douglas faria abrindo um chat novo por fase, com o chat de planejamento escrevendo cada prompt. **O Douglas não vai estar presente.** A autorização antecipada dele (seção 2 de `fase-13.md`) vale para você e para cada sessão que você abrir, com os mesmos limites.

## 0. Leitura obrigatória

1. `docs/fases/plano-melhorias.md` inteiro: a ordem, as dependências, o que não dá como foi pedido, as decisões do Douglas de 08/11 (inclusive a 11: a autorização em todas as fases) e a seção de cada fase.
2. `docs/fases/fase-12.md` e `docs/fases/fase-13.md`: **são o modelo** de um prompt de fase. Estrutura (seções 0 a 4), voz, nível de detalhe (cada entrega com o arquivo, a decisão com a recomendação, o teste que a prova), as armadilhas, a seção 2 (autorização e limites), o resumo final.
3. `docs/prompt-implementacao.md`: seções 2, 12 e 13 (a fase 13 o leva à v4).
4. `docs/decisoes.md` inteiro uma vez; depois, a cada fase, só a seção que a fase anterior escreveu.
5. A memória do projeto (`~/.claude/projects/-Users-douglas-Documents-dev-viajei/memory/viajei-projeto.md` e `MEMORY.md`): as sessões filhas a atualizam ao terminar; você a lê antes de escrever o prompt seguinte.
6. `docs/teste-final.md`: para saber o que cada fase deve acrescentar ao roteiro do aparelho.

## 1. Como uma fase roda

Uma fase por vez, nesta ordem: **13, 14, 15, 16, 17, 18, 19, 20.** A 21 (o banco conectado) fica de fora: depende de um contrato com um agregador, que só o Douglas assina. Nunca duas ao mesmo tempo: a fila do laboratório é uma só, e a pasta principal é de uma sessão só.

### 1.1 O portão de entrada

Antes de escrever o prompt da fase N:
- a fase anterior está na `main` (`git fetch`; `git merge-base --is-ancestor <ponta da fase-(N-1)> origin/main`), com o commit `fase N-1: …`;
- o último laboratório na produção (`gh run list --workflow lab.yml --repo dougedss/viajei --limit 3`) está verde, ou vermelho só no que a fase anterior registrou como "medido, não cobrado";
- `docs/decisoes.md` tem a seção da fase anterior, e a memória foi atualizada depois do fim dela (a data no texto; `grep -n "fase N-1"`);
- a cota do GitHub Actions dá para a fase (seção 3).

Se um portão falhar e a sessão da fase anterior já terminou: uma sessão curta para fechá-la ("feche a fase N-1: falta X", com o que falta e por quê), uma vez. Se ainda falhar, **pare a sequência** e escreva o relatório: nunca comece uma fase sobre uma `main` quebrada.

### 1.2 O levantamento e o prompt

Você escreve `docs/fases/fase-N.md` como o chat de planejamento escreveria, **a partir do código daquela hora**, não da memória do que ele era. Pela ordem:
1. A seção da fase N no plano: o que entra, as sugestões, o que foi decidido, as dependências.
2. O que a fase anterior deixou: o resumo final dela (o campo `result` do JSON da sessão), a seção dela em `decisoes.md` (o número da última D: as da fase N começam na seguinte), as armadilhas novas, as pendências.
3. O levantamento no código, pelas refs remotas (`git show origin/main:<caminho>`, `git ls-tree -r --name-only origin/main -- <pasta>`, `git grep <padrão> origin/main -- <pasta>`): os arquivos que a fase toca, as rotas (`src/app/router.tsx`), as constantes (`supabase/functions/_shared/constants.ts`), a última migration (o próximo número), os cenários do laboratório (`src/features/lab/scenarios.ts`, `scripts/lab/`), as specs do e2e (`e2e/`), as decisões que a fase revisita. Leia o que importa; não leia o repositório inteiro.
4. O prompt, com as seções do modelo:
   - **0. Leitura obrigatória:** arquivos e decisões específicos, com o porquê de cada um;
   - **1. Estado ao começar:** o sha da `main`, a última D, onde trabalhar (a pasta principal, se livre; senão um worktree irmão, com as armadilhas de worktree da fase-12.md), as armadilhas conhecidas que valem para esta fase (copie as da fase-13.md e acrescente as que a fase anterior achou);
   - **2. A autorização antecipada:** copie a da fase-13.md e ajuste o item do hospedado ao que a fase prevê (as migrations pelo número, as funções pelo nome);
   - **3. Entregas:** cada item do plano virado em entrega concreta: onde no código, o que muda, a decisão com a recomendação já tomada (o Douglas confirmou as do plano; o que o plano não decide, você decide pela recomendação do plano e registra), o teste que prova (Vitest, pgTAP, e2e, cenário do laboratório), o que entra em `docs/teste-final.md`, no README e em `decisoes.md`;
   - **4. Como trabalhar:** a ordem (plano como mensagem e seguir; commits; CI; laboratório no preview; merge; laboratório na produção; documentação, memória e o resumo final).
5. A régua de qualidade do prompt, antes de abrir a sessão: nenhuma entrega sem o arquivo e o teste; nenhuma decisão em aberto; nenhum "melhorar X" sem o como; as restrições do plano ("O que não dá") escritas onde a fase esbarra nelas; o tamanho parecido com o da fase-12.md ou da fase-13.md.

**A fase 13 já tem prompt.** Não o reescreva: só confira que a seção 1 dele ainda descreve o estado real (ele cobre a fase 12 ainda não publicada) e passe à sessão o que o Douglas tiver deixado do teste dele na sua mensagem de abertura.

### 1.3 A sessão nova

Cada fase roda numa **sessão nova do Claude Code**, em modo headless, com permissões liberadas, na pasta principal. Isso dá a ela contexto limpo, a própria compactação e a própria transcrição, como um chat novo. O mecanismo foi provado nesta máquina em 08/11 (uma sessão filha rodou um comando no shell e devolveu o resultado em JSON).

O binário é o da extensão do VS Code; resolva o caminho a cada vez, porque a versão muda:

```sh
BIN=$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude | sort -V | tail -1)
```

As variáveis da sua própria sessão impedem a filha de subir; tire-as. O texto de abertura fica num arquivo do scratchpad (`$S/fase-N.kickoff.txt`), e a saída em JSON noutro:

```sh
cd /Users/douglas/Documents/dev/viajei && env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_ENTRYPOINT "$BIN" -p "$(cat "$S/fase-N.kickoff.txt")" --dangerously-skip-permissions --output-format json > "$S/fase-N.out.json" 2> "$S/fase-N.err"
```

Rode em segundo plano (`run_in_background`), sem `--max-turns`, e **não fique consultando**: você é avisado quando o processo termina. O texto de abertura de cada fase:

> Leia docs/fases/fase-N.md e tudo o que ele manda ler na seção 0. O Douglas não vai estar presente: você tem o ok antecipado dele para tudo o que a seção 2 lista, sem perguntar, e os limites dela continuam valendo. Publique o plano e siga sem esperar ok, até a fase N estar na main com o laboratório da produção verde. Nunca pergunte nada: decida pela recomendação do prompt e registre em decisoes.md. Ao terminar, a sua última mensagem é o resumo final da seção 4, lido por um orquestrador: diga o que está no ar (o sha da main), os números, as decisões novas (os números das D), as armadilhas novas e as pendências que só o Douglas resolve.

Para a fase 13, acrescente o que o Douglas tiver deixado do teste dele.

**Enquanto ela roda**, um laço em segundo plano (Monitor ou `until`) a cada 30 min confere só sinais de vida: o processo (`pgrep -f native-binary/claude`), o último commit da `fase-N` (`git fetch && git log -1 --format=%cI origin/fase-N`), as execuções da CI e do laboratório (`gh run list --branch fase-N --limit 3`). Sem nenhum sinal novo em **3 h**, leia o fim da transcrição dela (`~/.claude/projects/-Users-douglas-Documents-dev-viajei/<session_id>.jsonl`, o `session_id` só sai no JSON do fim; antes dele, a transcrição mais recente que não é a sua) para entender onde ela está. Não a interrompa por estar lenta: um laboratório leva 45 min, cinco laboratórios seguidos levam quatro horas.

**Quando o processo termina**, leia o JSON: `is_error`, `stop_reason`, `num_turns`, `total_cost_usd`, `session_id` e `result` (o resumo final). Depois, os portões de saída.

### 1.4 O portão de saída

- A ponta da `fase-N` está na `origin/main` e há um commit `fase N: …`.
- A CI daquele sha verde; o último laboratório na produção verde, ou vermelho só no "medido, não cobrado" registrado.
- `docs/decisoes.md` tem a seção "Fase N" com D numeradas em sequência; `docs/fases/fase-N.md` e `docs/fases/orquestracao.md` foram commitados.
- A memória do projeto foi atualizada depois do fim da fase.
- O resumo final diz o que está no ar, os números e as pendências.

Se a sessão terminou **antes** disso:
- **terminou por conta própria com uma pendência** (bateu num limite da seção 2, um `--dry-run` destrutivo, risco de perder dados): leia o motivo. Se a pendência é do Douglas (uma chave, um contrato, um domínio, uma decisão que o plano não cobre), registre e veja o que da fase ainda dá para entregar sem ela; a fase-N.md já deve dizer (a 18 entrega sem o e-mail encaminhado se não houver domínio). Se nada mais dá, a fase fica incompleta e você aplica a regra das dependências (1.5);
- **morreu** (`is_error`, contexto esgotado, erro de rede, o processo caiu): retome a mesma sessão com `--resume <session_id>` e o texto "Continue a fase N de onde parou: leia o estado da branch fase-N, a CI, o laboratório e a seção da fase em decisoes.md antes de qualquer coisa; não refaça o que já está commitado". Até 3 retomadas; depois, uma sessão nova com a mesma fase-N.md e o mesmo texto de continuação. As fases são retomáveis por desenho: a branch, os commits, a CI e o `decisoes.md` são o estado;
- **terminou dizendo que acabou, mas um portão falha**: uma sessão curta com o que falta, uma vez. Se ainda falhar, pare a sequência e relate.

### 1.5 Dependências e pulos

Do plano: 13 → 14 → 15; 13 → 16 → 17 → 18; 16 → 19 → 20. Uma fase incompleta bloqueia as que dependem dela e não bloqueia as outras:
- a 14 incompleta pula a 15 e segue para a 16;
- a 16 incompleta pula a 17, a 18, a 19 e a 20: pare e relate;
- a 17 incompleta pula a 18 e segue para a 19;
- a 19 incompleta pula a 20.

Cada pulo vai para o relatório com o motivo. Nunca "resolva" uma dependência implementando você mesmo.

## 2. O que você faz e o que não faz

**Você faz:** o levantamento, o prompt de cada fase, a abertura e a retomada das sessões, os portões, o relatório, a memória. **Você não faz:** código, commits de código, correções à mão (se um portão falha, é uma sessão com um prompt preciso que corrige), duas fases ao mesmo tempo, mudanças no `fase-N.md` depois que a sessão dele abriu (se o plano mudou, é uma sessão nova com um prompt novo), nada na árvore de trabalho da pasta principal **enquanto uma sessão roda** (entre fases a pasta está parada, e aí você escreve o `fase-N.md` e o `orquestracao.md`, fora do git; a sessão seguinte os commita).

As sessões filhas são suas: falar com elas pelo texto de abertura e pela retomada é o seu trabalho. A regra de não mandar mensagem a **outras** sessões (o chat da fase 12, o do nome e marca, o de planejamento) continua.

**Os limites da seção 2 da fase-13.md valem para você e para cada filha**, e nenhuma abertura sua pode afrouxá-los: senha, contas, `.env*`, segredo no client, secrets e painéis, dados reais fora do expurgo, `db reset`/`--force`/force push, outra conta, gasto além do laboratório normal e do que cada fase prevê (a 17 e a 20 chamam a IA; o custo de cada uma está na própria fase).

## 3. A máquina, a cota e a duração

- **Dias, não horas.** Cada fase leva de 2 a 12 h; a sequência, alguns dias. O Mac fica no carregador, com a tampa aberta e `caffeinate -i -s -d` rodando; se o terminal em que você roda fechar, você morre com ele. O Douglas abre você num terminal (não na janela do VS Code) e não fecha.
- **A cota do GitHub Actions.** O repositório é privado: os minutos são contados (runners `ubuntu-latest`, 1×). Antes de cada fase, meça. O jeito certo é `gh api /users/dougedss/settings/billing/actions` (usados e incluídos no ciclo), mas ele exige o escopo `user` no `gh`, que só o Douglas concede (`gh auth refresh -h github.com -s user`, com login no navegador): **nunca rode isso você**. Sem o escopo, some os minutos do mês pelas execuções (`gh run list --repo dougedss/viajei --limit 500 --created ">=AAAA-MM-01" --json createdAt,updatedAt`) e compare com o plano que o Douglas disser na abertura (sem dizer, assuma 2.000 min, o do plano gratuito). Uma fase gasta uns 25 min por CI (uma por commit) e 45 min por laboratório; conte uns 400 min por fase comum e 700 pela 13 (os cinco laboratórios do rack). Se o que resta no ciclo não dá para a fase, **pare e relate**, em vez de começar e travar no meio: uma CI que não roda é um portão que nunca abre. O Douglas decide (tornar o repositório público, comprar minutos, esperar o ciclo).
- **O binário.** Se a extensão do VS Code atualizar no meio, o caminho antigo some: por isso você o resolve a cada abertura. Se não houver nenhum, use a ferramenta Agent com um agente de uso geral e o mesmo texto de abertura, como reserva: ele também começa com contexto limpo, e a fase é retomável do mesmo jeito.
- **O modelo** das filhas é o padrão da conta: não passe `--model`.

## 4. O relatório

`docs/fases/orquestracao.md`, na pasta principal, atualizado a cada portão: por fase, a hora de início e fim, o `session_id`, as retomadas, o sha na `main`, a CI, o laboratório na produção, o custo (`total_cost_usd`) e os minutos do Actions, as D novas, as pendências e os pulos. A sessão de cada fase o commita como está; o que você escrever depois da última fase fica fora do git, e o resumo final avisa.

**Ao fim da sequência** (ou quando parar), a memória do projeto com o estado (o que está no ar, por fase), e o **resumo final para o Douglas**, escrito para quem volta depois de dias fora:
1. o que está no ar, fase por fase, com o sha da `main`;
2. o que ficou incompleto ou foi pulado, e por quê;
3. o que só ele resolve, em ordem: o teste nos aparelhos (`docs/teste-final.md`), o nome e o domínio (a 18), o contrato do agregador (a 21), e o que mais as fases deixaram;
4. os números: custo, minutos do Actions, testes, as notas do Lighthouse;
5. onde está tudo: este relatório, as transcrições (`~/.claude/projects/-Users-douglas-Documents-dev-viajei/<session_id>.jsonl`), as D.
