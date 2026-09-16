import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Brand } from '@/constants/theme';

/** A centred success message with a check mark, for example after an email or a request was sent. */
export function ConfirmationCard({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  /** Extra content under the message, such as a reference number. */
  children?: ReactNode;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.check}>✓</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.success,
  },
  title: {
    fontSize: 22,
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
});
