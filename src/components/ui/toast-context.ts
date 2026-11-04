import { createContext, useContext } from 'react';

export type ToastKind = 'ok' | 'info' | 'warn' | 'late';
export type ToastInput = {
  title: string;
  description?: string;
  kind?: ToastKind;
  /** ms; padrão 4000. */
  duration?: number;
  action?: { label: string; onClick: () => void };
};
export type ToastContextValue = { show: (toast: ToastInput) => void };

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa do ToastProvider.');
  return ctx;
}
