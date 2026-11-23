import { AlertCircle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * React ErrorBoundary isolating unexpected UI exceptions so users always see
 * a branded recovery path rather than an empty screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error details intentionally omitted from UI telemetry; handled by recovery view.
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.compact) {
      return (
        <div role="alert" className="rounded-lg border border-[#DC2626] bg-white p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-[#18181B]">
                This screen ran into an unexpected display error
              </h2>
              <p className="mt-1 text-sm text-[#52525B]">
                Your saved business data is unaffected. Reload this view to continue working.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={this.handleReset}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reload view</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] p-6 text-[#18181B]">
        <div
          role="alert"
          className="w-full max-w-md rounded-lg border border-[#E4E4E7] bg-white p-6 sm:p-8"
        >
          <p className="text-sm font-bold text-[#991B1B]">Festola Business Hub</p>
          <h1 className="mt-2 text-xl font-bold text-[#18181B]">
            Something went wrong displaying this page
          </h1>
          <p className="mt-2 text-sm text-[#52525B]">
            Your business records remain safely stored. Try reloading the screen or returning to the
            home page.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={this.handleReset}>
              Try again
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                window.location.assign('/');
              }}
            >
              Return home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
