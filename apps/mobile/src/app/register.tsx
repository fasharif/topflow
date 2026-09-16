import { registerSchema, type RegisterInput } from '@topflow/shared';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ConfirmationCard } from '@/components/ui/confirmation-card';
import { InlineError } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { collectFieldErrors, optional, type FieldErrors } from '@/lib/forms';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { register, resendConfirmationEmail } from '@/lib/session';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<keyof RegisterInput>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Set when Supabase asks the customer to confirm their email before the first sign-in. */
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    if (submitting) return;
    const parsed = registerSchema.safeParse({
      fullName,
      email,
      password,
      phoneNumber: optional(phoneNumber),
    });
    if (!parsed.success) {
      setErrors(collectFieldErrors<keyof RegisterInput>(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await register(parsed.data);
      if (result.status === 'confirm-email') {
        setConfirmEmail(result.email);
        setSubmitting(false);
        return;
      }
      if (router.canGoBack()) router.back();
      else router.replace(routes.account);
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  if (confirmEmail) return <CheckYourEmail email={confirmEmail} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Create your account
        </Text>
        <Text style={styles.subtitle}>
          Order irrigation and flow-control supplies with delivery across the UAE and pay on delivery.
        </Text>
      </View>

      {formError ? <InlineError message={formError} /> : null}

      <TextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        error={errors.fullName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        label="Email"
        inputRef={emailRef}
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
        onSubmitEditing={() => phoneRef.current?.focus()}
      />
      <TextField
        label="Mobile number (optional)"
        inputRef={phoneRef}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        error={errors.phoneNumber}
        hint="Used for delivery updates, e.g. +971 50 123 4567"
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
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
        hint="At least 8 characters, including a letter and a number."
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void handleSubmit()}
      />

      <Button label="Create account" onPress={() => void handleSubmit()} loading={submitting} fullWidth />

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Already have an account?</Text>
        <Button label="Sign in" variant="ghost" size="sm" onPress={() => router.replace(routes.login)} />
      </View>
    </ScrollView>
  );
}

/** Supabase has emailed a confirmation link; there is no session until it is followed. */
function CheckYourEmail({ email }: { email: string }) {
  const insets = useSafeAreaInsets();
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    if (resending) return;
    setResending(true);
    setNotice(null);
    setError(null);
    try {
      await resendConfirmationEmail(email);
      setNotice(`We've sent another confirmation link to ${email}.`);
    } catch (resendError) {
      setError(errorMessage(resendError));
    } finally {
      setResending(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Title>Confirm your email</Stack.Title>

      <ConfirmationCard
        title="Check your email to confirm your account"
        message={`We've sent a confirmation link to ${email}. Open it to activate your account, then sign in here with your email and password.`}
      />

      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          ✓ {notice}
        </Text>
      ) : null}
      {error ? <InlineError message={error} /> : null}

      <Button label="Sign in" onPress={() => router.replace(routes.login)} fullWidth />
      <Button label="Resend the email" variant="secondary" onPress={() => void resend()} loading={resending} fullWidth />
      <Text style={styles.finePrint}>
        Can&apos;t find it? Check your spam folder. The link opens the Top Flow website.
      </Text>
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
    textAlign: 'center',
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
