import { Check, MapPin, Route, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { StopKind } from '@shared/constants.ts';
import { GEOAPIFY_ATTRIBUTION } from '@shared/places-schema.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { KIND_TEXT } from '@/features/itinerary/stop-kinds.ts';
import { cx } from '@/lib/cx.ts';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';
import {
  canBuild,
  groupFate,
  summaryOf,
  type MapStage,
  type NamedEntry,
  type OptionGroup,
} from '../flow.ts';
import type { PlaceHit, PlaceQuestion } from '../locate.ts';
import { openingText } from '../opening.ts';
import { aboutMinutes, reachLabel, type MapOption } from '../search.ts';

type Props = {
  map: MapStage;
  /** "Saindo de Major Vieira, SC · mudar" (fase 25, D271), antes das opções */
  origin?: ReactNode;
  /** a cidade escolhida na pergunta da cidade (fase 25, D276) */
  onPlace: (said: string, hit: PlaceHit) => void;
  /** a cidade escrita no lugar do que foi dito, ou '' para seguir sem ela (D283) */
  onRename: (said: string, city: string) => void;
  onToggle: (id: string) => void;
  onPick: (named: number, pick: NamedEntry['pick']) => void;
  /** "Tirar" uma vontade da viagem, e o desfazer (fase 25, D278) */
  onRemove: (group: number, removed: boolean) => void;
  onMore: (group: number) => void;
  onWider: (group: number) => void;
  onByType: (named: number) => void;
  onByName: (name: string, kind: StopKind, group?: number) => void;
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
    // o nome acessível é o próprio texto do cartão (o nome, a cidade, o tempo e o horário): o que se
    // lê é o que se vê (WCAG 2.5.3)
    <button
      type="button"
      aria-pressed={chosen}
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
function ByName({
  kind,
  group,
  onByName,
}: {
  kind: StopKind;
  group: number;
  onByName: Props['onByName'];
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length >= 3) onByName(name, kind, group);
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
  const fate = groupFate(group, chosen);
  // o estado de cada vontade fica à vista (fase 25, D278): escolhida, sem escolha, pendente ou tirada
  const remove = (
    <Button size="md" variant="ghost" onClick={() => props.onRemove(index, true)}>
      Tirar da viagem
    </Button>
  );
  return (
    <section
      className="grid gap-2"
      aria-label={title}
      data-option-group={group.status}
      data-fate={fate}
    >
      <h2 className="label-caps text-accent-ink">{title}</h2>
      {fate === 'removed' ? (
        <Card className="grid gap-2" role="status">
          <p className="text-[15px] text-ink-2">
            Tirado da viagem: {group.label}. A viagem não leva isso.
          </p>
          <Button size="md" variant="secondary" onClick={() => props.onRemove(index, false)}>
            Desfazer
          </Button>
        </Card>
      ) : group.status === 'ok' ? (
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
          <p className="text-[14px] text-ink-2">
            Fica pendente: entra na viagem sem local, e dá para marcar o local na revisão.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.radiusKm < 400 ? (
              <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
                Procurar mais longe
              </Button>
            ) : null}
            {remove}
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
          <p className="text-[14px] text-ink-2">
            {group.byName
              ? 'Procurado pelo nome: o lugar está acima.'
              : 'Sem isso, fica pendente: entra na viagem sem local, e dá para marcar o local na revisão.'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.status === 'offline' || group.status === 'failed' ? (
              <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
                Tentar de novo
              </Button>
            ) : null}
            {group.byName ? null : remove}
          </div>
          <ByName kind={group.search.kind} group={index} onByName={props.onByName} />
        </Card>
      )}
    </section>
  );
}

/**
 * A pergunta da cidade (fase 25, D276 e D283), no molde de "Escolher o local" da D229: a cidade dita tem
 * mais de um candidato plausível, ou só candidatos longe (outro país, além do alcance), ou nenhuma
 * cidade com esse nome no mapa ("Serra Gaúcha" são postos de gasolina). A busca só roda depois da
 * resposta: um candidato, outra cidade escrita, ou (só para onde vão) seguir sem ela. "Voltar ao texto"
 * fica embaixo. Nunca outro país em silêncio, e nunca o pedido sem a cidade em silêncio.
 */
function PlaceAsk({
  ask,
  onPlace,
  onRename,
}: {
  ask: PlaceQuestion;
  onPlace: Props['onPlace'];
  onRename: Props['onRename'];
}) {
  const [city, setCity] = useState('');
  const where = ask.role === 'origin' ? 'de onde vocês saem' : 'para onde vocês vão';
  const lead =
    ask.kind === 'unknown'
      ? `Não achei “${ask.said}” como cidade no mapa. ${ask.role === 'origin' ? 'De qual cidade vocês saem?' : 'Para qual cidade vocês vão?'}`
      : ask.kind === 'far'
        ? `Não achei “${ask.said}” perto de vocês. É um destes, ${where}?`
        : `Há mais de um “${ask.said}” no mapa. Qual é o de vocês, ${where}?`;
  return (
    <section
      className="grid gap-2"
      aria-label={`Escolher o local de ${ask.said}`}
      data-place-ask={ask.kind}
    >
      {ask.options.length > 0 ? (
        <h2 className="label-caps text-accent-ink">
          Escolher o local ({String(ask.options.length)})
        </h2>
      ) : null}
      <p className="text-[15px]">{lead}</p>
      {ask.options.length > 0 ? (
        <div role="radiogroup" className="grid gap-2" aria-label={ask.said}>
          {ask.options.map((o) => (
            <button
              key={`${o.address}-${String(o.lat)}`}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => onPlace(ask.said, o)}
              className="grid min-h-14 gap-0.5 rounded-[16px] bg-card px-3 py-2 text-left shadow-[inset_0_0_0_1px_var(--color-line)]"
            >
              <span className="text-[16px] font-semibold">
                {o.name}
                {o.minutes !== null ? (
                  <span className="font-normal text-ink-2">
                    {' '}
                    · a {aboutMinutes(o.minutes)} de carro
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] break-words text-ink-2">{o.address}</span>
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (city.trim().length >= 2) onRename(ask.said, city);
        }}
      >
        <TextField
          label={ask.options.length > 0 ? 'Outra cidade' : 'A cidade'}
          value={city}
          autoComplete="off"
          onChange={(e) => setCity(e.target.value)}
        />
        <Button type="submit" size="md" variant="secondary" disabled={city.trim().length < 2}>
          <Search className="size-5" aria-hidden="true" />
          Procurar esta cidade
        </Button>
      </form>
      {ask.role === 'area' ? (
        <Button size="md" variant="ghost" onClick={() => onRename(ask.said, '')}>
          Sem cidade: procurar perto de onde vocês saem
        </Button>
      ) : null}
    </section>
  );
}

/** Um lugar que a pessoa nomeou: o que o mapa achou, a escolha entre os candidatos, ou "não achei". */
function Named({ entry, index, props }: { entry: NamedEntry; index: number; props: Props }) {
  const s = entry.state;
  const said = entry.named.name;
  if (entry.pick === 'remove') {
    return (
      <Card className="grid gap-2" role="status" data-named="removed">
        <p className="text-[15px] text-ink-2">Tirado da viagem: “{said}”.</p>
        <Button size="md" variant="secondary" onClick={() => props.onPick(index, null)}>
          Desfazer
        </Button>
      </Card>
    );
  }
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
          : `Não achei “${said}” no mapa.`}{' '}
        <span className="text-ink-2">
          Fica pendente: entra na viagem sem local, e dá para marcar o local na revisão.
        </span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="md" variant="secondary" onClick={() => props.onByType(index)}>
          Procurar pelo tipo
        </Button>
        <Button size="md" variant="ghost" onClick={() => props.onPick(index, 'remove')}>
          Tirar da viagem
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
  const summary = summaryOf(map);
  const total = summary.chosen;
  const summaryText = [
    plural(summary.chosen, 'escolhido', 'escolhidos'),
    summary.unchosen.length > 0
      ? `${plural(summary.unchosen.length, 'sem escolha', 'sem escolha')}: ${summary.unchosen.join(', ')}`
      : null,
    summary.pending.length > 0
      ? `${plural(summary.pending.length, 'pendente', 'pendentes')}: ${summary.pending.join(', ')}`
      : null,
    summary.removed.length > 0
      ? `${plural(summary.removed.length, 'tirado', 'tirados')}: ${summary.removed.join(', ')}`
      : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');
  if (map.ask) {
    return (
      <div className="grid gap-5" data-options="ask">
        <p className="font-num text-[22px] leading-tight font-semibold">
          Antes de procurar no mapa:
        </p>
        {props.origin}
        <PlaceAsk ask={map.ask} onPlace={props.onPlace} onRename={props.onRename} />
        <Button variant="ghost" size="md" onClick={props.onBack}>
          Voltar ao texto
        </Button>
      </div>
    );
  }
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
      {props.origin}
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
        {map.groups.length + map.named.length > 0 ? (
          <p className="text-[14px] text-ink-2" data-summary>
            {summaryText}
          </p>
        ) : null}
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
