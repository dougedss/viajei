import { OPEN_METEO_ATTRIBUTION } from '@shared/weather.ts';
import { useNow } from '@/features/travel-mode/hooks.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { updatedLabel } from '../rules.ts';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A atribuição do Open-Meteo (CC BY 4.0: um link junto de onde o dado aparece) e a hora da previsão
 * guardada. Vai nas telas com o detalhe (visão geral e dia); o chip da maquete, as pílulas e o "Agora"
 * contam com elas. Sem rede, o "atualizado às" diz de quando é o que está na tela.
 */
export function WeatherCredit({ updatedAt }: { updatedAt: string | null }) {
  const now = useNow(60_000);
  const online = useOnline();
  return (
    <p className="text-[13px] text-ink-2" data-weather-credit>
      {updatedAt ? (
        <span data-weather-updated>
          {online
            ? capitalize(updatedLabel(updatedAt, now))
            : `Sem internet · ${updatedLabel(updatedAt, now)}`}
        </span>
      ) : null}
      {updatedAt ? ' · ' : null}
      <a
        href={OPEN_METEO_ATTRIBUTION.href}
        target="_blank"
        rel="noreferrer"
        className="font-semibold text-accent-ink underline-offset-2 hover:underline"
      >
        {OPEN_METEO_ATTRIBUTION.label}
      </a>
    </p>
  );
}
