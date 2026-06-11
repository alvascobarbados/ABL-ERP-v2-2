import { Component, ErrorInfo, ReactNode } from "react";
import { Wordmark } from "@/components/leads/Wordmark";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Top-level React error boundary. Catches render-time exceptions anywhere
 * in the tree and renders a styled fallback instead of a white screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Legitimate unexpected-error path. Avoid logging any user/row payloads.
    console.error("[AppErrorBoundary]", error?.name, error?.message, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="min-h-screen w-full flex items-center justify-center p-6"
        style={{ backgroundColor: "hsl(var(--brand-paper, 39 30% 95%))" }}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-card border shadow-[var(--shadow-section)] p-8 text-center"
          style={{ borderColor: "hsl(var(--brand-navy) / 0.2)" }}
        >
          <div className="flex justify-center mb-5">
            <Wordmark />
          </div>
          <h1
            className="text-xl font-light mb-2"
            style={{ color: "hsl(var(--brand-navy))" }}
          >
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-6 break-words">
            {this.state.message}
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "hsl(var(--brand-orange))", minHeight: 44 }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
