"use client";
// src/components/PanelErrorBoundary.tsx
//
// Per-panel error boundary. The brief's requirement: "a broken chart must
// never take down a dashboard". Every chart/heavy panel on the cockpit
// dashboard, metrics view and network view is wrapped individually so one
// panel throwing (bad data, a worker failure, a chart edge case) degrades
// to an inline retry affordance instead of a blank white screen for the
// whole page.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label: string;
}

interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[panel:${this.props.label}] crashed`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-700">{this.props.label} failed to render</p>
          <p className="text-xs text-rose-500">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="mt-1 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Retry panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
