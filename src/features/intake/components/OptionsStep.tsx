import { Check, MapPin, Route, Search } from 'lucide-react';
import { useState } from 'react';
import type { StopKind } from '@shared/constants.ts';
import { GEOAPIFY_ATTRIBUTION } from '@shared/places-schema.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { KIND_TEXT } from '@/features/itinerary/stop-kinds.ts';
import { cx } from '@/lib/cx.ts';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';
import { canBuild, type MapStage, type NamedEntry, type OptionGroup } from '../flow.ts';
import { openingText } from '../opening.ts';
import { aboutMinutes, reachLabel, type MapOption } from '../search.ts';

type Props = {
  map: MapStage;
  onToggle: (id: string) => void;
  onPick: (named: number, pick: number | 'skip') => void;
  onMore: (group: number) => void;
  onWider: (group: number) => void;
  onByType: (named: number) => void;
  onByName: (name: string, kind: StopKind) => void;
  onBuild: () => void;
  onBack: () => void;
};

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** O pé da tela: o mapa é do OpenStreetMap, e a busca é da Geoapify (a regra do plano gratuito). */
export function MapAttribution() {
  return (
    <p className="text-[13px] text-ink-2" data-map-attribution>
      {OSM_ATTRIBUTION} ·{' '}
      <a
        href={GEOAPIFY_ATTRIBUTION.url}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline"
      >
        {GEOAPIFY_ATTRIBUTION.text}
      </a>
    </p>
  );
}

/** Um cartão de opção: o nome como está no mapa, a cidade, o tempo de carro e o horário se houver. */
function OptionCard({
  option,
  chosen,
  onToggle,
}: {
  option: MapOption;
  chosen: boolean;
  onToggle: () => void;
}) {
  const { place } = option;
  const about = `${aboutMinutes(option.minutes)} de carro`;
  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={`${place.name}${place.city ? `, ${place.city}` : ''}, ${about}`}
      onClick={onToggle}
      className={cx(
        'flex min-h-16 w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left',
        chosen
          ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]'
          : 'bg-card shadow-[inset_0_0_0_1px_var(--color-line)]',
      )}
      data-option={place.id}
    >
      <span
        className={cx(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px]',
          chosen ? 'bg-on-time text-white' : 'shadow-[inset_0_0_0_2px_var(--color-line)]',
        )}
        aria-hidden="true"
      >
        {chosen ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-2 text-[17px] font-semibold">
          <StopKindIcon
            kind={option.kind}
            className={`size-4 shrink-0 ${KIND_TEXT[option.kind]}`}
          />
          <span className="min-w-0 break-words">{place.name}</span>
        </span>
        <span className="text-[14px] text-ink-2">
          {[place.city, about].filter(Boolean).join(' · ')}
        </span>
        {place.opening_hours ? (
          <span className="text-[13px] text-ink-2">
            Horário no mapa: {openingText(place.opening_hours)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** A busca pelo nome, quando a do mapa por tipo não está ligada ou não respondeu. */
function ByName({ kind, onByName }: { kind: StopKind; onByName: Props['onByName'] }) {
  const [name, setName] = useState('');
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length >= 3) onByName(name, kind);
      }}
    >
      <TextField
        label="Procurar pelo nome do lugar"
        value={name}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" variant="secondary" size="md" disabled={name.trim().length < 3}>
        <Search className="size-5" aria-hidden="true" />
        Procurar
      </Button>
    </form>
  );
}

function Group({
  group,
  index,
  chosen,
  props,
}: {
  group: OptionGroup;
  index: number;
  chosen: readonly string[];
  props: Props;
}) {
  const where = group.centerLabel ? ` de ${group.centerLabel}` : '';
  const reach = `a até ${reachLabel(group.radiusKm)}${where}`;
  const title = group.label.charAt(0).toLocaleUpperCase('pt-BR') + group.label.slice(1);
  return (
    <section className="grid gap-2" aria-label={title} data-option-group={group.status}>
      <h2 className="label-caps text-accent-ink">{title}</h2>
      {group.status === 'ok' ? (
        <>
          <p className="text-[14px] text-ink-2">
            {plural(group.options.length, 'opção', 'opções')} no mapa {reach}. Escolha uma ou mais.
          </p>
          {group.options.slice(0, group.shown).map((o) => (
            <OptionCard
              key={o.place.id}
              option={o}
              chosen={chosen.includes(o.place.id)}
              onToggle={() => props.onToggle(o.place.id)}
            />
          ))}
          {group.options.length > group.shown ? (
            <Button variant="ghost" size="md" onClick={() => props.onMore(index)}>
              Mais opções ({String(group.options.length - group.shown)})
            </Button>
          ) : null}
        </>
      ) : group.status === 'none' ? (
        <Card className="grid gap-3" role="status">
          <p className="text-[15px]">
            Não achei {group.label} {reach}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.radiusKm < 400 ? (
              <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
                Procurar mais longe
              </Button>
            ) : null}
            <Button size="md" variant="ghost" onClick={props.onBack}>
              Mudar o pedido
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="grid gap-3" role="status">
          <p className="text-[15px]">
            {group.status === 'offline'
              ? 'Sem internet para buscar no mapa agora.'
              : group.status === 'limit'
                ? 'A busca no mapa chegou ao limite de hoje.'
                : group.status === 'no_source'
                  ? 'Não deu para buscar no mapa pelo tipo agora.'
                  : 'O mapa não respondeu agora.'}{' '}
            Dá para procurar pelo nome do lugar.
          </p>
          {group.status === 'offline' || group.status === 'failed' ? (
            <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
              Tentar de novo
            </Button>
          ) : null}
          <ByName kind={group.search.kind} onByName={props.onByName} />
        </Card>
      )}
    </section>
  );
}

/** Um lugar que a pessoa nomeou: o que o mapa achou, a escolha entre os candidatos, ou "não achei". */
function Named({ entry, index, props }: { entry: NamedEntry; index: number; props: Props }) {
  const s = entry.state;
  const said = entry.named.name;
  if (s.kind === 'found') {
    return (
      <Card className="grid gap-1" data-named="found">
        <p className="text-[14px] text-ink-2">Vocês disseram “{said}”: entra no caminho.</p>
        <p className="flex items-center gap-2 text-[17px] font-semibold">
          <MapPin className="size-4 shrink-0 text-on-time-ink" aria-hidden="true" />
          {s.hit.name}
        </p>
        <p className="text-[14px] text-ink-2">{s.hit.address}</p>
      </Card>
    );
  }
  if (s.kind === 'choice') {
    return (
      <section
        className="grid gap-2"
        aria-label={`Escolher o local de ${said}`}
        data-named="choice"
      >
        <h2 className="label-caps text-accent-ink">
          Escolher o local ({String(s.options.length)})
        </h2>
        <p className="text-[14px] text-ink-2">Há mais de um “{said}” no mapa. Qual é o de vocês?</p>
        <div role="radiogroup" className="grid gap-2" aria-label={said}>
          {s.options.map((o, i) => (
            <button
              key={`${o.name}-${String(o.lat)}`}
              type="button"
              role="radio"
              aria-checked={entry.pick === i}
              onClick={() => props.onPick(index, i)}
              className={cx(
                'grid min-h-14 gap-0.5 rounded-[16px] px-3 py-2 text-left',
                entry.pick === i
                  ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'bg-card shadow-[inset_0_0_0_1px_var(--color-line)]',
              )}
            >
              <span className="text-[16px] font-semibold">{o.name}</span>
              <span className="text-[13px] break-words text-ink-2">{o.address}</span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={entry.pick === 'skip'}
            onClick={() => props.onPick(index, 'skip')}
            className={cx(
              'min-h-12 rounded-[16px] px-3 text-left text-[15px] font-semibold text-ink-2',
              entry.pick === 'skip' && 'shadow-[inset_0_0_0_2px_var(--color-accent)]',
            )}
          >
            Nenhum destes
          </button>
        </div>
      </section>
    );
  }
  return (
    <Card className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]" data-named="none">
      <p className="text-[15px]">
        {s.kind === 'offline'
          ? `O mapa não respondeu para procurar “${said}”.`
          : `Não achei “${said}” no mapa.`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="md" variant="secondary" onClick={() => props.onByType(index)}>
          Procurar pelo tipo
        </Button>
        <Button
          size="md"
          variant="ghost"
          aria-pressed={entry.pick === 'skip'}
          onClick={() => props.onPick(index, 'skip')}
        >
          Seguir sem o local
        </Button>
      </div>
    </Card>
  );
}

/**
 * As opções do mapa (fase 24): o que existe de verdade, por vontade, com o nome do mapa, a cidade, o
 * tempo de carro estimado e o horário quando o mapa tem; poucas de cada vez; uma ou mais escolhidas.
 * Os lugares que a pessoa nomeou entram no caminho (a regra de ouro), com a escolha quando há mais de
 * um. Sem opção nenhuma ao alcance, a tela diz e oferece procurar mais longe ou mudar o pedido.
 */
export function OptionsStep(props: Props) {
  const { map } = props;
  const chosen = map.chosen.length;
  const named = map.named.filter(
    (n) => n.state.kind === 'found' || (n.state.kind === 'choice' && typeof n.pick === 'number'),
  ).length;
  const total = chosen + named;
  if (map.nowhere) {
    return (
      <Card className="grid gap-3" role="status" data-options="nowhere">
        <p className="text-[15px]">
          Não sei de onde vocês saem nem para onde querem ir, e sem isso não dá para procurar no
          mapa. Conte de novo com a cidade, ou de onde vocês saem.
        </p>
        <Button size="md" variant="secondary" onClick={props.onBack}>
          Voltar ao texto
        </Button>
      </Card>
    );
  }
  return (
    <div className="grid gap-5" data-options>
      <p className="font-num text-[22px] leading-tight font-semibold">
        {map.groups.some((g) => g.status === 'ok')
          ? 'Estes lugares existem no mapa. Escolha para onde ir.'
          : 'Para onde vocês vão?'}
      </p>
      {map.named.map((entry, i) => (
        <Named key={`${entry.named.name}-${String(i)}`} entry={entry} index={i} props={props} />
      ))}
      {map.groups.map((group, i) => (
        <Group
          key={`${group.label}-${String(i)}`}
          group={group}
          index={i}
          chosen={map.chosen}
          props={props}
        />
      ))}
      <div className="grid gap-2">
        <Button disabled={!canBuild(map)} onClick={props.onBuild}>
          <Route className="size-5" aria-hidden="true" />
          {total > 1 ? `Traçar o caminho por ${String(total)} lugares` : 'Traçar o caminho'}
        </Button>
        <Button variant="ghost" size="md" onClick={props.onBack}>
          Voltar ao texto
        </Button>
      </div>
      <MapAttribution />
    </div>
  );
}
