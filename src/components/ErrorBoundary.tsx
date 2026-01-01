import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { errorReportingService } from '../services/errorReporting';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number | boolean | undefined | null>;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report the error
    errorReportingService.reportError(error, {
      severity: 'critical',
      screen: 'ErrorBoundary',
      action: 'component_crash',
      tags: ['react_error_boundary'],
      customData: {
        errorId: this.state.errorId,
        componentStack: errorInfo.componentStack,
        errorBoundary: true
      }
    });

    // Call the custom error handler if provided
    this.props.onError?.(error, errorInfo);

    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetKeys) {
        const hasResetKeyChanged = resetKeys.some((key, index) =>
          prevProps.resetKeys?.[index] !== key
        );

        if (hasResetKeyChanged) {
          this.resetErrorBoundary();
        }
      }
    }

    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    this.resetTimeoutId = setTimeout(() => {
      this.setState({ hasError: false, error: undefined, errorId: undefined });
    }, 100) as any;
  };

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>
              We encountered an unexpected error. This has been reported to our team.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.debugText}>{this.state.error.name}</Text>
                <Text style={styles.debugText}>{this.state.error.message}</Text>
                <Text style={styles.errorId}>Error ID: {this.state.errorId}</Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={this.resetErrorBoundary}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export const withErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) => {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName =
    `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithErrorBoundaryComponent;
};

// Specialized error boundaries for different contexts
export const ImportErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    onError={(error) => {
      errorReportingService.reportError(error, {
        severity: 'high',
        screen: 'ImportRecipe',
        action: 'import_error_boundary',
        tags: ['import', 'error_boundary']
      });
    }}
    fallback={
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Import Error</Text>
          <Text style={styles.errorMessage}>
            Something went wrong while importing your recipe. Please try again or enter the recipe manually.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => {/* Navigate back or restart */}}>
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    }
  >
    {children}
  </ErrorBoundary>
);

export const AuthErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary
    onError={(error) => {
      errorReportingService.reportError(error, {
        severity: 'critical',
        screen: 'Auth',
        action: 'auth_error_boundary',
        tags: ['auth', 'error_boundary']
      });
    }}
    fallback={
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Authentication Error</Text>
          <Text style={styles.errorMessage}>
            We encountered an issue with authentication. Please restart the app.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => {/* Navigate back or restart */}}>
            <Text style={styles.retryButtonText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      </View>
    }
  >
    {children}
  </ErrorBoundary>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  errorContainer: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxWidth: 400,
    width: '100%',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  debugContainer: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6b7280',
    marginBottom: 4,
  },
  errorId: {
    fontSize: 10,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});