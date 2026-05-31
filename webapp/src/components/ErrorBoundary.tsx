import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback != null) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-game-bg px-4 text-center">
          <h1 className="text-2xl font-black text-white">Something went wrong</h1>
          <p className="max-w-sm text-sm text-game-muted">Please refresh the page or return to the home screen.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-xl bg-brand px-6 py-3 font-bold text-white shadow-royale"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.replace('/home')}
            className="rounded-xl bg-brand px-6 py-3 font-bold text-white shadow-royale"
          >
            Go Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
