import { Component, type ErrorInfo, type ReactNode } from "react";

interface IProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface IState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<IProps, IState> {
  state: IState = { error: null };

  static getDerivedStateFromError(error: Error): IState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div
          role="alert"
          className="flex h-screen items-center justify-center bg-bg p-6 text-text"
        >
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
            <p className="text-sm text-text-muted mb-4">
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition"
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
