import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Fresh Bazar Admin Panel - Global Error Boundary
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Fresh Bazar Admin ErrorBoundary] Caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // In production, send to error tracking service like Sentry
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, { extra: errorInfo });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/dashboard';
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Something Went Wrong
            </h1>

            <p className="text-gray-600 mb-6">
              We apologize for the inconvenience. An unexpected error has occurred in Fresh Bazar Admin.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left overflow-auto max-h-48">
                <p className="text-red-600 font-mono text-sm mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <pre className="text-gray-600 font-mono text-xs">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </Button>

              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>
            </div>

            <p className="text-gray-500 text-sm mt-6">
              If the problem persists, please contact Fresh Bazar support at{' '}
              <a href="mailto:support@freshbazar.pk" className="text-primary-600 hover:underline">
                support@freshbazar.pk
              </a>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
