import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = 'An unexpected error occurred.';
      
      try {
        // Check if it's a Firestore error JSON
        const firestoreError = JSON.parse(this.state.error?.message || '');
        if (firestoreError.error) {
          errorMessage = `Firestore Error: ${firestoreError.error} during ${firestoreError.operationType} on ${firestoreError.path}`;
        }
      } catch (e) {
        // Not a Firestore error JSON
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-6 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-bold text-red-500">Something went wrong</h2>
            <p className="text-zinc-400">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-zinc-100 text-zinc-950 rounded-xl font-semibold hover:bg-zinc-200 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
