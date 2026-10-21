import { Component, lazy, Suspense } from 'react';
import ErrorCard from './ui/ErrorCard';
import LoadingScreen from './LoadingScreen';

/**
 * ErrorBoundary - Class component that catches errors in its children
 * and displays a fallback UI with context-aware messages
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error for debugging (in production, send to monitoring service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Store error info for dev mode display
    this.setState({
      errorInfo,
      error: {
        ...error,
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { hasError } = this.state;
    const {
      context,           // Feature context for custom messages
      errorType,         // Specific error type (network, unauthorized, etc.)
      loadingFallback,   // Custom loading fallback
      retryHandler,      // Custom retry handler
      dismissible = false,
      children,
    } = this.props;

    if (hasError) {
      const { error, errorInfo } = this.state;
      
      return (
        <ErrorCard
          context={context}
          errorType={errorType}
          onRetry={retryHandler || this.handleRetry}
          dismissible={dismissible}
          onDismiss={this.handleDismiss}
        >
          {/* Technical details shown in dev mode */}
          <div className="font-mono">
            <p className="mb-2 font-semibold">Error: {(error && error.message) || 'Unknown error'}</p>
            {error && errorInfo && (
              <>
                <p className="mb-1 font-semibold">Component Stack:</p>
                <pre className="text-xs">{error.componentStack}</pre>
              </>
            )}
          </div>
        </ErrorCard>
      );
    }

    // Normal rendering with Suspense fallback
    return (
      <Suspense fallback={loadingFallback || <LoadingScreen />}>
        {children}
      </Suspense>
    );
  }
}

/**
 * withErrorBoundary - HOC wrapper for adding error handling to any component
 * 
 * Usage:
 * const DictationWithError = withErrorBoundary(Dictation, {
 *   context: 'dictation',
 *   errorType: 'audioError',
 * });
 */
export function withErrorBoundary(WrappedComponent, options = {}) {
  return function ErrorBoundWrapper(props) {
    const { context, errorType, loadingFallback, onRetry, ...rest } = options;
    
    return (
      <ErrorBoundary
        context={context}
        errorType={errorType}
        loadingFallback={loadingFallback}
        retryHandler={onRetry}
      >
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

/**
 * Create a lazy-loaded component with error boundary
 * 
 * Example usage:
 * const Dictation = createLazyWithBoundary(() => import('./components/Dictation'));
 * const Grammar = createLazyWithBoundary(() => import('./components/Grammar'), {
 *   context: 'grammar',
 *   errorType: 'network',
 * });
 */
export function createLazyWithBoundary(importFn, options = {}) {
  // `lazy` has to come from React. It was read off `window` here, and React
  // does not put `lazy` on the global object — so this threw "window.lazy is
  // not a function" while App.jsx was still being evaluated. The app never
  // booted: what the end-to-end suite saw was the static marketing shell in
  // index.html, not the app.
  const LazyComponent = lazy(() => importFn().then(mod => ({
    default: props => (
      <ErrorBoundary
        context={options.context}
        errorType={options.errorType}
        retryHandler={options.onRetry}
      >
        <mod.default {...props} />
      </ErrorBoundary>
    ),
  })));

  return LazyComponent;
}
