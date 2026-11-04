import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { Wordmark } from '@/components/ui/Wordmark.tsx';

export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="grid min-h-full place-content-center gap-4 bg-paper py-10 safe-x text-center">
      <Wordmark className="text-[40px]" />
      <h1 className="font-num text-[28px] font-semibold">
        {notFound ? 'Página não encontrada' : 'Algo deu errado por aqui'}
      </h1>
      <p className="max-w-[40ch] text-ink-2">
        {notFound
          ? 'O endereço não existe mais ou foi digitado errado.'
          : 'Recarregue a página. Se continuar, avise o Douglas.'}
      </p>
      <div className="flex justify-center gap-2">
        <Button variant="secondary" onClick={() => window.location.assign('/')}>
          Ir para o início
        </Button>
        {notFound ? null : <Button onClick={() => window.location.reload()}>Recarregar</Button>}
      </div>
    </main>
  );
}
