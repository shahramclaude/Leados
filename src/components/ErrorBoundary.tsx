import { Component, type ReactNode } from "react";

// Red-team fix (R-022): previously there was no error boundary, so any
// unhandled render error in a single module (e.g. a bad mock-data edit)
// would blank the entire app with no recovery path and no explanation.
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // In a production build this would report to telemetry. Logged here
    // honestly instead of silently swallowed.
    console.error("LEADOS UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
            <p className="text-2xl">⚠️</p>
            <h1 className="mt-2 text-lg font-semibold text-slate-900">Something broke in this view</h1>
            <p className="mt-2 text-sm text-slate-500">
              This module hit an unexpected error. Your other data is safe — nothing in LEADOS
              auto-retries or auto-sends, so no action fired silently in the background.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
