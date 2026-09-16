import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius, TouchTarget } from '@/constants/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  error?: string;
  hint?: string;
  /** For optional fields: tapping the selected option again clears the choice. */
  clearable?: boolean;
}

/** A single choice shown as joined segments, announced as a radio group. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
  clearable = false,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[styles.track, error ? styles.trackInvalid : null]}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}>
        {options.map((option, index) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected }}
              accessibilityHint={selected && clearable ? 'Clears the selection' : undefined}
              onPress={() => onChange(selected && clearable ? null : option.value)}
              style={({ pressed }) => [
                styles.segment,
                index > 0 && styles.segmentDivider,
                selected && styles.segmentSelected,
                pressed && !selected && styles.segmentPressed,
              ]}>
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.text,
  },
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    overflow: 'hidden',
  },
  trackInvalid: {
    borderColor: Brand.danger,
  },
  segment: {
    flex: 1,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Brand.border,
  },
  segmentSelected: {
    backgroundColor: Brand.navy,
  },
  segmentPressed: {
    backgroundColor: Brand.blueTint,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.navy,
  },
  segmentTextSelected: {
    color: '#FFFFFF',
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.danger,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
  },
});
