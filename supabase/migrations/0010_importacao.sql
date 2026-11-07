-- 0010_importacao (fase 10): o registro das importações com IA, o limite diário sem corrida e a
-- origem das paradas (o fato da conquista `planner`). A última migration do plano. O texto colado e a resposta da IA nunca entram no banco: só o
-- tamanho do texto, os tokens, o modelo que respondeu, o estado e um código curto de erro.

-- ------------------------------------------------------------------------------- edge_call
-- O limite da importação é o mesmo da route-day (D24), e não uma contagem de ai_imports: o client
-- não muda nem apaga `edge_calls`. Duas mudanças, valendo para as duas funções:
-- 1. Trava por pessoa e função até o fim da transação. Sem ela, duas chamadas ao mesmo tempo
--    contavam 19 cada uma e passavam as duas; com ela, a segunda espera a primeira terminar e conta
--    a linha que a primeira gravou. Uma rota nunca espera uma importação (a chave inclui a função).
-- 2. A recusa leva em DETAIL a hora em que a cota volta: quando sai da janela a linha que deixa o
--    total abaixo do limite (com 20 de 20, a mais antiga). A mensagem não muda.
create or replace function public.edge_call(p_fn text, p_limit integer) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_n    integer;
  v_back timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('edge_call:' || v_uid::text || ':' || p_fn, 0));
  select count(*) into v_n from public.edge_calls
   where user_id = v_uid and fn = p_fn and created_at > now() - interval '24 hours';
  if v_n >= p_limit then
    select created_at + interval '24 hours' into v_back from public.edge_calls
     where user_id = v_uid and fn = p_fn and created_at > now() - interval '24 hours'
     order by created_at
     offset v_n - p_limit limit 1;
    raise exception 'limite de % chamadas por dia atingido', p_limit
      using errcode = '54000',
            detail = to_char(v_back at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  insert into public.edge_calls (user_id, fn) values (v_uid, p_fn);
  return v_n + 1;
end $$;

-- ------------------------------------------------------------------------------ ai_imports
-- Só o registro. A Edge Function import-itinerary, rodando como a pessoa (RLS vale, sem chave
-- secreta), abre a linha em `started` e a fecha uma vez com o estado, os tokens, o modelo que
-- respondeu (o fallback pode trocar) e um código curto. Não sincroniza: é dado só de servidor.
create table public.ai_imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles on delete cascade,
  trip_id       uuid references public.trips on delete set null,
  input_chars   integer not null check (input_chars between 1 and 30000),
  model         text not null check (model ~ '^claude-[a-z0-9.-]{1,60}$'),
  status        text not null default 'started' check (status in
                ('started', 'succeeded', 'refused', 'truncated', 'invalid', 'failed', 'canceled')),
  -- um código, nunca texto livre: 'max_tokens', 'deadline', 'refusal:general_harms', 'abandoned'…
  error         text check (error ~ '^[a-z][a-z0-9_:]{0,59}$'),
  input_tokens  integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  constraint ai_imports_finished check ((status = 'started') = (finished_at is null))
);
create index on public.ai_imports (user_id, created_at desc);
create index ai_imports_open on public.ai_imports (created_at) where status = 'started';

alter table public.ai_imports enable row level security;
-- O Supabase dá tudo a `authenticated` em tabela nova (a 0001 só revoga de `anon`). Sem este
-- revoke, os grants de coluna abaixo não restringiriam nada.
revoke all on public.ai_imports from anon, authenticated;
grant select on public.ai_imports to authenticated;
-- abrir: só a viagem, o tamanho e o modelo pedido; id, dono, estado e carimbo são do banco
grant insert (trip_id, input_chars, model) on public.ai_imports to authenticated;
-- fechar: o estado e o que se sabe no fim; nunca created_at, input_chars, trip_id ou user_id
grant update (status, model, error, input_tokens, output_tokens) on public.ai_imports to authenticated;

create policy "importações: as minhas" on public.ai_imports for select to authenticated
  using (user_id = (select auth.uid()));
create policy "importações: abro as minhas" on public.ai_imports for insert to authenticated
  with check (user_id = (select auth.uid())
              and (trip_id is null or (select private.is_trip_member(trip_id))));
create policy "importações: fecho as minhas" on public.ai_imports for update to authenticated
  using (user_id = (select auth.uid()) and status = 'started')
  with check (user_id = (select auth.uid()));

-- Uma linha fecha uma vez: só sai de `started`, nunca volta, e o carimbo é do servidor. Vale
-- também para o job abaixo, que roda como o dono do banco.
create function private.ai_imports_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'started' then
    raise exception 'esta importação já foi encerrada' using errcode = '42501';
  end if;
  if new.status = 'started' then
    raise exception 'o registro só muda para encerrar a importação' using errcode = '22023';
  end if;
  new.finished_at := now();
  return new;
end $$;
create trigger a_close before update on public.ai_imports
  for each row execute function private.ai_imports_close();

-- Nenhuma linha fica em `started` para sempre. A função encerra antes do limite de parede e fecha
-- o registro em todo caminho, inclusive no cancelamento; o que sobra é o worker morto pela
-- plataforma (CPU ou memória). Dez minutos é mais que o maior limite de parede (400 s, no Pro).
create function private.close_abandoned_imports() returns integer
language sql set search_path = '' as $$
  with closed as (
    update public.ai_imports set status = 'failed', error = 'abandoned'
     where status = 'started' and created_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::integer from closed;
$$;
revoke all on function private.close_abandoned_imports() from public;

select cron.schedule('viajei-ai-imports', '*/10 * * * *',
                     'select private.close_abandoned_imports()');

-- ----------------------------------------------------------------------------- stops.source
-- A origem da parada, como `checklist_items.source` (D93): 'ai' quando entrou por uma importação
-- com IA revisada pela pessoa. É o fato que sincroniza da conquista `planner`: a regra pura da fase
-- 9 o lê no aparelho, sem sinal. Nunca muda depois de criada (mudar a parada não muda a origem).
alter table public.stops add column source text not null default 'user'
  check (source in ('user', 'ai'));
drop trigger b_sync on public.stops;
create trigger b_sync before insert or update on public.stops
  for each row execute function private.sync_guard('trip_id', 'source');
