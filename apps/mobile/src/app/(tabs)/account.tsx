import { ORG_ROLE_LABELS, ORG_STATUS_LABELS, type AuthUser, type OrgStatus } from '@topflow/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import type { Tone } from '@/lib/format';
import { routes } from '@/lib/routes';
import { signOut, useSession } from '@/lib/session';

const ORG_STATUS_TONES: Record<OrgStatus, Tone> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  SUSPENDED: 'danger',
};

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.title} accessibilityRole="header">
          Account
        </Text>
        {session.status === 'loading' ? (
          <LoadingState />
        ) : session.user ? (
          <SignedIn user={session.user} />
        ) : (
          <SignedOut />
        )}
      </ScrollView>
    </View>
  );
}

function SignedOut() {
  return (
    <>
      <Card>
        <Text style={styles.cardTitle}>Sign in to Top Flow</Text>
        <Text style={styles.body}>
          Check out with delivery across the UAE, pay on delivery and track every order in one place.
        </Text>
        <Button label="Sign in" onPress={() => router.push(routes.login)} fullWidth />
        <Button label="Create an account" variant="secondary" onPress={() => router.push(routes.register)} fullWidth />
      </Card>
      <TradePortalNote />
    </>
  );
}

function SignedIn({ user }: { user: AuthUser }) {
  const [signingOut, setSigningOut] = useState(false);

  const performSignOut = () => {
    setSigningOut(true);
    signOut().finally(() => setSigningOut(false));
  };

  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      performSignOut();
      return;
    }
    Alert.alert('Sign out?', 'Your cart stays on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: performSignOut },
    ]);
  };

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <>
      <Card>
        <View style={styles.profileRow}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.name}>{user.fullName}</Text>
            <Text style={styles.body}>{user.email}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Badge
            label={user.emailVerified ? 'Verified' : 'Not verified'}
            tone={user.emailVerified ? 'success' : 'warning'}
          />
        </View>
        {!user.emailVerified ? (
          <Text style={styles.hint}>Check your inbox for the verification link we sent you.</Text>
        ) : null}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Phone</Text>
          <Text style={styles.infoValue}>{user.phoneNumber ?? 'Not provided'}</Text>
        </View>
      </Card>

      <View style={styles.section}>
        <SectionTitle>Trade accounts</SectionTitle>
        <Card>
          {user.memberships.length === 0 ? (
            <Text style={styles.body}>You are not a member of any trade (company) account.</Text>
          ) : (
            user.memberships.map((membership) => (
              <View key={membership.organizationId} style={styles.membership}>
                <View style={styles.membershipText}>
                  <Text style={styles.membershipName}>{membership.organizationName}</Text>
                  <Text style={styles.body}>{ORG_ROLE_LABELS[membership.role]}</Text>
                </View>
                <Badge
                  label={ORG_STATUS_LABELS[membership.organizationStatus]}
                  tone={ORG_STATUS_TONES[membership.organizationStatus]}
                />
              </View>
            ))
          )}
        </Card>
        <TradePortalNote />
      </View>

      <Button label="Sign out" variant="secondary" onPress={confirmSignOut} loading={signingOut} fullWidth />
    </>
  );
}

function TradePortalNote() {
  return (
    <Text style={styles.note}>
      Company ordering, quotations and approvals are available in the Top Flow trade portal on the web. This app
      is for personal (retail) purchases.
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.canvas,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Brand.navy,
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.navy,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.warning,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    color: Brand.navy,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: Brand.textMuted,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.text,
  },
  section: {
    gap: 8,
  },
  membership: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  membershipText: {
    flex: 1,
    gap: 2,
  },
  membershipName: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.text,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: Brand.textMuted,
  },
});
