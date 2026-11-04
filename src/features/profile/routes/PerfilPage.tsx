import { zodResolver } from '@hookform/resolvers/zod';
import { PERSON_COLORS, PERSON_COLOR_KEYS, type PersonColor } from '@shared/constants.ts';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { nameSchema } from '@/lib/auth/schemas.ts';
import { cx } from '@/lib/cx.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { signOutNow, trySignOut, useUpdateProfile } from '../actions.ts';
import { asPersonColor, useProfile } from '../queries.ts';

const schema = z.object({ name: nameSchema, color: z.enum(PERSON_COLOR_KEYS) });
type Values = z.infer<typeof schema>;

export default function PerfilPage() {
  const { session } = useSession();
  const profile = useProfile();
  const update = useUpdateProfile();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const [pendingOnExit, setPendingOnExit] = useState<number | null>(null);
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

  const signOut = () => {
    setLeaving(true);
    void trySignOut()
      .then((pending) => {
        if (pending > 0) setPendingOnExit(pending);
      })
      .finally(() => setLeaving(false));
  };

  return (
    <div className="grid gap-4">
      <h1 className="font-num text-[30px] leading-none font-semibold">Perfil</h1>
      <Card className="grid gap-5">
        <div className="flex items-center gap-4">
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
      <Button variant="ghost" loading={leaving} onClick={signOut}>
        Sair
      </Button>
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
    </div>
  );
}
