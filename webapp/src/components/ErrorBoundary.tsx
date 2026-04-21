import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-game-bg px-4 text-center">
          <p className="text-5xl">⚠️</p>
          <h1 className="text-2xl font-black text-white">Something went wrong</h1>
          <p className="max-w-sm text-sm text-game-muted">{this.state.error.message}</p>
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
