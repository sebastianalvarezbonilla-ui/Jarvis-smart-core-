import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Se produjo un error inesperado en la interfaz.',
    };
  }

  override render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `Error de sincronización (${parsed.operationType || 'operación'}): ${parsed.error}`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="panel w-full max-w-md p-6 text-center">
            <div className="mono-label">jarvis smart core</div>
            <h1 className="mt-2 font-heading text-lg font-semibold">
              Se interrumpió la sesión
            </h1>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Recargar consola</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
