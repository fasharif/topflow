import {
  addressSchema,
  Emirate,
  EMIRATE_LABELS,
  type AddressDto,
  type AddressInput,
  type AuthUser,
} from '@topflow/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius, TouchTarget } from '@/constants/theme';
import { api } from '@/lib/api';
import { collectFieldErrors, optional, type FieldErrors } from '@/lib/forms';
import { errorMessage } from '@/lib/http';

type AddressField = keyof AddressInput;

const EMIRATES = Object.values(Emirate);

export function AddressForm({
  user,
  makeDefault,
  onSaved,
  onCancel,
}: {
  user: Pick<AuthUser, 'fullName' | 'phoneNumber'>;
  /** Pre-selects "Use as my default address" (e.g. for the first address). */
  makeDefault: boolean;
  onSaved: (address: AddressDto) => void;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState('Home');
  const [contactName, setContactName] = useState(user.fullName);
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber ?? '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [area, setArea] = useState('');
  const [emirate, setEmirate] = useState<Emirate>(Emirate.DUBAI);
  const [city, setCity] = useState<string>(EMIRATE_LABELS[Emirate.DUBAI]);
  const [isDefault, setIsDefault] = useState(makeDefault);
  const [errors, setErrors] = useState<FieldErrors<AddressField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectEmirate = (next: Emirate) => {
    // Keep the city in step with the emirate until the customer types their own.
    if (city.trim() === '' || city === EMIRATE_LABELS[emirate]) setCity(EMIRATE_LABELS[next]);
    setEmirate(next);
  };

  const handleSave = async () => {
    if (saving) return;
    const parsed = addressSchema.safeParse({
      label,
      contactName,
      phoneNumber,
      line1,
      line2: optional(line2),
      area,
      city,
      emirate,
      isDefault,
    });
    if (!parsed.success) {
      setErrors(collectFieldErrors<AddressField>(parsed.error.issues));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const address = await api<AddressDto>('/me/addresses', { method: 'POST', body: parsed.data, auth: true });
      onSaved(address);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      {formError ? <InlineError message={formError} /> : null}

      <TextField
        label="Address name"
        value={label}
        onChangeText={setLabel}
        error={errors.label}
        placeholder="Home, Office, Site A…"
        maxLength={60}
      />
      <TextField
        label="Contact name"
        value={contactName}
        onChangeText={setContactName}
        error={errors.contactName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label="Mobile number"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        error={errors.phoneNumber}
        placeholder="+971 50 123 4567"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <TextField
        label="Street, building or villa"
        value={line1}
        onChangeText={setLine1}
        error={errors.line1}
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        maxLength={200}
      />
      <TextField
        label="Apartment, floor or landmark (optional)"
        value={line2}
        onChangeText={setLine2}
        error={errors.line2}
        textContentType="streetAddressLine2"
        maxLength={200}
      />
      <TextField
        label="Area or community"
        value={area}
        onChangeText={setArea}
        error={errors.area}
        placeholder="Al Barsha, JVC, Mussafah…"
        maxLength={100}
      />

      <View style={styles.group}>
        <Text style={styles.groupLabel}>Emirate</Text>
        <View style={styles.emirates} accessibilityRole="radiogroup" accessibilityLabel="Emirate">
          {EMIRATES.map((value) => {
            const selected = value === emirate;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => selectEmirate(value)}
                style={({ pressed }) => [
                  styles.emirate,
                  selected && styles.emirateSelected,
                  pressed && !selected && styles.emiratePressed,
                ]}>
                <Text style={[styles.emirateText, selected && styles.emirateTextSelected]}>
                  {EMIRATE_LABELS[value]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.emirate ? <Text style={styles.error}>{errors.emirate}</Text> : null}
      </View>

      <TextField
        label="City"
        value={city}
        onChangeText={setCity}
        error={errors.city}
        autoComplete="postal-address-locality"
        textContentType="addressCity"
        maxLength={100}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Use as my default address</Text>
        <Switch
          value={isDefault}
          onValueChange={setIsDefault}
          accessibilityLabel="Use as my default address"
          trackColor={{ true: Brand.blue, false: Brand.borderStrong }}
          thumbColor={Brand.surface}
        />
      </View>

      <Button label="Save address" onPress={() => void handleSave()} loading={saving} fullWidth />
      {onCancel ? <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={saving} fullWidth /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.text,
  },
  emirates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emirate: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    backgroundColor: Brand.surface,
  },
  emirateSelected: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  emiratePressed: {
    backgroundColor: Brand.blueTint,
  },
  emirateText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.navy,
  },
  emirateTextSelected: {
    color: '#FFFFFF',
  },
  error: {
    fontSize: 13,
    color: Brand.danger,
  },
  switchRow: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontSize: 15,
    color: Brand.text,
  },
});
