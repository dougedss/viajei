import { MailOpen, Plus, Route } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { InstallCard } from '@/features/pwa/components/InstallCard.tsx';
import { useAcceptInvite, useDeclineInvite } from '../actions.ts';
import { TripCard } from '../components/TripCard.tsx';
import { usePendingInvites, useTrips } from '../queries.ts';
import { formatPeriod, todayISO, tripStatus } from '../rules.ts';

/**
 * Viagens para as quais este carregamento do app já redirecionou. Só a abertura (`/`) redireciona; a
 * lista (`/viagens`), aonde levam os links "Início" e "Voltar", nunca: quem foi até ela fica nela,
 * mesmo recarregando.
 */
const redirected = new Set<string>();

/**
 * Durante a viagem, abrir o app cai direto no Modo Viagem do dia (D33). A decisão mora num efeito, e
 * não no render: o render pode rodar mais de uma vez por mudança (o modo estrito do React roda duas),
 * e marcar o `Set` ali fazia a segunda passada achar a viagem já marcada e mostrar a lista.
 */
function useLaunchRedirect(ongoingId: string | undefined): void {
  const launch = useLocation().pathname === '/';
  const navigate = useNavigate();
  useEffect(() => {
    if (!launch || !ongoingId || redirected.has(ongoingId)) return;
    redirected.add(ongoingId);
    void navigate(`/viagens/${ongoingId}/viagem`, { replace: true });
  }, [launch, ongoingId, navigate]);
}

export default function HomePage() {
  const invites = usePendingInvites();
  const trips = useTrips();
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();
  const toast = useToast();
  const today = todayISO();
  const ongoing = trips?.find((t) => tripStatus(t.trip, today) === 'ongoing');
  useLaunchRedirect(ongoing?.trip.id);

  return (
    <div className="grid gap-6">
      <InstallCard />

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
                    {formatPeriod(inv.start_date, inv.end_date)}
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
        <div className="flex items-end justify-between gap-3">
          <h1 id="h-viagens" className="font-num text-[30px] leading-none font-semibold">
            Suas viagens
          </h1>
          {trips && trips.length > 0 ? (
            <ButtonLink to="/viagens/nova" size="sm" variant="secondary">
              <Plus className="size-4" aria-hidden="true" />
              Nova viagem
            </ButtonLink>
          ) : null}
        </div>
        {trips === undefined ? null : trips.length === 0 ? (
          <EmptyState
            icon={Route}
            title="Nenhuma viagem ainda"
            text="Crie a primeira: ela fica neste celular, funciona sem sinal e sincroniza quando a internet voltar."
            action={
              <ButtonLink to="/viagens/nova">
                <Plus className="size-5" aria-hidden="true" />
                Nova viagem
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-3">
            {trips.map((item) => (
              <li key={item.trip.id} className="min-w-0">
                <TripCard item={item} today={today} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
