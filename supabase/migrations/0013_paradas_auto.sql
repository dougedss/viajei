-- 0013_paradas_auto: o tipo Posto e a parada que se registra sozinha (fase 15).
-- Só amplia o que o banco aceita: nenhuma linha muda, nada é recusado que antes passava.
--  1. `stops.kind` ganha `fuel` (Posto), espelhando `STOP_KINDS` de `_shared/constants.ts`.
--  2. `stops.source` ganha `auto`: a parada que o GPS registrou com o mapa aberto, com a hora medida
--     da chegada e da saída. Continua imutável depois de criada (o `sync_guard` da 0010 não muda).
-- O `drop` e o `add` vão na mesma instrução: a tabela nunca fica sem o `check`.

alter table public.stops
  drop constraint stops_kind_check,
  add constraint stops_kind_check
    check (kind in ('origin', 'transit', 'nature', 'winery', 'hotel', 'food', 'event', 'city', 'fuel', 'other'));

alter table public.stops
  drop constraint stops_source_check,
  add constraint stops_source_check check (source in ('user', 'ai', 'auto'));
