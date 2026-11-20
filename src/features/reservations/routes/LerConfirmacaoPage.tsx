import { FileText, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { READ_MAX_CHARS } from '@shared/read-protocol.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { FilePickers } from '@/features/media/components/FilePickers.tsx';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { db } from '@/lib/db/schema.ts';
import { formatBytes } from '@/lib/media/compress.ts';
import { kickMedia, MediaError, mediaQueue } from '@/lib/media/index.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { addReservationFiles, createReservation } from '../actions.ts';
import { ReservationForm } from '../components/ReservationForm.tsx';
import { clearReadDraft, loadReadDraft, saveReadDraft } from '../read/draft.ts';
import { readErrorCopy } from '../read/messages.ts';
import { StageError, stageFile, type Staged } from '@/lib/media/stage.ts';
import { shareText } from '../share/parse.ts';
import { formFromConfirmation, joinLabels, missingLabels } from '../read/to-form.ts';
import { useReadConfirmation } from '../read/useReadConfirmation.ts';

const fmt = (n: number) => n.toLocaleString('pt-BR');

/**
 * "Ler a confirmação" (`/viagens/:tripId/reservas/ler`, fase 18): a pessoa cola o texto do e-mail
 * ou anexa o PDF ou o print da reserva, a IA devolve a reserva preenchida (só o que está lá; o resto
 * fica vazio e é dito), e ela revisa e salva no formulário de reserva de hoje. O anexo sobe antes da
 * leitura e vira anexo da reserva ao salvar, sem ir duas vezes pela rede. Nenhuma reserva nasce sem o
 * toque dela (D203).
 */
export default function LerConfirmacaoPage() {
  const { tripId = '' } = useParams();
  const [params] = useSearchParams();
  const shareId = params.get('share');
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const members = useTripMembers(tripId);
  const { session } = useSession();
  const online = useOnline();
  const navigate = useNavigate();
  const toast = useToast();
  const uid = session?.user.id ?? '';
  const reader = useReadConfirmation(tripId || null);

  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [staging, setStaging] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const latest = useRef('');

  // o rascunho do texto, ao abrir e numa pausa da digitação (D138); o que chegou pelo Compartilhar do
  // Android (?share=) entra no lugar do rascunho, e sai do Dexie: foi consumido
  useEffect(() => {
    if (!tripId) return;
    // uma função, e não um `let`: o cancelamento vem de outra função (a limpeza do efeito), e o
    // TypeScript não estreitaria uma variável lida depois de um await
    const alive = { current: true };
    const isAlive = () => alive.current;
    void (async () => {
      const shared = shareId ? await db.shares.get(shareId) : undefined;
      const draft = shared ? shareText(shared) : await loadReadDraft(tripId);
      if (!isAlive()) return;
      latest.current = draft;
      setText(draft);
      setLoaded(true);
      if (!shared) return;
      await db.shares.delete(shared.id);
      const first = shared.files[0];
      if (!first) return;
      setStaging(true);
      try {
        const file = new File([first.blob], first.name, { type: first.type });
        // sem rede o arquivo fica preparado e sobe quando a pessoa tocar em Ler, com sinal
        const staged = await stageFile(file, tripId).catch((err: unknown) => {
          if (err instanceof StageError && err.reason === 'offline') {
            return stageFile(file, tripId, { upload: false });
          }
          throw err;
        });
        if (isAlive()) setStaged(staged);
      } catch (err) {
        if (isAlive()) {
          setStageError(
            err instanceof MediaError || err instanceof StageError
              ? err.message
              : 'Não deu para preparar o arquivo compartilhado.',
          );
        }
      } finally {
        if (isAlive()) setStaging(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [tripId, shareId]);
  useEffect(() => {
    if (!tripId || !loaded) return;
    const t = setTimeout(() => void saveReadDraft(tripId, text), 300);
    return () => clearTimeout(t);
  }, [tripId, loaded, text]);

  if (trip === undefined || days === undefined || !loaded) return <Splash />;
  if (trip === null) return <NotFound />;
  const list = `/viagens/${trip.id}/reservas`;
  const adults = Math.max(1, members.filter((m) => m.member.status === 'accepted').length);
  const phase = reader.phase;

  const pick = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setStageError(null);
    setStaging(true);
    try {
      setStaged(await stageFile(file, trip.id));
    } catch (err) {
      setStageError(
        err instanceof MediaError || err instanceof StageError
          ? err.message
          : 'Não deu para preparar este arquivo.',
      );
    } finally {
      setStaging(false);
    }
  };

  /** Lê; um anexo que ficou sem subir (chegou sem rede) sobe primeiro. */
  const readNow = async () => {
    let attachment = staged;
    if (attachment && !attachment.uploaded) {
      setStaging(true);
      try {
        attachment = await stageFile(attachment.file, trip.id);
        setStaged(attachment);
      } catch (err) {
        setStageError(err instanceof StageError ? err.message : 'Não deu para enviar o anexo.');
        return;
      } finally {
        setStaging(false);
      }
    }
    await reader.read({ text, attachment: attachment ? { path: attachment.path } : null });
  };

  const header = (
    <PageHeader
      back={list}
      title="Ler a confirmação"
      eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
    />
  );

  if (phase.kind === 'done') {
    const missing = missingLabels(phase.data);
    return (
      <div className="grid gap-5">
        {header}
        <Card className="grid gap-1 shadow-[inset_0_0_0_2px_var(--color-accent)]" role="status">
          <p className="flex items-center gap-2 text-[17px] font-semibold">
            <Sparkles className="size-5 text-accent-ink" aria-hidden="true" />
            Reserva lida. Confira e salve.
          </p>
          <p className="text-[15px] text-ink-2" data-missing={missing.length}>
            {missing.length === 0
              ? 'Tudo o que o formulário pede estava na confirmação.'
              : `A confirmação não dizia: ${joinLabels(missing)}. Preencha se quiser.`}
          </p>
        </Card>
        <ReservationForm
          key="lida"
          initial={formFromConfirmation(phase.data, { days, stops })}
          initialFiles={staged ? [staged.file] : []}
          days={days}
          stops={stops}
          media={[]}
          adults={adults}
          onRemoveMedia={() => undefined}
          submitLabel="Salvar reserva"
          onSubmit={async (values, files) => {
            const id = await createReservation(trip.id, uid, values);
            const errors: string[] = [];
            if (staged && files.includes(staged.file)) {
              // o objeto já está no Storage com este id: a fila o encontra e grava a linha
              await mediaQueue.enqueueUpload(
                staged.prepared,
                { tripId: trip.id, stopId: null, reservationId: id },
                uid,
                staged.id,
              );
              kickMedia();
            }
            const others = files.filter((f) => f !== staged?.file);
            if (others.length > 0) {
              errors.push(...(await addReservationFiles(trip.id, id, others, uid)).errors);
            }
            await clearReadDraft(trip.id);
            toast.show({
              title: 'Reserva adicionada',
              ...(errors.length > 0 ? { description: errors.join(' ') } : {}),
              kind: errors.length > 0 ? 'late' : 'ok',
            });
            await navigate(`${list}?abrir=${id}`, { replace: true });
          }}
        />
        <Button variant="ghost" onClick={reader.reset}>
          Ler outra confirmação
        </Button>
      </div>
    );
  }

  const reading = phase.kind === 'reading';
  const canRead = !reading && !staging && (text.trim() !== '' || staged !== null);
  const tooLong = text.length > READ_MAX_CHARS;

  return (
    <div className="grid gap-5">
      {header}
      {phase.kind === 'error' ? (
        <ErrorCard
          copy={readErrorCopy(phase.code, phase.retryAt, new Date())}
          onDismiss={reader.reset}
        />
      ) : null}
      <p className="text-[15px] text-ink-2">
        Cole o e-mail ou a mensagem da reserva, ou anexe o voucher (PDF ou print). A reserva vem
        preenchida com o que está lá; o que não está, fica vazio para você.
      </p>
      <TextArea
        label="O texto da confirmação"
        rows={8}
        value={text}
        disabled={reading}
        placeholder="Reserva confirmada! Vila Suzana Parque Hotel, check-in 13/12 às 14h…"
        hint={`${fmt(text.length)} / ${fmt(READ_MAX_CHARS)}`}
        error={tooLong ? `O texto passa de ${fmt(READ_MAX_CHARS)} caracteres.` : undefined}
        onChange={(e) => {
          latest.current = e.target.value;
          setText(e.target.value);
        }}
      />
      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-semibold">O voucher ou o print</legend>
        {staged ? (
          <ul className="grid gap-2" aria-label="Anexo a ler">
            <li className="flex items-center gap-2 rounded-field bg-paper px-3 py-2 text-[15px]">
              <FileText className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{staged.file.name}</span>
              <span className="num text-[13px] text-ink-2">{formatBytes(staged.file.size)}</span>
              <button
                type="button"
                aria-label={`Tirar ${staged.file.name}`}
                disabled={reading}
                onClick={() => setStaged(null)}
                className="grid size-10 place-items-center rounded-full text-ink-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          </ul>
        ) : (
          <FilePickers
            mode="document"
            disabled={reading || staging}
            onFiles={(f) => void pick(f)}
          />
        )}
        {staging ? (
          <p className="text-[14px] text-ink-2" role="status">
            Preparando o anexo…
          </p>
        ) : null}
        {stageError ? (
          <p className="text-[14px] font-semibold text-late-ink" role="alert">
            {stageError}
          </p>
        ) : null}
      </fieldset>
      {reading ? (
        <Card className="grid gap-2" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-[17px] font-semibold">
            <Sparkles className="size-5 animate-pulse text-accent-ink" aria-hidden="true" />
            {phase.name ? `Lendo: ${phase.name}` : 'Lendo a confirmação…'}
          </p>
          <Button variant="ghost" size="md" onClick={reader.cancel}>
            Cancelar
          </Button>
        </Card>
      ) : (
        <Button disabled={!canRead || !online || tooLong} onClick={() => void readNow()}>
          <Sparkles className="size-5" aria-hidden="true" />
          Ler a confirmação
        </Button>
      )}
      {!online ? (
        <p className="text-[14px] text-ink-2">
          Sem internet agora. O texto fica guardado aqui; quando a rede voltar, é só tocar em Ler.
        </p>
      ) : null}
      <p className="text-[13px] text-ink-2">
        Prefere digitar? A reserva à mão continua em "Nova reserva".
      </p>
    </div>
  );
}

function ErrorCard({
  copy,
  onDismiss,
}: {
  copy: { title: string; text: string };
  onDismiss: () => void;
}) {
  return (
    <Card role="alert" className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]">
      <p className="font-num text-[20px] leading-tight font-semibold">{copy.title}</p>
      <p className="text-[15px] text-ink-2">{copy.text}</p>
      <Button variant="ghost" size="md" onClick={onDismiss}>
        Voltar ao texto
      </Button>
    </Card>
  );
}
