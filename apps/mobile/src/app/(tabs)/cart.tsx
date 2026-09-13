import { formatMoney, UOM_LABELS, VAT_RATE_BPS, type Fils } from '@topflow/shared';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckoutSection } from '@/components/checkout-section';
import { Button } from '@/components/ui/button';
import { Card, DetailRow, Divider, SectionTitle } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { Brand, TouchTarget } from '@/constants/theme';
import {
  cartTotals,
  MAX_LINE_QUANTITY,
  removeFromCart,
  setQuantity,
  useCart,
  type CartLine,
} from '@/lib/cart';
import { perUnit, pluralize, quantityWithUnit } from '@/lib/format';
import { routes } from '@/lib/routes';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { lines, hydrated } = useCart();

  if (!hydrated || lines.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={[styles.title, styles.titleStandalone]} accessibilityRole="header">
          Cart
        </Text>
        {hydrated ? (
          <EmptyState
            title="Your cart is empty"
            message="Browse irrigation and flow-control supplies and add products to your cart."
            action={<Button label="Browse products" onPress={() => router.navigate(routes.shop)} />}
          />
        ) : (
          <LoadingState />
        )}
      </View>
    );
  }

  const totals = cartTotals(lines);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Cart
          </Text>
          <Text style={styles.subtitle}>{pluralize(lines.length, 'product')}</Text>
        </View>

        <Card style={styles.lines}>
          {lines.map((line, index) => (
            <View key={line.productId}>
              {index > 0 ? <Divider /> : null}
              <CartLineRow line={line} lineTotalFils={totals.lines[index]?.lineTotalFils ?? 0} />
            </View>
          ))}
        </Card>

        <SectionTitle>Order summary</SectionTitle>
        <Card>
          <DetailRow label="Subtotal (excl. VAT)" value={formatMoney(totals.subtotalFils)} />
          <DetailRow
            label="Delivery"
            value={totals.deliveryFeeFils === 0 ? 'Free' : formatMoney(totals.deliveryFeeFils)}
            valueTone={totals.deliveryFeeFils === 0 ? 'success' : undefined}
          />
          <DetailRow label={`VAT (${VAT_RATE_BPS / 100}%)`} value={formatMoney(totals.vatFils)} />
          <Divider />
          <DetailRow label="Total" value={formatMoney(totals.totalFils)} emphasis />
          {totals.freeDeliveryRemainingFils > 0 ? (
            <Text style={styles.deliveryHint}>
              Add {formatMoney(totals.freeDeliveryRemainingFils)} more (excl. VAT) for free delivery.
            </Text>
          ) : null}
        </Card>

        <CheckoutSection lines={lines} />
      </ScrollView>
    </View>
  );
}

function CartLineRow({ line, lineTotalFils }: { line: CartLine; lineTotalFils: Fils }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="Opens product details"
          onPress={() => router.push(routes.product(line.slug))}
          style={({ pressed }) => [styles.lineInfo, pressed && styles.pressed]}>
          <Text style={styles.lineName} numberOfLines={2}>
            {line.name}
          </Text>
          <Text style={styles.lineMeta}>
            SKU {line.sku} · {formatMoney(line.retailPrice)} {perUnit(line.uom)} incl. VAT
          </Text>
          {line.minOrderQty > 1 ? (
            <Text style={styles.lineMeta}>Minimum order {quantityWithUnit(line.minOrderQty, line.uom)}</Text>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.name} from cart`}
          onPress={() => removeFromCart(line.productId)}
          style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}>
          <Text style={styles.removeText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.lineBottom}>
        <QuantityStepper
          value={line.quantity}
          min={line.minOrderQty}
          max={MAX_LINE_QUANTITY}
          unit={UOM_LABELS[line.uom]}
          itemName={line.name}
          onChange={(next) => setQuantity(line.productId, next)}
        />
        <View style={styles.lineTotalBlock}>
          <Text style={styles.lineTotal}>{formatMoney(lineTotalFils)}</Text>
          <Text style={styles.lineTotalNote}>incl. VAT</Text>
        </View>
      </View>
    </View>
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
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Brand.navy,
  },
  titleStandalone: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: Brand.textMuted,
  },
  lines: {
    gap: 0,
    paddingVertical: 4,
  },
  line: {
    paddingVertical: 12,
    gap: 10,
  },
  lineTop: {
    flexDirection: 'row',
    gap: 8,
  },
  lineInfo: {
    flex: 1,
    gap: 3,
  },
  pressed: {
    opacity: 0.7,
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
  remove: {
    width: TouchTarget,
    height: TouchTarget,
    marginTop: -10,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TouchTarget / 2,
  },
  removePressed: {
    backgroundColor: Brand.dangerTint,
  },
  removeText: {
    fontSize: 16,
    color: Brand.textMuted,
  },
  lineBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineTotalBlock: {
    alignItems: 'flex-end',
  },
  lineTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  lineTotalNote: {
    fontSize: 12,
    color: Brand.textSubtle,
  },
  deliveryHint: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.blueInk,
  },
});
