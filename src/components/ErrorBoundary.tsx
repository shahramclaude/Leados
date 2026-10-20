"use client";

"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle: string;
  minHeight?: number;
};

type State = { hasError: boolean; message: string | null };

/**
 * Per-panel error boundary. A broken chart/network graph/heatmap must never
 * take the rest of the cockpit down — each heavy panel on the dashboard is
 * wrapped individually so one failure degrades gracefully in place.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : "Unknown error" };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[panel:${this.props.fallbackTitle}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{ minHeight: this.props.minHeight }}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center"
        >
          <p className="text-sm font-semibold text-rose-700">{this.props.fallbackTitle} is unavailable</p>
          <p className="text-xs text-rose-500">
            This panel failed to render, but the rest of the cockpit is unaffected.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
