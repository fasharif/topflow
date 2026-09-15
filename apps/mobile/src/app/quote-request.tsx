import {
  createWebsiteQuoteRequestSchema,
  type CreateWebsiteQuoteRequestInput,
  type Emirate,
  type WebsiteQuoteReceiptDto,
} from '@topflow/shared';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmiratePicker } from '@/components/emirate-picker';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionTitle } from '@/components/ui/card';
import { EmptyState, InlineError, LoadingState } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { clearCart, useCart, type CartLine } from '@/lib/cart';
import { formatDateTime, pluralize, quantityWithUnit } from '@/lib/format';
import { collectFieldErrors, optional, type FieldErrors } from '@/lib/forms';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { useSession } from '@/lib/session';

type QuoteField = keyof CreateWebsiteQuoteRequestInput;

/** Closes the modal and shows the Shop tab. */
function continueShopping() {
  router.dismissTo(routes.shop);
}

/**
 * Asks Top Flow's sales team for a quotation on the products in the cart ("basket"). The endpoint is
 * public, so no account is needed; signed-in customers get their details prefilled.
 */
export default function QuoteRequestScreen() {
  const { lines, hydrated } = useCart();
  const [receipt, setReceipt] = useState<WebsiteQuoteReceiptDto | null>(null);

  if (receipt) return <QuoteConfirmation receipt={receipt} />;
  if (!hydrated) return <LoadingState />;
  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your basket is empty"
        message="Add the products you need, then request a quote for your best price."
        action={<Button label="Browse products" onPress={continueShopping} />}
      />
    );
  }
  return <QuoteRequestForm lines={lines} onSent={setReceipt} />;
}

function QuoteRequestForm({
  lines,
  onSent,
}: {
  lines: readonly CartLine[];
  onSent: (receipt: WebsiteQuoteReceiptDto) => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  // `null` means "not edited yet": the signed-in account's details show until the customer types,
  // including when the session finishes restoring after this screen opened.
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [emirate, setEmirate] = useState<Emirate | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors<QuoteField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);

  const nameValue = name ?? user?.fullName ?? '';
  const emailValue = email ?? user?.email ?? '';
  const phoneValue = phone ?? user?.phoneNumber ?? '';

  const handleSubmit = async () => {
    if (submitting) return;
    const parsed = createWebsiteQuoteRequestSchema.safeParse({
      name: nameValue,
      email: emailValue,
      phone: phoneValue,
      companyName: optional(companyName),
      emirate: emirate ?? undefined,
      notes: optional(notes),
      items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
    if (!parsed.success) {
      const fieldErrors = collectFieldErrors<QuoteField>(parsed.error.issues);
      setErrors(fieldErrors);
      // Basket problems have no field of their own; otherwise point to the highlighted fields.
      setFormError(fieldErrors.items ?? 'Please correct the highlighted details.');
      return;
    }
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      // Public endpoint: no account or access token is needed.
      const sent = await api<WebsiteQuoteReceiptDto>('/quote-requests', { method: 'POST', body: parsed.data });
      onSent(sent);
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
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.title} accessibilityRole="header">
          Get your best price
        </Text>
        <Text style={styles.subtitle}>
          Send your basket to Top Flow&apos;s sales team and we&apos;ll reply with a quotation. No account or
          payment needed.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <SectionTitle style={styles.sectionHeaderTitle}>
            {`Your basket · ${pluralize(lines.length, 'product')}`}
          </SectionTitle>
          <Button
            label="Edit basket"
            variant="ghost"
            size="sm"
            accessibilityHint="Closes this form and opens your cart"
            onPress={() => router.dismissTo(routes.cart)}
          />
        </View>
        <Card style={styles.lines}>
          {lines.map((line, index) => (
            <View key={line.productId}>
              {index > 0 ? <Divider /> : null}
              <View
                style={styles.line}
                accessible
                accessibilityLabel={`${line.name}, SKU ${line.sku}, quantity ${quantityWithUnit(line.quantity, line.uom)}`}>
                <View style={styles.lineText}>
                  <Text style={styles.lineName} numberOfLines={2}>
                    {line.name}
                  </Text>
                  <Text style={styles.lineMeta}>SKU {line.sku}</Text>
                </View>
                <Text style={styles.lineQuantity}>{quantityWithUnit(line.quantity, line.uom)}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Your details</SectionTitle>
        <View style={styles.fields}>
          <TextField
            label="Full name"
            value={nameValue}
            onChangeText={setName}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => emailRef.current?.focus()}
            maxLength={120}
          />
          <TextField
            label="Email"
            inputRef={emailRef}
            value={emailValue}
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
            label="Mobile number"
            inputRef={phoneRef}
            value={phoneValue}
            onChangeText={setPhone}
            error={errors.phone}
            hint="So our sales team can call you, e.g. +971 50 123 4567"
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => companyRef.current?.focus()}
            maxLength={20}
          />
          <TextField
            label="Company (optional)"
            inputRef={companyRef}
            value={companyName}
            onChangeText={setCompanyName}
            error={errors.companyName}
            autoCapitalize="words"
            // iOS offers the organisation from the contact card; Android has no autofill hint for it.
            textContentType="organizationName"
            returnKeyType="done"
            maxLength={160}
          />
          <EmiratePicker
            label="Emirate (optional)"
            value={emirate}
            onChange={setEmirate}
            error={errors.emirate}
            hint="Where the products are needed."
            clearable
          />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            error={errors.notes}
            placeholder="Project details, delivery location, timing, accepted alternatives…"
            multiline
            maxLength={2000}
          />
        </View>
      </View>

      {formError ? <InlineError message={formError} /> : null}
      <Button
        label="Send quote request"
        accessibilityHint="Sends your details and basket to Top Flow's sales team"
        onPress={() => void handleSubmit()}
        loading={submitting}
        fullWidth
      />
      <Text style={styles.finePrint}>
        This does not place an order or change your basket. Your quotation confirms prices, stock and delivery.
      </Text>
    </ScrollView>
  );
}

function QuoteConfirmation({ receipt }: { receipt: WebsiteQuoteReceiptDto }) {
  const insets = useSafeAreaInsets();
  const { lines } = useCart();
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    clearCart();
    setCleared(true);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Title>Quote request sent</Stack.Title>

      <Card style={styles.confirmation}>
        <View
          style={styles.confirmationIcon}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Text style={styles.confirmationCheck}>✓</Text>
        </View>
        <Text style={styles.confirmationTitle} accessibilityRole="header">
          Quote request sent
        </Text>
        <Text style={styles.body}>
          Thank you. Top Flow&apos;s sales team will review your request and reply by email or phone with your
          quotation.
        </Text>
        <View style={styles.reference} accessible accessibilityLabel={`Reference number ${receipt.number}`}>
          <Text style={styles.referenceLabel}>Reference</Text>
          <Text style={styles.referenceNumber} selectable>
            {receipt.number}
          </Text>
        </View>
        <Text style={styles.meta}>
          {pluralize(receipt.lineCount, 'product')} · sent {formatDateTime(receipt.createdAt)}
        </Text>
      </Card>

      <Button label="Continue shopping" onPress={continueShopping} fullWidth />
      {cleared ? (
        <Text style={styles.cleared} accessibilityLiveRegion="polite">
          ✓ Your basket has been cleared.
        </Text>
      ) : lines.length > 0 ? (
        <Button
          label="Clear basket"
          variant="secondary"
          accessibilityHint="Removes all products from your cart"
          onPress={handleClear}
          fullWidth
        />
      ) : null}
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
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Brand.navy,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionHeaderTitle: {
    flexShrink: 1,
  },
  lines: {
    gap: 0,
    paddingVertical: 4,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  lineText: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Brand.navy,
  },
  lineMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: Brand.textSubtle,
  },
  lineQuantity: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.text,
    fontVariant: ['tabular-nums'],
  },
  fields: {
    gap: 16,
  },
  finePrint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
    textAlign: 'center',
  },
  confirmation: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  confirmationIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Brand.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationCheck: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.success,
  },
  confirmationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Brand.navy,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: Brand.textMuted,
    textAlign: 'center',
  },
  reference: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Brand.blueTint,
  },
  referenceLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Brand.textMuted,
  },
  referenceNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontSize: 13,
    color: Brand.textSubtle,
    textAlign: 'center',
  },
  cleared: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.success,
    textAlign: 'center',
  },
});
