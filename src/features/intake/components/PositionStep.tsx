import { LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';

/**
 * A pergunta de posição na conversa (fase 25, D271; a decisão 2 de 21/11): uma frase e um toque, uma
 * vez por aparelho, pelo mesmo consentimento do mapa (D48, `askKeys.geoAsked`) e pela permissão do
 * navegador. Onde a pessoa está é o ponto de referência de tudo: de onde sai, o que é "perto", a
 * cidade dita. Negada, a conversa segue pela origem conhecida e não insiste (D176).
 */
export function PositionStep({
  onAllow,
  onDecline,
}: {
  onAllow: () => void;
  onDecline: () => void;
}) {
  return (
    <Card
      role="region"
      aria-label="Usar a posição do celular"
      className="grid gap-3"
      data-position-ask
    >
      <p className="flex items-start gap-3 text-[16px]">
        <LocateFixed className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden="true" />
        Posso usar a posição do celular para saber de onde vocês saem? É ela que diz o que fica
        perto. Uma leitura agora, nada em segundo plano.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="md" onClick={onAllow}>
          Usar posição
        </Button>
        <Button variant="ghost" size="md" onClick={onDecline}>
          Agora não
        </Button>
      </div>
    </Card>
  );
}
