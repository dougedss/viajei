# Fase 11 · Mapa e clima

> Você é o agente de implementação da **fase 11** do Viajei. Este chat faz só esta fase. Ao terminar: o commit da fase, resumo curto, `docs/decisoes.md` e a memória do projeto atualizados. O prompt da fase 12 (polish e E2E) sai do chat de planejamento; não comece a fase 12.

## 0. Leitura obrigatória, nesta ordem

1. `docs/prompt-implementacao.md` (v3):
   - seção 2 (regras), com atenção à regra 4: **não é jogo nem GPS**;
   - seção 3 (stack: `leaflet` + `react-leaflet` 5 com tiles do OSM; Open-Meteo; TanStack Query para o clima);
   - **4.9** (mapa e clima) e 4.12 (o briefing da manhã: "paradas, primeira saída, clima");
   - 5.3 (caches recalculáveis: `weather` nunca sincroniza), **5.5** (`CacheFirst` para tiles do OSM, 30 dias, limite de entradas) e 5.6 (a store `weather`);
   - 6.4 (a abertura do dia, com o chip do clima);
   - 7.2 (as rotas `/viagens/:tripId/mapa` e a visão geral com clima);
   - 12 (linha da fase 11) e 13.
2. `docs/passo-0-delta-2026-11-04.md`:
   - a linha do `morning_briefing` na tabela dos avisos ("clima buscado pela Edge Function no Open-Meteo");
   - a tabela da abertura do dia (o chip do clima entra com o carro, por volta de 1,8 s);
   - o trecho dos termos do Open-Meteo (uso não comercial, CC BY 4.0, atribuição na tela).
3. `docs/decisoes.md` inteiro. Em especial:
   - D24 (`edge_call`), D26 (a costa embutida erra de 1 a 2 km), D29 ("sair às"), D47 (os raios da trilha) e D56 (o rewrite da Vercel: caminho inexistente devolve 200);
   - D91 (onde se testa), D104 (tipos da CI), D105 (avisos em dois dias), **D106 (que esta fase reescreve)**, D108 (deploy das funções), D109 e D111 (sync e conectividade);
   - D116 (a costa a 3 km), D121 (`spliceTrip`, a viagem inteira num caminho só) e D124 (a tela busca as rotas que faltam);
   - tudo o que a fase 10 decidiu (D127 em diante), inclusive o custo medido.
4. Código que esta fase estende. Leia antes de desenhar:
   - `src/sw.ts` (a rota `osm-tiles`, com defeito: veja a seção 1) e `vite.config.ts` (o `injectManifest`);
   - `src/lib/db/schema.ts`: a store `weather: 'trip_day_id'` existe desde a v1, sem tipo e sem uso;
   - `src/features/itinerary/{route.ts,queries.ts}` (`useDayRoute`, `useCachedRoute`, `fetchDayRoute`): o padrão de cache no Dexie com busca pelo TanStack, que o clima repete;
   - `src/features/itinerary/routes/DiaPage.tsx`, `components/StopCard.tsx`, `components/StopKindIcon.tsx`;
   - `src/features/trips/routes/ViagemPage.tsx` (visão geral), `components/TripHero.tsx` e `components/TripShortcuts.tsx` (o comentário "O mapa entra na fase 11");
   - `src/features/travel-mode/components/AgoraHeader.tsx`;
   - `src/features/world/opening.ts`, `components/WorldHud.tsx` e `components/WorldSection.tsx` (a abertura e as pílulas dos nós);
   - `src/features/retrospective/rules.ts` (`spliceTrip`) e `routes/RetrospectivaPage.tsx` (como busca as rotas que faltam);
   - `src/lib/geo/municipalities.ts` (`nearestMunicipality`), `src/lib/links` (`googleMapsUrl`, `wazeUrl`) e `src/lib/geocode/nominatim.ts` (`OSM_ATTRIBUTION`);
   - a definição mais recente de `public.due_notifications` (hoje em `supabase/migrations/0009_progressao.sql`, com o "gancho do clima" `first_point` no ramo do `morning_briefing`; confira se a 0010 a recriou);
   - `supabase/functions/_shared/notifications.ts` (o texto do `morning_briefing`) e o teste, e `supabase/functions/send-notifications/index.ts`;
   - `supabase/tests/07_notificacoes.test.sql`;
   - `scripts/lab/{run.ts,evaluate.ts,app.ts,road.ts}` (o `briefing` do laboratório confere um texto fixo) e `e2e/helpers/import.ts` (o `nominatimLocal`, o padrão de serviço externo de mentira nos e2e).

## 1. Estado do repositório ao começar

- **Primeiro, confira que a fase 10 fechou.** Quando este prompt foi escrito (07/11/2026, noite), a fase 10 estava na branch `fase-10` (commit `c67fca3` `fase 10: importação com IA`, sobre a fase 9), num worktree próprio em `/Users/douglas/Documents/dev/viajei-fase-10`, com a CI rodando. A `main` estava em `eac0ec9` (a fase 9 mais duas correções do laboratório). Faltavam à fase 10: a chave da Anthropic no hospedado, a 0010 e a função no hospedado, o merge, o laboratório na produção e os números da D140.

  Confira pela `origin/main`:
  - a fase 10 na `main`, a CI verde, a 0010 e a `import-itinerary` no hospedado;
  - o laboratório na produção, com o `app_importar`, e os ciclos de dois dias (véspera, prazo, `retro`);
  - a D140 com o custo medido.

  **Se a fase 10 ainda não estiver na `main`:**
  - Faça o plano lendo o código da `origin/fase-10` (`git show origin/fase-10:<caminho>`) e publique-o.
  - **Não escreva código antes do merge:** as duas fases mexem no `lab.yml`, no `scripts/lab/run.ts`, no `router.tsx` e no `decisoes.md`.
  - Acompanhe a `origin/main` com um comando em segundo plano (Monitor, ou um laço `until` em segundo plano): `git fetch` a cada 5 minutos, saindo quando o commit de assunto `fase 10: importação com IA` estiver na `origin/main`. Procure pelo assunto, não pelo hash: o chat da fase 10 pode refazer o commit sobre a `main` atual. Nunca use um laço de mensagens para isso.
  - Quando ele entrar, leia o que a fase 10 deixou em `decisoes.md` e na memória, ajuste o plano e siga.
- **Onde trabalhar:** na pasta principal, `/Users/douglas/Documents/dev/viajei`.
  - Ela está livre: o chat da fase 9 terminou, e o da fase 10 trabalha no worktree dele (da pasta principal ele só copia o vínculo em `supabase/.temp`).
  - Ela está na branch `fase-9`, em `eac0ec9`, com dois arquivos fora do git: `docs/fases/fase-10.md` e este `docs/fases/fase-11.md`. Nenhum dos dois está no commit da fase 10 (confira com `git ls-tree origin/main docs/fases/`). Depois do merge da fase 10: `git fetch` e `git switch -c fase-11 origin/main`; os dois arquivos vêm junto. Eles entram no commit da fase 11, o da fase 10 sem mudança.
  - Não mexa no worktree `viajei-fase-10` nem o remova: o chat dele ainda pode voltar para corrigir algo.
- **A primeira tarefa: devolver o alvo `preview` ao laboratório.** Era a primeira tarefa da fase 9, e ela não a fez (o chat reconheceu a omissão no resumo final). A resposta final do Douglas ao bypass da Vercel é **sim** (07/11): o secret `VERCEL_AUTOMATION_BYPASS_SECRET` está no repositório e o bypass está ligado na Vercel.
  - O código está na branch **local** `backup/fase-8-7db37ad` (não está no GitHub; não a apague). O que falta à `main` é exatamente `git diff bf99cf5 7db37ad -- .github/workflows/lab.yml scripts/lab` (124 linhas):
    - a entrada `alvo` (`producao|preview`) no `lab.yml`, com `LAB_ALVO`, `LAB_BRANCH` e o secret;
    - `scripts/lab/preview.ts` (`previewOrigin`, puro) e `appTarget()` no `env.ts`;
    - o `passBypass` no `app.ts`: o segredo vai só na primeira navegação, como parâmetro que grava o cookie, nunca como cabeçalho e nunca no log;
    - o bloqueio do `vercel.live` (`7db37ad`): a barra de ferramentas da Vercel cobria o "Feito" da missão no preview;
    - o teste em `arm.test.ts`.
  - Aplique sobre a `main` de agora. O `lab.yml` ganhou na fase 10 a entrada `tarefa` (`laboratorio|medir-importacao`): as duas convivem, e o agendado testa sempre a produção.
  - Reescreva a D106: o laboratório testa o preview da branch antes do merge e a produção depois. O preview usa o mesmo banco da produção.
  - Commit próprio, o primeiro da `fase-11`: `laboratório: o preview da branch volta`. Confira com `gh workflow run lab.yml --repo dougedss/viajei --ref fase-11 -f alvo=preview` (o preview é `https://viajei-git-fase-11-qimkt38-gmailcoms-projects.vercel.app`). Ele tem de ficar todo verde antes do código da fase. O `app_importar` também roda no preview, com uma leitura real da IA por execução, dentro do limite de 20 por dia do lab-a.
- **Onde se testa (D91):** nada roda neste Mac (nem Supabase local, nem Docker, nem as suítes, nem Playwright). A CI do GitHub roda em todo push das branches `fase-*`. O laboratório é o teste de aceitação: no preview da branch antes do merge e na produção depois. **Não peça teste manual nesta fase**, mas escreva o roteiro (`docs/teste-manual-fase-11.md`) para o teste final nos aparelhos.
- **Já existe e serve a esta fase:**
  - a rota de tiles `osm-tiles` no `sw.ts`, que **não grava tile nenhum** (veja as armadilhas);
  - a store `weather` no Dexie, sem tipo;
  - o fato `first_point` no `morning_briefing` do `due_notifications`;
  - a rota real de cada dia no Dexie (`routes`: geometria `[lng, lat]`, trechos, altitude), o `spliceTrip` e a busca das rotas que faltam;
  - a trilha (`trip_tracks`, só de quem compartilha a posição);
  - `nearestMunicipality`, os links do Maps e do Waze, o `StopKindIcon` e os ícones do `lucide-react`, que tem ícones de tempo.
- **Ainda não existe:**
  - `leaflet`, `react-leaflet`, `@types/leaflet` e `workbox-cacheable-response` instalados;
  - a rota `/viagens/:tripId/mapa`;
  - nada de clima: nem módulo, nem tela, nem texto no aviso.
- **Migration desta fase:** o plano não previa nenhuma. Este prompt recomenda a `0011_clima.sql`, só para recriar o `due_notifications` com o ponto onde o dia termina (seção 3.4). O expurgo da fase 12 vira a 0012.
- Branch `fase-11` saída da `main`; a `main` recebe por fast-forward quando o Douglas aprovar (push na `main` = deploy).

### Levantamento conferido em 07/11/2026 (pelo chat da fase 10)

Confira de novo as versões antes de instalar: exatas e publicadas há pelo menos duas semanas, como nas fases 9 e 10.
- **Leaflet `1.9.4`** (18/05/2023, BSD-2; a 2.0 está em beta e fica de fora). 42 KB gzip mais 3,5 KB de CSS. Tipos: `@types/leaflet` `1.9.22`.
- **react-leaflet `5.0.0`** (14/12/2024), com peer `react ^19` e `leaflet ^1.9`. Licença **Hippocratic-2.1**, uma licença ética não aprovada pela OSI: diga isso ao Douglas no plano, numa linha. A recomendação é ficar com ele, que é a stack aprovada; a alternativa é o Leaflet puro numa classe criada e destruída no mesmo efeito, como o `WorldRuntime`. As props do `MapContainer` são imutáveis depois de montar: o `fitBounds` vai num filho com `useMap()`.
- **Tiles do OSM** (política em operations.osmfoundation.org/policies/tiles):
  - só `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, com `maxZoom: 19` (o z20 dá 400);
  - o Referer é exigido: o app não define `Referrer-Policy`, e assim tem de continuar;
  - **"Offline use is not permitted"** nesse servidor: nada de baixar antes os tiles da rota nem "salvar área". Permitido é servir do cache o que a pessoa já viu;
  - a resposta traz `max-age` de umas 25 h, `stale-while-revalidate` de 7 dias e ETag. Guardar por 30 dias vai além do `max-age`, mas pede menos ao servidor: é a leitura deste prompt, registre-a;
  - CORS aberto (`access-control-allow-origin: *`);
  - atribuição visível num canto do mapa, nunca sob a interface nem fora da área segura: "© OpenStreetMap" com link para https://www.openstreetmap.org/copyright.
- **Open-Meteo:**
  - `https://api.open-meteo.com/v1/forecast` com `daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`, `timezone=America/Sao_Paulo` (obrigatório com `daily`), `start_date` e `end_date`;
  - por hora: `hourly=temperature_2m,precipitation_probability,weather_code,is_day`;
  - o nome atual é `weather_code`; o antigo `weathercode` ainda responde, com a chave antiga;
  - horizonte até hoje + 15 (`forecast_days` de 0 a 16); fora disso a API devolve erro;
  - várias coordenadas numa chamada só, que custa 1 por local; **um local devolve um objeto, vários devolvem uma lista**;
  - sem chave e com CORS aberto. Grátis para uso não comercial: 600 por minuto, 5.000 por hora, 10.000 por dia e 300 mil por mês, contados por IP;
  - atribuição CC BY 4.0: um link junto de onde o dado aparece ("Dados do tempo: Open-Meteo.com", https://open-meteo.com/).
- **Códigos WMO** (a tabela atual do Open-Meteo, com o 97; confira na documentação ao escrever):
  - 0 céu limpo · 1 predomínio de sol · 2 parcialmente nublado · 3 nublado · 45 neblina · 48 neblina com geada;
  - 51/53/55 garoa fraca/moderada/forte · 56/57 garoa congelante;
  - 61/63/65 chuva fraca/moderada/forte · 66/67 chuva congelante;
  - 71/73/75 neve · 77 grãos de neve · 85/86 pancadas de neve;
  - 80/81/82 pancadas de chuva fracas/moderadas/muito fortes;
  - 95 trovoada · 96 trovoada com granizo fraco · 97 trovoada forte · 99 trovoada com granizo forte.

  O código diário é "a condição mais severa do dia". Código desconhecido tem rótulo de reserva.

### Armadilhas conhecidas (não redescubra)

**Ambiente e comandos**
- Em cada comando: `cd /Users/douglas/Documents/dev/viajei && PATH="$HOME/.nvm/versions/node/v22.23.4/bin:$PATH" pnpm ...`. Começar por `export PATH`, por `mkdir` ou por qualquer comando sem o `cd` no repo dispara um hook do zsh que falha.
- `gh` está em `/opt/homebrew/bin/gh` e precisa de `XDG_CACHE_HOME` gravável (use uma pasta no scratchpad). A API às vezes dá "error connecting" no `gh run watch`: use um laço com `gh run view`.
- As permissões bloqueiam ler e escrever `.env*`. A checagem do Bash recusa heredocs com `$$`: escreva SQL e scripts com a ferramenta Write.
- **Mutação no Supabase hospedado só com ok explícito do Douglas e `SUPABASE_YES=1 pnpm remote:...`**, com `--dry-run` antes. Publicar função também é mutação. Sem Docker, o deploy das funções usa `--use-api --import-map` (D108).

**CI e testes**
- Tipos do banco pelo artefato da CI (D104). Cada volta leva uns 9 minutos: junte mudanças e leia `gh run view <id> --log-failed` antes de mexer.
- **Teste do Vitest que importa, mesmo por tabela, algo que carrega `lib/supabase/client.ts` quebra na CI.** Regra, parser e formatador moram em módulo puro.
- O Vitest na CI não grava snapshot novo: escreva o esperado à mão.
- Datas de teste nunca com `toISOString().slice(0, 10)`: depois das 21h de Brasília já é amanhã. Use `e2e/helpers/dates.ts`.
- Teste que não é da maquete abre o Modo Viagem com `?render=list`. `getByRole('heading', { name })` casa por substring: use `exact`.

**Código**
- React Compiler: não mute props, valores de hooks nem locais do render. Estado mutável vai numa classe com métodos. `no-non-null-assertion` é erro em `src/`. Para lookup em `Record` tipado, use `Object.hasOwn` em vez de `??`.

**Esta fase**
- **A rota `osm-tiles` nunca gravou um tile.** Sem `cacheWillUpdate`, o Workbox 7.4.1 só grava status 200. O Leaflet, por padrão, cria o `<img>` sem `crossorigin`: o pedido sai em no-cors e a resposta chega opaca (status 0). Correção:
  - `crossOrigin: true` no `TileLayer`;
  - `CacheableResponsePlugin({ statuses: [200] })`;
  - o filtro por `url.origin === 'https://tile.openstreetmap.org'`, não por `endsWith`.

  **Nunca `statuses: [0, 200]`:** o Chrome conta uns 7 MB de cota por resposta opaca, e um erro opaco ficaria preso no `CacheFirst`.
- **O ícone padrão do Leaflet quebra com o Vite:** os PNGs viram `data:` e o caminho detectado fica vazio. Use `divIcon` com a arte do app; nenhum PNG.
- `import 'leaflet/dist/leaflet.css'` dentro do chunk do mapa, e o contêiner com altura explícita.
- **Nenhum pedido real a tiles ou ao Open-Meteo na CI.** Nos e2e, os dois são de mentira. O tile de mentira é um PNG pequeno com `access-control-allow-origin: *`. Os pedidos do service worker não passam pelo `page.route`: no projeto `pwa`, use `context.route` e confira que ele intercepta o SW.
- O Open-Meteo pela Edge Function sai de um IP compartilhado do Supabase, que pode bater no limite. O aviso nunca espera o clima: prazo curto, e sem resposta o aviso sai sem clima.

## 2. Ações do Douglas nesta fase

1. **Ok no plano**, inclusive nas divergências. Ele pode dispensar esse ok na mensagem de abertura.
2. **Ok para aplicar a 0011 no hospedado** e republicar a `send-notifications`, com a CI verde e o `--dry-run` antes.
3. **Ok para o fast-forward na `main`**, que leva o commit do preview e o da fase.

Nenhuma chave nova: o OSM e o Open-Meteo não pedem chave. Avise que a previsão da viagem real (11 a 14/12) começa a aparecer em 26/11, quando o primeiro dia entra nos 15 dias do Open-Meteo.

## 3. Entregas

### 3.1 Os tiles no service worker
- Corrija a rota `osm-tiles` (seção 1). Fica `CacheFirst` com 30 dias e `purgeOnQuotaError`.
- Dimensione o `maxEntries` pelo que a viagem do seed de 4 dias vê, ao abrir o mapa de cada dia e ao aproximar duas vezes. Os 500 de hoje podem despejar tiles da própria viagem.
- **Nada de baixar antes:** o mapa offline mostra só o que já foi visto neste aparelho. A linha e os marcadores aparecem mesmo sem tile, porque vêm do Dexie.
- A URL dos tiles mora num lugar só, como a política recomenda.

### 3.2 A tela do mapa (`/viagens/:tripId/mapa`, `features/map/`)
- Chunk próprio, carregado só nesta rota, com o Leaflet e o CSS dele.
- **Fora do Modo Viagem.** Sem "você está aqui", sem pedir a posição, sem rota passo a passo, sem recálculo (regra 4). Entra pelo atalho "Mapa" no `TripShortcuts` e por "Ver no mapa" na página do dia (`?dia=<id>`). Nunca pelo Modo Viagem.
- **Escolha do dia:** chips "Viagem" e "Dia 1 · sex" e assim por diante. Durante a viagem abre o dia de hoje; antes dela, o primeiro dia. "Viagem" mostra todos os dias, com o caminho do `spliceTrip` (D121) ou um traço por dia; escolha e explique.
- **Linhas:**
  - a rota real de cada dia vem do Dexie (`routes`);
  - com rede, a tela busca as rotas que faltam, como a retrospectiva (D124);
  - sem rota, um traço reto e tracejado entre as paradas, claramente diferente da estrada: nunca finja que é o caminho;
  - o trecho já rodado (entre paradas concluídas) com outro peso;
  - meça o primeiro quadro com a viagem do seed inteira (milhares de pontos). Se o SVG pesar, use o renderizador em canvas ou simplifique a linha.
- **Marcadores:** `divIcon` com o ícone do tipo (`StopKindIcon`), numerados na ordem do dia, com os mesmos estados e cores da lista do dia (concluída, pulada, próxima, pendente). As paradas sem coordenada aparecem numa linha abaixo do mapa ("2 paradas sem lugar no mapa"), com caminho para editar.
- **Para quem ficou em casa:** a trilha de hoje (`trip_tracks`, só de quem compartilha a posição) num traço fino, e no último ponto o carro da viagem (a arte do `CarSide`) com "Visto às 14:02". Não é posição ao vivo: muda quando a trilha sincroniza.
- **Enquadramento:** `fitBounds` do que está visível, com margem para o cabeçalho, os chips e a área segura do iPhone. Ao trocar de dia, voo suave; sem animação com reduzir movimento.
- **Toque num marcador:** a `Sheet` do app com nome, tipo, horário, "fecha às", endereço, a previsão no horário da parada (seção 3.3) e os botões Google Maps e Waze (`lib/links`), mais "Ver no roteiro".
- **Atribuição:**
  - "© OpenStreetMap" com link, no canto, acima da área segura e de qualquer barra;
  - o prefixo do Leaflet fica só com o texto "Leaflet" (`setPrefix`).
- **Tema:**
  - os tiles do OSM são mais saturados que a paleta do app. Um filtro CSS só no painel de tiles aproxima o mapa dos tokens; no escuro, uma versão escurecida;
  - linhas e marcadores usam os tokens;
  - confira o contraste nos dois temas.
- **Sem rede:** um aviso calmo ("Sem internet: o mapa mostra só as áreas já vistas neste aparelho"), e o fundo do contêiner na cor do app, não o cinza do Leaflet.

### 3.3 O clima (módulos puros em `supabase/functions/_shared/weather.ts`, telas em `features/weather/`)
O texto do clima tem de ser o mesmo no app e no aviso. Por isso a tabela dos códigos e o formatador moram no `_shared`, como as `constants`, e o app os importa por `@shared`.
- **Puros e testados:**
  - `codes`: código WMO → rótulo em pt-BR, ícone do `lucide-react` (sol, nuvem, chuva, garoa, trovoada, neblina, neve; lua quando `is_day` é 0) e gravidade. Código desconhecido tem reserva;
  - `points`: quais lugares contam em cada dia (veja abaixo), com coordenadas arredondadas para o mesmo lugar não sair duas vezes;
  - `horizon`: quais dias têm previsão (hoje até hoje + 15, em São Paulo). Para os dias além disso, "previsão a partir de 26/11", a data do dia menos 15. Dia que já passou não mostra nada;
  - `request` e `parse`: uma chamada para todos os lugares da viagem dentro do horizonte, e o parser em Zod que aceita objeto ou lista;
  - `summary`: o resumo do dia e o da parada.
- **Que lugares (divergência do 4.9, que diz só a primeira parada com coordenadas):**
  - **onde o dia começa e onde termina:** a primeira e a última parada com coordenadas. A última só conta se estiver a 50 km ou mais da primeira. Numa viagem de carro, o tempo de onde se acorda e de onde se dorme difere: Papanduva, no planalto, e Montenegro, no vale, num mesmo dezembro;
  - **cada parada com horário escrito**, pela previsão daquela hora (arredondada à hora cheia), quando há previsão por hora. Parada sem horário não ganha previsão por hora: **nunca inventar uma hora de chegada**.
- **O cache no Dexie:**
  - o tipo `WeatherEntry` na store `weather`, por `trip_day_id`, com `trip_id`, `fetched_at`, um `hash` dos lugares e da data, o resumo diário de cada lugar e a previsão por hora das paradas;
  - se a chave da store não muda, a versão do Dexie não sobe;
  - o hook segue o padrão do `useDayRoute`: lê o Dexie; com rede e cache velho busca pelo TanStack e grava. Velho quer dizer outro `hash`, ou mais de 1 h no dia da viagem, ou mais de 6 h antes dela; ajuste com razão;
  - sem rede, mostra o que tem, com "atualizado às 07:40" ou "ontem às 18:10";
  - o que é de viagem encerrada ou de viagem que saiu do aparelho sai do cache.
- **Onde aparece:**
  - **visão geral:** uma faixa com os dias (ícone, máxima, mínima, chance de chuva), "previsão a partir de…" nos dias distantes e o link de atribuição do Open-Meteo;
  - **página do dia:** o resumo de onde o dia começa e termina, com o nome do município (`nearestMunicipality`): "Papanduva 26° / 15° → Montenegro 31° / 19° · chuva 60%". Em cada `StopCard` com horário, um detalhe pequeno: ícone, temperatura e chuva naquela hora. Atribuição na página;
  - **"Agora":** a previsão da próxima parada no horário dela, discreta, nunca maior que a hora nem com toque novo;
  - **maquete:** o chip do clima na abertura do dia, entrando com o carro (passo `car`), e ficando pequeno na faixa de cima do HUD. Vem do Dexie e funciona sem rede. Com reduzir movimento, aparece sem animação. Nas pílulas dos nós, um ícone de chuva quando a chance no horário da parada passa de um limite. Tudo em HTML, nada novo na cena 3D;
  - **mapa:** a previsão no horário da parada, na folha do marcador.
- **Sem previsão, nada aparece.** Nem traço, nem zero. Previsão é rotulada como previsão.
- **Atribuição:** o link do Open-Meteo vai nas telas com o detalhe (visão geral, dia). O chip, as pílulas e o "Agora" contam com elas. Registre essa leitura do "junto de onde o dado aparece".
- **Fora desta fase:** o céu da maquete mudando com o tempo (nuvens, chuva em 3D). O fps no iPhone ainda não foi medido, e a maquete mostra o dia inteiro, enquanto o tempo varia ao longo dele.

### 3.4 O briefing da manhã com clima
- **`0011_clima.sql`:** `create or replace function public.due_notifications`, com a mesma assinatura e o corpo inteiro copiado da definição mais recente, acrescentando `last_point` (a última parada do dia com coordenadas) aos fatos do `morning_briefing`. Como a 0009 fez com o `retro_ready`. pgTAP do fato novo, inclusive o dia com uma parada só.
- **Na `send-notifications`:**
  - antes de enviar, junta os `morning_briefing` do lote;
  - escolhe os lugares pelo mesmo `points` do app;
  - faz **uma chamada** ao Open-Meteo com todos os lugares distintos, com prazo de uns 3 s;
  - grava os fatos do clima em `data.weather` da linha em `notifications_sent`, ou o código curto do motivo de não ter clima. O laboratório confere por eles.
- **O texto**, em `_shared/notifications.ts`, pelo formatador do `_shared/weather.ts`: o que já existe ("6 paradas · primeira saída às 06:30") e o clima, curto, para caber na tela bloqueada. Por exemplo: "Parcialmente nublado, 15° a 31°, chuva 60%". Junte os dois lugares: a menor mínima, a maior máxima, a maior chance de chuva e o código mais severo. Sem clima, o texto de hoje. Mostre no plano os exemplos exatos, no singular e no plural.
- Teste da função com uma resposta gravada do Open-Meteo e com o Open-Meteo fora do ar (o aviso sai sem clima, no prazo).

### 3.5 Testes
- **Vitest:**
  - os códigos de clima (todos, mais o desconhecido) e o ícone de noite;
  - os lugares: a distância de 50 km, o arredondamento, a parada sem horário, o dia sem coordenada;
  - o horizonte: hoje + 15 em São Paulo e o "a partir de";
  - o parser: um lugar, vários lugares e resposta fora do formato;
  - o resumo e o texto do briefing, com e sem clima;
  - quando o cache está velho;
  - os puros do mapa: limites, estado dos marcadores, trechos rodados, último ponto da trilha.
- **pgTAP:** o `last_point`.
- **Playwright**, com tiles e Open-Meteo de mentira:
  - `e2e/mapa.spec.ts`: marcadores, a linha (`[data-map-route]`), a atribuição visível e não coberta, a folha do marcador, a troca de dia;
  - no projeto `pwa`: ver o mapa com rede, conferir tiles no Cache Storage `osm-tiles`, ficar sem rede, recarregar e ver o tile do cache e o aviso;
  - `e2e/clima.spec.ts`: a faixa da visão geral, o "a partir de" num dia distante e o "atualizado às" sem rede.

### 3.6 O laboratório desta fase (D91)
- **`app_mapa`:** uma viagem fixa de hoje, com coordenadas e rota reais. O mapa abre com os tiles de verdade, num viewport de celular e num zoom só, sem arrastar: são umas dezenas de tiles por dia, dentro da política. Confere:
  - os marcadores, a linha e a atribuição;
  - pelo menos um tile gravado no cache com status 200;
  - sem rede, depois de recarregar, os tiles vistos e o aviso.
- **`app_clima`:** o Open-Meteo de verdade, pelo navegador do laboratório. A faixa da visão geral tem os números de hoje; sem rede, aparece o "atualizado às".
- **`briefing`:** o texto esperado passa a ser montado pelos fatos que a função gravou (`data.weather`). Com clima, o formato; sem clima, o motivo gravado.
- Primeiro no preview da branch, depois na produção.

### 3.7 Documentação
- **`docs/teste-manual-fase-11.md`**, para o teste final nos aparelhos:
  - pinça e arrastar no iPhone e no Android;
  - a atribuição com a barra de baixo e a área segura;
  - o mapa no tema escuro;
  - o mapa sem rede depois de visto;
  - o clima legível ao sol;
  - o briefing na tela bloqueada.
- **`docs/decisoes.md`**, da próxima decisão livre em diante. Uma entrada por decisão não óbvia:
  - o preview de volta (a D106 reescrita);
  - o defeito dos tiles e a correção;
  - os 30 dias contra o `max-age` e a regra de nunca baixar antes;
  - react-leaflet e a licença;
  - os lugares do clima (começo, fim, paradas com horário) e a divergência do 4.9;
  - a 0011;
  - o clima no aviso: uma chamada, prazo, sem clima quando falha;
  - a atribuição do Open-Meteo;
  - o que ficou fora (o céu da maquete);
  - os números medidos (chunk do mapa, primeiro quadro, tiles por dia, cache).
- **README:** a seção "Mapa e clima", com as atribuições, a política dos tiles e os limites do Open-Meteo.

## 4. Como trabalhar nesta fase

1. **Antes de codar**, apresente numa mensagem:
   - a conferência do fechamento da fase 10;
   - o plano do commit do preview;
   - a DDL da 0011;
   - as versões exatas das dependências novas, com a linha da licença do react-leaflet;
   - um wireframe em texto do mapa: chips, linhas, marcadores, folha, atribuição, sem rede;
   - o desenho do clima: os lugares, quando busca, o cache, cada lugar onde aparece com um exemplo de texto, e os textos exatos do briefing;
   - os cenários do laboratório;
   - o que fica fora.

   **Espere o ok**, a não ser que o Douglas tenha dito na mensagem de abertura que não precisa esperar. Nesse caso:
   - publique o plano como mensagem e siga para o código, depois do merge da fase 10;
   - escolha pela recomendação deste prompt e registre cada escolha em `decisoes.md`;
   - as paradas da seção 2 continuam valendo: a 0011 e a função no hospedado, e o merge.
2. **O preview primeiro:** o commit `laboratório: o preview da branch volta` na `fase-11`, push e o laboratório no preview, todo verde.
3. **Branch `fase-11`:** push, CI e tipos pelo artefato. Com a CI verde:
   - o laboratório no preview. O mapa e o clima do app já rodam lá. O briefing com clima só depois da função publicada, porque as funções não têm preview;
   - com o ok, `SUPABASE_YES=1 pnpm remote:db-push` e `SUPABASE_YES=1 pnpm remote:functions-deploy`, com o `--dry-run` antes. A 0011 e a função nova servem também ao app de hoje: o aviso só ganha uma linha;
   - o fast-forward na `main`, com o ok;
   - o laboratório na produção, cujo resultado você traz.
4. **Commits na `fase-11`:**
   - o do preview;
   - `fase 11: mapa e clima`, com os dois prompts (`fase-10.md` e `fase-11.md`);
   - o laboratório pode ganhar commit próprio.

   Depois:
   - resumo curto;
   - `decisoes.md` atualizado;
   - memória atualizada: o estado, as armadilhas novas e o levantamento útil à fase 12.

   O levantamento da fase 12 cobre:
   - o Playwright completo, com o fluxo principal e o offline;
   - a matriz iPhone e Android, juntando os roteiros manuais pendentes das fases 4 a 11 num roteiro só para o teste final;
   - acessibilidade e Lighthouse;
   - o README;
   - o job de expurgo (`0012`), inclusive os objetos do Storage sem linha (armadilha da fase 7).
5. **Regras permanentes:**
   - elegância sobre velocidade; experiência acima do custo;
   - não é jogo nem GPS: o mapa fica fora do Modo Viagem e nunca pede a posição;
   - iPhone primeiro, Android igual;
   - offline primeiro: o mapa desenha do Dexie, e o clima mostra o que tem com a hora;
   - **nunca inventar:** sem previsão, nada aparece; hora de parada só a escrita;
   - a política dos tiles do OSM: nunca baixar antes, atribuição sempre visível;
   - nenhum segredo no client;
   - mutação no hospedado só com ok e `SUPABASE_YES=1`;
   - nada roda no Mac: o teste é na web.
