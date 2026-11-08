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
import { Check, GripVertical, MoreHorizontal } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { PERSON_COLORS } from '@shared/constants.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { cx } from '@/lib/cx.ts';
import type { ChecklistItem, Profile } from '@/lib/db/schema.ts';
import { formatStamp } from '@/lib/time/index.ts';

type RowProps = {
  item: ChecklistItem;
  profiles: ReadonlyMap<string, Profile>;
  onToggle: () => void;
  onMenu: () => void;
  /** a linha de baixo além de quem marcou: a parada e os pontos da missão */
  extra?: ReactNode;
  handleProps?: ComponentProps<'button'> | undefined;
};

/**
 * Um item: alça, o toque grande que marca (quem e quando, na cor da pessoa), o texto e o menu.
 * O toque cobre o texto inteiro, não só o círculo: 48 px de altura no mínimo.
 */
export function ChecklistRow({ item, profiles, onToggle, onMenu, extra, handleProps }: RowProps) {
  const done = item.done_at !== null;
  const by = item.done_by ? profiles.get(item.done_by) : undefined;
  const color = by ? PERSON_COLORS[asPersonColor(by.color)].hex : 'var(--color-on-time)';
  return (
    <div className="flex items-center gap-1 rounded-[16px] bg-card shadow-[inset_0_0_0_1px_var(--color-line)]">
      {handleProps ? (
        <button
          type="button"
          aria-label={`Arrastar ${item.text}`}
          className="grid h-14 w-12 shrink-0 cursor-grab touch-none place-items-center text-ink-2 active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
      ) : (
        <span className="w-3" aria-hidden="true" />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <span
          className={cx(
            'grid size-8 shrink-0 place-items-center rounded-full transition',
            done ? 'text-white' : 'shadow-[inset_0_0_0_2px_var(--color-line)]',
          )}
          style={done ? { background: color } : undefined}
          aria-hidden="true"
        >
          {done ? <Check className="size-5" strokeWidth={3} /> : null}
        </span>
        <span className="grid min-w-0">
          <span
            className={cx(
              'text-[17px] leading-snug break-words',
              done && 'text-ink-2 line-through decoration-1',
            )}
          >
            {item.text}
          </span>
          {done || extra ? (
            <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
              {done ? (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: color }}
                    aria-hidden="true"
                  />
                  {by?.name ?? 'Alguém do time'}
                  {item.done_at ? ` · ${formatStamp(item.done_at)}` : ''}
                </span>
              ) : null}
              {extra}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        onClick={onMenu}
        aria-label={`Mais opções: ${item.text}`}
        className="grid size-12 shrink-0 place-items-center rounded-[12px] text-ink-2"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function SortableRow(props: Omit<RowProps, 'handleProps'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-90' : undefined}
    >
      <ChecklistRow {...props} handleProps={{ ...attributes, ...listeners }} />
    </li>
  );
}

/**
 * A lista reordenável, como as paradas do roteiro: alça de arrasto, toque com atraso para a lista
 * ainda rolar com o dedo, teclado; subir e descer ficam no menu como caminho sem arrasto.
 */
export function SortableChecklist({
  items,
  label,
  profiles,
  onToggle,
  onMenu,
  onMove,
  extra,
}: {
  items: ChecklistItem[];
  label: string;
  profiles: ReadonlyMap<string, Profile>;
  onToggle: (item: ChecklistItem) => void;
  onMenu: (item: ChecklistItem) => void;
  onMove: (from: number, to: number) => void;
  extra?: (item: ChecklistItem) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((i) => i.id);
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
        <ul className="grid gap-2" aria-label={label}>
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              profiles={profiles}
              onToggle={() => onToggle(item)}
              onMenu={() => onMenu(item)}
              extra={extra?.(item)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
