import { Component, type ReactNode } from 'react';

/**
 * Limite de erro das cenas 3D: se o chunk 3D não carregar, o renderer não nascer ou a cena quebrar,
 * quem está em volta mostra a versão sem 3D (a lista do dia, a vista lateral da garagem). Nunca uma
 * tela em branco, nunca uma mensagem de erro técnica.
 */
type Props = { onError?: (error: unknown) => void; fallback: ReactNode; children: ReactNode };
type State = { failed: boolean };

export class ThreeBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.warn('viajei: a cena 3D não pôde ser desenhada', error);
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
