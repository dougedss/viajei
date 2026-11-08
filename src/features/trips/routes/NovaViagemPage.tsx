import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { createTrip } from '../actions.ts';
import { TripForm } from '../components/TripForm.tsx';

export default function NovaViagemPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <div className="grid gap-5">
      <PageHeader back="/viagens" title="Nova viagem" />
      <TripForm
        submitLabel="Criar viagem"
        onSubmit={async (values) => {
          if (!session) return;
          const id = await createTrip(values, session.user.id);
          toast.show({
            title: 'Viagem criada',
            description: 'Já está guardada neste celular.',
            kind: 'ok',
          });
          await navigate(`/viagens/${id}/detalhes`, { replace: true });
        }}
        alternate={{
          label: 'Criar e colar roteiro',
          onSubmit: async (values) => {
            if (!session) return;
            const id = await createTrip(values, session.user.id);
            // a visão geral fica atrás: o "Voltar" da importação leva à viagem, não ao formulário
            await navigate(`/viagens/${id}/detalhes`, { replace: true });
            await navigate(`/viagens/${id}/importar`);
          },
        }}
      />
    </div>
  );
}
