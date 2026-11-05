import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, UserMinus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { AlreadyInvitedError, inviteMember, removeMember, setSharePosition } from '../actions.ts';
import { useIsOwner, useTrip, useTripMembers } from '../queries.ts';
import { memberLabel } from '../rules.ts';
import { inviteSchema, type InviteInput } from '../schemas.ts';

export default function MembrosPage() {
  const { tripId = '' } = useParams();
  const { session } = useSession();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const isOwner = useIsOwner(trip);
  const toast = useToast();
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const me = members.find(
    (m) => m.member.user_id === session?.user.id && m.member.status === 'accepted',
  );
  const invite = form.handleSubmit(async ({ email }) => {
    if (!session) return;
    if (email === session.user.email?.toLowerCase()) {
      form.setError('email', { message: 'Você já está na viagem.' });
      return;
    }
    try {
      await inviteMember(trip.id, email, session.user.id);
      form.reset();
      toast.show({
        title: 'Convite guardado',
        description: 'Quem entrar com este e-mail confirmado vê o convite na tela inicial.',
        kind: 'ok',
      });
    } catch (err) {
      if (err instanceof AlreadyInvitedError)
        form.setError('email', { message: 'Este e-mail já foi convidado.' });
      else form.setError('email', { message: 'Não deu para convidar. Tente de novo.' });
    }
  });

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}`}
        title="Time"
        eyebrow={<span className="text-[15px] text-ink-2">{trip.name}</span>}
      />

      {isOwner ? (
        <Card className="grid gap-3">
          <form onSubmit={(e) => void invite(e)} noValidate className="grid gap-3">
            <TextField
              label="Convidar por e-mail"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="nome@exemplo.com"
              hint="O Viajei não manda e-mail: o convite aparece para quem entrar com esse endereço confirmado."
              error={errors.email?.message}
              {...form.register('email')}
            />
            <Button type="submit" size="md" loading={isSubmitting}>
              <Mail className="size-5" aria-hidden="true" />
              Convidar
            </Button>
          </form>
        </Card>
      ) : null}

      {me ? (
        <Card>
          <label className="flex min-h-12 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              className="size-6 shrink-0 accent-sunset"
              checked={me.member.share_position}
              onChange={(e) => void setSharePosition(me.member.id, e.target.checked)}
            />
            <span className="grid">
              <span className="text-[16px] font-semibold">
                Compartilhar minha posição nesta viagem
              </span>
              <span className="text-[14px] text-ink-2">
                Quem ficou em casa vê o carrinho andar pela sua trilha. Só você muda isto.
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      <ul className="grid gap-2" aria-label="Membros da viagem">
        {members.map(({ member, profile }) => {
          const pending = member.status !== 'accepted';
          const name = pending ? (member.invited_email ?? 'Convite') : (profile?.name ?? '…');
          const removable = isOwner && member.role !== 'owner';
          return (
            <li key={member.id} className="min-w-0">
              <Card className="flex items-center gap-3" role="group" aria-label={name}>
                {pending ? (
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                    <Mail className="size-5" aria-hidden="true" />
                  </span>
                ) : (
                  <Avatar
                    name={profile?.name ?? '?'}
                    color={asPersonColor(profile?.color ?? 'sunset')}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{name}</p>
                  <Chip
                    kind={pending ? 'warn' : member.role === 'owner' ? 'neutral' : 'ok'}
                    className="mt-1"
                  >
                    {memberLabel(member)}
                  </Chip>
                </div>
                {removable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={pending ? `Cancelar convite de ${name}` : `Remover ${name}`}
                    onClick={() => {
                      void removeMember(member.id).then(() =>
                        toast.show({
                          title: pending ? 'Convite cancelado' : 'Membro removido',
                          kind: 'info',
                        }),
                      );
                    }}
                  >
                    {pending ? (
                      <X className="size-4" aria-hidden="true" />
                    ) : (
                      <UserMinus className="size-4" aria-hidden="true" />
                    )}
                    {pending ? 'Cancelar' : 'Remover'}
                  </Button>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
