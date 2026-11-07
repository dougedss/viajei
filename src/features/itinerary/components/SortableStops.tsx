import type { ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Stop } from '@/lib/db/schema.ts';
import { StopCard } from './StopCard.tsx';

type Props = {
  stops: Stop[];
  suggestions: Map<string, number>;
  onMove: (from: number, to: number) => void;
  onAcceptSuggestion: (stop: Stop, minutes: number) => void;
  onEdit: (stop: Stop) => void;
  onRemove: (stop: Stop) => void;
  /** um detalhe pequeno embaixo da parada (a previsão do tempo no horário dela) */
  detail?: ((stop: Stop) => ReactNode) | undefined;
};

function SortableItem({
  stop,
  index,
  count,
  suggestion,
  onAcceptSuggestion,
  onEdit,
  onRemove,
  onMove,
  detail,
}: {
  stop: Stop;
  index: number;
  count: number;
  suggestion: number | undefined;
  detail: ReactNode;
  onAcceptSuggestion: (minutes: number) => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-90' : undefined}
    >
      <StopCard
        stop={stop}
        index={index}
        count={count}
        suggestion={suggestion}
        onAcceptSuggestion={onAcceptSuggestion}
        onEdit={onEdit}
        onRemove={onRemove}
        onMove={onMove}
        detail={detail}
        handleProps={{ ...attributes, ...listeners }}
      />
    </li>
  );
}

/**
 * Lista reordenável: alça de arrasto, toque com atraso (para a lista ainda rolar com o dedo),
 * teclado, e os botões subir e descer do card como caminho sem arrasto. Um arrasto, um patch.
 */
export function SortableStops({
  stops,
  suggestions,
  onMove,
  onAcceptSuggestion,
  onEdit,
  onRemove,
  detail,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = stops.map((s) => s.id);
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over;
    if (!over || e.active.id === over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onMove(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="grid gap-3" aria-label="Paradas do dia">
          {stops.map((stop, index) => (
            <SortableItem
              key={stop.id}
              stop={stop}
              index={index}
              count={stops.length}
              suggestion={suggestions.get(stop.id)}
              onAcceptSuggestion={(minutes) => onAcceptSuggestion(stop, minutes)}
              onEdit={() => onEdit(stop)}
              onRemove={() => onRemove(stop)}
              onMove={(delta) => onMove(index, index + delta)}
              detail={detail?.(stop)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
