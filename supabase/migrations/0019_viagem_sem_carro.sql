-- 0019_viagem_sem_carro: as colunas `car_*` saem de `trips` (fase 25, a 3.0; D199, D268, D270).
--
-- O carro é da pessoa desde a fase 16 (0014: `profiles.car_*`). As três colunas ficaram em `trips` só
-- para um PWA de antes da 16, ainda em cache, não quebrar ao gravá-las; a D199 marcou a retirada para
-- quando nenhum aparelho pudesse estar com ele (~21/11), com o `--dry-run` lido antes.
--
-- O que a leitura mostrou antes de tirar (D270):
--  1. nenhum caminho de hoje lê ou escreve `trips.car_*`: o tipo `Trip` do app já as omitia, as
--     fábricas de teste, os e2e e o laboratório só tocam `profiles.car_*`;
--  2. o `sync_push` (0003) monta as colunas de um upsert ou de um patch pela interseção entre as chaves
--     do JSON e as colunas que a tabela tem (`pg_attribute`): um app antigo que ainda mande `car_model`
--     numa viagem tem a chave ignorada, e a operação é aplicada sem erro (o pgTAP 21 prova);
--  3. a `private.copy_trip_cars()` (0014), a cópia de uma vez do carro da viagem para o perfil, lia as
--     colunas: já rodou na 0014 e sai junto.
-- Nenhuma linha se perde: só as três colunas e a função de uma vez.

drop function private.copy_trip_cars();

alter table public.trips
  drop column car_model,
  drop column car_color,
  drop column car_accessories;
