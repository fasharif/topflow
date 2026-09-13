import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Brand, Radius, TouchTarget } from '@/constants/theme';

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Unit shown after the number, e.g. "m". */
  unit?: string;
  /** Included in accessibility labels, e.g. the product name. */
  itemName?: string;
  disabled?: boolean;
}

export function QuantityStepper({
  value,
  min = 1,
  max = 100_000,
  onChange,
  unit,
  itemName,
  disabled = false,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const suffix = itemName ? ` of ${itemName}` : '';

  const clamp = (next: number) => Math.min(max, Math.max(min, Math.floor(next)));

  const step = (delta: number) => {
    setDraft(null);
    const next = clamp(value + delta);
    if (next !== value) onChange(next);
  };

  const commitDraft = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) return;
    const next = clamp(parsed);
    if (next !== value) onChange(next);
  };

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <StepButton
        symbol="−"
        label={`Decrease quantity${suffix}`}
        disabled={disabled || value <= min}
        onPress={() => step(-1)}
      />
      <View style={styles.valueBox}>
        <TextInput
          value={draft ?? String(value)}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, ''))}
          onEndEditing={commitDraft}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          editable={!disabled}
          maxLength={6}
          accessibilityLabel={`Quantity${suffix}`}
          style={styles.input}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <StepButton
        symbol="+"
        label={`Increase quantity${suffix}`}
        disabled={disabled || value >= max}
        onPress={() => step(1)}
      />
    </View>
  );
}

function StepButton({
  symbol,
  label,
  disabled,
  onPress,
}: {
  symbol: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}>
      <Text style={[styles.symbol, disabled && styles.symbolDisabled]}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
  step: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: {
    backgroundColor: Brand.blueTint,
  },
  symbol: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '500',
    color: Brand.blueInk,
  },
  symbolDisabled: {
    color: Brand.placeholder,
  },
  valueBox: {
    minWidth: 56,
    height: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Brand.border,
  },
  input: {
    minWidth: 32,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 13,
    color: Brand.textMuted,
    marginLeft: 2,
  },
});
