import { ArrowLeft } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useToast } from '@/components/ui/toast-context.ts';
import { StopForm } from '@/features/itinerary/components/StopForm.tsx';
import type { Trip } from '@/lib/db/schema.ts';
import { applyGeo, geoTargets, type GeoState } from '../geocode.ts';
import { chooseGeo, updateStop } from '../review-edit.ts';
import type { ImportState, SaveResult } from '../useImport.ts';
import { GeoChoiceSheet } from './GeoChoiceSheet.tsx';
import { ReviewStep } from './ReviewStep.tsx';

type Props = {
  imp: ImportState;
  geo: Readonly<Record<string, GeoState>>;
  /** as datas contra as quais a revisão marca o dia de fora (a viagem, ou o cabeçalho da nova) */
  trip: Pick<Trip, 'start_date' | 'end_date'>;
  /** o cabeçalho da tela (fica de fora quando uma parada está aberta no formulário) */
  header: ReactNode;
  existingByDate?: Readonly<Record<string, number>>;
  creating?: { top: ReactNode; blocked: boolean; bottom?: ReactNode } | undefined;
  /** antes de gravar (a tela da viagem nova para de decidir sozinha para onde vai) */
  onSaving?: () => void;
  onSaved: (result: SaveResult) => Promise<void> | void;
  onSaveFailed?: () => void;
  /** depois de descartar a leitura */
  onDiscarded?: () => void;
};

/**
 * A revisão de uma leitura, com o que a importação (fase 10) e a viagem nova do campo (fase 17)
 * dividem: a parada aberta no formulário dentro da própria tela (a revisão continua onde estava), a
 * escolha do lugar entre as opções da busca e o "Salvar", que grava tudo de uma vez.
 */
export function ReviewFlow({
  imp,
  geo,
  trip,
  header,
  existingByDate = {},
  creating,
  onSaving,
  onSaved,
  onSaveFailed,
  onDiscarded,
}: Props) {
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!imp.stored) return null;
  const review = applyGeo(imp.stored.review, geo);

  const editingStop = review.days.flatMap((d) => d.stops).find((s) => s.key === editing);
  if (editingStop && editing) {
    return (
      <div className="grid gap-5">
        <header className="grid gap-2">
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="inline-flex min-h-12 w-fit items-center gap-1 text-[15px] font-semibold text-ink-2"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            Voltar à revisão
          </button>
          <h1 className="font-num text-[30px] leading-none font-semibold">Editar parada</h1>
        </header>
        <StopForm
          stop={editingStop}
          submitLabel="Guardar na revisão"
          onSubmit={(values) => {
            imp.edit((r) => updateStop(r, editing, values));
            setEditing(null);
            return Promise.resolve();
          }}
        />
      </div>
    );
  }

  const choice = choosing && Object.hasOwn(geo, choosing) ? geo[choosing] : undefined;
  const choosingStop = review.days.flatMap((d) => d.stops).find((s) => s.key === choosing);

  return (
    <div className="grid gap-5">
      {header}
      <ReviewStep
        trip={trip}
        review={review}
        partial={imp.stored.partial}
        targets={geoTargets(imp.stored.review)}
        geo={geo}
        existingByDate={existingByDate}
        saving={saving}
        creating={creating}
        schedule={imp.stored.schedule ?? null}
        onChange={imp.edit}
        onEditStop={setEditing}
        onChoose={setChoosing}
        onDiscard={() => void imp.discard().then(() => onDiscarded?.())}
        onSave={() => {
          setSaving(true);
          onSaving?.();
          void imp
            .save(geo)
            .then(async (result) => {
              if (result) await onSaved(result);
              else onSaveFailed?.();
            })
            .catch((err: unknown) => {
              onSaveFailed?.();
              toast.show({
                title: 'Não deu para salvar',
                description:
                  err instanceof Error ? err.message : 'Tente de novo; a revisão continua aqui.',
                kind: 'late',
              });
            })
            .finally(() => setSaving(false));
        }}
      />
      <GeoChoiceSheet
        open={choice?.kind === 'choice' && choosingStop !== undefined}
        name={choosingStop?.name ?? ''}
        options={choice?.kind === 'choice' ? choice.options : []}
        onClose={() => setChoosing(null)}
        onPick={(option) => {
          const key = choosing;
          if (key) imp.edit((r) => chooseGeo(r, key, option));
          setChoosing(null);
        }}
      />
    </div>
  );
}
