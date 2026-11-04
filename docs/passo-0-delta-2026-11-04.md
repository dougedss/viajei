# Passo 0 · delta para aprovação formal (04/11/2026)

Delta sobre `docs/passo-0-2026-11-04.md` (que continua sendo a base: estrutura, ciclo offline, DDL completa, gamificação), sobre `docs/prompt-implementacao.md` **v3** e sobre os dois companheiros de 04/11 (`atualizacao-prompt-3d.md` e `atualizacao-prompt-notificacoes.md`). Nada aqui refaz o que já foi apresentado; só o que mudou, o que foi encontrado na revisão e o que precisa de ok. Nenhuma linha de código do projeto foi escrita.

Materiais novos deste delta:

| Arquivo | O que é |
|---|---|
| `docs/style-tile-v2.html` | Style tile v2 (https://claude.ai/artifact/9ciLua3nNxeaPuxeyyy1DB): Barlow e Barlow Condensed, paleta menos saturada, "Agora" com a maquete abaixo, a notificação no iPhone e no Android, visão geral, garagem showroom, retrospectiva em filme e o storyboard do replay e da abertura do dia |
| `docs/passo-0-delta-2026-11-04.md` | Este documento |

---

## 1. Ambiente reconferido hoje (regra 11)

| Camada | Resultado em 04/11/2026 | Situação |
|---|---|---|
| `gh auth status` | `dougedss` ativa (id 203018054); `reitechkairos-commits` logada, inativa; protocolo ssh | ok |
| `ssh -T git@github.com`, `git@github-dougedss`, `git@github-trabalho` | os três respondem `Hi dougedss!`; o alias `github-dougedss` tem `IdentitiesOnly yes` | ok |
| `git config --global user.email` | `douglas.santos@brcaptura.com.br` (trabalho) | **diverge**: e-mail local no repo |
| Repositório `dougedss/viajei` | não existe | ok |
| Supabase CLI | 2.19.5 instalada (atual 3.0.0). Logada numa conta com **duas organizações**: `Materialize` (Apassul, Hoopr, NetGol, Clinica G3) e `My` (Kifin, work-order) | **conta/organização pessoal a confirmar** (pergunta 2) |
| Vercel CLI | 62.1.0, logada como `reitechkairos-commits`, único time: `reitechkairos-commits' projects` (Pro) | **conta errada** (pergunta 2) |
| Docker | 28.0.4 instalado, daemon **parado** | abrir o Docker Desktop antes da fase 1 (`supabase start`) |
| Node / pnpm / git | 22.17.1 / 11.20.0 / 2.40.0 | ok |
| Blender | não instalado | não faz falta: arte por código |

Detalhe que muda a recomendação 2: a Supabase CLI guarda **um** login por máquina. Em vez de trocar de conta toda hora, o projeto usa `SUPABASE_ACCESS_TOKEN` da conta pessoal em `.env.local` (fora do git): a CLI prefere a variável ao login salvo, e as contas de cliente ficam intactas. No Vercel, o deploy entra pela integração com o GitHub (repositório `dougedss/viajei` conectado na conta pessoal), então a CLI logada em cliente nem é usada.

## 2. Versões no npm hoje (`pnpm view`, 04/11/2026)

Nenhuma major mudou em relação ao prompt. Só os pins exatos e três pacotes novos.

| Pacote | Prompt | npm hoje | Proposta |
|---|---|---|---|
| react, react-dom | 19.3 | 19.3.1 | 19.3.1 |
| babel-plugin-react-compiler | Compiler | 1.0.0 | 1.0.0 (peer exigido por `@vitejs/plugin-react` 6) |
| typescript | 6.0 | latest 7.0.2; 6.0.3 disponível | **6.0.3** (`typescript-eslint` 8.72.1 aceita `<6.1`) |
| vite / @vitejs/plugin-react | 8 | 8.3.5 / 6.2.1 | 8.3.5 / 6.2.1 |
| tailwindcss / @tailwindcss/vite | 4 | 4.3.4 | 4.3.4 |
| react-router | 8 | 8.5.1 (react ≥ 19.2.7) | 8.5.1 |
| @tanstack/react-query | 5 | 5.105.3 | 5.105.3 |
| dexie / dexie-react-hooks / fake-indexeddb | 4 | 4.4.7 / 4.4.0 / 6.2.7 | idem |
| zod | 4 | 4.6.7 | 4.6.7 |
| vite-plugin-pwa (+ workbox-window) | 2 | 2.0.0 (7.4.1) | idem |
| @supabase/supabase-js | — | 2.118.0 (3.0 ainda em `next`) | 2.118.0 |
| @supabase/server | — | 1.9.2 | 1.9.2 nas Edge Functions (`withSupabase({ auth: 'user' })`, confirmado na doc do Supabase hoje) |
| supabase (CLI) | devDependency | 3.0.0 | 3.0.0 como devDependency |
| @anthropic-ai/sdk | — | 1.4.0 (peer zod `^3.25 \|\| ^4`) | 1.4.0 |
| three / @types/three | 0.187 | 0.187.0 / 0.187.0 | idem |
| @react-three/fiber / drei | 9.8 / 10.7 | 9.8.2 / 10.7.9 | idem (fiber 10 segue em alfa) |
| motion / canvas-confetti | 14 | 14.9.1 / 1.9.4 | idem |
| fractional-indexing | — | 4.0.0 | 4.0.0 |
| @dnd-kit core / sortable / utilities | 6.3 / 10 | 6.3.1 / 10.0.0 / 3.2.2 | idem |
| react-hook-form / @hookform/resolvers | 7 | 7.91.0 / 7.0.2 | idem |
| date-fns / lucide-react | — | 4.4.0 / 1.68.0 | idem |
| browser-image-compression / html-to-image | — | 2.0.2 / 1.11.13 | idem |
| leaflet / react-leaflet / @types/leaflet | 5 | 1.9.4 / 5.0.0 / 1.9.22 | idem (leaflet 2 está em beta e react-leaflet 5 exige `^1.9`) |
| vitest / @playwright/test | 5 / 1.64 | 5.1.0 / 1.64.1 | idem |
| eslint / typescript-eslint / eslint-plugin-react-hooks | — | 10.14.0 / 8.72.1 / 7.1.1 | idem (o plugin 7 já traz as regras do React Compiler) |
| prettier / prettier-plugin-tailwindcss | — | 3.9.10 / 0.8.1 | idem |
| @fontsource/barlow, barlow-condensed | Barlow | 5.3.0 | idem |
| **novos** | | | `partial-json` 0.1.7 (preview progressivo da importação), `@testing-library/react` 16.3.3, `happy-dom` 21.0.4; na Edge Function `send-notifications`: `npm:web-push@3.6.7` (biblioteca de referência do Web Push, RFC 8291 e 8292; validar na fase 4 que o runtime Deno do Supabase a executa) com `jsr:@negrel/webpush@0.5.0` (nativa de Deno, só SubtleCrypto) como reserva. O `.ics` é gerado à mão: é texto simples e a biblioteca `ics` não acrescenta nada |

## 3. As 7 perguntas abertas, com recomendação

| # | Pergunta | Recomendação |
|---|---|---|
| 1 | E-mail dos commits: `203018054+dougedss@users.noreply.github.com` só neste repo? | **Sim.** `git config user.email` local no `git init`; o global continua o do trabalho. Remote `git@github-dougedss:dougedss/viajei.git`, repositório privado. O id 203018054 foi conferido hoje na API do GitHub |
| 2 | Conta ou organização pessoal do Supabase e do Vercel | **Supabase:** confirmar se a organização `My` (Kifin, work-order) é a sua pessoal ou de cliente; se for de cliente, criar uma organização pessoal. Projeto `viajei` na região **South America (São Paulo)**, plano Free para começar. Token pessoal em `SUPABASE_ACCESS_TOKEN` no `.env.local`, sem trocar o login da CLI. **Vercel:** conta pessoal (login com o GitHub `dougedss`) e deploy pela integração com o repositório; a CLI logada em cliente não entra |
| 3 | SMTP próprio para produção e domínio | **Resend** com um domínio seu (ou subdomínio, ex.: `mail.seudominio.com.br`). Sem isso, confirmação de e-mail e recuperação de senha só funcionam no Supabase local (Mailpit), e o convite por e-mail confirmado não funciona em produção. Pode ficar para a fase 2 (primeiro deploy), não trava a fase 1 |
| 4 | Versões: React 19.3 + Compiler, Vite 8, TS 6.0, Zod 4, pnpm; dependências novas | **Aprovar** a tabela da seção 2 (pins exatos). Novos: `partial-json`, `@supabase/server`, `@testing-library/react`, `happy-dom` |
| 5 | Os 17 ajustes técnicos | **Aprovar em bloco** (seção 4); já estão no prompt e na DDL |
| 6 | Chegada automática por presença ou sempre com um toque | **Automática**, ao entrar no raio de 150 m da parada e permanecer 3 min, com toast "Chegamos à Casa Valduga · Desfazer" por 10 s (está no style tile v2). Partiu! automático ao sair do raio de 300 m. Sem GPS, só os botões |
| 7 | Posição ao vivo para quem ficou em casa | **Ligada para todos os membros**, com toggle por pessoa e por viagem "compartilhar minha posição nesta viagem" (padrão ligado), guardado em `trip_members.share_position boolean` (migration 0004; o membro edita só a própria linha). Com o modelo da v3, "posição ao vivo" significa: trilha do modo painel e pontos esparsos do catch-up, que já sincronizam por `trip_tracks`; o toggle só decide se os outros veem |

## 4. Os 17 ajustes técnicos (ok em bloco)

| # | Ajuste | Por quê, em uma linha |
|---|---|---|
| 1 | Conflito por coluna (`field_versions`) | Por linha, um "Chegamos!" offline seria apagado por uma observação editada depois |
| 2 | Push ordenado por rank de tabela depois de coalescer | FIFO coalescido quebra FKs (parada chega antes do dia) |
| 3 | UUID v5 quando há chave natural | Dois celulares sem sinal criam a mesma linha em vez de colidir |
| 4 | Dias derivados das datas, sem `position` | A ordem já é a data |
| 5 | Índice fracionário nas paradas e itens | Um arrasto, um patch; reordenações simultâneas não se misturam |
| 6 | Memória por pessoa (`stop_memories`) | Duas pessoas não se sobrescrevem |
| 7 | Convite só com e-mail confirmado | Ninguém reivindica convite alheio antes de confirmar |
| 8 | Exclusão de viagem soft, `revoked` e expurgo | Hard delete não deixa lápide |
| 9 | Funções security definer em `private` | Em `public` virariam RPC exposta |
| 10 | Um aviso Realtime por transação e viagem | Importação de 80 linhas não gera 80 broadcasts |
| 11 | Arquivos imutáveis no Storage | O Blob em cache é por id |
| 12 | Códigos em inglês, rótulos pt-BR | Consistência entre banco, Zod e UI |
| 13 | Carro em três colunas | Cor e acessório editados em paralelo se juntam |
| 14 | Carro no último concluído, halo no próximo | Coerente com o protótipo |
| 15 | Chaves novas do Supabase (`publishable`) | `anon`/`service_role` serão descontinuadas até o fim de 2026 (confirmado hoje na doc) |
| 16 | CRUD de viagens na fase 2, sobre o Dexie | Evita escrever online na 1 e reescrever na 2 |
| 17 | XP de equipe derivado por cada aparelho | A policy só deixa cada um gravar o próprio evento |

## 5. DDL: o que muda em relação ao Passo 0 salvo

### 5.1 Pela direção 3D: nada a fazer
A DDL salva já incorpora as três consequências da decisão de 04/11: `trip_days` sem `theme` (0004), `trip_tracks` com policy "só a própria trilha" (0004) e as conquistas `coast` e `downhill` no `check` de `achievements` (0007, agora 0008). Conferido linha a linha.

### 5.2 Renumeração pela migration de notificações

| Migration | Conteúdo | Fase |
|---|---|---|
| 0001_fundacao, 0002_perfis_viagens_membros | como no Passo 0 | 1 |
| 0003_sync | como no Passo 0 | 2 |
| 0004_roteiro | como no Passo 0, mais `trip_members.share_position` (pergunta 7) | 3 |
| **0005_notificacoes** | **nova**: `push_subscriptions`, `notification_prefs`, `notifications_sent`, `due_notifications`, `pg_cron` + `pg_net` | 4 |
| 0006_reservas_anexos_memorias | era 0005 | 7 |
| 0007_listas_contatos_gastos | era 0006 | 8 |
| 0008_progressao | era 0007 | 9 |
| 0009_importacao | era 0008 | 10 |

### 5.3 Migration nova `0005_notificacoes.sql` (fase 4)
```sql
create extension if not exists pg_cron;                                -- no Supabase, habilitadas por extensão
create extension if not exists pg_net with schema extensions;

-- assinatura Web Push: uma por navegador instalado; é do aparelho, não sincroniza
create table public.push_subscriptions (
  id           uuid primary key,
  user_id      uuid not null references public.profiles on delete cascade,
  endpoint     text not null unique check (endpoint like 'https://%'),
  p256dh       text not null,
  auth         text not null,
  platform     text not null check (platform in ('ios','android','desktop')),
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failed_at    timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy "assinaturas: só as minhas" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.push_subscriptions (user_id);

-- preferências por pessoa e viagem: sincronizada com escopo user (todos os aparelhos da pessoa)
create table public.notification_prefs (
  id           uuid primary key,                                       -- v5(user_id, trip_id)
  user_id      uuid not null references public.profiles on delete cascade,
  trip_id      uuid not null references public.trips on delete cascade,
  enabled      boolean not null default true,
  lead_minutes smallint not null default 15 check (lead_minutes between 5 and 120),
  kinds        jsonb not null default '{"departure_soon":true,"departure_now":true,"closes_soon":true,
                 "morning_briefing":true,"eve_checklist":true,"cancel_deadline":true,"team_arrived":false,"retro_ready":true}',
  morning_time time not null default '07:00',
  created_at timestamptz not null default now(), updated_at timestamptz not null,
  field_versions jsonb not null default '{}', synced_at timestamptz not null,
  unique (user_id, trip_id),
  check (id = extensions.uuid_generate_v5(user_id, trip_id::text))
);
create trigger b_sync before insert or update on public.notification_prefs
  for each row execute function private.sync_guard('user_id', 'trip_id');
alter table public.notification_prefs enable row level security;
create policy "avisos: só os meus" on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));
create index on public.notification_prefs (user_id, synced_at);
insert into private.sync_tables values ('notification_prefs', 'user', 'lww', 25);

-- dedupe do servidor: uma linha por pessoa, tipo, referência e minuto. Sem policy: invisível ao client
create table public.notifications_sent (
  id           uuid primary key,                                       -- v5(user_id, kind || ':' || ref || ':' || minuto ISO UTC)
  user_id      uuid not null references public.profiles on delete cascade,
  kind         text not null check (kind in ('departure_soon','departure_now','closes_soon','morning_briefing',
                                             'eve_checklist','cancel_deadline','team_arrived','retro_ready')),
  ref          text not null,
  scheduled_at timestamptz not null,
  sent_at      timestamptz,
  status       text not null default 'queued' check (status in ('queued','sent','failed','no_subscription')),
  error        text,
  unique (user_id, kind, ref, scheduled_at)
);
alter table public.notifications_sent enable row level security;
create index on public.notifications_sent (scheduled_at desc);

-- o que vence agora: função pura sobre o estado; o dedupe é o insert em notifications_sent feito pela Edge Function
create function public.due_notifications(p_now timestamptz default now())
returns table (user_id uuid, kind text, ref text, scheduled_at timestamptz, trip_id uuid, stop_id uuid,
               title text, body text, url text, tag text, actions text[])
language sql stable security definer set search_path = '' as $$
  with win as (select date_trunc('minute', p_now) as t1,
                      date_trunc('minute', p_now) - interval '2 minutes' as t0,          -- tolera atraso do cron
                      (p_now at time zone 'America/Sao_Paulo')::date as today),
  members as (                                       -- membros aceitos, com as preferências ou os padrões
    select m.trip_id, m.user_id, t.name as trip_name, t.start_date, t.end_date,
           coalesce(p.enabled, true) as enabled, coalesce(p.lead_minutes, 15) as lead,
           coalesce(p.kinds, '{}'::jsonb) as kinds, coalesce(p.morning_time, '07:00'::time) as morning
      from public.trip_members m
      join public.trips t on t.id = m.trip_id and t.deleted_at is null
      left join public.notification_prefs p on p.user_id = m.user_id and p.trip_id = m.trip_id
     where m.status = 'accepted' and m.deleted_at is null and m.user_id is not null),
  today_stops as (                                   -- paradas de hoje, em ordem
    select s.*, d.date, row_number() over (partition by s.trip_day_id order by s.position collate "C") as rn
      from public.stops s
      join public.trip_days d on d.id = s.trip_day_id and d.deleted_at is null, win
     where s.deleted_at is null and not s.skipped and d.date = win.today),
  nxt as (                                           -- a primeira não concluída e a anterior a ela: "sair às"
    select b.trip_id, b.id as next_id, b.name as next_name, a.departed_at, a.travel_minutes_to_next as travel,
           ((b.date + b.time) at time zone 'America/Sao_Paulo') - make_interval(mins => a.travel_minutes_to_next) as leave_at
      from today_stops b
      join today_stops a on a.trip_day_id = b.trip_day_id and a.rn = b.rn - 1
     where b.done_at is null and b.time is not null and a.travel_minutes_to_next is not null
       and b.rn = (select min(c.rn) from today_stops c where c.trip_day_id = b.trip_day_id and c.done_at is null)),
  due as (
    select mb.user_id, 'departure_soon'::text, n.next_id::text, n.leave_at - make_interval(mins => mb.lead),
           mb.trip_id, n.next_id,
           format('Sair em %s min para %s', mb.lead, n.next_name),
           format('%s min de estrada · chegada prevista %s', n.travel, to_char(n.leave_at + make_interval(mins => n.travel) at time zone 'America/Sao_Paulo', 'HH24:MI')),
           format('/viagens/%s/viagem', mb.trip_id), 'stop:' || n.next_id, array['departed']
      from nxt n join members mb on mb.trip_id = n.trip_id, win
     where n.departed_at is null and mb.enabled and coalesce((mb.kinds ->> 'departure_soon')::boolean, true)
       and n.leave_at - make_interval(mins => mb.lead) > win.t0 and n.leave_at - make_interval(mins => mb.lead) <= win.t1
    union all
    select mb.user_id, 'departure_now', n.next_id::text, n.leave_at, mb.trip_id, n.next_id,
           format('Hora de sair para %s', n.next_name), format('%s min de estrada', n.travel),
           format('/viagens/%s/viagem', mb.trip_id), 'stop:' || n.next_id, array['departed']
      from nxt n join members mb on mb.trip_id = n.trip_id, win
     where n.departed_at is null and mb.enabled and coalesce((mb.kinds ->> 'departure_now')::boolean, true)
       and n.leave_at > win.t0 and n.leave_at <= win.t1
    union all
    -- closes_soon · morning_briefing · eve_checklist · cancel_deadline · team_arrived · retro_ready: tabela 5.4
    select null::uuid, null, null, null, null, null, null, null, null, null, null where false
  )
  select d.* from due d
   where not exists (select 1 from public.notifications_sent x
                      where x.user_id = d.user_id and x.kind = d.kind and x.ref = d.ref and x.scheduled_at = d.scheduled_at);
$$;
revoke execute on function public.due_notifications(timestamptz) from public, anon, authenticated;
grant  execute on function public.due_notifications(timestamptz) to service_role;

-- a cada minuto: a Edge Function send-notifications. URL e chave secreta ficam no Vault, criadas uma vez por
-- ambiente (vault.create_secret), nunca na migration
select cron.schedule('viajei-send-notifications', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_secret_key')),
    body := jsonb_build_object('now', now()),
    timeout_milliseconds := 30000) as request_id;
$job$);
```
Por que a função é `security definer` em `public` e não em `private`: a Edge Function a chama por RPC com a chave secreta, e o PostgREST só expõe `public`. O `revoke`/`grant` deixa só `service_role` executar, então ela não vira RPC do client.

### 5.4 Os seis tipos restantes de `due_notifications` (mesma forma: ramo `union all` por tipo)

| kind | ref | `scheduled_at` | condição | título e corpo | ações |
|---|---|---|---|---|---|
| `closes_soon` | stop.id | `(date + closes_at)` em SP, menos 60 min | parada de hoje com `closes_at`, `done_at` nulo | "Salto Ventoso fecha às 17:00" · "faltam 60 min" | — |
| `morning_briefing` | trip_day.id | `date + morning_time` da pessoa | dia de viagem é hoje | "Dia 1 de 4 · sexta" · "4 paradas · primeira saída às 07:00 · clima" (clima buscado pela Edge Function no Open-Meteo) | — |
| `eve_checklist` | trip.id | véspera de `start_date`, 19:00 | existem itens `before`/`pack` com `done_at` nulo | "Amanhã é dia de viajar" · "3 itens de antes e 2 da mala faltando" | — |
| `cancel_deadline` | reservation.id | véspera de `cancel_until`, 10:00 | reserva com `cancel_until` | "Último dia para cancelar o Vila Suzana sem custo" · "até 08/12" | — |
| `team_arrived` | stop.id + minuto | `date_trunc('minute', stops.synced_at)` | `done_at` gravado e sincronizado na janela; destinatários ≠ `done_by`; padrão desligado | "Ana chegou à Casa Valduga" · "14:02" | — |
| `retro_ready` | trip.id | `end_date + 1`, 09:00 | viagem terminou | "A retrospectiva da viagem está pronta" · "4 dias, 17 paradas" | — |

Decisão em relação ao prompt (regra 10): a função usa `stops.synced_at`, e não `done_at`, para o `team_arrived`, porque `done_at` é a hora do client e pode chegar horas depois de um trecho sem sinal; a janela de 2 minutos sobre `synced_at` garante um aviso por marcação, na hora em que o servidor soube.

### 5.5 Correções encontradas na revisão da DDL salva (pedir ok em bloco)

| # | Onde | Problema | Correção |
|---|---|---|---|
| C1 | 0004 `trip_days` | `check (id = uuid_generate_v5(trip_id, date::text))` depende do `DateStyle` da sessão: com `SQL, DMY` a data vira `11/12/2026` e o id não bate com o do client | `check (id = extensions.uuid_generate_v5(trip_id, to_char(date, 'YYYY-MM-DD')))`. O client gera o v5 com a mesma string ISO |
| C2 | 0002 `claim_invites` | Se o dono convidar um e-mail de quem já é membro (ou o próprio), o `update` viola `unique (trip_id, user_id)` e a função inteira falha, inclusive para os outros convites | Reivindicar só onde ainda não há membro e aposentar o convite redundante: `update ... set user_id = v_uid where ... and not exists (select 1 from public.trip_members x where x.trip_id = m.trip_id and x.user_id = v_uid and x.deleted_at is null)`; depois `update ... set deleted_at = now()` nos que sobraram com esse e-mail |
| C3 | 0003 `sync_push`, caminho de update | Um `upsert` de `trip_members` que cai na linha existente (ex.: convidar de novo um e-mail que recusou) tenta atualizar `invited_email`, `role`, `status`, e o grant de coluna recusa a operação inteira | Montar `v_cols` só com colunas em que o usuário tem privilégio: `and has_column_privilege(format('public.%I', v_t.name)::regclass, a.attname, 'UPDATE')`. Só afeta `trip_members` e `notification_prefs`; o reconvite vira um patch de `deleted_at`, que é o comportamento certo |
| C4 | 0003 `sync_push` e 0001 `sync_guard` | Op sem `versions` grava `field_versions = null`; no `sync_guard` o `v_in ? v_col` vira `null` e todas as colunas inalteradas ganham versão nova | `coalesce(v_op -> 'versions', '{}'::jsonb)` ao montar `v_vals`, e `v_in := coalesce(..., '{}')` no trigger |
| C5 | 0003 `sync_push` | Update que não encontra a linha (inexistente ou invisível pela RLS) devolve `status: 'error'` sem `code` nem `message` | Devolver `code: 'P0002'` e `message: 'linha inexistente ou sem acesso'` nesse caso |
| C6 | 0003 `sync_pull` | Só o próprio XP e as próprias conquistas chegam ao aparelho (`sync_pull_user`); a retrospectiva ("conquistas e o time") e a tela de membros não teriam os dados dos outros, embora a policy permita ler | `sync_pull(trip)` também devolve `achievements` e `xp_events` com `trip_id = p_trip_id`, mais `create index on achievements (trip_id, synced_at)` e o mesmo em `xp_events` (0008) |
| C7 | 0002/0003 | `trip_members` não passa por `enable_trip_sync` e ficou sem os índices do pull | `create index on public.trip_members (trip_id, synced_at)` e `(user_id, synced_at)` |
| C8 | bucket (0006) | `image/heic` nos tipos permitidos: o Blob em cache de um HEIC não renderiza no Android nem no Chrome | Tirar `image/heic`; o client sempre converte a foto para JPEG na compressão (`browser-image-compression` com `fileType: 'image/jpeg'`) |
| C9 | 0001 | `private.uuid_or_null` é chamada pelas policies de Storage e Realtime sem grant explícito, e `service_role` não tem `usage` em `private` para o job de expurgo | `revoke/grant execute` explícitos como nas outras três funções; `grant usage on schema private to service_role` |
| C10 | 0004 | Pergunta 7 | `alter table public.trip_members add column share_position boolean not null default true`, editável só pelo próprio membro (grant de coluna + policy `user_id = auth.uid()`) |
| C11 | 0003 e Dexie v1 | `notification_prefs` sincroniza com escopo `user`, mas o Dexie v1 do prompt não tem a store | `notification_prefs: 'id, trip_id'` no `db.version(1)`; `sync_pull_user` já a devolve pelo loop de `scope = 'user'` |

Tudo o mais da DDL (RLS, FKs compostas, `sync_guard`, broadcast, convites, Storage, Realtime, progressão, `ai_imports`) foi revisado e fica como está.

### 5.6 Contrato de uma operação do push (fixa os nomes)
```
{ seq: 12, table: 'stops', id: '<uuid>', op: 'upsert' | 'patch',
  values: { done_at: '2026-12-11T16:27:00-03:00' },        // só as colunas tocadas (patch) ou todas (upsert)
  versions: { done_at: '2026-12-11T16:27:00-03:00' },      // hora da edição por coluna, do client
  updated_at: '2026-12-11T16:27:00-03:00' }
→ { seq: 12, status: 'applied' | 'ignored' | 'stale' | 'error', superseded: ['notes'], code?, message? }
```
Na outbox a linha chama-se `row_id`; o motor renomeia para `id` ao montar o lote. Tabelas `append` (`achievements`, `xp_events`) só aceitam `op: 'upsert'` e respondem `ignored` em colisão. O service worker usa a mesma `mutate` e a mesma outbox quando Partiu! ou Chegamos! vem do botão da notificação.

## 6. Pastas e ciclo offline

Sem mudanças em relação ao prompt v3 (seções 5.2 e 7.1). Três acréscimos pequenos: `docs/style-tile-v2.html` e este delta; `src/lib/geo/data/` com os dados embutidos (costa, municípios, biomas) gerados por `scripts/geo/build-data.ts` a partir das fontes (Natural Earth, IBGE), para o dado nunca ser editado à mão; `supabase/functions/_shared/route-schema.ts` com o Zod da `route-day`, compartilhado como o da importação. A pasta `supabase/migrations/` vai de 0001 a 0009 (seção 5.2).

## 7. Style tile v2 e storyboard

https://claude.ai/artifact/9ciLua3nNxeaPuxeyyy1DB (`docs/style-tile-v2.html`). O que pede aprovação:
- **Fontes:** Barlow Condensed para números, títulos e botões; Barlow para texto. Escala de tipos na página.
- **Paleta v2:** pôr do sol `#E8653A` só como acento (tinta `#B8471F` para texto), noite `#141A26`, asfalto `#3B4250`, faixa `#E9C24A`; estados `#1F9A66` / `#E9A23B` / `#D94B4B`; neutros com viés de asfalto (papel `#F4F4F2`, tinta `#1C2230`); céu em degradê como token (dia `#F6DCC5 → #F2EEE6`, noite `#0F1627 → #26304A`); HUD em vidro escuro `rgba(16,21,31,.8)` nos dois temas; cinco cores de cenário do protótipo. Contrastes medidos na página (texto sobre papel 14,4:1; tinta laranja sobre cartão 5,3:1; branco sobre laranja 3,3:1, só em texto grande).
- **As telas:** "Agora" no topo com a maquete abaixo (interativa: Partiu!, Chegamos!, noite, curiosidade do caminho, faixa de cenários, chips "Modo painel" e "Rever o dia"); a notificação no iPhone (toque abre o "Agora") e no Android (botão Partiu! na notificação) com o selo no ícone; visão geral; garagem showroom (cores e acessórios interativos); retrospectiva em filme (vídeo de 15 s e cards).
- **Novos estados:** chip de posição ("Posição ao abrir", "Modo painel · GPS contínuo", "Fora da rota · 3 km") e toast de chegada automática com "Desfazer".

Storyboard (também desenhado na página, quadro a quadro):

| Abertura do dia (uma vez por dia, 2 a 3 s) | Replay ao abrir (3 a 8 s conforme a distância) |
|---|---|
| 0,0 s · o relevo sobe, com as cores dos cenários | 0,0 s · sincroniza, uma leitura de posição (até 8 s), compara `travel_state` com o estado atual |
| 0,6 s · a estrada se desenha da origem à última parada | 0,5 s · o carro parte do ponto antigo, câmera parada, easing; "Pular" sempre visível |
| 1,2 s · anéis e pílulas caem no lugar; o próximo nó pulsa | 2,0 s · ao passar por uma parada: anel preenche, check salta, "+10 XP" |
| 1,8 s · o carro da garagem entra e estaciona na origem; chip do clima | 3,5 s · chip "Ana · 14:02" na marcação de outro membro |
| 2,4 s · o "Agora" preenche com o "sair às" e a contagem | 5,0 s · curiosidade encurtada (1,5 s; no máximo 3: serra, mar, ponto mais alto, entrada de cenário) |
| `prefers-reduced-motion`: um quadro só | 7,0 s · chega ao ponto atual; se o catch-up viu o carro no raio da próxima parada, "Chegamos?" com desfazer por 10 s. `prefers-reduced-motion`: card com a lista |

"Rever o dia" é o mesmo mecanismo do começo do dia até agora, em até 20 s, com as fotos das memórias nos nós.

## 8. Plano das 12 fases, dependências e matriz iPhone e Android

| Fase | Depende de | Pode andar em paralelo com | Entrega (resumo) |
|---|---|---|---|
| 1 Base | — | — | scaffold, tokens, fontes, primitivos, CI, Supabase local, 0001–0002, auth, perfil, convites |
| 2 Offline, PWA e viagens | 1 | — | Dexie, `mutate`, outbox, `sync_push/pull`, Realtime, SW próprio (`injectManifest`), sessão em IndexedDB, manifest, CRUD de viagens e membros, primeiro deploy |
| 3 Roteiro, rota real e trilha | 2 | — | 0004, dias derivados, paradas com arrastar, Nominatim, deep links, `route-day`, `lib/geo`, **cabeçalho "Agora"**, lista acessível, seed |
| 4 Uso com a tela apagada | 3 | 7, 8, 11 | 0005, push (assinatura, permissão no momento certo, ações no Android), `due_notifications` + `pg_cron`, `send-notifications`, `/avisos`, selo, **catch-up**, **modo painel** (Wake Lock, GPS, geofences, `trip_tracks`), `.ics`, redirecionamento de `/` |
| 5 Maquete 3D e replay | 3, 4 | 7, 8, 11 | gerador da maquete, cenários, câmera parada e curiosidades, noite, qualidade, carrinho pelo catch-up e pelo painel, **abertura do dia, replay, "Rever o dia"**, fora da rota |
| 6 Garagem 3D | 5 | 7, 8, 11 | 5 carros, 8 cores, acessórios, showroom, regras puras de desbloqueio, carro em toda a UI |
| 7 Reservas, anexos e memórias | 3 | 4, 5, 6, 8, 11 | 0006, upload com compressão, cache de Blob, folha pós-parada, diário, fotos nos nós do "Rever o dia" |
| 8 Listas, missões, contatos e gastos | 3 | 4, 5, 6, 7, 11 | 0007, sugestões de missão, ligar e WhatsApp, orçamento; véspera e cancelamento passam a ter dados |
| 9 Progressão e retrospectiva | 5, 6, 7, 8 | 10, 11 | 0008, XP, níveis, conquistas, cosméticos, filme com exportação, "retrospectiva pronta" |
| 10 Importação com IA | 3, 7, 8 | 9, 11 | 0009, Edge Function em streaming, limites, preview progressivo, geocodificação, salvar via outbox |
| 11 Mapa e clima | 3 (clima no briefing: 4) | 4 a 10 | Leaflet com rota real, cache de tiles, Open-Meteo no briefing e na abertura do dia |
| 12 Polish e E2E | todas | — | Playwright completo, matriz nos dois celulares, acessibilidade, Lighthouse, README, expurgo (job) |

Ordem de execução: 1 → 12, uma fase por vez, com ok entre elas. O paralelismo acima só diz o que não quebra se a ordem mudar.

Matriz de testes manuais, iPhone (Safari e PWA instalado, iOS 26) e Android (Chrome), com a fase em que cada item é validado:

| Item | iPhone | Android | Fase |
|---|---|---|---|
| Instalação do PWA (folha "Adicionar à Tela de Início" / `beforeinstallprompt`) | ✓ | ✓ | 2 |
| Offline completo, `navigateFallback`, aviso de nova versão | ✓ | ✓ | 2 |
| `navigator.storage.persist()` e retenção do IndexedDB (7 dias sem uso no iOS não instalado) | ✓ | ✓ | 2 |
| Sync entre dois aparelhos pelo Realtime, conflito por coluna | ✓ | ✓ | 2 |
| Pedido de permissão de push no momento certo; folha de instalação antes, no iPhone | ✓ | ✓ | 4 |
| Push com o app fechado e com o celular bloqueado; `tag` substituindo o aviso da mesma parada | ✓ (só instalado) | ✓ | 4 |
| Botões Partiu! e Chegamos! na notificação, gravando na fila offline pelo SW, com e sem sinal | não existe | ✓ | 4 |
| Toque na notificação abre o "Agora" com o botão em destaque | ✓ | ✓ | 4 |
| Selo no ícone (`setAppBadge`): pendências e ponto a 30 min da saída | ✓ | ✓ | 4 |
| Catch-up ao abrir: no raio (toast com desfazer), entre paradas, paradas puladas, sem permissão | ✓ | ✓ | 4 |
| Modo painel: Wake Lock, GPS contínuo, geofences, trilha, redução após 10 min parado | ✓ | ✓ | 4 |
| `.ics` do dia e da viagem abrindo no Calendário / Google Agenda, com os alarmes | ✓ | ✓ | 4 |
| WebGPU disponível; fallback WebGL2; lista acessível como último recurso | ✓ | ✓ | 5 |
| fps da maquete: alvo ≥ 45 em Alta, ≥ 30 em Leve; rebaixamento automático | ✓ | ✓ | 5 |
| Abertura do dia, replay ao abrir e "Rever o dia", com e sem `prefers-reduced-motion` | ✓ | ✓ | 5 |
| Render sob demanda e consumo de bateria em 30 min de modo painel | ✓ | ✓ | 5 |
| Vibração curta (`navigator.vibrate`) | não existe: silencioso | ✓ | 5 |
| Sons curtos opcionais (exigem gesto; chave de silêncio no iPhone) | ✓ | ✓ | 5 |
| Garagem: giro com o dedo, acessórios, reflexo do carro na UI | ✓ | ✓ | 6 |
| Câmera e galeria, compressão para JPEG, HEIC convertido | ✓ | ✓ | 7 |
| Exportação de vídeo (MediaRecorder: `video/mp4` no Safari, `video/webm` no Chrome) e cards por `html-to-image` | ✓ | ✓ | 9 |
| Web Share API com arquivo (`navigator.canShare({ files })`) | ✓ | ✓ | 9 |
| Deep links para Google Maps e Waze, `tel:` e `wa.me` | ✓ | ✓ | 3, 8 |
| Modo noite automático, texto 10% maior, `prefers-reduced-motion` | ✓ | ✓ | 5 |
| Safe areas, teclado sobre formulários, alvos de 48 px | ✓ | ✓ | 12 |
| Lighthouse PWA e Performance ≥ 90 no celular | ✓ | ✓ | 12 |

## 9. Contratos das Edge Functions

Conferido hoje: documentação do Supabase (Edge Functions: `withSupabase` de `npm:@supabase/server@1`, `verify_jwt = true` por padrão; agendamento oficial com `pg_cron` + `pg_net` e segredos no Vault; limites: 150 s de wall-clock no plano Free, 400 s nos pagos, 2 s de CPU, 256 MB) e referência atual da API da Anthropic (`claude-sonnet-5-5`; `tool_choice` forçado dá 400; saída estruturada por `output_config.format`; `fallbacks: "default"` com o beta `server-side-fallback-2026-07-01`, só nessa forma no Sonnet 5.5; `effort` padrão `high`, níveis recalibrados; `stop_reason: "refusal"` com `stop_details.category`).

### 9.1 `import-itinerary`
- **Chamada:** `POST /functions/v1/import-itinerary`, `Authorization: Bearer <JWT do usuário>`, `apikey: <publishable>`, `verify_jwt` ligado. Dentro: `withSupabase({ auth: 'user' })`, cliente `ctx.supabase` com RLS; nenhuma chave secreta.
- **Entrada (Zod em `_shared/import-schema.ts`):** `{ text: string (1 a 30.000 caracteres), trip: { name, start_date, end_date, origin | null } }`.
- **Processo:** insere `ai_imports` com `status = 'started'`; conta as importações do usuário nas últimas 24 h; se > 20, marca `rate_limited` e responde 429. Chama `client.messages.stream({ model: 'claude-sonnet-5-5', max_tokens: 16000, output_config: { effort: 'medium', format: zodOutputFormat(ImportSchema) }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], system, messages })`. Sem `thinking` explícito (adaptativo por padrão) e sem `tool_choice`.
- **Saída:** `text/event-stream`. Eventos `delta` com o texto JSON conforme sai (o client acumula e desenha o preview com `partial-json`); evento final `done` com `{ status, usage: { input_tokens, output_tokens }, data }`, em que `data` é o JSON validado pelo mesmo Zod no `finalMessage()`. Status gravados em `ai_imports`: `succeeded`, `refused` (`stop_reason: 'refusal'`, categoria em `error`), `truncated` (`stop_reason: 'max_tokens'`), `invalid` (Zod falhou), `failed` (exceção), `rate_limited`.
- **Schema de saída:** `days[] { date, title | null, stops[] { time | null, kind, name, address | null, closes_at | null, travel_minutes_to_next | null, notes | null, url | null } }`, `reservations[]`, `contacts[]`, `checklist_before[]`, `checklist_pack[]`, `quests[] (≤ 8, com stop_ref)`, `unclassified: string[]`. Opcionais como união com `null`; sem `min/max`, sem recursão. Coordenadas nunca vêm da IA: o preview geocodifica pelo Nominatim (1 req/s, `User-Agent` identificando o app, resultados guardados, busca por botão ou pausa de digitação, nunca por tecla) antes de salvar pela outbox.
- **Limites de tempo:** streaming mantém a conexão ativa; um texto de 30.000 caracteres com `effort: 'medium'` fica dentro dos 150 s do plano Free. Se não ficar na prática (medir na fase 10), reduzir a entrada ou ir para o plano Pro (400 s).

### 9.2 `route-day`
- **Chamada:** `POST /functions/v1/route-day`, mesmo esquema de autenticação. **Entrada:** `{ trip_day_id, points: [{ lat, lng }] }` com 2 a 25 pontos, ordenados.
- **Processo:** `ORS_API_KEY` em `supabase secrets`. `POST https://api.openrouteservice.org/v2/directions/driving-car/geojson` com `coordinates`, `elevation: true`, `instructions: false`. Limite por usuário: 60 chamadas por dia (tabela `route_requests` simples, 0004). Em desenvolvimento, `ROUTE_PROVIDER=osrm` usa o OSRM público para a geometria e a Elevation API do Open-Meteo (gratuita, sem chave, até 100 pontos por chamada) para a altitude.
- **Saída:** `{ provider, fetched_at, distance_m, duration_s, legs: [{ distance_m, duration_s }], ascent_m, descent_m, geometry: [[lng, lat, ele_m], …] (simplificada a ~1 ponto a cada 500 m, Douglas-Peucker em `lib/geo`), bbox }`. O client guarda em `routes` (Dexie, por `trip_day_id`, com hash das coordenadas) e só rechama quando o hash muda.
- **Cotas do OpenRouteService:** a página de planos não respondeu hoje (404); a cota de 2.000 rotas por dia do plano gratuito, citada no prompt, fica para reconferir ao criar a chave, na fase 3.

### 9.3 `send-notifications`
- **Chamada:** `POST /functions/v1/send-notifications`, servidor para servidor, a cada minuto pelo `pg_cron` via `pg_net`, com `apikey: <chave secreta>` lida do Vault. `verify_jwt = false` só nela (`[functions.send-notifications] verify_jwt = false` no `config.toml`); `withSupabase({ auth: 'secret' })` valida a chave e entrega `ctx.supabaseAdmin`. Qualquer chamada sem a chave secreta é recusada. **Decisão em relação ao prompt (regra 10):** a chave secreta faz o papel do `CRON_SECRET`, porque é o padrão documentado do Supabase, já é um segredo exclusivo do servidor e dá o cliente admin; um segredo a menos para guardar. Se o Douglas preferir os dois, o `x-cron-secret` entra como segunda conferência.
- **Entrada:** `{ now }` (informativo; a função usa `now()` do banco).
- **Processo:** `rpc('due_notifications')` → para cada linha, `insert` em `notifications_sent` (conflito no `unique` = já enviado, pula) → busca as assinaturas da pessoa (`failed_at is null`) → monta o payload `{ title, body, url, tag, actions, badge }` (no `morning_briefing`, busca o clima no Open-Meteo pela primeira parada com coordenadas) → envia com `npm:web-push@3.6.7` e as chaves VAPID de `supabase secrets` → 404 ou 410 marca `failed_at` na assinatura; outros erros gravam `status = 'failed'` e `error`; sucesso grava `sent_at` e `status = 'sent'`; sem assinatura, `no_subscription`. Tudo em paralelo limitado (8 envios por vez), dentro de 30 s.
- **Saída:** `{ due, sent, failed, no_subscription }` para o log do cron.
- **No service worker:** `push` mostra a notificação e atualiza o selo; `notificationclick` com ação `departed`/`arrived` grava via `mutate` no Dexie e tenta enviar a fila com a sessão lida do IndexedDB, sem ação abre a URL; `pushsubscriptionchange` reassina e atualiza `push_subscriptions`.
- **Variáveis:** `VITE_VAPID_PUBLIC_KEY` no client; `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`) em `supabase secrets`; `viajei_project_url` e `viajei_secret_key` no Vault do banco. O par VAPID é gerado uma vez (`web-push generate-vapid-keys`) e nunca trocado sem reassinar todos os aparelhos.

Open-Meteo (clima e elevação): 10.000 chamadas por dia no uso não comercial, licença CC-BY 4.0 (atribuição na tela de clima). Nominatim: 1 requisição por segundo, identificação obrigatória, sem autocomplete no client.

## 10. Depois do ok

1. `git init` em `viajei/` com `git config user.email 203018054+dougedss@users.noreply.github.com` e `user.name "Douglas Santos"`; `.gitignore`; commit inicial só com `docs/`.
2. `gh repo create dougedss/viajei --private` (gh já está na conta certa) e `git remote add origin git@github-dougedss:dougedss/viajei.git`; push.
3. Fase 1, nos termos da seção 12 do prompt: `docs/decisoes.md` nasce no primeiro commit de código, com as decisões C1 a C11, a chave secreta no lugar do `CRON_SECRET`, `synced_at` no `team_arrived` e o token da Supabase CLI por variável de ambiente.
