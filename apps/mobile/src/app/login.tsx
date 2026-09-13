import { loginSchema, type LoginInput } from '@topflow/shared';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { collectFieldErrors, type FieldErrors } from '@/lib/forms';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { signIn } from '@/lib/session';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<keyof LoginInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(collectFieldErrors<keyof LoginInput>(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await signIn(parsed.data);
      if (router.canGoBack()) router.back();
      else router.replace(routes.account);
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Welcome back
        </Text>
        <Text style={styles.subtitle}>Sign in to check out, track deliveries and see your order history.</Text>
      </View>

      {formError ? <InlineError message={formError} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        label="Password"
        inputRef={passwordRef}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void handleSubmit()}
      />

      <Button label="Sign in" onPress={() => void handleSubmit()} loading={submitting} fullWidth />

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>New to Top Flow?</Text>
        <Button label="Create an account" variant="ghost" size="sm" onPress={() => router.replace(routes.register)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.canvas,
  },
  content: {
    padding: 20,
    gap: 18,
  },
  intro: {
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Brand.navy,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  switchText: {
    fontSize: 15,
    color: Brand.textMuted,
  },
});
