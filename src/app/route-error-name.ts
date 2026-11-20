import { isRouteErrorResponse } from 'react-router';

/**
 * O nome do erro que derrubou a tela, para quem diagnostica (o laboratório lê `data-route-error`,
 * fase 23): o nome da classe (`TypeError`, `DatabaseClosedError`) ou o status de uma resposta, nunca
 * a mensagem, que pode carregar dado.
 */
export function routeErrorName(error: unknown): string {
  if (isRouteErrorResponse(error)) return `http-${String(error.status)}`;
  if (error instanceof Error)
    return /^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(error.name) ? error.name : 'Error';
  return typeof error;
}
