import { Navigate, useLocation, useParams } from 'react-router';
import { GARAGE_PATH, type GarageState } from '../links.ts';

/**
 * A garagem antiga (`/viagens/:tripId/garagem`, até a fase 15): o carro passou a ser da pessoa, e a
 * garagem foi para o perfil. Os links guardados continuam valendo: redireciona com a query
 * (`?render=list`, `?diag=1`), e o "voltar" da garagem leva à viagem de onde o link vinha.
 */
export default function GaragemRedirect() {
  const { tripId = '' } = useParams();
  const location = useLocation();
  const state: unknown = location.state;
  const back = (state as GarageState | null)?.back ?? `/viagens/${tripId}/detalhes`;
  return (
    <Navigate
      to={`${GARAGE_PATH}${location.search}`}
      replace
      state={{ back } satisfies GarageState}
    />
  );
}
