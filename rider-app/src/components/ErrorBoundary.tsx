import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/** Global error boundary — keeps a crash from blanking the rider's screen mid-delivery. */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null, errorInfo: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Rider ErrorBoundary]', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app hit an unexpected error. Tap below to continue — your duty status and tasks are safe on the server.
          </Text>
          {__DEV__ && this.state.error ? (
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>Error details (dev only)</Text>
              <Text style={styles.debugText}>{this.state.error.toString()}</Text>
              {this.state.errorInfo ? <Text style={styles.debugStack}>{this.state.errorInfo.componentStack}</Text> : null}
            </View>
          ) : null}
          <TouchableOpacity style={styles.restartButton} onPress={this.handleRestart} accessibilityRole="button">
            <Text style={styles.restartButtonText}>Try again</Text>
          </TouchableOpacity>
          <Text style={styles.footerText}>If this keeps happening, contact your Fresh Bazar admin.</Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dangerSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconText: { fontSize: 40 },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  debugContainer: {
    width: '100%',
    backgroundColor: colors.gray100,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  debugTitle: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.gray700, marginBottom: spacing.sm },
  debugText: { fontSize: typography.size.xs, color: colors.danger },
  debugStack: { fontSize: 10, color: colors.gray600, marginTop: spacing.sm },
  restartButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.md,
    minWidth: 200,
    alignItems: 'center',
  },
  restartButtonText: { color: colors.white, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  footerText: { fontSize: typography.size.xs, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
});

export default ErrorBoundary;
