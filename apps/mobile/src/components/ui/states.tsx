import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Brand, Radius } from '@/constants/theme';

export function LoadingState({ label, style }: { label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.centered, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator size="large" color={Brand.blue} />
      {label ? <Text style={styles.message}>{label}</Text> : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying = false,
  style,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.centered, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} loading={retrying} style={styles.action} /> : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
  style,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.centered, style]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

/** Non-blocking error banner shown above content. */
export function InlineError({ message, style }: { message: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.banner, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.navy,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
    textAlign: 'center',
  },
  action: {
    marginTop: 12,
    minWidth: 180,
  },
  banner: {
    backgroundColor: Brand.dangerTint,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: {
    color: Brand.danger,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
