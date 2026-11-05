import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { clearBadge } from './badge.ts';

/**
 * O service worker fala com a tela aberta: ao tocar numa notificação com o app já aberto, ele
 * foca a janela e manda `{ type: 'NAVIGATE', url }`, e a SPA navega sem recarregar. E, ao abrir ou
 * voltar a ficar visível, o selo do ícone é limpo.
 */
function isNavigate(data: unknown): data is { type: 'NAVIGATE'; url: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'NAVIGATE' &&
    typeof (data as { url?: unknown }).url === 'string'
  );
}

export function useServiceWorkerMessages(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (isNavigate(data)) void navigate(data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}

export function useClearBadgeWhenVisible(): void {
  useEffect(() => {
    void clearBadge();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void clearBadge();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
