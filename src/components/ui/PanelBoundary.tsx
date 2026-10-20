"use client";

// Panel-level error boundary (requirement D: "one broken chart never kills
// a dashboard"). Class component because React error boundaries still
// require `componentDidCatch`/`getDerivedStateFromError` — there is no hook
// equivalent. Each dashboard panel gets its own instance.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorId: string | null;
}

export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: crypto.randomUUID() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[panel:${this.props.title}] [${this.state.errorId}]`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null, errorId: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <p className="font-semibold">{this.props.title} is unavailable right now.</p>
          <p className="text-rose-700/80 dark:text-rose-300/80">
            The rest of the dashboard keeps working. Error ref: <code>{this.state.errorId}</code>
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="w-fit rounded-md border border-rose-300 bg-white px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:bg-transparent dark:text-rose-200"
          >
            Retry panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
