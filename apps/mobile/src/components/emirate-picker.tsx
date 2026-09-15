import { Emirate, EMIRATE_LABELS } from '@topflow/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius, TouchTarget } from '@/constants/theme';

const EMIRATES = Object.values(Emirate);

export interface EmiratePickerProps {
  label: string;
  value: Emirate | null;
  onChange: (emirate: Emirate | null) => void;
  error?: string;
  hint?: string;
  /** For optional fields: tapping the selected emirate again clears the choice. */
  clearable?: boolean;
}

/** The seven emirates as a group of radio chips. */
export function EmiratePicker({ label, value, onChange, error, hint, clearable = false }: EmiratePickerProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {EMIRATES.map((emirate) => {
          const selected = emirate === value;
          return (
            <Pressable
              key={emirate}
              accessibilityRole="radio"
              accessibilityLabel={EMIRATE_LABELS[emirate]}
              accessibilityState={{ checked: selected }}
              accessibilityHint={selected && clearable ? 'Clears the selection' : undefined}
              onPress={() => onChange(selected && clearable ? null : emirate)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && !selected && styles.optionPressed,
              ]}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {EMIRATE_LABELS[emirate]}
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
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    backgroundColor: Brand.surface,
  },
  optionSelected: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  optionPressed: {
    backgroundColor: Brand.blueTint,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.navy,
  },
  optionTextSelected: {
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
