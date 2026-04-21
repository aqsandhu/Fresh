import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '@utils/constants';

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
 * Fresh Bazar Customer App - Global Error Boundary
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
    console.error('[Fresh Bazar ErrorBoundary] Caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // In production, you could send to an error tracking service like Sentry
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
              We apologize for the inconvenience. An unexpected error has occurred in Fresh Bazar.
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
    padding: SPACING.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.error + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconText: {
    fontSize: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: COLORS.gray600,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  debugContainer: {
    width: '100%',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray700,
    marginBottom: SPACING.xs,
  },
  debugText: {
    fontSize: 12,
    color: COLORS.error,
    fontFamily: FONTS.regular,
  },
  debugStack: {
    fontSize: 10,
    color: COLORS.gray600,
    marginTop: SPACING.xs,
    fontFamily: FONTS.regular,
  },
  restartButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.lg,
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
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
