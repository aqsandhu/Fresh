import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// Colors for Rider App error boundary
const COLORS = {
  primary: '#10B981',
  error: '#EF4444',
  white: '#FFFFFF',
  gray100: '#F3F4F6',
  gray600: '#4B5563',
  gray700: '#374151',
  gray900: '#111827',
  gray500: '#6B7280',
};

/**
 * Fresh Bazar Rider App - Global Error Boundary
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
    console.error('[Fresh Bazar Rider ErrorBoundary] Caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // In production, send to error tracking service
    // if ((window as any).Sentry) { (window as any).Sentry.captureException(error); }
  }

  private handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.iconContainer}>
              <Text style={styles.iconText}>⚠️</Text>
            </View>

            <Text style={styles.title}>Something Went Wrong</Text>
            <Text style={styles.message}>
              We apologize for the inconvenience. An unexpected error has occurred in Fresh Bazar Rider.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Error Details (Dev Only):</Text>
                <Text style={styles.debugText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.debugStack}>{this.state.errorInfo.componentStack}</Text>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.restartButton} onPress={this.handleRestart}>
              <Text style={styles.restartButtonText}>Try Again</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              If the problem persists, please contact Fresh Bazar support.
            </Text>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.gray600,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  debugContainer: {
    width: '100%',
    backgroundColor: COLORS.gray100,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: COLORS.error,
  },
  debugStack: {
    fontSize: 10,
    color: COLORS.gray600,
    marginTop: 8,
  },
  restartButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  restartButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 24,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
