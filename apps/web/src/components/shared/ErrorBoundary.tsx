import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full bg-card border border-red-500/20 rounded-lg shadow-lg p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-navy dark:text-ice">Module Error</h2>
            <p className="text-sm text-grey-dark dark:text-grey-light leading-relaxed">
              An unexpected error occurred in this section. The rest of the application remains operational.
            </p>
            {this.state.error && (
              <pre className="text-left text-[10px] font-mono bg-ice-soft dark:bg-navy-deep border border-line rounded p-3 overflow-auto max-h-32 text-red-600 dark:text-red-400">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-navy dark:bg-ice text-white dark:text-navy text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={14} />
              Retry Module
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
