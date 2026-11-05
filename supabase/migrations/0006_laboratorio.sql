-- 0006_laboratorio: o laboratório de testes automáticos da tela apagada. Usuários de laboratório
-- (lab_access), a caixa de entrada do receptor de push de mentira (lab_inbox), os resultados de cada
-- execução (lab_runs, lab_checks) e um diagnóstico que só o laboratório lê. Nada aqui toca as
-- tabelas da viagem: o laboratório usa as mesmas RPCs e policies que o app, como um usuário comum.
-- As migrations seguintes renumeram: 0007 reservas, anexos e memórias · 0008 listas, contatos e
-- gastos · 0009 progressão · 0010 importação.

-- Quem é do laboratório: `runner` executa e grava resultados; `viewer` só vê o painel.
create table private.lab_access (
  user_id    uuid primary key references auth.users on delete cascade,
  role       text not null check (role in ('runner', 'viewer')),
  created_at timestamptz not null default now()
);

create function private.lab_role() returns text
language sql stable security definer set search_path = '' as $$
  select a.role from private.lab_access a where a.user_id = (select auth.uid());
$$;
revoke all on function private.lab_role() from public;
grant execute on function private.lab_role() to authenticated, service_role;

-- Para o app saber se mostra o painel (null para quem não é do laboratório).
create function public.my_lab_role() returns text
language sql stable security invoker set search_path = '' as $$
  select private.lab_role();
$$;
revoke execute on function public.my_lab_role() from public, anon;
grant execute on function public.my_lab_role() to authenticated;

-- Dá acesso ao laboratório por e-mail. Só a chave secreta (o `pnpm lab:setup`), nunca o client.
create function public.lab_grant(p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  select u.id into v_uid from auth.users u where lower(u.email) = lower(p_email);
  if v_uid is null then
    raise exception 'não existe usuário com o e-mail %', p_email using errcode = 'P0002';
  end if;
  insert into private.lab_access (user_id, role) values (v_uid, p_role)
  on conflict (user_id) do update set role = excluded.role;
  return v_uid;
end $$;
revoke execute on function public.lab_grant(text, text) from public, anon, authenticated;
grant execute on function public.lab_grant(text, text) to service_role;

-- Caixa de entrada do receptor de push de mentira (Edge Function push-receiver): cada POST que o
-- send-notifications faz para uma assinatura de laboratório vira uma linha, com o que um push
-- service real conferiria (VAPID, tamanho, cabeçalhos) e o corpo cifrado, que só o laboratório
-- decifra (ele guarda a chave privada da assinatura). Escrita só pelo receptor (chave secreta).
create table public.lab_inbox (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles on delete cascade,
  subscription_id  uuid,
  inbox            uuid not null,
  gone             boolean not null default false,
  status_code      smallint not null,
  received_at      timestamptz not null default now(),
  vapid_ok         boolean not null,
  vapid_error      text,
  vapid_sub        text,
  vapid_aud        text,
  vapid_exp        timestamptz,
  ttl              integer,
  urgency          text,
  topic            text,
  content_encoding text,
  size_bytes       integer not null,
  body_b64         text
);
alter table public.lab_inbox enable row level security;
create policy "caixa: só a minha" on public.lab_inbox for select to authenticated
  using (user_id = (select auth.uid()));
create policy "caixa: apagar a minha" on public.lab_inbox for delete to authenticated
  using (user_id = (select auth.uid()));
create index on public.lab_inbox (user_id, received_at desc);
create index on public.lab_inbox (received_at);

-- Uma execução do laboratório e os seus cenários.
create table public.lab_runs (
  id          uuid primary key,
  target      text not null check (target in ('production', 'local')),
  source      text not null check (char_length(source) between 1 and 40),
  commit_sha  text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  status      text not null check (status in ('pass', 'fail', 'skip')),
  summary     text check (char_length(summary) <= 500),
  started_at  timestamptz not null,
  finished_at timestamptz not null,
  diagnostics jsonb not null default '{}',
  runner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  check (finished_at >= started_at)
);
alter table public.lab_runs enable row level security;
create policy "laboratório: quem é do laboratório vê" on public.lab_runs for select to authenticated
  using (private.lab_role() is not null);
create policy "laboratório: o executor grava" on public.lab_runs for insert to authenticated
  with check (private.lab_role() = 'runner' and runner_id = (select auth.uid()));
create index on public.lab_runs (started_at desc);

create table public.lab_checks (
  run_id     uuid not null references public.lab_runs on delete cascade,
  scenario   text not null check (scenario ~ '^[a-z][a-z0-9_]{1,39}$'),
  status     text not null check (status in ('pass', 'fail', 'skip')),
  latency_ms integer check (latency_ms >= 0),
  detail     text check (char_length(detail) <= 1000),
  data       jsonb not null default '{}',
  primary key (run_id, scenario)
);
alter table public.lab_checks enable row level security;
create policy "laboratório: quem é do laboratório vê" on public.lab_checks for select to authenticated
  using (private.lab_role() is not null);
create policy "laboratório: o executor grava" on public.lab_checks for insert to authenticated
  with check (private.lab_role() = 'runner'
              and exists (select 1 from public.lab_runs r
                           where r.id = run_id and r.runner_id = (select auth.uid())));

-- Diagnóstico para quando algo falha: as últimas execuções do cron, as respostas HTTP do pg_net e
-- o que o servidor reservou para os usuários do laboratório. Só quem é do laboratório lê.
create function public.lab_diagnostics(p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.lab_role() is null then
    raise exception 'só para o laboratório' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cron', coalesce((
      select jsonb_agg(jsonb_build_object('start', r.start_time, 'status', r.status,
                                          'message', left(r.return_message, 200)) order by r.start_time desc)
        from (select d.start_time, d.status, d.return_message
                from cron.job_run_details d join cron.job j on j.jobid = d.jobid
               where j.jobname = 'viajei-send-notifications' and d.start_time >= p_since
               order by d.start_time desc limit 15) r), '[]'::jsonb),
    'http', coalesce((
      select jsonb_agg(jsonb_build_object('at', h.created, 'status', h.status_code, 'timed_out', h.timed_out,
                                          'error', left(h.error_msg, 200), 'body', left(h.content, 300))
                       order by h.created desc)
        from (select x.created, x.status_code, x.timed_out, x.error_msg, x.content
                from net._http_response x where x.created >= p_since
               order by x.created desc limit 15) h), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'ref', n.ref, 'status', n.status, 'attempts', n.attempts,
                                          'error', n.error, 'scheduled_at', n.scheduled_at, 'sent_at', n.sent_at)
                       order by n.scheduled_at)
        from public.notifications_sent n join private.lab_access a on a.user_id = n.user_id
       where n.created_at >= p_since), '[]'::jsonb));
end $$;
revoke execute on function public.lab_diagnostics(timestamptz) from public, anon;
grant execute on function public.lab_diagnostics(timestamptz) to authenticated;
