import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Brand, Radius } from '@/constants/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[styles.sectionTitle, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** A label / value row, e.g. in totals and order summaries. */
export function DetailRow({
  label,
  value,
  emphasis = false,
  valueTone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  valueTone?: 'success';
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, emphasis && styles.rowLabelEmphasis]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          emphasis && styles.rowValueEmphasis,
          valueTone === 'success' && styles.rowValueSuccess,
        ]}>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Brand.textMuted,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 15,
    color: Brand.textMuted,
  },
  rowLabelEmphasis: {
    fontSize: 17,
    fontWeight: '700',
    color: Brand.navy,
  },
  rowValue: {
    fontSize: 15,
    color: Brand.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  rowValueEmphasis: {
    fontSize: 19,
    fontWeight: '700',
    color: Brand.navy,
  },
  rowValueSuccess: {
    color: Brand.success,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Brand.borderStrong,
  },
});
