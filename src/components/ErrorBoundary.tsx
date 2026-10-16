import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearUserStations } from '../lib/stationDraft';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error shows a recovery screen instead of a blank page.
 * Clearing local stations backs them up first (see clearUserStations).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('VoltSSA render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-testid="error-boundary" className="flex h-dvh items-center justify-center bg-base p-6 text-fg">
        <div className="max-w-md space-y-4">
          <h1 className="text-lg font-semibold">Algo deu errado ao mostrar o mapa</h1>
          <p className="text-sm text-muted">
            Recarregue a página. Se o problema continuar, pode ser um posto salvo neste navegador com dados inválidos —
            limpe os postos locais (uma cópia fica guardada).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="btn-error-reload"
              onClick={() => window.location.reload()}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
            >
              Recarregar
            </button>
            <button
              type="button"
              data-testid="btn-error-clear-stations"
              onClick={() => {
                clearUserStations();
                window.location.reload();
              }}
              className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg-2"
            >
              Limpar postos locais e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
