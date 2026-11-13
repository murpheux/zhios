import { Component, type ErrorInfo, type ReactNode } from "react";
import { noticeError } from "./newrelic";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors below it, reports them to New Relic and shows a fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
    noticeError(error, {
      source: "react-error-boundary",
      path: window.location.pathname,
      componentStack: info.componentStack?.slice(0, 1000) ?? undefined,
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <main role="alert">
            <h1>Something went wrong</h1>
            <p>The error was reported. Reload the page to try again.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </main>
        )
      );
    }
    return this.props.children;
  }
}
