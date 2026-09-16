import { PAYMENT_METHOD_LABELS, type AddressDto, type AuthUser, type OrderDto } from '@topflow/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AccountUnavailable } from '@/components/account-unavailable';
import { AddressForm } from '@/components/address-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { InlineError } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand, Radius } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { clearCart, type CartLine } from '@/lib/cart';
import { formatAddress } from '@/lib/format';
import { optional } from '@/lib/forms';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { useSession } from '@/lib/session';

const fetchAddresses = () => api<AddressDto[]>('/me/addresses', { auth: true });

export function CheckoutSection({ lines }: { lines: readonly CartLine[] }) {
  const session = useSession();

  if (session.status === 'loading') {
    return (
      <Card>
        <ActivityIndicator color={Brand.blue} />
      </Card>
    );
  }

  if (session.status === 'unavailable') {
    return <AccountUnavailable variant="card" message={session.error} />;
  }

  if (!session.user) {
    return (
      <Card>
        <Text style={styles.cardTitle}>Ready to order?</Text>
        <Text style={styles.body}>
          Sign in or create an account to choose a delivery address and place your order.
        </Text>
        <Button label="Sign in to check out" onPress={() => router.push(routes.login)} fullWidth />
        <Button label="Create an account" variant="secondary" onPress={() => router.push(routes.register)} fullWidth />
      </Card>
    );
  }

  // Keyed by user so switching accounts starts with fresh addresses and form state.
  return <SignedInCheckout key={session.user.id} user={session.user} lines={lines} />;
}

function SignedInCheckout({ user, lines }: { user: AuthUser; lines: readonly CartLine[] }) {
  const addresses = useResource(fetchAddresses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const saved = addresses.data ?? [];
  const selected =
    saved.find((address) => address.id === selectedId) ?? saved.find((address) => address.isDefault) ?? saved[0] ?? null;
  const showForm = addingAddress || (addresses.data !== undefined && saved.length === 0);

  const handleAddressSaved = (address: AddressDto) => {
    const others = address.isDefault ? saved.map((item) => ({ ...item, isDefault: false })) : saved;
    addresses.setData([...others, address]);
    setSelectedId(address.id);
    setAddingAddress(false);
  };

  const placeOrder = async () => {
    if (placing || !selected || lines.length === 0) return;
    setPlacing(true);
    setOrderError(null);
    try {
      // The server prices every line, delivery and VAT; only products and quantities are sent.
      const order = await api<OrderDto>('/me/orders', {
        method: 'POST',
        auth: true,
        body: {
          items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          addressId: selected.id,
          paymentMethod: 'CASH_ON_DELIVERY',
          notes: optional(notes),
        },
      });
      clearCart();
      router.navigate(routes.order(order.id), { withAnchor: true });
    } catch (error) {
      setOrderError(errorMessage(error));
      setPlacing(false);
    }
  };

  let addressContent;
  if (addresses.loading) {
    addressContent = (
      <Card>
        <ActivityIndicator color={Brand.blue} accessibilityLabel="Loading your addresses" />
      </Card>
    );
  } else if (addresses.data === undefined) {
    addressContent = (
      <Card>
        <InlineError message={addresses.error ?? 'Could not load your addresses.'} />
        <Button
          label="Try again"
          variant="secondary"
          onPress={() => void addresses.refresh()}
          loading={addresses.refreshing}
        />
      </Card>
    );
  } else if (showForm) {
    addressContent = (
      <Card>
        {saved.length === 0 ? <Text style={styles.body}>Add the address we should deliver to.</Text> : null}
        <AddressForm
          user={user}
          makeDefault={saved.length === 0}
          onSaved={handleAddressSaved}
          onCancel={saved.length > 0 ? () => setAddingAddress(false) : undefined}
        />
      </Card>
    );
  } else {
    addressContent = (
      <Card style={styles.addressList}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Delivery address" style={styles.addressList}>
          {saved.map((address) => (
            <AddressOption
              key={address.id}
              address={address}
              selected={address.id === selected?.id}
              onPress={() => setSelectedId(address.id)}
            />
          ))}
        </View>
        <Button label="Add a new address" variant="ghost" size="sm" onPress={() => setAddingAddress(true)} />
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <SectionTitle>Delivery address</SectionTitle>
      {addressContent}

      <SectionTitle>Payment</SectionTitle>
      <Card>
        <Text style={styles.paymentTitle}>{PAYMENT_METHOD_LABELS.CASH_ON_DELIVERY}</Text>
        <Text style={styles.body}>Pay by cash or card when your order is delivered.</Text>
      </Card>

      <TextField
        label="Delivery notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Gate code, preferred delivery time, site contact…"
        multiline
        maxLength={1000}
      />

      {orderError ? <InlineError message={orderError} /> : null}
      <Button
        label="Place order (pay on delivery)"
        onPress={() => void placeOrder()}
        loading={placing}
        disabled={!selected || showForm}
        fullWidth
      />
      <Text style={styles.finePrint}>
        Prices, stock, delivery and VAT are confirmed by Top Flow when you place the order.
      </Text>
    </View>
  );
}

function AddressOption({
  address,
  selected,
  onPress,
}: {
  address: AddressDto;
  selected: boolean;
  onPress: () => void;
}) {
  const summary = formatAddress(address);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${address.label}, ${summary}`}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionText}>
        <View style={styles.optionHeader}>
          <Text style={styles.optionLabel}>{address.label}</Text>
          {address.isDefault ? <Badge label="Default" tone="info" /> : null}
        </View>
        <Text style={styles.body}>
          {address.contactName} · {address.phoneNumber}
        </Text>
        <Text style={styles.body}>{summary}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.navy,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textMuted,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.text,
  },
  addressList: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  optionSelected: {
    borderColor: Brand.blue,
    backgroundColor: '#F1F7F5',
  },
  optionPressed: {
    opacity: 0.8,
  },
  radio: {
    width: 22,
    height: 22,
    marginTop: 2,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Brand.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Brand.blue,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Brand.blue,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.text,
  },
  finePrint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
    textAlign: 'center',
  },
});
