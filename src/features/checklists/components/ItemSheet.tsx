import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import type { ChecklistItem, Stop, TripDay } from '@/lib/db/schema.ts';
import { QuestFields } from './QuestFields.tsx';

type Props = {
  item: ChecklistItem | null;
  index: number;
  count: number;
  /** as missões seguem a ordem das paradas: não sobem nem descem */
  movable: boolean;
  stops: readonly Stop[];
  days: readonly TripDay[];
  onClose: () => void;
  onSave: (changes: { text: string; points: number; stopId: string | null }) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
};

/** O menu de um item: editar o texto (e, na missão, a parada e os pontos), mover e excluir. */
export function ItemSheet(props: Props) {
  const { item, onClose } = props;
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      title={item?.kind === 'quest' ? 'Missão' : 'Item'}
    >
      {item ? <Body key={item.id} {...props} item={item} /> : null}
    </Sheet>
  );
}

function Body({
  item,
  index,
  count,
  movable,
  stops,
  days,
  onSave,
  onMove,
  onRemove,
}: Props & { item: ChecklistItem }) {
  const [text, setText] = useState(item.text);
  const [points, setPoints] = useState(item.points);
  const [stopId, setStopId] = useState(item.stop_id);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === '') return;
        onSave({ text, points, stopId });
      }}
    >
      <TextField
        label="Texto"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
      />
      {item.kind === 'quest' ? (
        <QuestFields
          stops={stops}
          days={days}
          stopId={stopId}
          points={points}
          onStop={setStopId}
          onPoints={setPoints}
        />
      ) : null}
      <div className="flex items-center gap-1">
        {movable ? (
          <>
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index <= 0}
              className="inline-flex min-h-12 items-center gap-1 rounded-[12px] px-3 text-[15px] font-semibold text-ink-2 disabled:opacity-30"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
              Subir
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index >= count - 1}
              className="inline-flex min-h-12 items-center gap-1 rounded-[12px] px-3 text-[15px] font-semibold text-ink-2 disabled:opacity-30"
            >
              <ArrowDown className="size-5" aria-hidden="true" />
              Descer
            </button>
          </>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-12 items-center gap-1 rounded-[12px] px-3 text-[15px] font-semibold text-late-ink"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Excluir
        </button>
      </div>
      <Button type="submit" size="lg" disabled={text.trim() === ''}>
        Salvar
      </Button>
    </form>
  );
}
