import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Brand, Radius, TouchTarget } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, { background: string; pressed: string; border: string; text: string }> = {
  primary: { background: Brand.blueInk, pressed: '#075985', border: Brand.blueInk, text: '#FFFFFF' },
  secondary: { background: Brand.surface, pressed: '#F1F5F9', border: Brand.borderStrong, text: Brand.navy },
  ghost: { background: 'transparent', pressed: Brand.blueTint, border: 'transparent', text: Brand.blueInk },
  danger: { background: Brand.danger, pressed: '#991B1B', border: Brand.danger, text: '#FFFFFF' },
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const palette = VARIANTS[variant];
  const isDisabled = Boolean(disabled) || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        { backgroundColor: pressed && !isDisabled ? palette.pressed : palette.background, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text numberOfLines={1} style={[styles.label, size === 'sm' && styles.labelSmall, { color: palette.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 18,
  },
  medium: {
    minHeight: 50,
  },
  small: {
    minHeight: TouchTarget,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  labelSmall: {
    fontSize: 14,
  },
});
