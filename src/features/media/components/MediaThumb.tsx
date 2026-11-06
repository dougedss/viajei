import { CloudOff, FileText, TriangleAlert, X } from 'lucide-react';
import { cx } from '@/lib/cx.ts';
import { useMediaImage, type MediaItem } from '@/lib/media/hooks.ts';

type Props = {
  item: MediaItem;
  onOpen?: () => void;
  onRemove?: () => void;
  /** anel na cor de quem tirou (fotos de memória) */
  ring?: string;
  size?: 'sm' | 'md' | 'lg';
  /** rótulo acessível do botão */
  label?: string;
};

const SIZES = { sm: 'size-14', md: 'size-20', lg: 'size-28' } as const;

/**
 * A miniatura de um anexo: a foto pelo Blob local, o borrão do thumbhash enquanto o arquivo não
 * chega, ou o ícone do PDF. "Aguardando sinal" enquanto está na fila; "recusado" quando caiu em
 * Pendentes.
 */
export function MediaThumb({ item, onOpen, onRemove, ring, size = 'md', label }: Props) {
  const image = useMediaImage(item.row.mime === 'application/pdf' ? null : item);
  const pdf = item.row.mime === 'application/pdf';
  const name = label ?? (pdf ? item.row.filename : 'Abrir foto');
  return (
    <div className={cx('relative shrink-0', SIZES[size])}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={name}
        className="relative block size-full overflow-hidden rounded-[14px] bg-paper shadow-[inset_0_0_0_1px_var(--color-line)]"
        style={ring ? { boxShadow: `0 0 0 3px ${ring}` } : undefined}
        data-media={item.row.id}
        data-pending={item.pending || undefined}
      >
        {pdf ? (
          <span className="grid size-full place-items-center content-center gap-0.5 px-1 text-ink-2">
            <FileText className="size-6 text-accent-ink" aria-hidden="true" />
            <span className="w-full truncate text-center text-[11px] font-semibold">
              {item.row.filename}
            </span>
          </span>
        ) : (
          <>
            {image.placeholder ? (
              <img
                src={image.placeholder}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 size-full scale-110 object-cover blur-[6px]"
              />
            ) : null}
            {image.src ? (
              <img
                src={image.src}
                alt=""
                className="absolute inset-0 size-full object-cover"
                decoding="async"
              />
            ) : null}
          </>
        )}
        {item.pending ? (
          <span
            className={cx(
              'absolute inset-x-1 bottom-1 inline-flex items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-tight font-semibold',
              item.failed ? 'bg-late text-white' : 'bg-[rgb(8_12_24/0.65)] text-white',
            )}
          >
            {item.failed ? (
              <TriangleAlert className="size-3" aria-hidden="true" />
            ) : (
              <CloudOff className="size-3" aria-hidden="true" />
            )}
            {item.failed ? 'recusado' : 'aguardando sinal'}
          </span>
        ) : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar ${pdf ? item.row.filename : 'a foto'}`}
          className="absolute -top-2 -right-2 grid size-8 place-items-center rounded-full bg-card text-ink shadow-card"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
