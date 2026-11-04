import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

type Props = { title: string; back?: string; eyebrow?: ReactNode; actions?: ReactNode };

/** Cabeçalho de tela interna: voltar, sobretítulo (chip ou rótulo), título grande e ações à direita. */
export function PageHeader({ title, back, eyebrow, actions }: Props) {
  return (
    <header className="grid gap-2">
      {back ? (
        <Link
          to={back}
          className="inline-flex min-h-10 w-fit items-center gap-1 text-[15px] font-semibold text-ink-2"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          Voltar
        </Link>
      ) : null}
      {eyebrow ? <div className="flex items-center gap-2">{eyebrow}</div> : null}
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-num text-[30px] leading-none font-semibold break-words">{title}</h1>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
