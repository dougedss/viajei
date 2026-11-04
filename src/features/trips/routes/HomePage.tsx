import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MailOpen, Route } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useAcceptInvite, useDeclineInvite } from '../actions.ts';
import { usePendingInvites } from '../queries.ts';

function periodo(start: string, end: string) {
  const a = parseISO(start);
  const b = parseISO(end);
  const sameMonth = a.getMonth() === b.getMonth();
  return sameMonth
    ? `${format(a, 'd', { locale: ptBR })} a ${format(b, "d 'de' MMMM", { locale: ptBR })}`
    : `${format(a, "d 'de' MMM", { locale: ptBR })} a ${format(b, "d 'de' MMM", { locale: ptBR })}`;
}

export default function HomePage() {
  const invites = usePendingInvites();
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();
  const toast = useToast();

  return (
    <div className="grid gap-6">
      {invites.data && invites.data.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="h-convites">
          <h2 id="h-convites" className="label-caps text-accent-ink">
            Convites
          </h2>
          {invites.data.map((inv) => (
            <Card
              key={inv.member_id}
              role="article"
              aria-label={`Convite para ${inv.trip_name}`}
              className="grid gap-3"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                  <MailOpen className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-num text-[22px] leading-tight font-semibold">
                    {inv.trip_name}
                  </p>
                  <p className="text-[14px] text-ink-2">
                    {periodo(inv.start_date, inv.end_date)}
                    {inv.invited_by_name ? ` · convite de ${inv.invited_by_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="md"
                  className="flex-1"
                  loading={accept.isPending && accept.variables === inv.member_id}
                  onClick={() => {
                    accept.mutate(inv.member_id, {
                      onSuccess: () =>
                        toast.show({
                          title: 'Convite aceito',
                          description: `Você entrou em ${inv.trip_name}.`,
                          kind: 'ok',
                        }),
                      onError: () =>
                        toast.show({
                          title: 'Não deu para aceitar',
                          description: 'Tente de novo em instantes.',
                          kind: 'late',
                        }),
                    });
                  }}
                >
                  Aceitar
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  loading={decline.isPending && decline.variables === inv.member_id}
                  onClick={() => {
                    decline.mutate(inv.member_id, {
                      onSuccess: () => toast.show({ title: 'Convite recusado', kind: 'info' }),
                    });
                  }}
                >
                  Recusar
                </Button>
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="h-viagens">
        <h1 id="h-viagens" className="font-num text-[30px] leading-none font-semibold">
          Suas viagens
        </h1>
        <EmptyState
          icon={Route}
          title="Nenhuma viagem ainda"
          text="A primeira viagem nasce na próxima fase, já com tudo funcionando sem sinal. Por enquanto, aceite os convites e deixe o perfil do seu jeito."
          action={
            <Button variant="secondary" disabled title="Chega na fase 2">
              Nova viagem
            </Button>
          }
        />
      </section>
    </div>
  );
}
