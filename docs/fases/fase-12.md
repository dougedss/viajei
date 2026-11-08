# Fase 12 · Polish e E2E

> Você é o agente de implementação da **fase 12**, a última do Viajei. Este chat faz esta fase e, se for preciso, termina a publicação da fase 11 (seção 1). **O Douglas não vai estar presente:** a seção 2 traz o ok antecipado dele e o que continua proibido mesmo assim. Ao terminar: o commit da fase, `docs/decisoes.md` e a memória atualizados, e um resumo final que diga o que ele testa nos aparelhos.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v3):
   - seção 2 (regras) e 3 (stack);
   - a regra da exclusão: **soft, só o dono; expurgo por job no servidor depois de 30 dias; viagem expurgada responde `revoked` no `sync_pull`**;
   - 5.1 e 5.2 (sync, outbox, cursores), 5.4 e 5.5 (conectividade, service worker);
   - 11 (design e UX: alvos de toque ≥ 48 px, contraste AA, Lighthouse);
   - 12 (linha da fase 12) e **13 inteira** (testes).
2. `docs/passo-0-delta-2026-11-04.md`: a matriz iPhone e Android, a linha da fase 12 e a C9 (`service_role` e o schema `private` para o job de expurgo).
3. `docs/decisoes.md` inteiro. Em especial:
   - D20 ("Sair da conta" apaga o banco local), D49 e D109 (que viagens o aparelho puxa), D53 (as lápides diárias do laboratório "que o expurgo leva"), D78 e D79 (o arquivo sobe antes da linha; o que o expurgo apaga no Storage);
   - a lista de FKs `on delete set null` da fase 8 e o `on delete set null` do XP (D112): o expurgo nunca apaga dinheiro, missão ou XP de ninguém em cascata;
   - D91 (onde se testa), D104 a D106 (tipos da CI, avisos de dois dias, preview), D108 (deploy das funções), D111;
   - tudo o que as fases 10 e 11 decidiram (D127 em diante).
4. Os roteiros manuais `docs/teste-manual-fase-4.md` a `docs/teste-manual-fase-11.md`: esta fase os junta num roteiro final.
5. Código: `supabase/migrations/` (as FKs e os `deleted_at` de cada tabela, a whitelist `private.sync_tables`, `sync_pull` e `sync_pull_user`), `src/lib/db/sync/{apply-pull.ts,engine.ts}` (como o `revoked` limpa o aparelho), `supabase/functions/send-notifications/index.ts` (o modelo de função chamada pelo `pg_cron` com a chave secreta do Vault), `playwright.config.ts`, `e2e/`, `.github/workflows/{ci,lab}.yml`, `scripts/lab/`, `README.md`.

## 1. Estado ao começar, e a fase 11

**Primeiro, antes de qualquer outra coisa:**
- Deixe o Mac acordado enquanto você trabalha: `caffeinate -i -s -t 86400` em segundo plano.
- Confira as identidades (regra global do Douglas): `gh auth status`, `ssh -T git@github.com` e `git config user.email`. A conta é **`dougedss`**, e o e-mail dos commits é `203018054+dougedss@users.noreply.github.com`. Se divergirem, pare: não contorne.

**Quando este prompt foi escrito (07/11/2026, 19h30):**
- a fase 10 estava na `main` (`e1ac046` `fase 10: importação com IA`, com a 0010 e as funções no hospedado);
- o chat da fase 11 rodava **na pasta principal** (`/Users/douglas/Documents/dev/viajei`), na branch `fase-11`. Ele já tinha o primeiro commit, `8448d71` `laboratório: o preview da branch volta`, e estava adaptando os navegadores novos ao preview;
- as decisões da fase 11 começam na D141;
- a abertura do chat da fase 11 manda ele **parar e esperar o Douglas** antes de aplicar a 0011, publicar a função e fazer o merge. Como o Douglas não vai estar, é provável que ele pare ali.

**A pasta principal é da fase 11.** Nela não faça checkout, stash, reset, branch, commit nem arquivo novo. Leia o código pelas refs remotas (`git show origin/fase-11:<caminho>`, `git show origin/main:<caminho>`).

**Trabalhe num worktree próprio:** `/Users/douglas/Documents/dev/viajei-fase-12`, pasta irmã fora do repositório, para o ESLint e o Prettier da fase 11 não o enxergarem. As armadilhas de worktree da fase 10:
- o `cd` do zsh é sobrescrito pelo gvm: use `builtin cd /Users/douglas/Documents/dev/viajei-fase-12 && ...`;
- o worktree não tem `.env.local`: carregue com `set -a && . /Users/douglas/Documents/dev/viajei/.env.local && set +a`. As regras negam ler, listar ou copiar `.env*`, mas carregar no shell funciona;
- copie `supabase/.temp` (project-ref e pooler-url, nada secreto) da pasta principal;
- os scripts `remote:*` leem `./.env.local`: rode o `supabase` direto, com o env carregado. Siga o que os scripts fazem, inclusive o `--use-api --import-map` do deploy (D108);
- o worktree `viajei-fase-10` é da fase 10, que terminou. Não o use nem o remova.

**Acompanhe a fase 11 com um comando em segundo plano** (Monitor, ou um laço `until` em segundo plano): `git fetch` a cada 5 minutos. Nunca use um laço de mensagens para isso. A cada volta, veja em qual estado ela está:

| Estado | Como reconhecer | O que você faz |
|---|---|---|
| **A · na `main`** | o commit de assunto `fase 11: mapa e clima` está na `origin/main` | Leia o que ela deixou em `decisoes.md` e na memória e siga para a fase 12. |
| **B · pronta e parada** | o commit `fase 11: mapa e clima` está na `origin/fase-11`; a CI desse sha está verde; a última execução do laboratório nessa branch (o preview) e nesse sha está verde, ou só falha no que depende da `send-notifications` nova, ainda não publicada (o `briefing` com clima); a branch não muda há 45 min ou mais | Termine a publicação dela (abaixo) e siga. |
| **C · trabalhando** | a branch mudou há menos de 45 min, ou há CI ou laboratório rodando nela | Espere. Enquanto isso, planeje e escreva a fase 12 no worktree, numa branch `fase-12` sobre a ponta da `origin/fase-11`. Nada vai ao hospedado nem à `main`. |
| **D · parada com erro** | CI ou laboratório vermelho no último sha, e a branch não muda há 2 h ou mais | Diagnostique pelo log (`gh run view <id> --log-failed`). Corrija na `fase-11`, num commit próprio que diga o que e por quê, a partir de um worktree seu saído da `origin/fase-11`, nunca da pasta principal. Depois, B. |

Para saber se o chat da fase 11 parou esperando o Douglas, você também pode ler a última mensagem dele na conversa mais recente em `~/.claude/projects/-Users-douglas-Documents-dev-viajei/*.jsonl`. Isso é só leitura. **Não mande mensagem a ele.**

**Terminar a fase 11 (estado B).** Antes de cada passo, confira que ele ainda não foi feito: o chat dela pode ter seguido sozinho. Use `supabase migration list` contra o hospedado, `gh run list` e a posição da `origin/main`.
1. `git merge-base --is-ancestor origin/main origin/fase-11`. Se não for ancestral, rebaseie a `fase-11` sobre a `main` num worktree seu e espere a CI verde de novo.
2. A 0011 no hospedado: o `db push` com `--dry-run`, leia o que ele vai aplicar e só então aplique.
3. As funções no hospedado (a `send-notifications` mudou), conferidas por leitura.
4. O laboratório no preview desse sha, se a função nova muda o `briefing`.
5. O fast-forward: `git push origin <sha da fase-11>:main`. Nunca force.
6. O laboratório na produção (`gh workflow run lab.yml --repo dougedss/viajei`). Se ele achar defeito da fase 11, corrija para a frente pela CI, ou reverta (seção 2).
7. Registre em `decisoes.md`, no começo das decisões da fase 12, uma nota curta: o que você fez pela fase 11 e com que números. Atualize o estado da fase 11 na memória.

**Só escreva a migration e faça o merge da fase 12 depois da fase 11 na `main`.** A 0012 tem de chegar ao hospedado depois da 0011, e as duas fases mexem no `lab.yml`, no `run.ts`, no README e no `decisoes.md`. Quando a fase 11 entrar, rebaseie a `fase-12` sobre a `origin/main`.

- **Onde se testa (D91):** nada roda neste Mac (nem Supabase local, nem Docker, nem as suítes, nem Playwright). A CI do GitHub roda em todo push das branches `fase-*`. O laboratório é o teste de aceitação: no preview da branch antes do merge e na produção depois. O teste nos aparelhos é do Douglas, uma vez, **depois desta fase**: o roteiro final (seção 3.6) é para esse dia.
- **Migration desta fase: `0012_expurgo.sql`**, a última.

### Armadilhas conhecidas (não redescubra)

**Ambiente e comandos**
- Na pasta principal (só leitura): `cd /Users/douglas/Documents/dev/viajei && ...`. No worktree: `builtin cd`. Começar por `export PATH` ou por `mkdir` dispara o hook do zsh que falha. Node: `PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH" pnpm ...`.
- `gh` está em `/opt/homebrew/bin/gh` e precisa de `XDG_CACHE_HOME` gravável (uma pasta no scratchpad). A API às vezes dá "error connecting" no `gh run watch`: use um laço com `gh run view`.
- A checagem do Bash recusa heredocs com `$$`: escreva SQL e scripts com a ferramenta Write. Heredoc de Python com acento pode falhar: escreva o script num arquivo.
- Conexão de leitura ao hospedado: o pooler `aws-1-sa-east-1.pooler.supabase.com`, porta 5432, usuário `postgres.iihwideuknnrpvtczxjs`, com `SUPABASE_DB_PASSWORD` do env carregado.

**CI e testes**
- Tipos do banco pelo artefato da CI (D104). Cada volta leva uns 9 a 10 minutos: junte mudanças e leia o log da falha antes de mexer.
- **Teste do Vitest que importa, mesmo por tabela, algo que carrega `lib/supabase/client.ts` quebra na CI.** Regra pura mora em módulo sem efeito colateral.
- O Vitest na CI não grava snapshot novo: escreva o esperado à mão.
- Datas de teste só por `e2e/helpers/dates.ts`; teste que não é da maquete abre o Modo Viagem com `?render=list`; `getByRole('heading', { name })` casa por substring (use `exact`).
- No SwiftShader da CI, a maquete e o filme são lentos: prazos longos, e o vídeo em 3D só tem o ritmo medido.
- Os e2e e o laboratório desligam os cartões de conquista (D119).
- Nenhuma chamada real à Anthropic, ao OSM ou ao Open-Meteo na CI.
- **O laboratório tem um grupo de concorrência só** (`laboratorio`, sem cancelar o que está rodando). Mas o GitHub cancela a execução que estava **na fila** quando outra chega. No estado C não dispare o laboratório. Depois, antes de cada disparo, confira com `gh run list --workflow lab.yml` que nenhuma execução da fase 11 está na fila.

**Código**
- React Compiler: não mute props, valores de hooks nem locais do render; estado mutável numa classe com métodos. `no-non-null-assertion` é erro em `src/`; para lookup em `Record` tipado, `Object.hasOwn`.
- Lápide some do aparelho no pull (`apply-pull.ts`). Por isso, apagar a lápide no servidor muda o que um aparelho atrasado sabe: veja a 3.1.
- `storage.objects` tem o trigger `protect_delete`. **Apagar a linha de `storage.objects` por SQL não apaga o arquivo:** o expurgo do Storage passa pela API do Storage.

## 2. A autorização antecipada do Douglas (07/11/2026)

Nas palavras dele: "com todos os acessos e permissões liberadas … pode subir e mergear tudo, pois eu não vou estar presente para autorizar nada". A mensagem de abertura deste chat repete isso. Vale para este chat, nesta fase e no fechamento da fase 11.

**Você pode fazer sem perguntar:**
1. Publicar o plano e seguir para o código sem esperar ok. Escolha pela recomendação deste prompt e registre cada escolha em `decisoes.md`.
2. Terminar a publicação da fase 11, nos estados B e D da seção 1, inclusive corrigir a `fase-11` em commits próprios.
3. Dar push nas branches `fase-11` e `fase-12`, rodar a CI e o laboratório, no preview e na produção, quantas vezes precisar. Cada laboratório faz uma leitura real da IA, de uns US$ 0,04.
4. No hospedado: aplicar a 0011, a 0012 e migrations corretivas desta fase (`db push`, sempre com o `--dry-run` antes e lido); publicar as funções; ligar o job do expurgo.
5. Dar fast-forward na `main` (push = deploy) com a CI verde **naquele sha** e o laboratório no preview verde **naquele sha**.
6. Se a produção quebrar depois de um merge e a correção não for rápida: `git revert` num commit novo, pela CI, até a produção voltar ao último estado verde.
7. Atualizar `decisoes.md`, a memória do projeto, o README e os roteiros.

**Continua proibido, mesmo com esse ok** (são regras de segurança, que o ok não desfaz):
- digitar a senha do Douglas em qualquer lugar, criar contas, ou ler ou escrever `.env*`;
- pôr chave secreta no client (Anthropic, ORS, chave secreta do Supabase, VAPID privada);
- criar, trocar ou apagar secrets (Supabase, GitHub, Vercel) e mexer em configurações de painel: Auth hospedado, proteção da Vercel, cobrança, limites;
- apagar dados reais por qualquer caminho que não seja a regra do expurgo. Isso inclui as viagens de teste do Douglas ("Teste", "Teste 3") e a viagem real `0faf1ff2-…`;
- `db reset`, `--force` ou qualquer comando destrutivo no hospedado; force push na `main` ou reescrever a história dela;
- usar outra conta GitHub ou conta de empresa cliente;
- mandar mensagem a outras sessões do Claude;
- gastar além do laboratório normal: nenhuma medição extra da IA e nenhum serviço pago novo.

**Quando parar.** Só quando seguir em frente exigiria quebrar uma regra acima, quando um `--dry-run` mostrar algo destrutivo que o plano não previa, ou quando houver risco de perder dados. Aí deixe a produção no último estado verde, escreva o relatório e pare. O que só o Douglas pode resolver vai como pendência no resumo final, nunca contornado.

## 3. Entregas

### 3.1 O expurgo (`0012_expurgo.sql`, função `purge`, job)
A parte mais delicada da fase: um erro aqui apaga dados de alguém, inclusive na viagem real de 11 a 14/12.
- **Viagens excluídas:** viagem com `deleted_at` há mais de 30 dias (a regra do prompt) sai do banco inteira: dias, paradas, reservas, listas, contatos, gastos, memórias, anexos, trilhas e participações.
  - XP e conquistas ficam (`trip_id` nulo, D112). Confira cada FK na DDL; nada de cascata que apague o que é de uma pessoa.
  - O aparelho que ainda a tiver recebe `revoked` no próximo pull. Prove no pgTAP.
- **Lápides de viagens vivas:** linhas com `deleted_at` antigo (as do laboratório, D53, e as de uso normal).
  - Ao sumir a lápide do servidor, um aparelho que não puxa há mais tempo que isso nunca saberia da exclusão e guardaria a linha para sempre. Por isso o expurgo grava um **horizonte** (a data de corte). O `sync_pull` e o `sync_pull_user`, chamados com um cursor anterior ao horizonte, respondem **`resync`**.
  - No `resync`, o aparelho apaga daquela viagem as linhas já sincronizadas, **nunca o que está na outbox ou em `uploads`**, zera o cursor e puxa de novo, sem perguntar e sem perder nada pendente.
  - Os caches recalculáveis (`routes`, `weather`, `travel_state`, `blobs`) ficam.
  - Vitest em `apply-pull`, pgTAP do horizonte e um e2e do aparelho atrasado.
  - **Recomendação: 90 dias para as lápides de viagens vivas.** Elas são pequenas, e com 90 dias o primeiro corte cai em fevereiro de 2027, depois da viagem real. O mecanismo fica pronto e testado, e o primeiro `resync` de verdade não acontece no meio da viagem.
- **Storage:**
  - os arquivos das viagens expurgadas;
  - os objetos sem linha viva em `attachments` com mais de 7 dias, pela D79. A folga existe porque o arquivo sobe antes da linha (D78): um objeto novo sem linha pode ser um envio a caminho.
  - Sempre pela API do Storage, na Edge Function.
- **Registros do servidor:** `notifications_sent`, `edge_calls`, `ai_imports`, `lab_runs`, `lab_checks` e `lab_inbox` crescem sem fim. Recomendação: 90 dias, conferindo que nada depende de mais (o dedupe dos avisos, o limite de 24 h da `edge_call`, o painel `/lab`).
- **Como roda:**
  - uma Edge Function `purge` com `withSupabase({ auth: 'secret' })` e `verify_jwt = false`, chamada pelo `pg_cron` todo dia às 4h de São Paulo com a chave do Vault, como a `send-notifications`. A C9 diz o que o `service_role` precisa;
  - a parte do banco numa função SQL com os cortes como parâmetros;
  - o log é uma linha com as contagens, nunca conteúdo;
  - com **`dry_run`**, devolve as contagens sem apagar nada.
- **No hospedado:** a primeira chamada é `dry_run`. As contagens vão para a decisão. Hoje nada deveria se qualificar, porque o app existe desde 04/11. Se qualificar, entenda antes de ligar o job.

### 3.2 Playwright completo
- **O fluxo principal de ponta a ponta**, num spec só, como uma pessoa: criar a viagem, montar o roteiro, abrir o Modo Viagem, Partiu! e Chegamos!, "Como foi?", gasto e lista, e chegar à retrospectiva.
- **O offline com `context.setOffline(true)`** no meio do uso:
  - criar e editar sem sinal, o "N pendentes", a volta da rede e o servidor com tudo;
  - recarregar sem rede no projeto `pwa`;
  - a foto sem sinal, que já tem e2e.
- **Um projeto WebKit com o perfil do iPhone 15**, o mais perto do Safari que a CI tem, para o fluxo principal e o offline. Onde a maquete não tiver WebGL lá, ele vai pela lista. Meça quanto tempo isso soma à CI e decida o recorte.
- Antes de escrever, compare a suíte atual com a lista da seção 13 do prompt. Escreva o que falta; não reescreva o que já cobre.

### 3.3 Acessibilidade
- `@axe-core/playwright` em todas as rotas, nos dois temas. Zero violações `serious` ou `critical`; as `moderate`, corrigidas ou explicadas.
- Contraste AA nos tokens (o branco sobre o laranja só em texto grande, como o prompt diz).
- Alvos de toque ≥ 48 px, foco visível e em ordem, nome acessível em todo botão de ícone.
- O `prefers-reduced-motion` em tudo que anima.
- Texto do Modo Viagem ≥ 17 px e +10% à noite.
- O que só o aparelho prova vai para o roteiro final: VoiceOver, TalkBack e o texto ampliado do sistema.

### 3.4 Lighthouse e desempenho
- **A categoria PWA saiu do Lighthouse na versão 12.** Confira na versão atual. Se não existir mais, a meta do prompt ("PWA acima de 90") vira os critérios de instalação, conferidos pelo laboratório: o `Page.getInstallabilityErrors` do CDP vazio, o manifest e o service worker. Registre a divergência.
- **No laboratório**, no preview e na produção, com a sessão do lab-a e o perfil de celular. As rotas: `/entrar`, a lista de viagens, a visão geral, o roteiro do dia e o Modo Viagem com `?render=list`.
  - Desempenho, acessibilidade e boas práticas ≥ 90, pela mediana de 3 execuções, porque a máquina do GitHub varia.
  - As notas vão para o `data` do cenário. Abaixo da meta, o cenário fica vermelho.
  - A maquete em WebGL por software não representa um celular: a rota 3D sai da meta de desempenho, e isso fica registrado.
- Se faltar desempenho, o caminho está no build: o chunk principal tem uns 503 KB (164 KB gzip). Rotas lazy, preload das fontes, imagens.

### 3.5 Segurança e revisão final
- **Um passo na CI** que reprova o build se o `dist/` contiver um segredo: `sb_secret_`, `sk-ant-`, um JWT com `service_role` ou a chave VAPID privada.
- **Os avisos de segurança e desempenho do banco**, em leitura (o `supabase db lint` na CI e os advisors do projeto hospedado, se a CLI os ler). Corrija o que for desta casa: `search_path` de função, índice de FK.
- `pnpm audit` das dependências. Atualize só o que tiver correção de segurança, com versão exata publicada há duas semanas ou mais.
- O aviso `THREE.Clock` deprecado e o que mais o console mostrar em uso normal.

### 3.6 O roteiro final e o README
- **`docs/teste-final.md`:** os roteiros das fases 4 a 11 num só, na ordem em que uma pessoa usa o app, primeiro no iPhone e depois no Android. Junte a matriz do prompt:
  - instalação, push com o app fechado, ações no Android, selo;
  - WebGPU e WebGL2, fps da maquete e da garagem (os números que faltam na D64 e na D75), Wake Lock, geolocalização;
  - vídeo, compartilhar;
  - mapa sem rede, clima;
  - VoiceOver e TalkBack.

  Cada item com o que observar e onde anotar. Diga quanto tempo leva e quando fazer: antes de 11/12, e de preferência a partir de 26/11, quando o clima da viagem real já aparece. Os roteiros por fase ficam, com um aviso apontando para o final.
- **README completo:**
  - o que é;
  - a arquitetura em uma página;
  - rodar e testar (D91);
  - laboratório, produção e deploy;
  - contas e segredos (onde cada um mora, nunca o valor);
  - custos (IA, laboratório);
  - atribuições: OSM, Open-Meteo, Nominatim, IBGE, Natural Earth;
  - licenças que pedem atenção (`react-leaflet` Hippocratic-2.1, `mediabunny` MPL-2.0);
  - **o calendário de manutenção:** o token `viajei-cli` vence em 02/02/2027, o crédito da Anthropic é por ciclo do Ultra, e o que fazer quando cada um acabar.

### 3.7 O laboratório desta fase
- Os cenários do expurgo:
  - um `dry_run` diário, só com as contagens, que confere que a função responde e que nada fora da regra se qualifica;
  - o `resync` provado com um aparelho de laboratório atrasado, se der para fazer sem mexer no horizonte de verdade (por exemplo, uma viagem do laboratório e um cursor forjado no Dexie).
- O Lighthouse da 3.4.
- Primeiro no preview, depois na produção.

### 3.8 Documentação
- `docs/decisoes.md`, da próxima decisão livre em diante:
  - a nota do fechamento da fase 11, se você o fez;
  - os cortes do expurgo e o porquê de cada um;
  - o horizonte e o `resync`;
  - o Storage pela API;
  - os registros do servidor;
  - o projeto WebKit;
  - o Lighthouse sem a categoria PWA;
  - as metas e os números medidos.

## 4. Como trabalhar nesta fase

1. **Comece agora,** sem esperar a fase 11: caffeinate, identidades, leitura, e o plano publicado como mensagem. O plano tem:
   - o estado da fase 11 (A a D) e o que você vai fazer por ela;
   - a DDL da 0012 e o desenho da função `purge`, com os cortes;
   - o `resync` passo a passo;
   - o que entra na suíte, inclusive o projeto WebKit;
   - acessibilidade, Lighthouse e segurança;
   - o roteiro final e o README;
   - os cenários do laboratório.

   Não espere ok: siga pela recomendação deste prompt.
2. **Enquanto a fase 11 trabalha (estado C):** escreva no worktree, na `fase-12` sobre a ponta da `origin/fase-11`. Pode dar push da `fase-12` para a CI rodar. Nada vai ao hospedado nem à `main`.
3. **Quando a fase 11 estiver pronta e parada (B), ou parada com erro (D):** termine a publicação dela pela seção 1.
4. **Com a fase 11 na `main`:**
   - rebaseie a `fase-12` sobre a `origin/main` e confira `git merge-base --is-ancestor origin/main HEAD`;
   - CI verde;
   - o laboratório no preview, verde;
   - a 0012 no hospedado, com o `--dry-run` lido, e a função `purge` publicada;
   - a primeira chamada em `dry_run`, com as contagens registradas, e só então o job ligado;
   - o fast-forward na `main`;
   - o laboratório na produção. Se ele achar defeito, corrija pela CI ou reverta (seção 2).
5. **Commits na `fase-12`:** `fase 12: polish e E2E`, com este prompt (`docs/fases/fase-12.md`). Ele nasceu fora do git na pasta principal: se o commit da fase 11 não o levou, copie-o para o worktree, sem mudança. Os do laboratório e as correções de testes antigos podem ter commits próprios, com mensagem em português que diga o porquê, como nas outras fases.
6. **Ao terminar:**
   - `decisoes.md`, README e roteiro final atualizados;
   - a memória do projeto com o estado final: o que está no ar, os números, as armadilhas novas e as pendências que só o Douglas resolve;
   - um **resumo final para o Douglas, escrito para quem volta depois de horas fora:**
     - o que foi publicado da fase 11 e da 12;
     - o laboratório na produção;
     - o que ele precisa fazer, em ordem: o roteiro final nos aparelhos, e qualquer pendência que exija ele;
     - o que mudou no ar enquanto ele estava fora.
7. **Regras permanentes:**
   - elegância sobre velocidade; experiência acima do custo;
   - não é jogo nem GPS;
   - iPhone primeiro, Android igual;
   - offline primeiro: o `resync` nunca perde o que está pendente;
   - nunca inventar;
   - nenhum segredo no client;
   - a autorização da seção 2 e os limites dela;
   - nada roda no Mac: o teste é na web.
