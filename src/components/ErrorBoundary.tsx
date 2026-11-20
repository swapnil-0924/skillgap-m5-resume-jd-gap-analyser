import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  scope?: 'app' | 'view';
  resetKey?: string | number;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('React ErrorBoundary caught an error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isFullApp = this.props.scope === 'app';

    return (
      <div
        role="alert"
        className={
          isFullApp
            ? 'min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6'
            : 'flex min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8'
        }
      >
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-semibold text-slate-900">
              {isFullApp ? 'Something went wrong' : 'This view encountered an unexpected error'}
            </h1>
            <p className="text-sm text-slate-600">
              {isFullApp
                ? 'SkillGap M5 hit an unexpected interface error. Your saved analyses remain safe—try recovering below.'
                : 'A rendering error interrupted this section. You can retry loading it or switch to another workspace view.'}
            </p>
            {this.state.errorMessage && (
              <p className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
