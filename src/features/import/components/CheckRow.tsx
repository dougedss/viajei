import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/cx.ts';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** o nome acessível, quando o rótulo é composto */
  ariaLabel?: string;
  /** embaixo do rótulo; pode ter botão próprio (ex.: "Escolher o local") */
  detail?: ReactNode;
  /** à direita, fora da área do toque que marca (ex.: "Editar") */
  action?: ReactNode;
};

/**
 * Uma linha da revisão que entra ou não na viagem: o mesmo desenho das listas.
 *
 * O botão que marca é uma camada que cobre a linha, por baixo do desenho; a caixa, o rótulo e o
 * detalhe ficam por cima e deixam o toque passar. Assim o detalhe pode ter um botão próprio sem ser
 * botão dentro de botão, que passava o toque para a caixa: escolher o local desmarcava a parada.
 * Só o que é interativo no detalhe fica com o próprio toque.
 */
export function CheckRow({ checked, onChange, label, ariaLabel, detail, action }: Props) {
  const labelId = useId();
  const detailId = useId();
  return (
    <div className="flex items-center gap-1 rounded-[16px] bg-card pl-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
      <div className="relative flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : labelId}
          aria-describedby={detail ? detailId : undefined}
          onClick={() => onChange(!checked)}
          className="absolute inset-y-0 right-0 -left-3 rounded-l-[16px]"
        />
        <span
          className={cx(
            'pointer-events-none relative grid size-7 shrink-0 place-items-center rounded-[9px] transition',
            checked ? 'bg-on-time text-white' : 'shadow-[inset_0_0_0_2px_var(--color-line)]',
          )}
          aria-hidden="true"
        >
          {checked ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        {/* a coluna nunca passa da linha: um endereço longo da busca quebra em vez de alargar a tela */}
        <span
          className={cx(
            'pointer-events-none relative grid min-w-0 grid-cols-1',
            !checked && 'opacity-60',
          )}
        >
          {/* o rótulo é o nome do botão (pelo aria-label ou pelo aria-labelledby): não se lê duas vezes */}
          <span
            id={labelId}
            aria-hidden="true"
            className="text-[16px] leading-snug [overflow-wrap:anywhere]"
          >
            {label}
          </span>
          {detail ? (
            <span
              id={detailId}
              className="flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] text-ink-2 [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
            >
              {detail}
            </span>
          ) : null}
        </span>
      </div>
      {action ? <div className="shrink-0 pr-1">{action}</div> : null}
    </div>
  );
}
