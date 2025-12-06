import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#333', fontFamily: 'monospace', background: '#fff', height: '100vh', overflow: 'auto' }}>
          <h1 style={{ color: '#e74c3c' }}>Something went wrong</h1>
          <div style={{ marginBottom: '20px', padding: '10px', background: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '4px' }}>
            <strong>Error:</strong> {this.state.error?.toString()}
          </div>
          {this.state.errorInfo && (
            <details style={{ whiteSpace: 'pre-wrap' }}>
              <summary>Component Stack</summary>
              {this.state.errorInfo.componentStack}
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
