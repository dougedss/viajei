import { Link } from 'react-router';
import { Wordmark } from '@/components/ui/Wordmark.tsx';

export function NotFound() {
  return (
    <main className="grid min-h-full place-content-center gap-3 bg-paper py-10 safe-x text-center">
      <Wordmark className="text-[40px]" />
      <h1 className="font-num text-[28px] font-semibold">Página não encontrada</h1>
      <Link
        to="/viagens"
        className="inline-flex min-h-12 items-center font-semibold text-accent-ink underline"
      >
        Ir para o início
      </Link>
    </main>
  );
}
