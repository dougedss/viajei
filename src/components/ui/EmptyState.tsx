import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { icon: LucideIcon; title: string; text: string; action?: ReactNode };

/** Estado vazio com ação: nunca uma tela em branco. */
export function EmptyState({ icon: Icon, title, text, action }: Props) {
  return (
    <div className="grid justify-items-center gap-3 rounded-card bg-card px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
      <span className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-ink">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h2 className="font-num text-[24px] leading-tight font-semibold">{title}</h2>
      <p className="max-w-[36ch] text-[15px] text-ink-2">{text}</p>
      {action}
    </div>
  );
}
