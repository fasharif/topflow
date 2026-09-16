import { forgotPasswordSchema, loginSchema, type LoginInput } from '@topflow/shared';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ConfirmationCard } from '@/components/ui/confirmation-card';
import { InlineError } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { collectFieldErrors, type FieldErrors } from '@/lib/forms';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { isEmailNotConfirmed, requestPasswordReset, resendConfirmationEmail, signIn } from '@/lib/session';

/** `reset` asks for the email that should receive a recovery link; `reset-sent` confirms it went out. */
type Mode = 'sign-in' | 'reset' | 'reset-sent';

/** Shared by the sign-in and reset forms: the keyboard's submit key either moves on or submits. */
function EmailField({
  value,
  onChangeText,
  error,
  returnKeyType,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  returnKeyType: 'next' | 'go';
  onSubmit: () => void;
}) {
  return (
    <TextField
      label="Email"
      value={value}
      onChangeText={onChangeText}
      error={error}
      placeholder="you@example.com"
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect={false}
      keyboardType="email-address"
      textContentType="emailAddress"
      returnKeyType={returnKeyType}
      submitBehavior={returnKeyType === 'next' ? 'submit' : undefined}
      onSubmitEditing={onSubmit}
    />
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<keyof LoginInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Set when sign-in was refused because this address is not confirmed yet. */
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setUnconfirmedEmail(null);
  };

  const handleSignIn = async () => {
    if (submitting) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(collectFieldErrors<keyof LoginInput>(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setNotice(null);
    setUnconfirmedEmail(null);
    setSubmitting(true);
    try {
      await signIn(parsed.data);
      if (router.canGoBack()) router.back();
      else router.replace(routes.account);
    } catch (error) {
      setFormError(errorMessage(error));
      if (isEmailNotConfirmed(error)) setUnconfirmedEmail(parsed.data.email);
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!unconfirmedEmail || resending) return;
    setResending(true);
    try {
      await resendConfirmationEmail(unconfirmedEmail);
      setFormError(null);
      setNotice(`We've sent a new confirmation link to ${unconfirmedEmail}.`);
      setUnconfirmedEmail(null);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setResending(false);
    }
  };

  const handleReset = async () => {
    if (submitting) return;
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(collectFieldErrors<keyof LoginInput>(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(parsed.data.email);
      setResetEmail(parsed.data.email);
      switchMode('reset-sent');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  let content;
  if (mode === 'reset-sent') {
    content = (
      <>
        <ConfirmationCard
          title="Check your email"
          message={`If there is a Top Flow account for ${resetEmail}, we've sent it a link to choose a new password. The link opens the Top Flow website.`}
        />
        <Text style={styles.finePrint}>Can&apos;t find it? Check your spam folder, or try again in a few minutes.</Text>
        <Button label="Back to sign in" onPress={() => switchMode('sign-in')} fullWidth />
      </>
    );
  } else if (mode === 'reset') {
    content = (
      <>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Reset your password
          </Text>
          <Text style={styles.subtitle}>
            Enter the email address you use for Top Flow. We&apos;ll email you a link to choose a new password on the Top
            Flow website.
          </Text>
        </View>

        {formError ? <InlineError message={formError} /> : null}
        <EmailField
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          returnKeyType="go"
          onSubmit={() => void handleReset()}
        />

        <Button label="Email me a reset link" onPress={() => void handleReset()} loading={submitting} fullWidth />
        <Button label="Back to sign in" variant="ghost" onPress={() => switchMode('sign-in')} fullWidth />
      </>
    );
  } else {
    content = (
      <>
        <View style={styles.intro}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome back
          </Text>
          <Text style={styles.subtitle}>Sign in to check out, track deliveries and see your order history.</Text>
        </View>

        {notice ? (
          <Text style={styles.notice} accessibilityLiveRegion="polite">
            ✓ {notice}
          </Text>
        ) : null}
        {formError ? <InlineError message={formError} /> : null}
        {unconfirmedEmail ? (
          <Button
            label="Resend confirmation email"
            variant="secondary"
            onPress={() => void handleResend()}
            loading={resending}
            fullWidth
          />
        ) : null}

        <EmailField
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          returnKeyType="next"
          onSubmit={() => passwordRef.current?.focus()}
        />
        <View style={styles.passwordBlock}>
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
            onSubmitEditing={() => void handleSignIn()}
          />
          <Button
            label="Forgot password?"
            variant="ghost"
            size="sm"
            accessibilityHint="Shows a form to email you a password reset link"
            onPress={() => switchMode('reset')}
            style={styles.forgot}
          />
        </View>

        <Button label="Sign in" onPress={() => void handleSignIn()} loading={submitting} fullWidth />

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>New to Top Flow?</Text>
          <Button label="Create an account" variant="ghost" size="sm" onPress={() => router.replace(routes.register)} />
        </View>
      </>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled">
      <Stack.Title>{mode === 'sign-in' ? 'Sign in' : 'Reset password'}</Stack.Title>
      {content}
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
  notice: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Brand.success,
  },
  passwordBlock: {
    gap: 4,
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  finePrint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
    textAlign: 'center',
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
