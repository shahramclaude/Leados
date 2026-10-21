"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
  correlationId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, correlationId: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, correlationId: crypto.randomUUID().slice(0, 8) };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // In production this would ship to an error-tracking endpoint along with
    // `correlationId` so support can find this exact occurrence.
    console.error(`[correlationId=${this.state.correlationId}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null, correlationId: "" });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">
            {this.props.fallbackTitle ?? "This panel could not load"}
          </p>
          <p className="mt-2 text-sm text-rose-800">
            Something on our side broke while rendering this. Reloading the panel usually fixes
            it; if it keeps happening, share the reference code below with support.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={this.reset}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            >
              Try again
            </button>
            <code className="text-xs text-rose-600">ref: {this.state.correlationId}</code>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
