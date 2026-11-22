import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Hourglass,
  MapPin,
  Route,
  Search,
  Star,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { StopKind } from '@shared/constants.ts';
import { minutesText } from '@shared/day-span.ts';
import {
  GEOAPIFY_ATTRIBUTION,
  GOOGLE_ATTRIBUTION,
  GOOGLE_MAX_RADIUS_M,
  isGooglePlace,
} from '@shared/places-schema.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import { KIND_TEXT } from '@/features/itinerary/stop-kinds.ts';
import { cx } from '@/lib/cx.ts';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';
import {
  canBuild,
  canContinue,
  currentStep,
  groupFate,
  nextStep,
  previousStep,
  stageAccount,
  stepGroups,
  summaryOf,
  toggleChoice,
  type MapStage,
  type NamedEntry,
  type OptionGroup,
} from '../flow.ts';
import type { PlaceHit, PlaceQuestion } from '../locate.ts';
import { openingText } from '../opening.ts';
import { ratingText, statusText } from '../option-text.ts';
import { overBudget, totalText, type OutingAccount } from '../outing-time.ts';
import { UNREAD_REACH_HINT } from '../reach.ts';
import { aboutMinutes, reachLabel, type MapOption } from '../search.ts';

/** O tempo do passeio para a conta das opções (fase 26, a 3.3). */
export type OptionsTime = {
  /** a hora de sair ("08:00" numa viagem; daqui a uns 15 min na saída de hoje) */
  start: string;
  /** o dia do passeio */
  date: string;
  /** quanto tempo têm: os minutos (null é sem teto) e como a pessoa disse; null quando ninguém disse */
  budget: { minutes: number | null; label: string } | null;
  /** o tempo mudado na tela não foi entendido */
  unread: boolean;
};

type Props = {
  map: MapStage;
  /** "Saindo de Major Vieira, SC · mudar" (fase 25, D271), antes das opções */
  origin?: ReactNode;
  /** a conta do passeio (fase 26): sem isto, a tela não a mostra */
  time?: OptionsTime | null;
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
  /** "Continuar" ao passo seguinte (fase 26) */
  onContinue?: () => void;
  /** "Voltar um passo" (fase 26) */
  onStepBack?: () => void;
  /** "mudar" num passo feito: volta a ele (fase 26) */
  onBackTo?: (group: number) => void;
  /** o tempo mudado na tela ("mais tempo", fase 26) */
  onTime?: (answer: string) => void;
};

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const capital = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

/**
 * O pé da tela: de onde vêm os lugares. O mapa é do OpenStreetMap e a busca por tipo é da Geoapify (a
 * regra do plano gratuito); desde a fase 27, "Dados do Google Maps" quando há lugares do Google na tela.
 */
export function MapAttribution({ google = false }: { google?: boolean }) {
  return (
    <p className="text-[13px] text-ink-2" data-map-attribution={google ? 'google' : 'osm'}>
      {google ? `${GOOGLE_ATTRIBUTION} · ` : null}
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

/** O que o candidato faz com o tempo do passeio, se for escolhido (fase 26). */
type CardAccount = {
  /** "Daria 4 h 50" */
  total: number;
  over: boolean;
  /** a chegada fora da hora do dia dita, ou fechado na hora prevista */
  warnings: string[];
};

/**
 * Um cartão de opção: o nome como está no mapa, a cidade, o tempo de carro e o horário se houver; num
 * passo seguinte (fase 26), o que o lugar acrescenta ao passeio e o total se for escolhido; o que
 * estoura o tempo aparece marcado e esmaecido, e continua escolhível (a pessoa manda).
 */
function OptionCard({
  option,
  chosen,
  account,
  onToggle,
}: {
  option: MapOption;
  chosen: boolean;
  account?: CardAccount | null;
  onToggle: () => void;
}) {
  const { place } = option;
  const about = `${aboutMinutes(option.minutes)} de carro`;
  const rating = ratingText(place);
  const status = statusText(place);
  const adds = option.fromPrevious
    ? [
        `a ${aboutMinutes(option.fromPrevious.minutes)} de ${option.fromPrevious.name}`,
        option.detour === undefined
          ? null
          : option.detour > 0
            ? `+${minutesText(option.detour)} de estrada`
            : 'no caminho',
      ].filter((x): x is string => x !== null)
    : null;
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
        (status?.tone === 'off' || (account?.over && !chosen)) && 'opacity-70',
      )}
      data-option={place.id}
      data-source={isGooglePlace(place) ? 'google' : 'geoapify'}
      data-over={account?.over ? 'true' : undefined}
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
          {adds ? adds.join(' · ') : [place.city, about].filter(Boolean).join(' · ')}
        </span>
        {adds && place.city ? <span className="text-[13px] text-ink-2">{place.city}</span> : null}
        {rating || status ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            {rating ? (
              <span className="inline-flex items-center gap-1 text-ink-2" data-rating>
                <Star className="size-3.5 shrink-0 text-tight-ink" aria-hidden="true" />
                {rating}
              </span>
            ) : null}
            {status ? (
              <span
                className={cx(
                  'inline-flex items-center gap-1 font-semibold',
                  status.tone === 'ok' && 'text-on-time-ink',
                  status.tone === 'warn' && 'text-tight-ink',
                  status.tone === 'off' && 'text-late-ink',
                )}
                data-status={status.tone}
              >
                <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                {status.text}
              </span>
            ) : null}
          </span>
        ) : null}
        {place.opening_hours ? (
          <span className="text-[13px] text-ink-2">
            {isGooglePlace(place) ? 'Horário: ' : 'Horário no mapa: '}
            {isGooglePlace(place) ? place.opening_hours : openingText(place.opening_hours)}
          </span>
        ) : null}
        {account ? (
          <span
            className={cx(
              'inline-flex items-center gap-1 text-[13px] font-semibold',
              account.over ? 'text-late-ink' : 'text-ink-2',
            )}
            data-card-time={account.over ? 'over' : 'fits'}
          >
            <Hourglass className="size-3.5 shrink-0" aria-hidden="true" />
            {account.over
              ? `Não cabe no tempo: daria ${minutesText(account.total)}`
              : chosen
                ? `Com este, o passeio dá ${minutesText(account.total)}`
                : `Daria ${minutesText(account.total)} no total`}
          </span>
        ) : null}
        {account?.warnings.map((w) => (
          <span key={w} className="text-[13px] font-semibold text-tight-ink" data-card-warning>
            {w}
          </span>
        ))}
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

/** "1 de 3 · Café" com a relação do passo (o planejador, fase 27): o que a fase 26 mostra um por vez. */
function StepHeading({ group, total }: { group: OptionGroup; total: number }) {
  const title = capital(group.label);
  if (!group.step) return <h2 className="label-caps text-accent-ink">{title}</h2>;
  const when = {
    '': null,
    manha: 'de manhã',
    almoco: 'no almoço',
    tarde: 'à tarde',
    noite: 'à noite',
  }[group.step.hora_do_dia];
  return (
    <h2 className="label-caps text-accent-ink" data-step={group.step.ordem}>
      {total > 1 ? `${String(group.step.ordem)} de ${String(total)} · ` : ''}
      {title}
      {when ? <span className="font-normal text-ink-2"> · {when}</span> : null}
    </h2>
  );
}

function Group({
  group,
  index,
  chosen,
  steps,
  accounts,
  props,
}: {
  group: OptionGroup;
  index: number;
  chosen: readonly string[];
  /** quantos passos o planejador entregou (o "1 de 3") */
  steps: number;
  /** o que cada candidato faz com o tempo, pelo id (fase 26) */
  accounts?: ReadonlyMap<string, CardAccount> | null;
  props: Props;
}) {
  const where = group.centerLabel ? ` de ${group.centerLabel}` : '';
  // onde se procurou: em palavras, pelo passo do planejador; senão, pelo raio da busca por tipo
  const reach = group.where ?? `a até ${reachLabel(group.radiusKm)}${where}`;
  const fate = groupFate(group, chosen);
  // o estado de cada vontade fica à vista (fase 25, D278): escolhida, sem escolha, pendente ou tirada
  const remove = (
    <Button size="md" variant="ghost" onClick={() => props.onRemove(index, true)}>
      Tirar da viagem
    </Button>
  );
  const byRating = (group.step?.busca?.nota_minima ?? 0) > 0;
  const left = group.step?.descartados ?? 0;
  return (
    <section
      className="grid gap-2"
      aria-label={capital(group.label)}
      data-option-group={group.status}
      data-fate={fate}
      data-neighbors={group.step?.fora_da_cidade ? 'true' : undefined}
    >
      <StepHeading group={group} total={steps} />
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
          {group.step?.fora_da_cidade && group.step.cidade ? (
            <p className="text-[14px] font-semibold text-tight-ink" data-neighbors-note>
              Nada em {group.step.cidade}; nos vizinhos há{' '}
              {plural(group.options.length, 'opção', 'opções')}.
            </p>
          ) : null}
          <p className="text-[14px] text-ink-2">
            {plural(group.options.length, 'opção', 'opções')} no mapa {reach}. Escolha uma ou mais.
            {byRating ? (
              // "o melhor café": o critério à vista (D287 deixou para esta fase)
              <span className="font-semibold text-ink" data-ranked-by="rating">
                {' '}
                Os melhores primeiro, pela nota do Google.
              </span>
            ) : null}
            {left > 0 ? (
              <span data-left-out>
                {' '}
                {plural(left, 'lugar que não era', 'lugares que não eram')} {group.label}{' '}
                {left === 1 ? 'ficou' : 'ficaram'} de fora.
              </span>
            ) : null}
          </p>
          {group.options.slice(0, group.shown).map((o) => (
            <OptionCard
              key={o.place.id}
              option={o}
              chosen={chosen.includes(o.place.id)}
              account={accounts?.get(o.place.id) ?? null}
              onToggle={() => props.onToggle(o.place.id)}
            />
          ))}
          {group.options.length > group.shown || fate === 'unchosen' ? (
            // sem escolha, a vontade também pode sair da viagem (D278: escolhida, pendente ou tirada)
            <div className="grid gap-2 sm:grid-cols-2">
              {group.options.length > group.shown ? (
                <Button variant="ghost" size="md" onClick={() => props.onMore(index)}>
                  Mais opções ({String(group.options.length - group.shown)})
                </Button>
              ) : null}
              {fate === 'unchosen' ? remove : null}
            </div>
          ) : null}
        </>
      ) : group.question ? (
        // o pendente do planejador (fase 27): o que só a pessoa conhece, com a pergunta que resolve
        <Card className="grid gap-3" role="status" data-pending-question>
          <p className="text-[15px]">
            {group.question}{' '}
            <span className="text-ink-2">
              Não está em mapa nenhum. Fica pendente: entra na viagem sem local, e dá para marcar o
              local na revisão.
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">{remove}</div>
          <ByName kind={group.search.kind} group={index} onByName={props.onByName} />
        </Card>
      ) : group.status === 'none' ? (
        <Card className="grid gap-3" role="status">
          <p className="text-[15px]">
            Não achei {group.label} {reach}.
          </p>
          <p className="text-[14px] text-ink-2">
            Fica pendente: entra na viagem sem local, e dá para marcar o local na revisão.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.radiusKm < (group.step ? GOOGLE_MAX_RADIUS_M / 1000 : 400) ? (
              <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
                Procurar mais longe
              </Button>
            ) : null}
            {remove}
          </div>
          {group.step ? (
            <ByName kind={group.search.kind} group={index} onByName={props.onByName} />
          ) : null}
        </Card>
      ) : group.status === 'unsearched' ? (
        // o passo seguinte ainda não procurado: a busca roda ao continuar (a tela só chega aqui se a
        // busca não rodou; o botão de tentar de novo a chama)
        <Card className="grid gap-3" role="status" data-unsearched>
          <p className="text-[15px]">As opções de {group.label} ainda não foram procuradas.</p>
          <Button size="md" variant="secondary" onClick={() => props.onWider(index)}>
            Procurar agora
          </Button>
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

/** "Quanto tempo vocês têm?" de novo, na tela das opções: mais tempo quando nada cabe (fase 26). */
const TIME_OPTIONS = ['A manhã', 'A tarde', 'O dia', 'Até amanhã'];
function TimeAsk({
  unread,
  onTime,
  onClose,
}: {
  unread: boolean;
  onTime: (answer: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="grid gap-2"
      data-time-ask
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() !== '') {
          onTime(value);
          onClose();
        }
      }}
    >
      <p className="text-[15px] font-semibold">Quanto tempo vocês têm?</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quanto tempo vocês têm?">
        {TIME_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => setValue(option)}
            className={cx(
              'min-h-12 rounded-full px-4 text-[16px] font-semibold',
              value === option
                ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                : 'bg-paper text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
          >
            {option}
          </button>
        ))}
      </div>
      {unread ? (
        <p role="alert" className="text-[15px] font-semibold text-late-ink" data-misread>
          {UNREAD_REACH_HINT}
        </p>
      ) : null}
      <TextField
        label="Ou com as suas palavras"
        value={value}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" size="md" variant="secondary" disabled={value.trim() === ''}>
          Usar este tempo
        </Button>
        <Button type="button" size="md" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * O total à vista (fase 26, a 3.3): "O passeio dá cerca de 4 h 10: 2 h 40 de estrada e 1 h 30 nos
 * lugares", ao lado de "vocês têm a tarde, cerca de 5 h"; o que estoura, dito; e "Mudar o tempo".
 */
function OutingTime({
  account,
  time,
  onTime,
}: {
  account: OutingAccount;
  time: OptionsTime;
  onTime?: Props['onTime'];
}) {
  const [changing, setChanging] = useState(false);
  const budget = time.budget;
  const over = budget ? overBudget(account.total, budget.minutes) : false;
  const have = budget
    ? budget.minutes === null
      ? `vocês têm ${budget.label}`
      : `vocês têm ${budget.label}${/\d\s*(h|min|hora)/i.test(budget.label) ? '' : `, cerca de ${minutesText(budget.minutes)}`}`
    : null;
  return (
    <Card className="grid gap-2" data-outing-time={over ? 'over' : budget ? 'fits' : 'open'}>
      <p className="flex items-start gap-2 text-[15px]">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden="true" />
        <span>
          <span className="font-semibold">{totalText(account)}</span>
          {have ? <span className="text-ink-2">; {have}.</span> : null}
          {account.back ? (
            <span className="text-ink-2"> Chegada em casa por volta das {account.back}.</span>
          ) : null}
        </span>
      </p>
      {over ? (
        <p className="text-[14px] font-semibold text-late-ink" role="status">
          Não cabe no tempo que vocês têm.
        </p>
      ) : null}
      {account.arrivals
        .flatMap((a) => [
          ...(a.outsideWindow ? [a.outsideWindow] : []),
          ...(a.closed ? [`${a.name} estará fechado às ${a.at}`] : []),
          ...(a.waited > 0 ? [`${a.name}: espera de ${minutesText(a.waited)} até abrir`] : []),
        ])
        .map((w) => (
          <p key={w} className="text-[14px] font-semibold text-tight-ink" data-time-warning>
            {w}
          </p>
        ))}
      {onTime ? (
        changing ? (
          <TimeAsk unread={time.unread} onTime={onTime} onClose={() => setChanging(false)} />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
            Mudar o tempo
          </Button>
        )
      ) : null}
    </Card>
  );
}

/** Um passo feito, numa linha: "1 · Cachoeira Wiegand · mudar" (fase 26). */
function DoneStep({
  group,
  chosen,
  onChange,
}: {
  group: OptionGroup;
  chosen: readonly string[];
  onChange?: (() => void) | undefined;
}) {
  const names = group.options.filter((o) => chosen.includes(o.place.id)).map((o) => o.place.name);
  const fate = groupFate(group, chosen);
  const text =
    fate === 'removed'
      ? `${capital(group.label)}: tirado da viagem`
      : fate === 'pending'
        ? `${capital(group.label)}: pendente, sem local`
        : names.join(', ');
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]"
      data-step-done={group.step?.ordem}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-on-time text-white">
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="font-num font-semibold">{String(group.step?.ordem ?? '')}</span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 font-semibold">{text}</span>
      {onChange ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            aria-label={`Mudar o passo ${String(group.step?.ordem ?? '')}`}
            className="min-h-8 font-semibold text-accent-ink underline"
            onClick={onChange}
          >
            mudar
          </button>
        </>
      ) : null}
    </li>
  );
}

/** O que cada candidato do passo da vez faz com o tempo, se for escolhido (fase 26). */
function cardAccounts(
  map: MapStage,
  group: OptionGroup,
  time: OptionsTime | null | undefined,
): Map<string, CardAccount> | null {
  if (!time) return null;
  const out = new Map<string, CardAccount>();
  for (const o of group.options.slice(0, group.shown)) {
    const chosen = map.chosen.includes(o.place.id);
    const stage = chosen ? map : toggleChoice(map, o.place.id);
    const acc = stageAccount(stage, time);
    const mine = acc.arrivals.find((a) => a.name === o.place.name);
    out.set(o.place.id, {
      total: acc.total,
      over: time.budget ? overBudget(acc.total, time.budget.minutes) : false,
      warnings: [
        ...(mine?.outsideWindow ? [mine.outsideWindow] : []),
        ...(mine?.closed ? [`Fechado às ${mine.at}`] : []),
      ],
    });
  }
  return out;
}

const summaryTextOf = (map: MapStage): string => {
  const summary = summaryOf(map);
  return [
    plural(summary.chosen, 'escolhido', 'escolhidos'),
    summary.destination ? `destino: ${summary.destination}` : null,
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
};

/**
 * As opções do mapa (fase 24): o que existe de verdade, por vontade, com o nome do mapa, a cidade, o
 * tempo de carro estimado e o horário quando o mapa tem; poucas de cada vez; uma ou mais escolhidas.
 * Os lugares que a pessoa nomeou entram no caminho (a regra de ouro), com a escolha quando há mais de
 * um. Sem opção nenhuma ao alcance, a tela diz e oferece procurar mais longe ou mudar o pedido.
 *
 * **Um passo de cada vez** (fase 26, a decisão 1 de 20/11): com os passos do planejador, só o passo da
 * vez aparece; os feitos ficam numa linha com "mudar"; escolhido um lugar, "Continuar" procura o
 * seguinte em volta dele; "Voltar um passo" desfaz as escolhas dos seguintes, e a tela avisa; o total
 * do passeio fica à vista e o que estoura o tempo aparece marcado; o resumo e "Traçar o caminho" só no
 * fim. O pendente e os nomeados continuam como antes.
 */
export function OptionsStep(props: Props) {
  const { map, time } = props;
  // "Mais tempo" aberto no cartão de "nada cabe" (fase 26); um gancho antes de qualquer retorno
  const [moreTime, setMoreTime] = useState(false);
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
  const current = currentStep(map);
  const google = map.groups.some((g) => g.options.some((o) => isGooglePlace(o.place)));
  const stepsTotal = map.groups.filter((g) => g.step).length;
  const buildLabel = (n: number) =>
    n > 1 ? `Traçar o caminho por ${String(n)} lugares` : 'Traçar o caminho';

  if (current === null) {
    // a conversa de antes (sem passos, ou guardada por uma versão anterior): todos os grupos à vista
    const total = summaryOf(map).chosen;
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
            steps={stepsTotal}
            props={props}
          />
        ))}
        <div className="grid gap-2">
          {map.groups.length + map.named.length > 0 ? (
            <p className="text-[14px] text-ink-2" data-summary>
              {summaryTextOf(map)}
            </p>
          ) : null}
          <Button disabled={!canBuild(map)} onClick={props.onBuild}>
            <Route className="size-5" aria-hidden="true" />
            {buildLabel(total)}
          </Button>
          <Button variant="ghost" size="md" onClick={props.onBack}>
            Voltar ao texto
          </Button>
        </div>
        <MapAttribution google={google} />
      </div>
    );
  }

  // um passo de cada vez (fase 26)
  const steps = stepGroups(map);
  const position = steps.indexOf(current);
  const done = steps.slice(0, position);
  const group = map.groups[current];
  const next = nextStep(map);
  const previous = previousStep(map);
  const others = map.groups.flatMap((g, i) => (g.step ? [] : [{ g, i }]));
  const account = time && summaryOf(map).chosen > 0 ? stageAccount(map, time) : null;
  const accounts = group ? cardAccounts(map, group, time) : null;
  // nada cabe: todos os candidatos do passo da vez estouram, e nada dele foi escolhido
  const nothingFits =
    !!group &&
    group.status === 'ok' &&
    !!accounts &&
    accounts.size > 0 &&
    [...accounts.values()].every((a) => a.over) &&
    !group.options.some((o) => map.chosen.includes(o.place.id));
  return (
    <div className="grid gap-5" data-options data-step-mode>
      <p className="font-num text-[22px] leading-tight font-semibold">
        {group?.status === 'ok'
          ? position === 0
            ? 'Estes lugares existem no mapa. Escolha por onde começar.'
            : `Escolha ${group.label}: as opções são em volta do que vocês já escolheram.`
          : 'Para onde vocês vão?'}
      </p>
      {props.origin}
      {done.length > 0 ? (
        <ol className="grid gap-1.5" aria-label="Passos feitos" data-steps-done>
          {done.map((gi) => {
            const g = map.groups[gi];
            return g ? (
              <DoneStep
                key={gi}
                group={g}
                chosen={map.chosen}
                onChange={props.onBackTo ? () => props.onBackTo?.(gi) : undefined}
              />
            ) : null;
          })}
        </ol>
      ) : null}
      {map.notice ? (
        <p role="status" className="text-[14px] font-semibold text-tight-ink" data-step-notice>
          {map.notice}
        </p>
      ) : null}
      {map.named.map((entry, i) => (
        <Named key={`${entry.named.name}-${String(i)}`} entry={entry} index={i} props={props} />
      ))}
      {account && time ? <OutingTime account={account} time={time} onTime={props.onTime} /> : null}
      {group ? (
        <Group
          group={group}
          index={current}
          chosen={map.chosen}
          steps={stepsTotal}
          accounts={accounts}
          props={props}
        />
      ) : null}
      {nothingFits && time?.budget ? (
        <Card
          className="grid gap-3 shadow-[inset_0_0_0_2px_var(--color-tight)]"
          role="status"
          data-nothing-fits
        >
          <p className="text-[15px]">
            Nenhuma opção de {group.label} cabe no tempo que vocês têm ({time.budget.label}
            ). Dá para ter mais tempo, ou escolher outro lugar no passo anterior.
          </p>
          {moreTime && props.onTime ? (
            <TimeAsk
              unread={time.unread}
              onTime={props.onTime}
              onClose={() => setMoreTime(false)}
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {props.onTime ? (
                <Button size="md" variant="secondary" onClick={() => setMoreTime(true)}>
                  Mais tempo
                </Button>
              ) : null}
              {previous !== null && props.onStepBack ? (
                <Button size="md" variant="ghost" onClick={props.onStepBack}>
                  Voltar um passo
                </Button>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}
      {others.map(({ g, i }) => (
        <Group
          key={`${g.label}-${String(i)}`}
          group={g}
          index={i}
          chosen={map.chosen}
          steps={stepsTotal}
          props={props}
        />
      ))}
      <div className="grid gap-2">
        {next !== null ? (
          <Button disabled={!canContinue(map)} onClick={props.onContinue} data-continue>
            <ArrowRight className="size-5" aria-hidden="true" />
            Continuar
          </Button>
        ) : (
          <>
            <p className="text-[14px] text-ink-2" data-summary>
              {summaryTextOf(map)}
            </p>
            <Button disabled={!canBuild(map)} onClick={props.onBuild}>
              <Route className="size-5" aria-hidden="true" />
              {buildLabel(summaryOf(map).chosen + (map.destination ? 1 : 0))}
            </Button>
          </>
        )}
        {previous !== null && props.onStepBack ? (
          <Button variant="ghost" size="md" onClick={props.onStepBack} data-step-back>
            <ArrowLeft className="size-5" aria-hidden="true" />
            Voltar um passo
          </Button>
        ) : null}
        <Button variant="ghost" size="md" onClick={props.onBack}>
          Voltar ao texto
        </Button>
      </div>
      <MapAttribution google={google} />
    </div>
  );
}
