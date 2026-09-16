import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { retryLoadUser } from '@/lib/session';

const TITLE = 'Could not load your account';
const FALLBACK_MESSAGE = 'Check your connection and try again.';

/**
 * Shown while the customer is signed in but their Top Flow account could not be loaded
 * (`status === 'unavailable'`), for example offline. `screen` fills the screen; `card` sits inside a
 * scrolling screen.
 */
export function AccountUnavailable({
  message,
  variant = 'screen',
}: {
  message: string | null;
  variant?: 'screen' | 'card';
}) {
  const [retrying, setRetrying] = useState(false);

  const retry = () => {
    setRetrying(true);
    retryLoadUser().finally(() => setRetrying(false));
  };

  if (variant === 'screen') {
    return <ErrorState title={TITLE} message={message ?? FALLBACK_MESSAGE} onRetry={retry} retrying={retrying} />;
  }

  return (
    <Card>
      <Text style={styles.title} accessibilityRole="header">
        {TITLE}
      </Text>
      <Text style={styles.body}>{message ?? FALLBACK_MESSAGE}</Text>
      <Button label="Try again" variant="secondary" onPress={retry} loading={retrying} fullWidth />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.navy,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
  },
});
