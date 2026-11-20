import { useLiveQuery } from 'dexie-react-hooks';
import { Share2 } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useTrips } from '@/features/trips/queries.ts';
import { formatPeriod, todayISO, tripStatus } from '@/features/trips/rules.ts';
import { db } from '@/lib/db/schema.ts';

/**
 * `/compartilhado` (fase 18): aonde o Compartilhar do Android chega, depois do service worker guardar o
 * conteúdo. Pergunta de qual viagem é (ou já sabe, quando só há uma em andamento ou futura) e cai em
 * "Ler a confirmação" com o texto e o arquivo já no lugar. No iPhone não existe o Compartilhar para
 * PWA (WebKit 194593, aberto desde 2019, ainda NEW em 20/11/2026): lá, o caminho é o e-mail.
 */
export default function CompartilhadoPage() {
  const [params] = useSearchParams();
  const id = params.get('id');
  const share = useLiveQuery(async () => (id ? ((await db.shares.get(id)) ?? null) : null), [id]);
  const trips = useTrips();
  const navigate = useNavigate();
  const today = todayISO();
  const candidates = (trips ?? [])
    .map((t) => t.trip)
    .filter((t) => tripStatus(t, today) !== 'past');
  const target = (tripId: string) => `/viagens/${tripId}/reservas/ler?share=${id ?? ''}`;

  // uma viagem só em andamento ou futura: vai direto
  useEffect(() => {
    if (share && trips && candidates.length === 1 && candidates[0]) {
      void navigate(target(candidates[0].id), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage ao conteúdo e à lista de viagens
  }, [share?.id, trips?.length]);

  const header = <PageHeader back="/viagens" title="Compartilhado com o Viajei" />;
  if (share === undefined || trips === undefined) return <div className="grid gap-5">{header}</div>;

  if (!share) {
    return (
      <div className="grid gap-5">
        {header}
        <EmptyState
          icon={Share2}
          title={params.get('vazio') ? 'Nada para ler' : 'Nada chegou pelo Compartilhar'}
          text={
            params.get('vazio')
              ? 'O que foi compartilhado não tinha texto nem imagem ou PDF. Compartilhe o e-mail ou o voucher da reserva.'
              : 'Compartilhe o e-mail ou o voucher da reserva pelo app de e-mail ou pela galeria, direto para o Viajei.'
          }
          action={
            <ButtonLink to="/viagens" size="md" variant="secondary">
              Voltar às viagens
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const summary = [
    share.title,
    share.text ? `${share.text.slice(0, 80)}${share.text.length > 80 ? '…' : ''}` : null,
    share.files.length > 0
      ? share.files.length === 1
        ? `1 arquivo (${share.files[0]?.name ?? ''})`
        : `${String(share.files.length)} arquivos`
      : null,
  ].filter((s): s is string => s !== null && s !== '');

  return (
    <div className="grid gap-5">
      {header}
      <Card className="grid gap-1" data-share={share.id}>
        <p className="text-[15px] font-semibold">Chegou:</p>
        {summary.map((line) => (
          <p key={line} className="text-[15px] break-words text-ink-2">
            {line}
          </p>
        ))}
      </Card>
      {candidates.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="De qual viagem é?"
          text="Nenhuma viagem em andamento ou futura neste aparelho. Crie a viagem primeiro e compartilhe de novo."
          action={
            <ButtonLink to="/viagens" size="md">
              Ir para as viagens
            </ButtonLink>
          }
        />
      ) : (
        <section className="grid gap-2" aria-labelledby="h-qual">
          <h2 id="h-qual" className="text-[17px] font-semibold">
            De qual viagem é a reserva?
          </h2>
          {candidates.map((t) => (
            <Button
              key={t.id}
              variant="secondary"
              size="md"
              className="w-full justify-between"
              onClick={() => void navigate(target(t.id), { replace: true })}
            >
              <span className="truncate">{t.name}</span>
              <span className="num text-[13px] text-ink-2">
                {formatPeriod(t.start_date, t.end_date)}
              </span>
            </Button>
          ))}
        </section>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          void db.shares.delete(share.id).then(() => navigate('/viagens', { replace: true }));
        }}
      >
        Descartar
      </Button>
    </div>
  );
}
