import { Wordmark } from '@/components/ui/Wordmark.tsx';

/** Tela de espera curta: enquanto a sessão é lida do storage ou uma rota lazy baixa. */
export function Splash() {
  return (
    <div
      className="grid min-h-full place-items-center bg-paper"
      aria-busy="true"
      aria-label="Carregando"
    >
      <Wordmark className="animate-pulse text-[48px]" />
    </div>
  );
}
