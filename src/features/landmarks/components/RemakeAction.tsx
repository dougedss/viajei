import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { stopPlaceKey } from '@shared/landmark-keys.ts';
import { type LandmarkRecipe } from '@shared/landmark-recipe.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { MINIATURE_BOX } from '@/art/stops/types.ts';
import { asStopKind } from '@/features/itinerary/stop-kinds.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { useLandmarkCatalog } from '../catalog.ts';
import {
  chooseRemake,
  remakeState,
  requestRemake,
  validChoice,
  type RemakeState,
} from '../remake.ts';
import { parseRecipe } from '@shared/landmark-recipe.ts';
import { syncLandmarks, placesOfDay } from '../sync.ts';

/**
 * "Refazer a peça" na folha da parada (fase 23, decisão 6 de 15/11): só para quem planejou a viagem,
 * só com o cartão-postal publicado e ainda não refeito. Um toque pede duas opções novas; quando elas
 * chegam, as três (a atual e as duas) aparecem desenhadas e a pessoa **precisa escolher** uma. A
 * escolhida vira a peça do catálogo para todos. Nenhuma pílula nem aviso: a folha é o lugar disso.
 */
type Props = { stop: Stop; tripId: string; isOwner: boolean };

export function RemakeAction({ stop, tripId, isOwner }: Props) {
  const catalog = useLandmarkCatalog();
  const key = stopPlaceKey(stop);
  const entry = key ? catalog?.get(key) : undefined;
  const state = remakeState(entry, isOwner);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  if (!entry || state.kind === 'unavailable' || state.kind === 'done') return null;

  const refresh = async () => {
    setBusy(true);
    await syncLandmarks(tripId, placesOfDay([stop], []), { force: true });
    setBusy(false);
  };

  return (
    <>
      {state.kind === 'available' ? (
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          data-landmark-remake
          onClick={() => {
            void (async () => {
              setBusy(true);
              const id = await requestRemake(tripId, entry);
              setBusy(false);
              toast.show({
                title: id ? 'Duas opções novas estão sendo feitas' : 'Não deu para pedir agora',
                ...(id ? { description: 'Volte aqui em alguns minutos.' } : {}),
                kind: id ? 'ok' : 'warn',
              });
            })();
          }}
        >
          <RefreshCw className="size-5" aria-hidden="true" />
          Refazer a peça
        </Button>
      ) : state.kind === 'generating' ? (
        <Button
          variant="secondary"
          size="md"
          loading={busy}
          data-landmark-remake="generating"
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-5" aria-hidden="true" />
          Ver se as opções chegaram
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="md"
          data-landmark-remake="choosing"
          onClick={() => setChoosing(true)}
        >
          <RefreshCw className="size-5" aria-hidden="true" />
          Escolher a peça
        </Button>
      )}
      {state.kind === 'choosing' ? (
        <ChooseSheet
          open={choosing}
          onClose={() => setChoosing(false)}
          stop={stop}
          current={parseRecipe(entry.recipe)}
          state={state}
          onChoose={async (choice) => {
            const ok = await chooseRemake(entry, state, choice);
            setChoosing(false);
            toast.show({
              title: ok ? 'Peça escolhida' : 'Não deu para escolher agora',
              ...(ok ? { description: 'Vale para todo mundo.' } : {}),
              kind: ok ? 'ok' : 'warn',
            });
          }}
        />
      ) : null}
    </>
  );
}

type ChooseProps = {
  open: boolean;
  onClose: () => void;
  stop: Stop;
  current: LandmarkRecipe | null;
  state: Extract<RemakeState, { kind: 'choosing' }>;
  onChoose: (choice: 0 | 1 | 2) => Promise<void>;
};

/** As três peças desenhadas (fora da tela, pelo mesmo construtor) e a escolha obrigatória. */
function ChooseSheet({ open, onClose, stop, current, state, onChoose }: ChooseProps) {
  const [images, setImages] = useState<(string | null)[]>([null, null, null]);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const recipes = [current, state.options[0], state.options[1]];
  useEffect(() => {
    if (!open) return;
    const gone = { current: false };
    void (async () => {
      const { renderPieceViews } = await import('../render.ts');
      const box = MINIATURE_BOX[asStopKind(stop.kind)];
      const out: (string | null)[] = [];
      for (const recipe of recipes) {
        if (!recipe) {
          out.push(null);
          continue;
        }
        try {
          const [view] = await renderPieceViews(recipe, box, 1);
          out.push(view ? `data:image/png;base64,${view.data}` : null);
        } catch {
          out.push(null);
        }
      }
      if (gone.current) return;
      setImages(out);
    })();
    return () => {
      gone.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as receitas não mudam com a folha aberta
  }, [open, state.id]);
  const labels = ['A peça de hoje', 'Opção 1', 'Opção 2'];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Qual peça fica?"
      description={`${stop.name} · a escolhida vale para todo mundo`}
    >
      <div className="grid gap-3" role="radiogroup" aria-label="As três peças">
        {recipes.map((recipe, i) => {
          const src = images[i];
          return (
            <label
              key={labels[i]}
              className={`flex items-center gap-3 rounded-2xl border p-2 ${recipe ? 'border-line' : 'border-line opacity-50'} has-[:checked]:border-accent`}
            >
              <input
                type="radio"
                name="landmark-choice"
                className="size-5 accent-accent"
                disabled={!recipe}
                checked={choice === i}
                onChange={() => setChoice(i)}
                data-landmark-option={i}
              />
              <span className="flex-1 mv-text-15">
                {labels[i]}
                {recipe ? '' : ' (não veio)'}
              </span>
              {src ? (
                <img src={src} alt="" width={96} height={72} className="rounded-xl bg-stage" />
              ) : (
                <span className="grid h-[72px] w-24 place-items-center rounded-xl bg-stage mv-text-12 text-ink-2">
                  {recipe ? '…' : '—'}
                </span>
              )}
            </label>
          );
        })}
        <Button
          size="md"
          loading={busy}
          disabled={!validChoice(state, choice)}
          data-landmark-choose
          onClick={() => {
            if (!validChoice(state, choice)) return;
            void (async () => {
              setBusy(true);
              await onChoose(choice);
              setBusy(false);
            })();
          }}
        >
          Ficar com esta
        </Button>
        <p className="mv-text-13 text-ink-2">
          É preciso escolher uma das três. Cada lugar pode ser refeito uma vez.
        </p>
      </div>
    </Sheet>
  );
}
