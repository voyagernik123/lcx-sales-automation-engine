import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * Change this and the boundary clears itself.
   *
   * WHY IT EXISTS — a defect found by an operator clicking around the shipped Mac
   * app, not by a test. One lead had `https://reppo foundation` in its website
   * field; `LeadDetail` called `new URL()` on it, WebKit threw
   * `"https://reppo foundation" cannot be parsed as a URL.`, and this boundary
   * caught it. Correct so far. But the boundary wraps the ROUTED OUTLET and had no
   * way to reset, so every page the operator opened afterwards — Deal Board,
   * Exchange Gaps, Market Map, even Settings — rendered this same error. The app
   * looked totally broken, and only a full reload cleared it.
   *
   * That also made the fallback's own copy false: "The rest of the application
   * remains operational" was a sentence about a boundary that had latched over the
   * entire application. Passing the current pathname here is what makes it true.
   */
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_KEY = 'lcx-os:chunk-reload';

/**
 * A failed dynamic import — the app was redeployed (chunk hashes changed)
 * while this tab held a stale index. Recoverable by reloading.
 */
function isChunkLoadError(error: Error): boolean {
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(
    `${error.name} ${error.message}`,
  );
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
    // Stale chunk after a redeploy: reload once to fetch fresh assets. The
    // session flag prevents a reload loop if the chunk is genuinely broken.
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
      } catch {
        /* sessionStorage blocked — fall through to the error UI */
      }
    }
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  /**
   * Clear on navigation. `componentDidUpdate` rather than
   * `getDerivedStateFromProps` because the reset is a reaction to a prop CHANGING,
   * which needs the previous value; deriving from props alone cannot tell the
   * difference between "new route" and "same route, re-render".
   */
  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
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
            <h2 className="text-lg font-bold text-navy">Module Error</h2>
            <p className="text-sm text-grey-dark leading-relaxed">
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
