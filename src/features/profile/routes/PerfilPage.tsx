import { zodResolver } from '@hookform/resolvers/zod';
import {
  INTERESTS,
  INTEREST_KEYS,
  LEAD_MINUTE_OPTIONS,
  PERSON_COLORS,
  PERSON_COLOR_KEYS,
  type PersonColor,
} from '@shared/constants.ts';
import { Check, ChevronRight, FlaskConical, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Splash } from '@/app/Splash.tsx';
import { CarSide } from '@/art/cars/CarSide.tsx';
import { describeCar } from '@/art/cars/describe.ts';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { Switch } from '@/components/ui/Switch.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { GARAGE_PATH } from '@/features/garage/links.ts';
import { useMyProfile } from '@/features/garage/my-car.ts';
import { carOf } from '@/features/garage/rules.ts';
import { useLabRole } from '@/features/lab/queries.ts';
import { DevicePush } from '@/features/notifications/components/DevicePush.tsx';
import { newTripDefaults } from '@/features/notifications/prefs.ts';
import { AchievementGrid } from '@/features/progression/components/AchievementBadge.tsx';
import { useCelebrations } from '@/features/progression/celebrations.ts';
import { CelebrationHost } from '@/features/progression/components/CelebrationHost.tsx';
import { LevelBar } from '@/features/progression/components/LevelBar.tsx';
import { levelProgress } from '@/features/progression/level.ts';
import { useCelebrationsPref, writeCelebrationsPref } from '@/features/progression/prefs.ts';
import { useMyProgress } from '@/features/progression/useTeamProgress.ts';
import { useSoundPref, writeSoundPref } from '@/lib/audio/index.ts';
import { nameSchema } from '@/lib/auth/schemas.ts';
import { cx } from '@/lib/cx.ts';
import type { Profile } from '@/lib/db/schema.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { useThemePref, writeThemePref, type ThemePref } from '@/lib/theme.ts';
import {
  saveInterests,
  saveNotifyDefaults,
  signOutNow,
  trySignOut,
  useUpdateProfile,
} from '../actions.ts';
import { interestsOf, learnedPhrase, toggleInterest, type Learned } from '../likes.ts';
import { asPersonColor, useLearnedLikes, useProfile } from '../queries.ts';

const schema = z.object({ name: nameSchema, color: z.enum(PERSON_COLOR_KEYS) });
type Values = z.infer<typeof schema>;

/**
 * O Perfil em seções (fase 16), nesta ordem: Você, O seu carro, Progresso, O que você gosta (fase
 * 17), Avisos neste aparelho, Aparência, Dados e Laboratório. Cada seção tem título; a raiz é uma
 * coluna que nunca passa da tela (D161).
 *
 * A tela pinta inteira (fase 17, 3.0): a fila das comemorações e o perfil do aparelho são lidos antes
 * da primeira pintura, como a visão geral faz (D162). Antes, o cartão do resumo chegava um quadro
 * depois, acima de "Você", e empurrava a página: 0,40 de CLS no laboratório da produção.
 */
export default function PerfilPage() {
  const labRole = useLabRole();
  const { session } = useSession();
  const celebrations = useCelebrations();
  const me = useMyProfile();
  const learned = useLearnedLikes(session?.user.id ?? '');
  if (celebrations === undefined || me === undefined || learned === undefined) return <Splash />;
  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="font-num text-[30px] leading-none font-semibold">Perfil</h1>
      {/* abrir o perfil é um momento calmo: o resumo ou o cartão de desbloqueio sai aqui */}
      <CelebrationHost active state={celebrations} />
      <You />
      <YourCar />
      <Progress />
      <Likes profile={me} learned={learned} />
      <DeviceNotices />
      <Appearance />
      <Data />
      {labRole.data ? (
        <Section id="h-laboratorio" title="Laboratório">
          <ButtonLink to="/lab" variant="secondary">
            <FlaskConical className="size-5" aria-hidden="true" />
            Laboratório de testes
          </ButtonLink>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby={id}>
      <div className="grid gap-0.5">
        <h2 id={id} className="label-caps text-accent-ink">
          {title}
        </h2>
        {lead ? <p className="text-[14px] text-ink-2">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ Você
function You() {
  const { session } = useSession();
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', color: 'sunset' },
  });

  useEffect(() => {
    if (profile.data)
      form.reset({ name: profile.data.name, color: asPersonColor(profile.data.color) });
  }, [profile.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.show({ title: 'Perfil salvo', kind: 'ok' });
    } catch {
      toast.show({
        title: 'Não deu para salvar',
        description: 'Tente de novo quando a internet voltar.',
        kind: 'late',
      });
    }
  });

  const name = useWatch({ control: form.control, name: 'name' });
  const color = useWatch({ control: form.control, name: 'color' });

  return (
    <Section id="h-voce" title="Você">
      <Card className="grid gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name || '?'} color={color} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{name || 'Seu nome'}</p>
            <p className="truncate text-[14px] text-ink-2">{session?.user.email}</p>
          </div>
        </div>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
          <TextField
            label="Nome"
            autoComplete="name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <fieldset className="grid gap-2">
                <legend className="text-[15px] font-semibold">Sua cor</legend>
                <p className="-mt-1 text-[14px] text-ink-2">
                  Identifica você nos itens marcados, nos gastos e na trilha.
                </p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
                  {PERSON_COLOR_KEYS.map((key: PersonColor) => {
                    const selected = field.value === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={PERSON_COLORS[key].label}
                        onClick={() => field.onChange(key)}
                        className={cx(
                          'grid size-12 place-items-center rounded-full text-white transition',
                          selected && 'ring-[3px] ring-accent ring-offset-2 ring-offset-card',
                        )}
                        style={{ background: PERSON_COLORS[key].hex }}
                      >
                        {selected ? <Check className="size-6" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          />
          <Button type="submit" loading={update.isPending} disabled={profile.isPending}>
            Salvar
          </Button>
        </form>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ O seu carro
function YourCar() {
  const profile = useMyProfile();
  // fora de uma viagem, a placa personalizada leva o nome da pessoa
  const car = profile === undefined ? null : carOf(profile, profile?.name ?? null);
  return (
    <Section
      id="h-seu-carro"
      title="O seu carro"
      lead="O mesmo em todas as viagens: na maquete, no card e na retrospectiva."
    >
      <Card className="grid gap-3" data-my-car>
        <div className="grid h-[96px] place-items-center">
          {car ? <CarSide car={car} className="h-full w-auto max-w-full" /> : null}
        </div>
        {car ? <p className="text-center text-[15px] text-ink-2">{describeCar(car)}</p> : null}
        <ButtonLink to={GARAGE_PATH} state={{ back: '/perfil' }} variant="secondary" size="md">
          Abrir a garagem
          <ChevronRight className="size-4" aria-hidden="true" />
        </ButtonLink>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ Progresso
function Progress() {
  const mine = useMyProgress();
  return (
    <Section id="h-progresso" title="Progresso">
      <LevelBar progress={levelProgress(mine.xp)} who="me" />
      <AchievementGrid mine={new Set(mine.achievements)} />
    </Section>
  );
}

// ------------------------------------------------------------------ O que você gosta
/**
 * Fase 17: os chips opcionais e o que o app aprende pelas notas. Pela regra 16, os chips vazios são a
 * própria pergunta, então a seção aparece sempre. É pista para a IA, nunca regra.
 */
function Likes({ profile, learned }: { profile: Profile | null; learned: readonly Learned[] }) {
  const toast = useToast();
  const chosen = interestsOf(profile?.interests);
  const phrase = learnedPhrase(learned);
  return (
    <Section
      id="h-gostos"
      title="O que você gosta"
      lead="Uma pista para a IA montar as viagens com vocês, nunca uma regra. Escolha quantos quiser, ou nenhum."
    >
      <Card className="grid gap-3" data-likes>
        <div role="group" aria-label="Gostos" className="flex flex-wrap gap-2">
          {INTEREST_KEYS.map((key) => {
            const on = chosen.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={!profile}
                data-interest={key}
                onClick={() =>
                  void saveInterests(toggleInterest(chosen, key)).catch(() =>
                    toast.show({ title: 'Não deu para salvar o gosto.', kind: 'late' }),
                  )
                }
                className={cx(
                  'inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold disabled:opacity-50',
                  on
                    ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                    : 'bg-paper text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
                )}
              >
                {on ? <Check className="size-4" aria-hidden="true" /> : null}
                {INTERESTS[key].label}
              </button>
            );
          })}
        </div>
        {phrase ? (
          <p className="text-[14px] text-ink-2" data-learned>
            {phrase}
          </p>
        ) : null}
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ Avisos neste aparelho
function DeviceNotices() {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const sound = useSoundPref();
  const celebrations = useCelebrationsPref();
  const profile = useMyProfile();
  const toast = useToast();
  const defaults = newTripDefaults(profile);
  const save = (patch: Parameters<typeof saveNotifyDefaults>[0]) => {
    void saveNotifyDefaults(patch).catch(() =>
      toast.show({ title: 'Não deu para salvar o padrão.', kind: 'late' }),
    );
  };
  return (
    <Section
      id="h-avisos-aparelho"
      title="Avisos neste aparelho"
      lead="Valem para todas as viagens. Os de cada viagem ficam em Avisos, na viagem."
    >
      <DevicePush uid={uid} />
      <Card className="grid gap-3">
        <Switch
          label="Sons do Modo Viagem"
          description="Buzina no Partiu!, sino no Chegamos!, ronco do motor no replay."
          checked={sound}
          onChange={writeSoundPref}
        />
        <Switch
          label="Cartões de conquista"
          description="Ao desbloquear, um cartão com o acessório encaixando no carro, num momento calmo."
          checked={celebrations}
          onChange={writeCelebrationsPref}
        />
      </Card>
      <Card className="grid gap-1 divide-y divide-line" data-notify-defaults>
        <div className="grid gap-0.5 pb-2">
          <p className="text-[17px] font-semibold">Para as viagens novas</p>
          <p className="text-[14px] text-ink-2">
            Com que cada viagem nova começa; depois, cada uma muda em Avisos.
          </p>
        </div>
        <div className="grid gap-2 py-3">
          <p className="text-[16px] font-semibold">Avisar com antecedência</p>
          <div
            role="radiogroup"
            aria-label="Antecedência padrão do aviso de saída"
            className="flex flex-wrap gap-2"
          >
            {LEAD_MINUTE_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                role="radio"
                aria-checked={defaults.lead_minutes === min}
                disabled={!profile}
                onClick={() => save({ notify_lead_minutes: min })}
                className={cx(
                  'min-h-12 min-w-16 rounded-full px-4 font-num text-[17px] font-bold disabled:opacity-50',
                  defaults.lead_minutes === min
                    ? 'bg-sunset-deep text-white'
                    : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]',
                )}
              >
                {min} min
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <span className="text-[16px] font-semibold">Briefing da manhã às</span>
          <input
            type="time"
            value={defaults.morning_time}
            disabled={!profile}
            onChange={(e) => {
              if (e.target.value) save({ notify_morning_time: e.target.value });
            }}
            className="min-h-12 rounded-field bg-paper px-3 font-num text-[20px] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] disabled:opacity-50"
          />
        </label>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ Aparência
const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Do sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
];

function Appearance() {
  const theme = useThemePref();
  const reduced = useReducedMotion();
  return (
    <Section id="h-aparencia" title="Aparência" lead="Só neste aparelho.">
      <Card className="grid gap-4">
        <div className="grid gap-2">
          <p className="text-[16px] font-semibold">Tema</p>
          <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                data-theme-option={value}
                onClick={() => writeThemePref(value)}
                className={cx(
                  'grid min-h-16 min-w-0 justify-items-center gap-1 rounded-[16px] px-1 py-2 text-[15px] font-semibold',
                  theme === value
                    ? 'bg-accent-soft text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                    : 'bg-paper text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)]',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[14px] text-ink-2" data-reduced-motion={reduced ? 'on' : 'off'}>
          O movimento reduzido segue o sistema
          {reduced
            ? ': está ligado neste aparelho, e o app corta as animações (a câmera da maquete, o replay, o confete).'
            : ' (no iPhone, Ajustes → Acessibilidade → Movimento → Reduzir movimento; no Android, Acessibilidade → Remover animações).'}
        </p>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ Dados
function Data() {
  const [leaving, setLeaving] = useState(false);
  const [pendingOnExit, setPendingOnExit] = useState<number | null>(null);
  const signOut = () => {
    setLeaving(true);
    void trySignOut()
      .then((pending) => {
        if (pending > 0) setPendingOnExit(pending);
      })
      .finally(() => setLeaving(false));
  };
  return (
    <Section
      id="h-dados"
      title="Dados"
      lead="Tudo fica guardado neste aparelho para funcionar sem sinal."
    >
      <Card className="grid gap-3">
        <p className="text-[15px] text-ink-2">
          Sair envia o que estiver pendente e apaga os dados deste aparelho. Na próxima entrada,
          tudo volta do servidor.
        </p>
        <Button variant="secondary" loading={leaving} onClick={signOut}>
          Sair
        </Button>
      </Card>
      <Sheet
        open={pendingOnExit !== null}
        onClose={() => setPendingOnExit(null)}
        title="Ainda há alterações por enviar"
        description={
          pendingOnExit === 1
            ? 'Uma alteração ainda não chegou ao servidor. Sair agora apaga os dados deste celular, e ela se perde.'
            : `${pendingOnExit ?? 0} alterações ainda não chegaram ao servidor. Sair agora apaga os dados deste celular, e elas se perdem.`
        }
      >
        <Button variant="secondary" onClick={() => setPendingOnExit(null)}>
          Ficar e tentar depois
        </Button>
        <Button variant="danger" onClick={() => void signOutNow()}>
          Sair mesmo assim
        </Button>
      </Sheet>
    </Section>
  );
}
