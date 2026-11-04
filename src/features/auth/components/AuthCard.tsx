import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card.tsx';

type Props = { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode };

export function AuthCard({ title, subtitle, children, footer }: Props) {
  return (
    <Card className="grid gap-5 p-6 shadow-card">
      <header className="grid gap-1">
        <h1 className="font-num text-[30px] leading-none font-semibold">{title}</h1>
        {subtitle ? <p className="text-[15px] text-ink-2">{subtitle}</p> : null}
      </header>
      {children}
      {footer ? (
        <footer className="grid gap-2 border-t border-line pt-4 text-center text-[15px]">
          {footer}
        </footer>
      ) : null}
    </Card>
  );
}
