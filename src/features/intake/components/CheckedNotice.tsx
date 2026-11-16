import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';

const list = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}`;

/**
 * O lugar que a pessoa nomeou e o mapa não achou (fase 24): ela disse, então ele está na viagem (a
 * regra de ouro), sem local; a revisão procura de novo, e dá para voltar às opções e buscar pelo tipo.
 * Nada sai em silêncio.
 */
export function CheckedNotice({
  missing,
  onToOptions,
}: {
  missing: readonly string[];
  onToOptions?: (() => void) | undefined;
}) {
  if (missing.length === 0) return null;
  return (
    <Card className="grid gap-2 shadow-[inset_0_0_0_2px_var(--color-tight)]" data-checked="faltou">
      <p className="text-[15px]">
        Não achei no mapa {missing.length === 1 ? 'o lugar' : 'os lugares'} que vocês disseram:{' '}
        {list(missing)}. {missing.length === 1 ? 'Ele entrou' : 'Eles entraram'} na viagem sem
        local; toque em Editar para procurar de novo, ou volte às opções para buscar pelo tipo.
      </p>
      {onToOptions ? (
        <Button variant="secondary" size="md" onClick={onToOptions}>
          Voltar às opções
        </Button>
      ) : null}
    </Card>
  );
}

/** A viagem só com a saída e a chegada não é um sucesso: a tela diz o que faltou (fase 24). */
export function NoPlaceNotice({ onToOptions }: { onToOptions?: (() => void) | undefined }) {
  return (
    <Card
      role="alert"
      className="grid gap-2 shadow-[inset_0_0_0_2px_var(--color-tight)]"
      data-no-place
    >
      <p className="text-[15px]">
        Ainda não há nenhum lugar na viagem além da saída e da chegada. Ligue uma sugestão ou volte
        às opções para escolher para onde ir.
      </p>
      {onToOptions ? (
        <Button variant="secondary" size="md" onClick={onToOptions}>
          Voltar às opções
        </Button>
      ) : null}
    </Card>
  );
}
