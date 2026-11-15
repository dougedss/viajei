-- 0015_conversa: criar a viagem conversando (fase 17). Só acrescenta.
--  1. `ai_imports.kind`: para que foi a leitura da IA. `import` (o roteiro colado, a fase 10, e o
--     padrão: as linhas de antes continuam o que eram), `plan` (a conversa: as perguntas e o roteiro
--     montado) e `today` (a saída de hoje). O registro continua só registro (D128): nunca o texto nem
--     a resposta. A cota de cada caminho é da `edge_call` (D24): `import-itinerary` (20 em 24 h),
--     `plan-trip` (10: a leitura da conversa ou da saída de hoje) e `plan-trip-ask` (20: as perguntas,
--     que não contam como leitura).
--  2. `profiles.interests`: "O que você gosta" no perfil, os chips opcionais (natureza, vinícolas,
--     comida, cidades históricas, praia, museus, "estrada de chão: não"). Os valores são os de
--     `INTERESTS` em `_shared/constants.ts`. Só a própria pessoa muda (o grant de coluna, sob a policy
--     "editar o próprio"), pela outbox como o carro (o `sync_guard` carimba a versão da coluna, e o
--     pull do usuário traz o próprio perfil inteiro, 0014). Não avisa o Realtime: o time não mostra.
--  3. `public.lab_drop_trip(id)`: o expurgo de uma viagem do laboratório já excluída. Os cenários da
--     fase 17 criam a viagem pelo campo (o id é do aparelho, não um id fixo); sem isto, cada execução
--     deixaria uma viagem excluída por 30 dias, e o aparelho novo do lab-a puxaria cada uma no
--     primeiro ciclo. Só o executor do laboratório, só na viagem dele, só depois de excluída e sem
--     anexo; como o expurgo de sempre (0012), a cascata leva o resto e o horizonte da pessoa sobe.

-- ------------------------------------------------------------------------- 1. ai_imports.kind
alter table public.ai_imports
  add column kind text not null default 'import' check (kind in ('import', 'plan', 'today'));
-- abrir a linha diz a finalidade; fechar não muda (o grant de update continua o da 0010)
grant insert (kind) on public.ai_imports to authenticated;

-- ------------------------------------------------------------------------- 2. profiles.interests
alter table public.profiles
  add column interests text[] not null default '{}'
    check (interests <@ array['nature', 'wineries', 'food', 'historic', 'beach', 'museums',
                              'no_dirt_road']::text[]);

revoke update on public.profiles from authenticated;
grant update (name, color, updated_at, field_versions,
              car_model, car_color, car_accessories, car_finish, car_wheels,
              notify_lead_minutes, notify_morning_time, interests)
  on public.profiles to authenticated;

-- ------------------------------------------------------------------------- 3. lab_drop_trip
create function public.lab_drop_trip(p_trip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if private.lab_role() is distinct from 'runner'
     or not exists (select 1 from auth.users u
                     where u.id = v_uid and lower(u.email) like '%.invalid') then
    raise exception 'só o executor do laboratório' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trips t
                  where t.id = p_trip_id and t.owner_id = v_uid and t.deleted_at is not null) then
    raise exception 'só uma viagem do executor do laboratório, já excluída' using errcode = '42501';
  end if;
  -- um arquivo no Storage não sai pela cascata: a viagem com anexo fica para o expurgo de sempre
  if exists (select 1 from public.attachments a where a.trip_id = p_trip_id) then
    raise exception 'a viagem tem anexos' using errcode = '55000';
  end if;
  -- as participações somem sem lápide: o aparelho com o cursor de antes recomeça do zero (o
  -- horizonte da pessoa, como no expurgo da 0012)
  insert into private.user_horizons as h (user_id, horizon) values (v_uid, now())
      on conflict (user_id) do update set horizon = greatest(h.horizon, excluded.horizon);
  delete from public.trips t where t.id = p_trip_id;
end $$;
revoke execute on function public.lab_drop_trip(uuid) from public, anon;
grant execute on function public.lab_drop_trip(uuid) to authenticated;
