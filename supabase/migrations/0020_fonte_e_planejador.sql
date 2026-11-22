-- 0020_fonte_e_planejador: a fonte de lugares do Google e o planejador com ferramentas (fase 27).
-- Só acrescenta: nenhuma coluna sai, nenhuma linha se perde, nenhum check novo recusa linha que existe.
--
--  1. `stops.google_place_id`: o identificador do lugar na Places API (New) do Google, ao lado do
--     objeto do OSM da 0017. A decisão 4 do Douglas (21/11/2026): o roteiro guarda o lugar inteiro (o
--     nome, o endereço, a coordenada), como hoje, mais o `place_id`; é o que o chat da fase 29 e o
--     catálogo da 23 vão usar para falar do mesmo lugar. Texto, nulo nas paradas de antes e nas que não
--     vêm do Google; o `check` só limita o tamanho e o alfabeto (os ids do Google são ASCII imprimível).
--  2. `ai_imports.kind` ganha `plan_search` (o planejador: uma linha por rodada, com os tokens de todos
--     os turnos somados), `bateria_pedidos` (a leitura que gera os dez pedidos de uma rodada da bateria
--     do laboratório) e `bateria_juiz` (a leitura que julga o roteiro de um pedido contra o pedido). O
--     registro continua só registro (D128): nunca o texto nem a resposta.

alter table public.stops
  add column google_place_id text
    check (google_place_id is null or (char_length(google_place_id) between 1 and 300
                                       and google_place_id ~ '^[A-Za-z0-9_=:./+-]+$'));

alter table public.ai_imports
  drop constraint ai_imports_kind_check,
  add constraint ai_imports_kind_check
    check (kind in ('import', 'plan', 'today', 'confirmation', 'receipt', 'landmark',
                    'plan_search', 'bateria_pedidos', 'bateria_juiz'));
