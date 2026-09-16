import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, SectionTitle } from '@/components/ui/card';
import { COMPANY } from '@/constants/company';
import { Brand, TouchTarget } from '@/constants/theme';

const CHANNELS = [
  { label: 'Call', value: COMPANY.phone, url: COMPANY.phoneHref, hint: 'Opens your phone app' },
  { label: 'WhatsApp', value: COMPANY.phone, url: COMPANY.whatsappHref, hint: 'Opens a WhatsApp chat with Top Flow' },
  { label: 'Email', value: COMPANY.email, url: COMPANY.emailHref, hint: 'Opens your email app' },
] as const;

function openChannel(url: string, value: string): void {
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open this link', `You can reach Top Flow at ${value}.`);
  });
}

/** Top Flow's phone, WhatsApp and email as tappable rows, with the area it serves. */
export function CompanyContact({ title = 'Talk to Top Flow', intro }: { title?: string; intro?: string }) {
  return (
    <View style={styles.section}>
      <SectionTitle>{title}</SectionTitle>
      <Card style={styles.card}>
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}
        {CHANNELS.map((channel, index) => (
          <Pressable
            key={channel.label}
            accessibilityRole="link"
            accessibilityLabel={`${channel.label} ${channel.value}`}
            accessibilityHint={channel.hint}
            onPress={() => openChannel(channel.url, channel.value)}
            style={({ pressed }) => [
              styles.row,
              (index > 0 || Boolean(intro)) && styles.rowDivider,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.rowLabel}>{channel.label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {channel.value}
            </Text>
          </Pressable>
        ))}
        <Text style={styles.area}>{COMPANY.serviceArea}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  card: {
    gap: 0,
    paddingVertical: 4,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textMuted,
    paddingVertical: 10,
  },
  row: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderStrong,
  },
  pressed: {
    opacity: 0.6,
  },
  rowLabel: {
    fontSize: 15,
    color: Brand.textMuted,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Brand.blueInk,
  },
  area: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textSubtle,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderStrong,
  },
});
