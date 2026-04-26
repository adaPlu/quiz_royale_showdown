import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-game-bg flex flex-col items-center justify-center gap-6 p-6 text-center text-white">
        <p className="text-5xl">💥</p>
        <h1 className="text-2xl font-black">Something went wrong</h1>
        <p className="max-w-md text-sm text-white/50">{this.state.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-brand px-6 py-3 font-bold shadow-royale hover:opacity-90"
        >
          Reload
        </button>
      </div>
    );
  }
}
