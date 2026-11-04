import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '@/components/ui/toast-context.ts';
import { isStandalone, persistStorage } from '@/lib/pwa/install.ts';

/**
 * Ciclo de vida do service worker: avisa "nova versão disponível" com Recarregar, confirma uma
 * vez que o app está pronto para funcionar sem sinal e, instalado, pede armazenamento persistente.
 */
export function UpdatePrompt() {
  const toast = useToast(); // valor estável (memoizado no ToastProvider)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // confere uma versão nova a cada hora com o app aberto (viagens duram dias)
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast.show({
      title: 'Nova versão disponível',
      description: 'Recarregue para usar a versão mais recente.',
      kind: 'info',
      duration: 60_000,
      action: { label: 'Recarregar', onClick: () => void updateServiceWorker(true) },
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker, toast]);

  useEffect(() => {
    if (!offlineReady) return;
    toast.show({ title: 'Pronto para usar sem sinal', kind: 'ok' });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (isStandalone()) void persistStorage();
  }, []);

  return null;
}
