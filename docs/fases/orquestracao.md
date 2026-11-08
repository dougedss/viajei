# Orquestração · as fases 13 a 20 (relatório)

> Relatório do orquestrador (`docs/fases/orquestrador.md`), atualizado a cada portão. O Douglas não
> estava presente: a autorização antecipada dele (seção 2 de `docs/fases/fase-13.md`) valeu para o
> orquestrador e para cada sessão aberta, com os mesmos limites. Datas e horas em São Paulo.

## Como ler

Cada fase tem: o portão de entrada (o que foi conferido antes de abrir a sessão), a sessão (hora de
início e fim, `session_id`, retomadas, custo), o portão de saída (o sha na `main`, a CI, o
laboratório na produção, as decisões, a memória) e o que ficou (pendências e pulos). O resumo final
para o Douglas fica no fim.

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
- **Fim:** _(a preencher)_ · `session_id`: _(a preencher)_ · retomadas: 0 · custo: _(a preencher)_

### Portão de saída
_(a preencher)_
