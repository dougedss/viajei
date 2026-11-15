import { Info, Sparkles, WifiOff } from 'lucide-react';
import { useId } from 'react';
import { IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { cx } from '@/lib/cx.ts';
import { looksLikeViajei, type FormatError } from '../format.ts';
import { charCount, quotaHint, type ErrorCopy } from '../messages.ts';
import { FormatErrors } from './FormatErrors.tsx';

type Props = {
  text: string;
  onText: (text: string) => void;
  online: boolean;
  remaining: number | null;
  error: ErrorCopy | null;
  /** o formato do Viajei com linhas que não deu para ler (fase 17) */
  formatErrors: readonly FormatError[] | null;
  /** o que chegou antes do corte dá para revisar */
  canReviewPartial: boolean;
  onRead: () => void;
  onReadWithAi: () => void;
  onReviewPartial: () => void;
  onDismiss: () => void;
};

/** Colar o roteiro: o campo, o contador, a linha sobre a IA e o botão de ler. */
export function ComposeStep({
  text,
  onText,
  online,
  remaining,
  error,
  formatErrors,
  canReviewPartial,
  onRead,
  onReadWithAi,
  onReviewPartial,
  onDismiss,
}: Props) {
  const fieldId = useId();
  const counterId = `${fieldId}-count`;
  // o formato do Viajei é lido aqui, sem IA nem rede, e sem o limite da IA (fase 17)
  const local = looksLikeViajei(text);
  const tooLong = !local && text.length > IMPORT_MAX_CHARS;
  const empty = text.trim() === '';
  const outOfReads = remaining === 0;
  const hint = quotaHint(remaining);

  return (
    <div className="grid gap-4">
      {error ? (
        <Card role="alert" className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]">
          <p className="font-num text-[20px] leading-tight font-semibold">{error.title}</p>
          <p className="text-[15px] text-ink-2">{error.text}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {canReviewPartial ? (
              <Button size="md" onClick={onReviewPartial}>
                Revisar o que chegou
              </Button>
            ) : null}
            <Button variant="ghost" size="md" onClick={onDismiss}>
              Voltar ao texto
            </Button>
          </div>
        </Card>
      ) : null}

      {formatErrors ? (
        <FormatErrors errors={formatErrors} online={online} onReadWithAi={onReadWithAi} />
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor={fieldId} className="text-[15px] font-semibold">
          Roteiro
        </label>
        <textarea
          id={fieldId}
          rows={12}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Cole aqui o roteiro: a conversa do WhatsApp, as notas, os e-mails de reserva…"
          aria-describedby={counterId}
          aria-invalid={tooLong || undefined}
          autoComplete="off"
          spellCheck={false}
          className={cx(
            'min-h-[40vh] w-full resize-y rounded-field bg-card px-4 py-3 text-[17px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] transition outline-none placeholder:text-ink-2/70 focus:shadow-[inset_0_0_0_2px_var(--color-accent)]',
            tooLong && 'shadow-[inset_0_0_0_2px_var(--color-late)]',
          )}
        />
        <p id={counterId} className="flex flex-wrap justify-between gap-x-3 text-[14px] text-ink-2">
          <span className={cx('num', tooLong && 'font-semibold text-late-ink')}>
            {charCount(text.length)}
          </span>
          {empty ? null : <span>Rascunho guardado neste celular</span>}
        </p>
        {tooLong ? (
          <p className="text-[14px] font-semibold text-late-ink">
            Passou do limite. Leia uma parte agora e o resto depois: a segunda leitura acrescenta,
            sem apagar a primeira.
          </p>
        ) : null}
      </div>

      <p className="flex gap-2 text-[14px] text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {local
            ? 'Está no formato do Viajei: é lido aqui mesmo, sem IA e sem internet. Nada entra na viagem sem você revisar.'
            : 'O texto vai para a IA da Anthropic, que monta o roteiro. Nada entra na viagem sem você revisar.'}
        </span>
      </p>

      <Button onClick={onRead} disabled={empty || tooLong || (!local && (!online || outOfReads))}>
        {online || local ? (
          <>
            <Sparkles className="size-5" aria-hidden="true" />
            Ler o roteiro
          </>
        ) : (
          <>
            <WifiOff className="size-5" aria-hidden="true" />
            Precisa de internet para ler o roteiro
          </>
        )}
      </Button>
      {!online && !local ? (
        <p className="-mt-2 text-center text-[14px] text-ink-2">
          O texto fica guardado aqui até a rede voltar.
        </p>
      ) : hint ? (
        <p className="-mt-2 text-center text-[14px] text-ink-2">{hint}</p>
      ) : null}
    </div>
  );
}
