# Viajei

PWA offline-first para planejar e, principalmente, **seguir** roteiros de viagem de carro: tudo da viagem num lugar, legível sem sinal, com a maquete 3D do dia, "sair às HH:MM", notificações e uma experiência gamificada. Nunca um GPS.

Fonte de verdade do projeto: [`docs/prompt-implementacao.md`](docs/prompt-implementacao.md). Decisões técnicas, uma por registro: [`docs/decisoes.md`](docs/decisoes.md).

## Rodar localmente

Pré-requisitos: Docker Desktop aberto, [nvm](https://github.com/nvm-sh/nvm) e pnpm.

```sh
nvm use                      # Node 22.23 (.nvmrc); react-router 8 exige 22.22+
pnpm install
pnpm db:start                # Supabase local: Postgres, Auth, Storage, Realtime, Mailpit
cp .env.example .env.local   # cole a URL e a publishable key que o db:start imprimiu
pnpm dev                     # http://127.0.0.1:5173
```

Usuários locais (senha `viajei123`): `dono@viajei.local`, `convidado@viajei.local` (tem um convite pendente) e `intruso@viajei.local`. E-mails de confirmação e de recuperação de senha (templates em pt-BR, `supabase/templates`) chegam no Mailpit: http://127.0.0.1:54324.

Para ver o PWA de verdade (service worker, instalação, offline da casca, **push**): `pnpm build && pnpm preview`. Em `pnpm dev` o service worker fica desligado de propósito.

## Avisos (push) e como testar localmente

A viagem roda no servidor: a cada minuto o `pg_cron` pergunta ao banco o que vence (`due_notifications`), reserva de forma atômica (`claim_due_notifications`) e, só quando há algo, chama a Edge Function `send-notifications` pelo `pg_net`, com a chave secreta do projeto no cabeçalho `apikey`. A função escreve o texto (`supabase/functions/_shared/notifications.ts`) e envia por Web Push (VAPID) um payload que o Safari lê sozinho (Declarative Web Push) e que o service worker (`src/sw.ts`) transforma em notificação com botões no Chrome. Partiu! e Chegamos! pelo botão da notificação gravam pela mesma `mutate` da tela e tentam enviar a fila, com o app fechado.

Para testar com o Chrome do computador (ele recebe Web Push de `localhost`):

1. `pnpm vapid:generate` uma vez; cole as duas linhas em `.env.local` e acrescente `VAPID_SUBJECT=mailto:...`.
2. `pnpm db:reset` (aplica as migrations e grava `viajei_project_url` e `viajei_secret_key` no Vault local pelo `db:vault-local`).
3. `pnpm functions:serve -- --env-file ./.env.local` (a edge-runtime local; o cron chega nela por `host.docker.internal`).
4. `pnpm build && pnpm preview`, abra http://localhost:4173, entre, abra uma viagem com dia hoje, ative os avisos em `/viagens/:id/avisos`.
5. Crie uma parada cujo "sair às" seja daqui a poucos minutos. No minuto certo, o cron chama a função e a notificação chega; `select * from notifications_sent` mostra o status.

Sem navegador: `curl -X POST http://127.0.0.1:54321/functions/v1/send-notifications -H "apikey: <SECRET_KEY do supabase status>"` devolve `{ claimed, sent, failed, no_subscription }`. Roteiro de teste nos aparelhos: [`docs/teste-manual-fase-4.md`](docs/teste-manual-fase-4.md).

## Como o offline funciona

O Dexie (IndexedDB) é a fonte de verdade da tela. Toda escrita passa por `mutate` (`src/lib/db/mutate.ts`), que atualiza a linha local e enfileira a operação na `outbox` **na mesma transação**, com ou sem rede. O motor de sync (`src/lib/db/sync/engine.ts`) funde e ordena a fila, chama `sync_push`, depois `sync_pull_user` e `sync_pull` por viagem, e aplica o resultado numa transação; outros aparelhos recebem um aviso pelo Realtime e puxam. O chip no cabeçalho mostra "Sem conexão" ou "N pendentes" e abre a lista com tentar de novo e descartar.

## Laboratório (testes automáticos na produção)

Um agente que exercita a tela apagada de ponta a ponta, na produção, sem ninguém pegar no celular. Roda todo dia às 3h07 de Brasília nas máquinas do GitHub Actions (`.github/workflows/lab.yml`) e quando alguém pede (`pnpm lab:remote`, ou Actions → Laboratório → Run workflow). O resultado aparece no painel **`/lab`** do app (link no Perfil para quem tem acesso); se algo falhar, o job fica vermelho e o GitHub avisa por e-mail.

Como funciona: o executor (`scripts/lab/run.ts`) entra como dois usuários de laboratório (`lab-a@viajei.invalid`, `lab-b@viajei.invalid`), monta quatro viagens de hoje com horários a poucos minutos pelas mesmas RPCs do app, e assina o push com chaves geradas na hora. Os endpoints apontam para a Edge Function `push-receiver`, um push service de mentira que confere o VAPID como o FCM ou a Apple confeririam e guarda a mensagem cifrada. O cron de verdade chama o `send-notifications` de verdade; o executor decifra o que chegou (RFC 8291) e confere os cenários do servidor: preparo, entrega e atraso, "sair em" e "hora de sair", fechamento, briefing, time, avisos desligados, repetição, aparelho que saiu (410 → `failed_at`), VAPID e payload.

Em paralelo, um Chromium (perfil de Android) faz o roteiro manual no app publicado (`scripts/lab/app.ts`): entra, abre o "Agora", ativa os avisos pela folha, fecha o app, recebe no service worker o "Hora de sair" que o servidor mandou, toca em **Partiu!** na notificação (a saída chega ao servidor com o app fechado), reabre, vê "Desde a última vez", deixa a posição no destino marcar **Chegamos!**, liga e desliga o modo painel e baixa o `.ics`. Só o registro no FCM e o dedo na notificação são simulados (D55). Tudo fica nas viagens dos usuários de laboratório; nada toca as viagens reais nem os seus aparelhos. Continua manual: a entrega pela Apple e pelo FCM, o selo no ícone, Wake Lock e GPS de verdade.

Desde a fase 8, um segundo Chromium entra como `lab-b` e os dois fazem também o roteiro das fases 7 e 8 (`scripts/lab/app-road.ts`): fechar as listas e ver "Pronto para partir" nos dois aparelhos, adicionar e dispensar sugestões, a missão feita pela folha "Como foi?", os `href` de ligar e WhatsApp e a emergência, o "+ Gasto" e a barra do orçamento, a reserva com print e PDF aberta sem rede, a foto sem sinal que sobe quando a rede volta e aparece no diário do outro, e "Sair" com foto pendente. Dois avisos se conferem em dois dias (`scripts/lab/armed.ts`, exceção à D53): uma execução arma a véspera e o prazo de cancelamento, o cron manda às 19h e às 10h, e a execução seguinte confere o texto e arma o próximo ciclo (D105). O laboratório testa o preview da branch antes do merge (`-f alvo=preview`, com o bypass da Vercel e o mesmo banco) e a produção depois (D106).

| Comando                                                         | O que faz                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm lab`                                                      | roda o laboratório contra a produção daqui (lê `~/.config/viajei/lab-secret`)                                        |
| `pnpm lab:remote`                                               | dispara o agente no GitHub Actions agora                                                                             |
| `pnpm lab:setup --target production --viewer <e-mail> --github` | uma vez: cria os usuários de laboratório, dá acesso ao painel e grava `LAB_SECRET` nos secrets do GitHub             |
| `pnpm lab:local`                                                | o mesmo contra o Supabase local (precisa de `functions:serve` com VAPID; afrouxa o check de https só no banco local) |

## Maquete 3D

O Modo Viagem desenha o dia como uma maquete vista de cima (`src/features/world`): o traçado em S entre as paradas, o relevo do perfil de altitude real, o cenário lido da geografia (`lib/geo`), o carro da viagem (`src/art/cars`) e, em HTML por cima, as pílulas das paradas. A câmera fica parada com o dia inteiro na tela e só mergulha nas curiosidades do caminho. Motor: `three/webgpu` (WebGPU no iOS 26 e no Chrome recente, WebGL2 nos demais) com React Three Fiber, render sob demanda (parado, zero quadros) e dois níveis de qualidade (Leve e Alta, automático com rebaixamento por fps). Tudo do 3D entra por `lazy()` num chunk próprio, só quando a maquete vai aparecer.

- **Forçar a lista:** `?render=list` na URL do Modo Viagem, ou "Ver como lista" no rodapé de "Lista do dia" (fica guardado no aparelho; "Ver a maquete" desfaz). Sem WebGL2 a lista aparece sozinha, com "Maquete indisponível neste aparelho".
- **Chip de diagnóstico:** em dev, ou com `?diag=1` em produção. Mostra fps (só em movimento), motor, qualidade e nível; toque alterna Auto → Leve → Alta. Os chips menores forçam noite, WebGL2 e o som.
- **Medir fps no iPhone:** abra `/viagens/<id>/viagem?diag=1`, toque em "Rever o dia" e leia o chip durante o movimento, em Alta e em Leve. Roteiro completo em [`docs/teste-manual-fase-5.md`](docs/teste-manual-fase-5.md).
- **Replay ao abrir:** o carro repõe o que aconteceu desde a última vez que este aparelho viu a maquete (`travel_state`); com "reduzir movimento", o card "Desde a última vez" é o que aparece.

## Garagem

`/viagens/<id>/garagem`, aberta pelo carro no topo da visão geral. É um showroom 3D (`src/features/garage`): o carro da viagem gira num disco sob luz de estúdio. Arrastar na horizontal gira, na vertical inclina, e pinçar (ou a roda do mouse) aproxima. Embaixo ficam as linhas Modelo, Pintura e Acessórios.

- **Os carros:** cinco modelos por código (`src/art/cars`), cada um um `CarProfile`: o contorno lateral, as rodas, os vidros e as âncoras dos acessórios. O mesmo perfil gera o 3D (`buildCar`) e a vista lateral em SVG (`CarSide`), usada no card da viagem, no topo da visão geral e na garagem sem 3D.
- **O que está liberado:** vem do progresso do time (`useTeamProgress`): o maior nível e a união das conquistas dos membros aceitos. Até a fase 9 todo time está no nível 1, sem conquistas. Tocar em algo bloqueado abre a **prévia**, com o selo "Prévia" e a frase do que falta; a prévia nunca grava. O que a viagem já usa continua, mesmo que o progresso de agora não o libere.
- **Persistência:** cada escolha grava só a coluna tocada (`car_model`, `car_color` ou `car_accessories`) pela outbox, e funciona offline.
- **Sem 3D:** `?render=list`, ou um aparelho sem WebGL2, mostra a mesma tela com a vista lateral grande no lugar do palco.
- **Chip de diagnóstico:** em dev, ou com `?diag=1` em produção, como na maquete (fps, motor, qualidade; WebGL2 forçado; som). O nível de qualidade é um só por aparelho para as duas cenas.
- **Tudo liberado:** `?garagem=tudo` libera os cinco modelos, o dourado e todos os acessórios para conferência visual. Só existe em `pnpm dev`; o build de produção nem contém o código.
- Roteiro de teste nos aparelhos: [`docs/teste-manual-fase-6.md`](docs/teste-manual-fase-6.md).

## Fotos e anexos

As fotos das memórias ("Como foi?", no Modo Viagem e no diário) e os prints e PDFs das reservas ficam no bucket privado `attachments` do Storage, em `{viagem}/{anexo}.{ext}`, e abrem sem sinal a partir de uma cópia no aparelho (`src/lib/media`).

- **Tamanhos:** a foto vira JPEG de até 1600 px e cerca de 400 KB (sem EXIF, inclusive sem a localização); o print de reserva vira JPEG de até 2400 px, qualidade 0,9; o PDF vai como está, até 10 MB. A compressão roda num worker e não depende de rede. HEIC que o navegador não abre recebe uma frase clara. Cada foto leva um thumbhash (o borrão que aparece antes do arquivo chegar).
- **Fila de envio:** a foto entra na hora, mesmo sem sinal, e aparece com o selo "aguardando sinal". Quando há rede, o arquivo sobe primeiro e só depois a linha nasce em `attachments` pela outbox. O servidor nunca tem linha sem arquivo. No Android, o service worker envia quando o sinal volta, mesmo com o app fechado (Background Sync); no iPhone, na próxima abertura. As fotos pendentes contam no "N pendentes" do cabeçalho, e um envio recusado aparece em Pendentes com "Tentar de novo" e "Descartar".
- **Cache no aparelho:** ao abrir uma viagem em andamento ou futura com rede, o app baixa os anexos que faltam, documentos primeiro. Os de viagens passadas baixam quando aparecem. O despejo nunca tira anexo de viagem em andamento ou futura; das passadas, saem primeiro as fotos menos usadas, até caber no orçamento (o menor entre 1 GB e 40% da cota do navegador). Nada disso vai para o cache do service worker.
- **Limpar no aparelho:** sair da conta apaga tudo (e avisa se há foto não enviada). Para liberar espaço sem sair: no iPhone, Ajustes › Safari › Avançado › Dados de Sites (ou apagar o app da tela de início); no Android, Chrome › Configurações do site › Armazenamento. Tudo volta do servidor na próxima abertura com rede.
- **PDF no iPhone instalado:** abre num visualizador próprio (pdf.js, carregado só quando um PDF abre e guardado no precache), porque o Safari no modo app não abre PDF de Blob. "Compartilhar" leva a outro app ou a Arquivos.
- **Testes:** `pnpm test:e2e` tem dois projetos: `iphone` (Vite de dev) e `pwa` (o build pelo `vite preview`, com service worker, para os testes que recarregam sem rede). Rode `pnpm build` antes. Roteiro nos aparelhos: [`docs/teste-manual-fase-7.md`](docs/teste-manual-fase-7.md).

## Listas e missões

`/viagens/<id>/checklists`, com três abas: **Antes de viajar**, **Mala** e **Missões** (`src/features/checklists`), cada uma com o seu anel. Adicionar é um campo no fim da lista (Enter adiciona e mantém o foco, para digitar a mala de uma vez); marcar é um toque grande que grava quem e quando, na cor da pessoa; reordenar é pela alça (um arrasto, um patch na posição fracionária) ou por Subir e Descer no menu do item; excluir tem Desfazer. Tudo offline, pela outbox.

- **Pronto para partir:** quando Antes e Mala chegam a 100% antes do início, o cartão com confete e sino aparece uma vez por viagem e aparelho. Na visão geral, os dois anéis e "Fechem as duas listas até 10/12 para ganhar a mala de teto" enquanto falta algo; o selo depois. O cartão é a comemoração da conquista "Pronto para partir": a mala de teto vai no rack, e o "Usar no carro" aparece quando o rack já está liberado.
- **Sugestões por regra, calculadas e não gravadas** (`suggestions.ts`): uma missão por parada pelo tipo dela (natureza, vinícola, comida, cidade, evento; 10 a 20 pontos) e itens de mala pela geografia das rotas guardadas no aparelho (praia, serra) e pelas paradas de natureza. Aparecem esmaecidas, com "Adicionar" e "Dispensar"; só o toque grava, com id determinístico, e a dispensada nunca volta (é um status da linha, não uma lápide).
- **Na estrada:** a folha "Como foi?" e a lista do dia mostram as missões da parada com "Feito". Nenhuma missão premia velocidade nem exige quem dirige; a de vinícola registra rótulo e foto, nunca consumo.
- **O aviso de véspera** (19h do dia anterior) diz o que falta: "Amanhã é dia de viajar" · "3 itens de antes e 2 da mala faltando", e abre a lista que falta.

## Contatos

`/viagens/<id>/contatos` (`src/features/contacts`): os contatos da viagem por tipo, com **Ligar** (`tel:`) e **WhatsApp** (`wa.me`, só para celular) em botões de 48 px. O telefone é digitado à brasileira e vira E.164.

- **Emergência sempre no topo:** SAMU 192, Bombeiros 193, Polícia Militar 190 e Polícia Rodoviária Federal 191, como constantes (sem cadastro e sem internet; ligar só precisa de sinal de voz).
- **Os telefones das reservas aparecem sozinhos**, marcados "da reserva", sem repetir o número que já é um contato.
- **Salvar no celular:** um `.vcf` (vCard 3.0, gerado à mão) de um contato ou de todos, pela folha de compartilhar ou por download.

## Gastos

`/viagens/<id>/gastos` (`src/features/expenses`): a barra do total contra o orçamento da viagem (verde até 80%, âmbar até 100%, vermelha acima, sempre com o valor e a porcentagem em texto), os totais por categoria e a lista por dia com quem pagou na cor da pessoa. As somas são em centavos.

- **"+ Gasto" no Modo Viagem:** um botão discreto ao lado de "Modo painel" abre o formulário já com a data do dia, a parada em que vocês estão e a categoria pelo tipo dela (na estrada, combustível). Nunca abre sozinho.
- **"Lançar como gasto" na reserva com valor:** cria o gasto ligado à reserva com id determinístico `v5(reservation_id, 'expense')`; dois aparelhos que lançam a mesma reserva escrevem a mesma linha. Lançado, o botão diz "Gasto lançado" e leva a ele.

## Progressão

XP, níveis e as 15 conquistas (`src/features/progression`), sem ranking: a equipe conquista junto.

- **Derivado dos dados, gravado como somente-anexar.** `rules.ts` (puro) recebe o que o aparelho sabe e devolve o conjunto inteiro de XP e conquistas da pessoa; o motor (`engine.ts`) grava só o que falta, pela outbox, com id determinístico (`v5(user_id, kind:ref_id)`, `v5(user_id, 'achievement:' || key)`). Desmarcar não tira XP, remarcar não dá de novo. Cada aparelho grava o da própria pessoa; o "todo o time" sai do estado compartilhado.
- **A janela do Desfazer:** nada é gravado enquanto a ação tem menos de 12 s; um Partiu! desfeito não vira conquista. O "+10" aparece na hora, perto do botão.
- **Nível:** cada pessoa pela soma do próprio XP (0, 150, 400, 900, 2000); o time (o que o carro usa) pelo maior nível dos membros, com os outros vindo do resumo público no perfil (`profiles.xp_total`, `achievement_keys`, mantidos por trigger). Barra na visão geral (o time) e no Perfil (a pessoa, com as conquistas e o que falta em cada uma).
- **O cartão de desbloqueio** sai num momento calmo (abrir a visão geral, a garagem ou o perfil; fechar a "Como foi?" sem o modo painel), um por vez, nunca por cima de outra folha: o carro da viagem com o acessório encaixando, confete, sino e vibração, "Usar no carro" e "Agora não". A primeira derivação de um aparelho vira um resumo calmo na página. Os cartões têm um toggle por aparelho em Avisos.
- **Regras e divergências:** `docs/decisoes.md`, D112 a D120 (inclusive "Pé na areia" a 3 km do mar e a pontualidade só com hora real).

## Retrospectiva

`/viagens/<id>/retrospectiva` (`src/features/retrospective`), do dia seguinte ao fim em diante, quando a viagem teve parada concluída. Às 9h desse dia chega o aviso "A retrospectiva da viagem está pronta".

- **O filme "Viajei!", 15 s:** a maquete da viagem inteira (as rotas dos dias emendadas, a trilha gravada onde existe), a câmera descendo até o carro, o sobrevoo com o chip de cada dia, as fotos e as missões nos nós, e o card final com dias, paradas, horas de estrada e km (só dos trechos rodados, pela rota real), o gasto contra o orçamento, as conquistas da viagem e o time. `planFilm` é puro e testado. Com reduzir movimento, sem WebGL ou com `?render=list`, a sequência de cards.
- **Vídeo vertical de 15 s, 1080 × 1920, sem som:** quadro a quadro, pelo relógio do filme, num alvo fora da tela, codificado pelo WebCodecs (H.264 em MP4; VP9 em WebM onde não há H.264; MediaRecorder só sem WebCodecs), montado pela `mediabunny` num chunk carregado só ao exportar.
- **Cards como imagem:** abertura, números, conquistas e fotos, em feed (4:5) e stories (9:16), desenhados em Canvas 2D pelo mesmo código do filme.
- **Compartilhar:** a folha com os arquivos onde o aparelho aceita; senão, download. Tudo funciona sem sinal.

## Importar com IA

`/viagens/<id>/importar` (`src/features/import`): a pessoa cola o roteiro (a conversa do WhatsApp, as notas, os e-mails de reserva), a IA lê e o roteiro aparece aos poucos. Nada entra na viagem sem a revisão.

- **Entradas:** "Criar e colar roteiro" no formulário de viagem nova, "Colar roteiro" na visão geral de uma viagem vazia e "Acrescentar de um texto" no Roteiro. A importação acrescenta e nunca apaga.
- **A função `import-itinerary`:** `claude-sonnet-5-5` com saída estruturada (o JSON Schema derivado do `importSchema`, sem coordenadas), `effort` médio e `fallbacks: "default"`. Roda como a pessoa (RLS vale, sem chave secreta do Supabase), repassa o JSON por SSE e para em 140 s (o limite do plano Free é 150 s). O texto colado e a resposta nunca vão para log nem para o banco: `ai_imports` guarda só o tamanho, os tokens, o modelo, o estado e um código curto.
- **Limites:** 30.000 caracteres por leitura e 20 leituras por pessoa em 24 h, pela mesma `edge_call` da rota (com trava contra corrida). A recusa diz a hora em que a cota volta.
- **Revisão:** cada parada, reserva, contato, item e missão entra ou não; campo vazio fica vazio ("sem horário no texto"); um dia fora das datas pede ampliar a viagem ou deixar de fora; parada repetida é marcada; cada "não classificado" vai para onde a pessoa mandar. O lugar vem de um link do Maps no texto ou da busca do Nominatim (1 por segundo, com cache), com escolha quando os resultados se espalham. O rascunho e a revisão ficam no aparelho até salvar.
- **Salvar:** uma transação da `mutate` (`mutate.batch`), pela outbox; paradas e itens com `source: 'ai'`. A parada importada é o fato da conquista "Planejador". O carregador da viagem de exemplo (só em desenvolvimento) passa pelo mesmo caminho, sem IA.
- **Custo:** perto de US$ 0,05 por importação do tamanho do seed (estimativa; o número medido entra em `docs/decisoes.md`, D140). O laboratório lê um roteiro curto por dia.
- **A chave:** `ANTHROPIC_API_KEY`, da conta pessoal do Douglas (workspace Viajei, com limite de gasto), mora só em `supabase secrets` (`pnpm remote:secrets-push`). A CI não tem a chave: a função é testada com respostas gravadas e o e2e intercepta a rede.
- **Decisões:** `docs/decisoes.md`, D127 a D140.

## Onde se testa (sem stack local)

Nada roda neste Mac (D91). O caminho de uma fase:

1. **CI da branch** (`.github/workflows/ci.yml`, em todo push de `fase-*`): lint, formatação, pgTAP, tipos do banco, tipos, Vitest, build e Playwright, no Supabase que a própria CI sobe.
2. **Tipos do banco:** quando uma migration muda o schema, a CI gera o `src/lib/supabase/database.types.ts`, guarda como artefato `tipos-do-banco`, roda o resto com ele e falha no fim. Baixe e commite: `gh run download <id> -n tipos-do-banco -D src/lib/supabase`.
3. **Hospedado:** com a CI verde e o ok, `SUPABASE_YES=1 pnpm remote:db-push` e `SUPABASE_YES=1 pnpm remote:functions-deploy`.
4. **Laboratório no preview:** com a CI verde, `gh workflow run lab.yml --repo dougedss/viajei --ref fase-N -f alvo=preview`. O navegador abre o preview da branch na Vercel (atrás do login dela, pelo "Protection Bypass for Automation"), com o banco e as funções da produção (D106).
5. **Merge e laboratório na produção:** com a migration no hospedado, fast-forward da branch na `main` (deploy de produção). Os cenários rodam de novo no app publicado: todo dia às 3h07 e sob demanda (`gh workflow run lab.yml --repo dougedss/viajei`).
6. **Aparelhos:** uma vez, na versão final, pelos roteiros `docs/teste-manual-fase-*.md`.

## Scripts

| Comando                                          | O que faz                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm preview`       | Vite (o build gera os ícones do PWA e o service worker)                                                                             |
| `pnpm lint` / `pnpm format` / `pnpm typecheck`   | ESLint, Prettier, `tsc -b`                                                                                                          |
| `pnpm test`                                      | Vitest (lógica pura e Dexie com `fake-indexeddb`)                                                                                   |
| `pnpm test:e2e`                                  | Playwright, viewport de iPhone, contra o Supabase local (dev e o build; `pnpm build` antes)                                         |
| `pnpm db:start` / `db:stop` / `db:reset`         | Supabase local (migrations + `seed.sql`)                                                                                            |
| `pnpm db:test`                                   | pgTAP (`supabase/tests`)                                                                                                            |
| `pnpm db:types`                                  | regenera `src/lib/supabase/database.types.ts` (commitado; a CI confere)                                                             |
| `pnpm remote:db-push`                            | aplica as migrations no projeto hospedado                                                                                           |
| `pnpm remote:config-diff` / `remote:config-push` | mostra e aplica a configuração do Auth (`[remotes.production]`) no hospedado                                                        |
| `pnpm remote:functions-deploy`                   | publica as Edge Functions `route-day`, `send-notifications`, `push-receiver` e `import-itinerary` no hospedado                      |
| `pnpm remote:secrets-push`                       | grava `ORS_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `ANTHROPIC_API_KEY` (só elas) nos secrets; recusa enviar variável vazia |
| `pnpm functions:serve`                           | Edge Functions no stack local (`-- --env-file ./.env.local` para ORS e VAPID)                                                       |
| `pnpm geo:build`                                 | regenera os dados geográficos embutidos (`docs/dados-geo.md`)                                                                       |
| `pnpm vapid:generate`                            | gera o par VAPID uma vez (`VITE_VAPID_PUBLIC_KEY` raw, `VAPID_PRIVATE_KEY` PKCS#8)                                                  |
| `pnpm db:vault-local`                            | grava URL e chave secreta locais no Vault, para o `pg_cron` (o `db:reset` já chama)                                                 |

Os scripts `remote:*` carregam `.env.local` antes de chamar a CLI: é de lá que saem o token, a senha do banco e a chave do Resend que o `config push` usa.

## Produção

- **Supabase:** projeto `viajei` (sa-east-1). Depois de uma migration nova e dos testes verdes, `pnpm remote:db-push`. A configuração do Auth (URLs, SMTP do Resend, templates) está versionada em `supabase/config.toml`; `pnpm remote:config-diff` mostra o que mudaria e `pnpm remote:config-push` aplica. O Vault do hospedado precisa, uma vez, de `viajei_project_url` e `viajei_secret_key` (SQL Editor: `select vault.create_secret(...)`), que o job `viajei-send-notifications` lê.
- **Vercel:** projeto `viajei`, integração com o GitHub. Push na `main` publica https://viajei-mauve.vercel.app; qualquer branch gera um preview, que usa o mesmo projeto Supabase (os links de e-mail voltam para a origem do preview).

## Contas e segredos

Há várias contas nesta máquina. O repositório usa um e-mail de commit local (`git config user.email`), o remote vai pelo alias SSH `github-dougedss`, e a CLI do Supabase lê `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` de `.env.local` em vez de trocar o login global. `RESEND_API_KEY` (conta da empresa, só envio) também fica em `.env.local`. Nenhuma chave secreta (Supabase, Anthropic, OpenRouteService, VAPID privada, Resend) entra no client ou no git.

A `ANTHROPIC_API_KEY` (conta pessoal do Douglas, workspace Viajei com limite de gasto mensal) fica em `.env.local`, posta por ele, e no hospedado só em `supabase secrets`; nenhum valor passa pelo chat, pela CI ou pelo client.

Variáveis do push: `VITE_VAPID_PUBLIC_KEY` (client; também na Vercel, Production e Preview), `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (só em `supabase secrets`, via `pnpm remote:secrets-push`). O par é gerado uma vez por `pnpm vapid:generate` e nunca trocado: trocar invalida todas as assinaturas.
