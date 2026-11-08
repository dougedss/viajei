import { zodResolver } from '@hookform/resolvers/zod';
import { Crosshair, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { STOP_KIND_KEYS, STOP_KINDS } from '@shared/constants.ts';
import { Button } from '@/components/ui/Button.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useOnline } from '@/lib/db/connectivity.ts';
import type { GeocodeResult, Stop } from '@/lib/db/schema.ts';
import { geocode, OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';
import { isShortMapsLink, parseMapsLink } from '@/lib/links/index.ts';
import { hhmm } from '@/lib/time/index.ts';
import { stopFormSchema, type StopFormInput, type StopFormValues } from '../schemas.ts';
import { KIND_TEXT } from '../stop-kinds.ts';
import { StopKindIcon } from './StopKindIcon.tsx';

/** O que o formulário lê de uma parada: a do roteiro ou a da revisão de uma importação. */
export type StopFormSource = Pick<
  Stop,
  | 'kind'
  | 'name'
  | 'time'
  | 'closes_at'
  | 'address'
  | 'lat'
  | 'lng'
  | 'travel_minutes_to_next'
  | 'notes'
  | 'url'
>;

type Props = {
  stop?: StopFormSource;
  submitLabel: string;
  onSubmit: (values: StopFormValues) => Promise<void>;
};

const EMPTY: StopFormInput = {
  kind: 'other',
  name: '',
  time: '',
  closes_at: '',
  address: '',
  lat: null,
  lng: null,
  travel_minutes_to_next: '',
  notes: '',
  url: '',
};

function fromStop(stop: StopFormSource): StopFormInput {
  return {
    kind: stop.kind as StopFormInput['kind'],
    name: stop.name,
    time: stop.time ? hhmm(stop.time) : '',
    closes_at: stop.closes_at ? hhmm(stop.closes_at) : '',
    address: stop.address ?? '',
    lat: stop.lat,
    lng: stop.lng,
    travel_minutes_to_next:
      stop.travel_minutes_to_next === null ? '' : String(stop.travel_minutes_to_next),
    notes: stop.notes ?? '',
    url: stop.url ?? '',
  };
}

const fmtCoord = (n: number) => n.toFixed(4).replace('.', ',');

/**
 * Formulário de parada. Coordenadas nunca são digitadas: vêm da busca de endereço (Nominatim, por
 * botão ou pausa de digitação, 1 requisição por segundo, cache local) ou de um link do Google Maps colado.
 */
export function StopForm({ stop, submitLabel, onSubmit }: Props) {
  const online = useOnline();
  const form = useForm<StopFormInput, unknown, StopFormValues>({
    resolver: zodResolver(stopFormSchema),
    defaultValues: stop ? fromStop(stop) : EMPTY,
  });
  const { errors, isSubmitting } = form.formState;
  const lat = useWatch({ control: form.control, name: 'lat' });
  const lng = useWatch({ control: form.control, name: 'lng' });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const address = useWatch({ control: form.control, name: 'address' });

  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [mapsHint, setMapsHint] = useState<string | null>(null);
  const lastSearched = useRef('');
  const abort = useRef<AbortController | null>(null);

  const search = async (query: string) => {
    const q = query.trim();
    if (q.length < 3 || q === lastSearched.current) return;
    lastSearched.current = q;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await geocode(q, controller.signal);
      if (!controller.signal.aborted) setResults(found);
    } catch (err) {
      if (!controller.signal.aborted) {
        setSearchError(
          err instanceof DOMException && err.name === 'AbortError'
            ? null
            : online
              ? 'A busca de endereço não respondeu. Tente de novo.'
              : 'Sem conexão: a busca só funciona online, mas você pode salvar sem o endereço.',
        );
        setResults(null);
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  // pausa de digitação: 900 ms depois da última tecla, nunca a cada tecla
  useEffect(() => {
    const q = address.trim();
    if (q.length < 3 || q === lastSearched.current) return;
    const t = setTimeout(() => void search(q), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const pick = (r: GeocodeResult) => {
    form.setValue('address', r.address, { shouldDirty: true });
    form.setValue('lat', r.lat, { shouldDirty: true });
    form.setValue('lng', r.lng, { shouldDirty: true });
    if (form.getValues('name').trim() === '') form.setValue('name', r.name, { shouldDirty: true });
    lastSearched.current = r.address.trim();
    setResults(null);
  };

  const onMapsLink = (text: string) => {
    setMapsLink(text);
    const coords = parseMapsLink(text);
    if (coords) {
      form.setValue('lat', coords.lat, { shouldDirty: true });
      form.setValue('lng', coords.lng, { shouldDirty: true });
      setMapsHint('Coordenadas lidas do link.');
    } else if (isShortMapsLink(text)) {
      setMapsHint('Link curto: abra no navegador e cole o endereço completo da barra.');
    } else if (text.trim() !== '') {
      setMapsHint('Não achei coordenadas nesse link.');
    } else {
      setMapsHint(null);
    }
  };

  const clearCoords = () => {
    form.setValue('lat', null, { shouldDirty: true });
    form.setValue('lng', null, { shouldDirty: true });
    setMapsLink('');
    setMapsHint(null);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      form.setError('root', {
        message: err instanceof Error ? err.message : 'Não deu para salvar. Tente de novo.',
      });
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-[15px] font-semibold">Tipo</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo da parada">
          {STOP_KIND_KEYS.map((k) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.setValue('kind', k, { shouldDirty: true })}
                className={
                  selected
                    ? 'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-[15px] font-semibold text-accent-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                    : 'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-card px-3 text-[15px] font-semibold text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]'
                }
              >
                <StopKindIcon kind={k} className={`size-4 ${KIND_TEXT[k]}`} />
                {STOP_KINDS[k].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <TextField
        label="Nome"
        placeholder="Park Salto Ventoso"
        autoComplete="off"
        error={errors.name?.message}
        {...form.register('name')}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Horário"
          type="time"
          error={errors.time?.message}
          {...form.register('time')}
        />
        <TextField
          label="Fecha às"
          type="time"
          error={errors.closes_at?.message}
          {...form.register('closes_at')}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-end gap-2">
          <TextField
            label="Endereço"
            placeholder="Nome do lugar, cidade"
            autoComplete="off"
            className="flex-1"
            hint={
              online
                ? 'Busque e escolha um resultado para marcar no mapa.'
                : 'Sem conexão: busca indisponível.'
            }
            error={errors.address?.message}
            {...form.register('address')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search(form.getValues('address'));
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
            aria-label="Buscar endereço"
            loading={searching}
            disabled={!online}
            className="mb-[26px]"
            onClick={() => void search(form.getValues('address'))}
          >
            <Search className="size-5" aria-hidden="true" />
          </Button>
        </div>
        {searchError ? (
          <p role="alert" className="text-[14px] font-semibold text-late-ink">
            {searchError}
          </p>
        ) : null}
        {results ? (
          <div className="grid gap-1 rounded-field bg-card p-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]">
            {results.length === 0 ? (
              <p className="px-2 py-1 text-[14px] text-ink-2">
                Nada encontrado. Tente com a cidade.
              </p>
            ) : (
              <ul className="grid gap-1" aria-label="Resultados da busca">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="grid min-h-12 w-full rounded-[10px] px-2 py-1.5 text-left hover:bg-accent-soft/50"
                    >
                      <span className="text-[15px] font-semibold">{r.name}</span>
                      <span className="text-[13px] text-ink-2">{r.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-2 pt-1 text-[12px] text-ink-2">{OSM_ATTRIBUTION}</p>
          </div>
        ) : null}
      </div>

      <TextField
        label="Ou cole um link do Google Maps"
        placeholder="https://www.google.com/maps/place/…"
        autoComplete="off"
        inputMode="url"
        value={mapsLink}
        onChange={(e) => onMapsLink(e.target.value)}
        hint={mapsHint ?? 'Lê a coordenada do link; o Viajei não digita latitude na mão.'}
      />

      {lat !== null && lng !== null ? (
        <div className="flex items-center gap-2">
          <Chip kind="ok">
            <Crosshair className="size-4" aria-hidden="true" />
            Marcada em {fmtCoord(lat)}, {fmtCoord(lng)}
          </Chip>
          <button
            type="button"
            onClick={clearCoords}
            className="inline-flex min-h-12 items-center gap-1 text-[14px] font-semibold text-ink-2"
          >
            <X className="size-4" aria-hidden="true" />
            Limpar
          </button>
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">
          Sem coordenada ainda: os links de navegação usarão o endereço.
        </p>
      )}

      <TextField
        label="Deslocamento até a próxima (min)"
        inputMode="numeric"
        placeholder="45"
        hint="Quando a rota do dia existir, o app sugere este valor."
        error={errors.travel_minutes_to_next?.message}
        {...form.register('travel_minutes_to_next')}
      />
      <TextField
        label="Link"
        placeholder="https://…"
        inputMode="url"
        autoComplete="off"
        error={errors.url?.message}
        {...form.register('url')}
      />
      <TextArea
        label="Observações"
        placeholder="Ingresso, estacionamento, o que lembrar."
        error={errors.notes?.message}
        {...form.register('notes')}
      />

      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-field bg-late/10 px-4 py-3 text-[15px] font-semibold text-late-ink"
        >
          {errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
