import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  errorMessage: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { errorMessage: message };
  }

  componentDidCatch(error: unknown) {
    console.error('CR8 runtime error:', error);
  }

  render() {
    if (!this.state.errorMessage) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))] px-4">
        <div className="w-full max-w-xl cr8-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] flex items-center justify-center overflow-hidden">
              <img src="/cr8-logo.svg" alt="CR8" className="h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-extrabold cr8-text-gradient">CR8</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Erro ao carregar o app</div>
            </div>
          </div>

          <div className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
            O app encontrou um erro de runtime e parou de renderizar.
          </div>

          <pre className="mt-4 text-xs whitespace-pre-wrap break-words bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-lg p-3 text-[hsl(var(--foreground))]">
            {this.state.errorMessage}
          </pre>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Recarregar
            </button>
            <button
              onClick={() => {
                try {
                  window.localStorage.clear();
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
            >
              Limpar cache local
            </button>
          </div>
        </div>
      </div>
    );
  }
}

