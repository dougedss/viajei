import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Copy, Sparkles, WifiOff } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { FormatErrors } from '@/features/import/components/FormatErrors.tsx';
import {
  clearReview,
  loadDraft,
  loadReview,
  NEW_TRIP_KEY,
  saveDraft,
} from '@/features/import/draft.ts';
import type { FormatError } from '@/features/import/format.ts';
import { copyText } from '@/lib/clipboard.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { INTAKE_LABEL, INTAKE_PATH, wantsFocus, type IntakeStart } from '../start.ts';

/** Até onde o campo cresce com o texto; daí em diante ele rola por dentro. */
const MAX_HEIGHT_VH = 45;

/** O texto do campo, no aparelho (Dexie, D138), por uma pausa da digitação e ao sair da tela. */
function useIntakeDraft() {
  const [text, setText] = useState<string | null>(null);
  const latest = useRef('');
  useEffect(() => {
    let alive = true;
    void loadDraft(NEW_TRIP_KEY).then((draft) => {
      if (!alive) return;
      latest.current = draft;
      setText(draft);
    });
    return () => {
      alive = false;
      void saveDraft(NEW_TRIP_KEY, latest.current);
    };
  }, []);
  useEffect(() => {
    if (text === null) return;
    const t = setTimeout(() => void saveDraft(NEW_TRIP_KEY, text), 300);
    return () => clearTimeout(t);
  }, [text]);
  return {
    text,
    setText: (value: string) => {
      latest.current = value;
      setText(value);
    },
  };
}

/** O pedido pronto para outras IAs, copiado (e, sem a área de transferência, numa folha). */
function CopyRequest() {
  const toast = useToast();
  const [manual, setManual] = useState<string | null>(null);
  const request = () => import('@/features/import/ai-request.ts').then((m) => m.AI_REQUEST);
  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-12 items-center gap-2 text-left text-[15px] font-semibold text-accent-ink"
        onClick={() => {
          void copyText(request()).then(async (copied) => {
            if (copied) {
              toast.show({
                title: 'Pedido copiado',
                description:
                  'Cole no chat onde vocês planejaram. A resposta, colada aqui, vira a viagem sem IA e sem internet.',
                kind: 'ok',
              });
            } else setManual(await request());
          });
        }}
      >
        <Copy className="size-4 shrink-0" aria-hidden="true" />
        Montou a viagem com outra IA? Copie este pedido
      </button>
      <Sheet
        open={manual !== null}
        onClose={() => setManual(null)}
        title="O pedido para outra IA"
        description="Este navegador não deixou copiar sozinho. Selecione o texto e copie."
      >
        <textarea
          readOnly
          value={manual ?? ''}
          aria-label="O pedido para outra IA"
          rows={10}
          className="w-full rounded-field bg-paper px-3 py-2 text-[14px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]"
        />
      </Sheet>
    </>
  );
}

/**
 * O campo da lista de viagens (fase 17), no lugar do botão "Nova viagem" e do formulário: um campo
 * que cresce com o texto, aceita colar, e um botão só. O que a pessoa escreve decide o caminho
 * (`decide.ts`): o formato do Viajei é lido aqui mesmo, sem rede; o roteiro e a conversa abrem
 * `/viagens/nova`. Sem rede, o campo diz o que espera, e o texto fica no rascunho.
 */
export function IntakeField() {
  const fieldId = useId();
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const draft = useIntakeDraft();
  const pending = useLiveQuery(() => loadReview(NEW_TRIP_KEY), []);
  const area = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<FormatError[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const text = draft.text ?? '';

  // cresce com o texto, até quase metade da tela
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = (window.innerHeight * MAX_HEIGHT_VH) / 100;
    el.style.height = `${String(Math.min(el.scrollHeight, max))}px`;
  }, [text]);

  // voltar de `/viagens/nova` sem nada a fazer traz o foco para cá
  useEffect(() => {
    if (draft.text !== null && wantsFocus(location.state)) area.current?.focus();
  }, [draft.text, location.state]);

  const send = async () => {
    setErrors(null);
    setNotice(null);
    setSending(true);
    try {
      const { sendIntake, offlineCopy } = await import('../send.ts');
      const out = await sendIntake(text, online, uid);
      if (out.kind === 'review') await navigate(INTAKE_PATH);
      else if (out.kind === 'start') {
        const state: IntakeStart = { start: out.path };
        await navigate(INTAKE_PATH, { state });
      } else if (out.kind === 'format_errors') setErrors(out.errors);
      else if (out.kind === 'offline') setNotice(offlineCopy(out.path));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="grid gap-3" aria-label="Nova viagem" data-intake>
      <Card className="grid gap-3">
        <label htmlFor={fieldId} className="font-num text-[20px] leading-tight font-semibold">
          {INTAKE_LABEL}
        </label>
        <textarea
          ref={area}
          id={fieldId}
          rows={2}
          value={text}
          disabled={draft.text === null}
          onChange={(e) => {
            draft.setText(e.target.value);
            setErrors(null);
            setNotice(null);
          }}
          placeholder="Serra Gaúcha em dezembro, 4 dias, saindo de Papanduva"
          autoComplete="off"
          className="min-h-24 w-full resize-none rounded-field bg-paper px-4 py-3 text-[17px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] transition outline-none placeholder:text-ink-2/70 focus:shadow-[inset_0_0_0_2px_var(--color-accent)]"
        />
        {notice ? (
          <p role="status" className="flex gap-2 text-[15px] text-ink-2" data-intake-offline>
            <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </p>
        ) : null}
        {errors ? (
          <FormatErrors
            errors={errors}
            online={online}
            onReadWithAi={() => {
              const state: IntakeStart = { start: 'itinerary' };
              // a revisão de antes dá lugar à leitura deste texto (já no rascunho, pelo envio)
              void clearReview(NEW_TRIP_KEY).then(() => navigate(INTAKE_PATH, { state }));
            }}
          />
        ) : null}
        <Button loading={sending} disabled={text.trim() === ''} onClick={() => void send()}>
          <Sparkles className="size-5" aria-hidden="true" />
          Montar a viagem
        </Button>
        <CopyRequest />
      </Card>
      {pending?.newTrip ? (
        <ButtonLink to={INTAKE_PATH} variant="secondary" size="md" data-intake-pending>
          Continuar a revisão: {pending.newTrip.header.name}
          <ChevronRight className="size-4" aria-hidden="true" />
        </ButtonLink>
      ) : null}
    </section>
  );
}
