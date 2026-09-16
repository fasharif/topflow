import {
  CONTACT_CHANNEL_LABELS,
  ContactChannel,
  createWebsiteQuoteRequestSchema,
  PROJECT_ENQUIRY_MIN_LENGTH,
  type CreateWebsiteQuoteRequestInput,
  type Emirate,
  type WebsiteQuoteReceiptDto,
} from '@topflow/shared';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompanyContact } from '@/components/company-contact';
import { DateField } from '@/components/date-field';
import { EmiratePicker } from '@/components/emirate-picker';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionTitle } from '@/components/ui/card';
import { ConfirmationCard } from '@/components/ui/confirmation-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { InlineError, LoadingState } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import { api } from '@/lib/api';
import { clearCart, useCart, type CartLine } from '@/lib/cart';
import { formatDateTime, pluralize, quantityWithUnit, todayIsoDate } from '@/lib/format';
import { collectFieldErrors, optional, type FieldErrors } from '@/lib/forms';
import { errorMessage, isApiError } from '@/lib/http';
import { routes } from '@/lib/routes';
import { useSession } from '@/lib/session';

type QuoteField = keyof CreateWebsiteQuoteRequestInput;

interface IssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

const CONTACT_OPTIONS = Object.values(ContactChannel).map((value) => ({
  value,
  label: CONTACT_CHANNEL_LABELS[value],
}));

/** How the confirmation describes the reply, by preferred contact channel. */
const REPLY_BY: Record<ContactChannel, string> = {
  PHONE: 'by phone',
  WHATSAPP: 'on WhatsApp',
  EMAIL: 'by email',
};

interface SentQuote {
  receipt: WebsiteQuoteReceiptDto;
  preferredContact: ContactChannel | null;
  /** A project enquiry lists no catalogue products. */
  enquiry: boolean;
}

/** Closes the modal and shows the Shop tab. */
function continueShopping() {
  router.dismissTo(routes.shop);
}

/**
 * Asks Top Flow's sales team for a quotation. With products in the cart ("basket") the request lists
 * them, each with an optional note; with an empty basket it is a project enquiry described in words.
 * The endpoint is public, so no account is needed; signed-in customers get their details prefilled
 * and the request is linked to their account.
 */
export default function QuoteRequestScreen() {
  const { lines, hydrated } = useCart();
  const [sent, setSent] = useState<SentQuote | null>(null);

  if (sent) return <QuoteConfirmation sent={sent} />;
  if (!hydrated) return <LoadingState />;
  return <QuoteRequestForm lines={lines} onSent={setSent} />;
}

/** Messages for problems with one basket line (`items.<index>.notes`), keyed by product. */
function lineErrorsFrom(issues: readonly IssueLike[], lines: readonly CartLine[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const [field, index] = issue.path;
    const line = field === 'items' && typeof index === 'number' ? lines[index] : undefined;
    if (line && result[line.productId] === undefined) result[line.productId] = issue.message;
  }
  return result;
}

function QuoteRequestForm({
  lines,
  onSent,
}: {
  lines: readonly CartLine[];
  onSent: (sent: SentQuote) => void;
}) {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const enquiry = lines.length === 0;
  // `null` means "not edited yet": the signed-in account's details show until the customer types,
  // including when the session finishes restoring after this screen opened.
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [preferredContact, setPreferredContact] = useState<ContactChannel | null>(null);
  const [projectReference, setProjectReference] = useState('');
  const [requiredBy, setRequiredBy] = useState<string | null>(null);
  const [emirate, setEmirate] = useState<Emirate | null>(null);
  const [notes, setNotes] = useState('');
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors<QuoteField>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const companyRef = useRef<TextInput>(null);

  const nameValue = name ?? user?.fullName ?? '';
  const emailValue = email ?? user?.email ?? '';
  const phoneValue = phone ?? user?.phoneNumber ?? '';
  const today = todayIsoDate();

  const notesLength = notes.trim().length;
  const enquiryHint =
    notesLength < PROJECT_ENQUIRY_MIN_LENGTH
      ? `Products, sizes, quantities, site and timing: at least ${PROJECT_ENQUIRY_MIN_LENGTH} characters (${PROJECT_ENQUIRY_MIN_LENGTH - notesLength} to go).`
      : 'Products, sizes, quantities, site and timing.';

  const handleSubmit = async () => {
    if (submitting) return;
    const parsed = createWebsiteQuoteRequestSchema.safeParse({
      name: nameValue,
      email: emailValue,
      phone: phoneValue,
      companyName: optional(companyName),
      emirate: emirate ?? undefined,
      preferredContact: preferredContact ?? undefined,
      projectReference: optional(projectReference),
      requiredBy: requiredBy ?? undefined,
      notes: optional(notes),
      items: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        notes: optional(lineNotes[line.productId] ?? ''),
      })),
    });

    const issues = parsed.success ? [] : parsed.error.issues;
    const fieldErrors = collectFieldErrors<QuoteField>(issues);
    // Only list-level problems belong to `items`; line problems are shown on their line.
    const itemsError = issues.find((issue) => issue.path[0] === 'items' && issue.path.length === 1)?.message;
    if (itemsError) fieldErrors.items = itemsError;
    else delete fieldErrors.items;
    if (requiredBy && !fieldErrors.requiredBy && requiredBy < today) {
      fieldErrors.requiredBy = 'Choose today or a later date';
    }

    if (!parsed.success || fieldErrors.requiredBy) {
      setErrors(fieldErrors);
      setLineErrors(lineErrorsFrom(issues, lines));
      setFormError(fieldErrors.items ?? 'Please correct the highlighted details.');
      return;
    }

    setErrors({});
    setLineErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      // A public endpoint: signed-in customers also send their access token to link the request.
      const receipt = await api<WebsiteQuoteReceiptDto>('/quote-requests', {
        method: 'POST',
        body: parsed.data,
        auth: 'optional',
      });
      onSent({
        receipt,
        preferredContact: parsed.data.preferredContact ?? null,
        enquiry: parsed.data.items.length === 0,
      });
    } catch (error) {
      if (isApiError(error) && error.details.length > 0) {
        setErrors(
          collectFieldErrors<QuoteField>(
            error.details.map((detail) => ({ path: detail.path.split('.'), message: detail.message })),
          ),
        );
      }
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
          {enquiry ? 'Describe your project' : 'Get your best price'}
        </Text>
        <Text style={styles.subtitle}>
          {enquiry
            ? "Tell Top Flow's sales team what you need, for example from a bill of quantities, and we'll reply with a quotation. No account or payment needed."
            : "Send your basket to Top Flow's sales team and we'll reply with a quotation. No account or payment needed."}
        </Text>
      </View>

      {enquiry ? (
        <View style={styles.section}>
          <SectionTitle>Your project</SectionTitle>
          <TextField
            label="What do you need?"
            value={notes}
            onChangeText={setNotes}
            error={errors.notes}
            hint={enquiryHint}
            placeholder="e.g. 200 m of 25 mm HDPE pipe, 40 pop-up sprinklers and a 6-station controller for a villa garden"
            multiline
            maxLength={2000}
          />
          <Button
            label="Browse products instead"
            variant="ghost"
            size="sm"
            accessibilityHint="Closes this form and opens the Shop"
            onPress={continueShopping}
            style={styles.inlineAction}
          />
        </View>
      ) : (
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
                <QuoteLine
                  line={line}
                  note={lineNotes[line.productId] ?? ''}
                  error={lineErrors[line.productId]}
                  onChangeNote={(text) => setLineNotes((current) => ({ ...current, [line.productId]: text }))}
                />
              </View>
            ))}
          </Card>
          <Text style={styles.sectionHint}>Quantities and alternatives can still be adjusted on your quotation.</Text>
        </View>
      )}

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
            hint="So our sales team can call or message you, e.g. +971 50 123 4567"
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
          <SegmentedControl
            label="Preferred contact (optional)"
            options={CONTACT_OPTIONS}
            value={preferredContact}
            onChange={setPreferredContact}
            error={errors.preferredContact}
            hint="How you would like our sales team to reply."
            clearable
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Project and delivery</SectionTitle>
        <View style={styles.fields}>
          <TextField
            label="Project reference (optional)"
            value={projectReference}
            onChangeText={setProjectReference}
            error={errors.projectReference}
            placeholder="e.g. Villa 12 landscaping, tender number"
            maxLength={120}
          />
          <DateField
            label="Required by (optional)"
            value={requiredBy}
            onChange={setRequiredBy}
            minimumDate={today}
            error={errors.requiredBy}
            hint="When you need the products on site."
          />
          <EmiratePicker
            label="Emirate (optional)"
            value={emirate}
            onChange={setEmirate}
            error={errors.emirate}
            hint="Where the products are needed."
            clearable
          />
          {enquiry ? null : (
            <TextField
              label="Project details (optional)"
              value={notes}
              onChangeText={setNotes}
              error={errors.notes}
              placeholder="Site, delivery location, timing, accepted alternatives…"
              multiline
              maxLength={2000}
            />
          )}
        </View>
      </View>

      {formError ? <InlineError message={formError} /> : null}
      <Button
        label={enquiry ? 'Send project enquiry' : 'Send quote request'}
        accessibilityHint="Sends your details and request to Top Flow's sales team"
        onPress={() => void handleSubmit()}
        loading={submitting}
        fullWidth
      />
      <Text style={styles.finePrint}>
        {enquiry
          ? 'This does not place an order. Your quotation confirms products, prices, stock and delivery.'
          : 'This does not place an order or change your basket. Your quotation confirms prices, stock and delivery.'}
      </Text>

      <CompanyContact title="Prefer to talk?" />
    </ScrollView>
  );
}

function QuoteLine({
  line,
  note,
  error,
  onChangeNote,
}: {
  line: CartLine;
  note: string;
  error: string | undefined;
  onChangeNote: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const quantity = quantityWithUnit(line.quantity, line.uom);

  return (
    <View style={styles.line}>
      <View style={styles.lineRow} accessible accessibilityLabel={`${line.name}, SKU ${line.sku}, quantity ${quantity}`}>
        <View style={styles.lineText}>
          <Text style={styles.lineName} numberOfLines={2}>
            {line.name}
          </Text>
          <Text style={styles.lineMeta}>SKU {line.sku}</Text>
        </View>
        <Text style={styles.lineQuantity}>{quantity}</Text>
      </View>
      {editing || note !== '' || error ? (
        <TextField
          label="Note (optional)"
          accessibilityLabel={`Note for ${line.name}`}
          value={note}
          onChangeText={onChangeNote}
          error={error}
          placeholder="Size, brand or alternatives you would accept"
          autoFocus={editing && note === ''}
          maxLength={300}
        />
      ) : (
        <Button
          label="Add a note"
          variant="ghost"
          size="sm"
          accessibilityLabel={`Add a note for ${line.name}`}
          onPress={() => setEditing(true)}
          style={styles.inlineAction}
        />
      )}
    </View>
  );
}

function QuoteConfirmation({ sent }: { sent: SentQuote }) {
  const insets = useSafeAreaInsets();
  const { lines } = useCart();
  const [cleared, setCleared] = useState(false);
  const replyBy = sent.preferredContact ? REPLY_BY[sent.preferredContact] : 'by email or phone';
  const summary = sent.enquiry ? 'Project enquiry' : pluralize(sent.receipt.lineCount, 'product');

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

      <ConfirmationCard
        title="Quote request sent"
        message={`Thank you. Top Flow's sales team will review your request and reply ${replyBy} with your quotation.`}>
        <View style={styles.reference} accessible accessibilityLabel={`Reference number ${sent.receipt.number}`}>
          <Text style={styles.referenceLabel}>Reference</Text>
          <Text style={styles.referenceNumber} selectable>
            {sent.receipt.number}
          </Text>
        </View>
        <Text style={styles.meta}>
          {summary} · sent {formatDateTime(sent.receipt.createdAt)}
        </Text>
      </ConfirmationCard>

      <Button label="Continue shopping" onPress={continueShopping} fullWidth />
      {sent.enquiry ? null : cleared ? (
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

      <CompanyContact
        title="Need it sooner?"
        intro={`Mention reference ${sent.receipt.number} when you call, message or email us.`}
      />
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
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
  },
  inlineAction: {
    alignSelf: 'flex-start',
  },
  lines: {
    gap: 0,
    paddingVertical: 4,
  },
  line: {
    paddingVertical: 10,
    gap: 6,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
