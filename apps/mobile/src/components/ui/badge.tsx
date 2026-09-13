import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import type { Tone } from '@/lib/format';

const TONES: Record<Tone, { background: string; text: string }> = {
  neutral: { background: '#F1F5F9', text: Brand.textMuted },
  info: { background: Brand.blueTint, text: Brand.blueInk },
  success: { background: Brand.successTint, text: Brand.success },
  warning: { background: Brand.warningTint, text: Brand.warning },
  danger: { background: Brand.dangerTint, text: Brand.danger },
};

export function Badge({ label, tone = 'neutral', style }: { label: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const palette = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }, style]}>
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
