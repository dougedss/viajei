import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  CHECKLIST_KINDS,
  CHECKLIST_KIND_KEYS,
  QUEST_POINTS_DEFAULT,
  type ChecklistKind,
} from '@shared/constants.ts';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Ring } from '@/components/ui/Ring.tsx';
import { Tabs } from '@/components/ui/Tabs.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { sortStops } from '@/features/itinerary/rules.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { gainXp, itemXp, tappedRect } from '@/features/progression/xp-gain.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { todayISO } from '@/features/trips/rules.ts';
import type { ChecklistItem, Profile, Stop, TripDay } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import {
  addItem,
  answerSuggestion,
  editItem,
  moveItem,
  removeItem,
  setDone,
  undoDismiss,
} from '../actions.ts';
import { AddItemField } from '../components/AddItemField.tsx';
import { ChecklistRow, SortableChecklist } from '../components/ChecklistRows.tsx';
import { ItemSheet } from '../components/ItemSheet.tsx';
import { QuestFields } from '../components/QuestFields.tsx';
import { ReadyCelebration } from '../components/Readiness.tsx';
import { SuggestionRow } from '../components/SuggestionRow.tsx';
import { useSuggestions, useTripChecklist, useTripScenery } from '../queries.ts';
import {
  fraction,
  kindFromSlug,
  listItems,
  listsProgress,
  questPoints,
  type Progress,
} from '../rules.ts';
import type { Suggestion } from '../suggestions.ts';

const RING_COLOR: Record<ChecklistKind, string> = {
  before: 'var(--color-accent)',
  pack: '#6A62C9',
  quest: 'var(--color-on-time)',
};

const ADD: Record<'before' | 'pack', { label: string; placeholder: string }> = {
  before: { label: 'Novo item de antes de viajar', placeholder: 'Ex.: revisar pneus e estepe' },
  pack: { label: 'Novo item da mala', placeholder: 'Ex.: carregador do celular' },
};

/**
 * As três listas da viagem: Antes de viajar, Mala e Missões, cada uma com o anel. Tudo pela `mutate`,
 * offline. As sugestões por regra aparecem esmaecidas e só viram linha com "Adicionar" ou "Dispensar".
 */
export default function ListasPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const items = useTripChecklist(tripId);
  const members = useTripMembers(tripId);
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = kindFromSlug(params.get('aba'));
  const scenery = useTripScenery(days ?? []);
  const suggestions = useSuggestions({ tripId, days: days ?? [], stops, items, scenery });
  const [menuId, setMenuId] = useState<string | null>(null);

  if (trip === undefined || days === undefined || items === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const profiles = new Map<string, Profile>();
  for (const m of members) if (m.profile) profiles.set(m.profile.id, m.profile);
  const progress = listsProgress(items);
  const list = listItems(items, kind);
  const menuItem = items.find((i) => i.id === menuId) ?? null;
  const menuIndex = menuItem ? list.findIndex((i) => i.id === menuItem.id) : -1;

  const setTab = (k: ChecklistKind) =>
    setParams(
      (p) => {
        p.set('aba', CHECKLIST_KINDS[k].slug);
        return p;
      },
      { replace: true },
    );
  const toggle = (item: ChecklistItem) => {
    const at = tappedRect();
    const done = item.done_at === null;
    void setDone(item, uid, done);
    if (done) {
      const xp = itemXp(item);
      void gainXp(uid, xp.kind, item.id, xp.points, at);
    }
  };
  const remove = async (item: ChecklistItem) => {
    setMenuId(null);
    const undo = await removeItem(item);
    toast.show({
      title: item.kind === 'quest' ? 'Missão excluída' : 'Item excluído',
      description: item.text,
      action: { label: 'Desfazer', onClick: () => void undo() },
      duration: 8000,
    });
  };
  const answer = async (s: Suggestion, a: 'add' | 'dismiss') => {
    await answerSuggestion(tripId, uid, s, a);
    if (a === 'dismiss') {
      toast.show({
        title: 'Sugestão dispensada',
        description: s.text,
        action: { label: 'Desfazer', onClick: () => void undoDismiss(s.id) },
        duration: 8000,
      });
    }
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}`}
        title="Listas"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
      />

      <Tabs
        label="Listas da viagem"
        value={kind}
        onChange={(id) => setTab(id as ChecklistKind)}
        tabs={CHECKLIST_KIND_KEYS.map((k) => ({
          id: k,
          label: `${CHECKLIST_KINDS[k].short} ${progress[k].done}/${progress[k].total}`,
        }))}
      />

      <section
        id={`panel-${kind}`}
        role="tabpanel"
        aria-labelledby={`tab-${kind}`}
        className="grid gap-4"
      >
        <ListHeader kind={kind} p={progress[kind]} items={items} />

        {kind === 'quest' ? (
          <QuestPanel
            tripId={tripId}
            uid={uid}
            items={list}
            stops={stops}
            days={days}
            profiles={profiles}
            suggestions={suggestions.filter((s) => s.kind === 'quest')}
            onToggle={toggle}
            onMenu={(i) => setMenuId(i.id)}
            onAnswer={(s, a) => void answer(s, a)}
          />
        ) : (
          <>
            {list.length === 0 ? (
              <p className="text-[15px] text-ink-2">
                {kind === 'before'
                  ? 'O que precisa estar resolvido antes de sair: ingressos, revisão do carro, confirmações.'
                  : 'O que vai na mala. Digite um item e aperte Enter para emendar o próximo.'}
              </p>
            ) : (
              <SortableChecklist
                items={list}
                label={CHECKLIST_KINDS[kind].label}
                profiles={profiles}
                onToggle={toggle}
                onMenu={(i) => setMenuId(i.id)}
                onMove={(from, to) => void moveItem(tripId, kind, from, to)}
              />
            )}
            <AddItemField
              label={ADD[kind].label}
              placeholder={ADD[kind].placeholder}
              onAdd={(text) => void addItem(tripId, uid, { kind, text })}
            />
            {kind === 'pack' && suggestions.some((s) => s.kind === 'pack') ? (
              <section aria-labelledby="h-sug-pack" className="grid gap-2">
                <h2 id="h-sug-pack" className="label-caps text-ink-2">
                  Sugestões pela estrada
                </h2>
                <ul className="grid gap-2">
                  {suggestions
                    .filter((s) => s.kind === 'pack')
                    .map((s) => (
                      <SuggestionRow
                        key={s.id}
                        suggestion={s}
                        onAdd={() => void answer(s, 'add')}
                        onDismiss={() => void answer(s, 'dismiss')}
                      />
                    ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </section>

      <ItemSheet
        item={menuItem}
        index={menuIndex}
        count={list.length}
        movable={menuItem?.kind !== 'quest'}
        stops={stops}
        days={days}
        onClose={() => setMenuId(null)}
        onSave={(changes) => {
          if (menuItem) void editItem(menuItem, changes);
          setMenuId(null);
        }}
        onMove={(delta) => {
          if (menuItem && menuIndex >= 0) {
            void moveItem(tripId, menuItem.kind as ChecklistKind, menuIndex, menuIndex + delta);
          }
        }}
        onRemove={() => {
          if (menuItem) void remove(menuItem);
        }}
      />
      <ReadyCelebration trip={trip} items={items} today={todayISO()} />
    </div>
  );
}

function ListHeader({
  kind,
  p,
  items,
}: {
  kind: ChecklistKind;
  p: Progress;
  items: readonly ChecklistItem[];
}) {
  const left = p.total - p.done;
  const points = questPoints(items);
  const text =
    p.total === 0
      ? 'Lista vazia'
      : left === 0
        ? kind === 'quest'
          ? 'Todas as missões feitas'
          : 'Tudo marcado'
        : `${p.done} de ${p.total} · ${left === 1 ? 'falta 1' : `faltam ${left}`}`;
  return (
    <div className="flex items-center gap-4">
      <Ring
        value={fraction(p)}
        color={RING_COLOR[kind]}
        className="size-[76px] shrink-0"
        label={`${CHECKLIST_KINDS[kind].label}: ${p.done} de ${p.total}`}
      >
        <b className="font-num text-[22px] font-bold">
          {p.done}/{p.total}
        </b>
      </Ring>
      <div className="grid gap-0.5">
        <h2 className="font-num text-[24px] leading-tight font-semibold">
          {CHECKLIST_KINDS[kind].label}
        </h2>
        <p className="text-[15px] text-ink-2">{text}</p>
        {kind === 'quest' && points.total > 0 ? (
          <p className="font-num text-[15px] font-semibold text-on-time-ink">
            +{points.done} de {points.total} pontos do time
          </p>
        ) : null}
      </div>
    </div>
  );
}

type QuestGroup = {
  key: string;
  title: string;
  quests: ChecklistItem[];
  suggestions: Suggestion[];
};

/** Missões por parada, na ordem do roteiro; as da viagem (sem parada) no fim. */
function questGroups(
  quests: readonly ChecklistItem[],
  suggestions: readonly Suggestion[],
  stops: readonly Stop[],
  days: readonly TripDay[],
): QuestGroup[] {
  const groups: QuestGroup[] = [];
  const placed = new Set<string>();
  for (const day of days) {
    for (const stop of sortStops(stops.filter((s) => s.trip_day_id === day.id))) {
      const q = quests.filter((i) => i.stop_id === stop.id);
      const s = suggestions.filter((x) => x.stop_id === stop.id);
      for (const i of q) placed.add(i.id);
      if (q.length + s.length === 0) continue;
      groups.push({
        key: stop.id,
        title: `${formatDayShort(day.date)} · ${stop.name}`,
        quests: q,
        suggestions: s,
      });
    }
  }
  const loose = quests.filter((i) => !placed.has(i.id));
  if (loose.length > 0) {
    groups.push({ key: 'trip', title: 'Da viagem', quests: loose, suggestions: [] });
  }
  return groups;
}

function QuestPanel({
  tripId,
  uid,
  items,
  stops,
  days,
  profiles,
  suggestions,
  onToggle,
  onMenu,
  onAnswer,
}: {
  tripId: string;
  uid: string;
  items: ChecklistItem[];
  stops: Stop[];
  days: TripDay[];
  profiles: ReadonlyMap<string, Profile>;
  suggestions: Suggestion[];
  onToggle: (item: ChecklistItem) => void;
  onMenu: (item: ChecklistItem) => void;
  onAnswer: (s: Suggestion, a: 'add' | 'dismiss') => void;
}) {
  const [text, setText] = useState('');
  const [stopId, setStopId] = useState<string | null>(null);
  const [points, setPoints] = useState<number>(QUEST_POINTS_DEFAULT);
  const groups = questGroups(items, suggestions, stops, days);
  return (
    <>
      {groups.length === 0 ? (
        <p className="text-[15px] text-ink-2">
          Missões são pequenos desafios do time na estrada: uma foto, um prato, um rótulo. Nada que
          dependa de pressa ou de quem dirige.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="grid gap-2">
            <h2 className="label-caps text-ink-2">{g.title}</h2>
            {g.quests.length > 0 ? (
              <ul className="grid gap-2">
                {g.quests.map((q) => (
                  <li key={q.id}>
                    <ChecklistRow
                      item={q}
                      profiles={profiles}
                      onToggle={() => onToggle(q)}
                      onMenu={() => onMenu(q)}
                      extra={
                        <span className="font-num font-semibold text-on-time-ink">+{q.points}</span>
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {g.suggestions.length > 0 ? (
              <ul className="grid gap-2">
                {g.suggestions.map((s) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={{ ...s, reason: 'sugestão para esta parada' }}
                    onAdd={() => onAnswer(s, 'add')}
                    onDismiss={() => onAnswer(s, 'dismiss')}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        ))
      )}
      <Card className="grid gap-4">
        <h2 className="font-num text-[19px] font-semibold">Nova missão</h2>
        <TextField
          label="Missão"
          placeholder="Ex.: tomar um mate na praça"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        <QuestFields
          stops={stops}
          days={days}
          stopId={stopId}
          points={points}
          onStop={setStopId}
          onPoints={setPoints}
        />
        <Button
          size="md"
          disabled={text.trim() === ''}
          onClick={() => {
            void addItem(tripId, uid, { kind: 'quest', text, stopId, points });
            setText('');
          }}
        >
          Adicionar missão
        </Button>
      </Card>
    </>
  );
}
