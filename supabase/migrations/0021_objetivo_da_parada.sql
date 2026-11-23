-- 0021_objetivo_da_parada: o objetivo do trecho guardado na parada (fase 28, D318).
-- Só acrescenta: nenhuma coluna sai, nenhuma linha se perde, nenhum check recusa linha que existe.
--
-- O mapa da viagem mostra um trecho por vez, até o objetivo (as decisões 9 a 13 do Douglas, 21/11/2026):
-- "o objetivo é o destino que a pessoa disse". A conversa o sabe (o destino dito, D304 e D313), mas a
-- conversa se apaga ao salvar a viagem, e na viagem salva o destino é só uma parada como as outras.
-- `stops.objective` guarda isso na parada: `true` só na que a conversa marcou; as paradas de antes, as
-- da importação, as do formato do Viajei e as de outras IAs ficam `false`, e o app divide o dia pela
-- regra de reserva (a ida e a volta, na parada mais longe de casa). Um app antigo que não mande a
-- coluna não a toca: o `sync_push` monta as colunas pela interseção com as que a tabela tem (0003), e
-- um patch sem ela deixa o valor como está.

alter table public.stops
  add column objective boolean not null default false;
