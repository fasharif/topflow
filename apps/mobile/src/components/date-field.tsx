import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius, TouchTarget } from '@/constants/theme';
import { formatDate, isoCalendarDate, todayIsoDate } from '@/lib/format';

export interface DateFieldProps {
  label: string;
  /** The chosen date as "YYYY-MM-DD", or `null` when none is chosen. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Earliest date that can be picked, as "YYYY-MM-DD". */
  minimumDate?: string;
  error?: string;
  hint?: string;
}

/**
 * An optional calendar date. iOS shows an inline calendar and Android the Material date dialog, both
 * from Expo UI. Expo UI's picker does not support web, which gets a "YYYY-MM-DD" text field instead.
 */
export function DateField(props: DateFieldProps) {
  return Platform.OS === 'web' ? <TextDateField {...props} /> : <PickerDateField {...props} />;
}

function TextDateField({ label, value, onChange, error, hint }: DateFieldProps) {
  return (
    <TextField
      label={label}
      value={value ?? ''}
      onChangeText={(text) => onChange(text.trim() === '' ? null : text.trim())}
      error={error}
      hint={hint}
      placeholder="YYYY-MM-DD"
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={10}
    />
  );
}

/** Android's Material picker counts whole days in UTC; iOS uses the device's local calendar. */
const PICKER_DAYS_IN_UTC = Platform.OS === 'android';

function toPickerDate(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return PICKER_DAYS_IN_UTC ? new Date(Date.UTC(year, month - 1, day)) : new Date(year, month - 1, day);
}

function fromPickerDate(date: Date): string {
  return PICKER_DAYS_IN_UTC
    ? isoCalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    : isoCalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function PickerDateField({ label, value, onChange, minimumDate, error, hint }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const shown = value ?? minimumDate ?? todayIsoDate();

  const pick = (date: Date) => {
    onChange(fromPickerDate(date));
    // Android's dialog is done once a date is confirmed; the iOS calendar stays open until Done.
    if (Platform.OS === 'android') setOpen(false);
  };

  const finish = () => {
    // Done without tapping a day accepts the day the calendar highlights.
    if (!value) onChange(shown);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${value ? formatDate(value) : 'no date chosen'}`}
          accessibilityHint={error ?? 'Opens a calendar'}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.input,
            open && styles.inputOpen,
            error ? styles.inputInvalid : null,
            pressed && styles.inputPressed,
          ]}>
          <Text style={[styles.inputText, !value && styles.placeholder]}>
            {value ? formatDate(value) : 'Choose a date'}
          </Text>
        </Pressable>
        {value ? <Button label="Clear" variant="ghost" size="sm" accessibilityLabel="Clear the date" onPress={clear} /> : null}
      </View>

      {open ? (
        <View style={Platform.OS === 'ios' ? styles.calendar : undefined}>
          <DateTimePicker
            value={toPickerDate(shown)}
            mode="date"
            display="inline"
            minimumDate={minimumDate ? toPickerDate(minimumDate) : undefined}
            accentColor={Brand.blue}
            onValueChange={(_event, date) => pick(date)}
            onDismiss={() => setOpen(false)}
          />
          {Platform.OS === 'ios' ? <Button label="Done" variant="secondary" size="sm" onPress={finish} /> : null}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: TouchTarget + 4,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    paddingHorizontal: 14,
  },
  inputOpen: {
    borderColor: Brand.blue,
  },
  inputInvalid: {
    borderColor: Brand.danger,
  },
  inputPressed: {
    backgroundColor: Brand.surfaceMuted,
  },
  inputText: {
    fontSize: 16,
    color: Brand.text,
  },
  placeholder: {
    color: Brand.placeholder,
  },
  calendar: {
    gap: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.danger,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
  },
});
