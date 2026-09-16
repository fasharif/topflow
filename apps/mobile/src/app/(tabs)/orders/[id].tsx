import {
  cancelOrderSchema,
  formatMoney,
  ORDER_PROGRESS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  toFils,
  type CancelOrderInput,
  type OrderDto,
  type OrderStatus,
  type PaymentStatus,
} from '@topflow/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AccountUnavailable } from '@/components/account-unavailable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, DetailRow, Divider, SectionTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/states';
import { TextField } from '@/components/ui/text-field';
import { Brand } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { formatAddress, formatDateTime, orderStatusTone, quantityWithUnit, type Tone } from '@/lib/format';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';
import { useSession } from '@/lib/session';

const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  UNPAID: 'warning',
  PAID: 'success',
  REFUNDED: 'neutral',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const orderId = typeof id === 'string' && id.length > 0 ? id : null;

  if (session.status === 'loading') return <LoadingState />;
  if (session.status === 'unavailable') return <AccountUnavailable message={session.error} />;
  if (!session.user) {
    return (
      <EmptyState
        title="Sign in to view this order"
        action={<Button label="Sign in" onPress={() => router.push(routes.login)} />}
      />
    );
  }
  if (!orderId) return <ErrorState title="Order not found" message="This link is not valid." />;
  return <OrderLoader key={`${session.user.id}:${orderId}`} orderId={orderId} />;
}

function OrderLoader({ orderId }: { orderId: string }) {
  const fetchOrder = useCallback(
    () => api<OrderDto>(`/me/orders/${encodeURIComponent(orderId)}`, { auth: true }),
    [orderId],
  );
  const order = useResource(fetchOrder);

  if (order.loading) return <LoadingState label="Loading order…" />;
  if (!order.data) {
    return (
      <ErrorState
        title="Could not load this order"
        message={order.error ?? 'Please try again.'}
        onRetry={() => void order.refresh()}
        retrying={order.refreshing}
      />
    );
  }
  return (
    <OrderDetail
      order={order.data}
      error={order.error}
      refreshing={order.refreshing}
      onRefresh={() => void order.refresh()}
      onUpdated={order.setData}
    />
  );
}

function OrderDetail({
  order,
  error,
  refreshing,
  onRefresh,
  onUpdated,
}: {
  order: OrderDto;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onUpdated: (order: OrderDto) => void;
}) {
  const events = [...order.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hasDiscount = toFils(order.discountTotal) > 0;
  const freeDelivery = toFils(order.deliveryFee) === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.blue} colors={[Brand.blue]} />
      }>
      <Stack.Title>{order.orderNumber}</Stack.Title>

      {error ? <InlineError message={error} /> : null}

      <Card>
        <View style={styles.summaryTop}>
          <View style={styles.summaryText}>
            <Text style={styles.orderNumber} accessibilityRole="header">
              {order.orderNumber}
            </Text>
            <Text style={styles.muted}>Placed {formatDateTime(order.createdAt)}</Text>
          </View>
          <Badge label={ORDER_STATUS_LABELS[order.status]} tone={orderStatusTone(order.status)} />
        </View>
        <DetailRow label="Order total" value={formatMoney(order.totalAmount)} emphasis />
      </Card>

      {order.status === 'CANCELLED' ? (
        <Card style={styles.cancelledCard}>
          <Text style={styles.cancelledTitle}>Order cancelled</Text>
          {order.cancelledAt ? <Text style={styles.muted}>{formatDateTime(order.cancelledAt)}</Text> : null}
          {order.cancellationReason ? <Text style={styles.body}>Reason: {order.cancellationReason}</Text> : null}
        </Card>
      ) : (
        <View style={styles.section}>
          <SectionTitle>Progress</SectionTitle>
          <Card>
            <ProgressTracker order={order} />
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <SectionTitle>Delivery</SectionTitle>
        <Card>
          {order.deliveryAddress ? (
            <View style={styles.block}>
              <Text style={styles.strong}>{order.deliveryAddress.label}</Text>
              <Text style={styles.body}>
                {order.deliveryAddress.contactName} · {order.deliveryAddress.phoneNumber}
              </Text>
              <Text style={styles.body}>{formatAddress(order.deliveryAddress)}</Text>
            </View>
          ) : (
            <Text style={styles.body}>{order.shippingAddress}</Text>
          )}
          {order.trackingReference ? <DetailRow label="Tracking reference" value={order.trackingReference} /> : null}
          {order.dispatchedAt ? <DetailRow label="Dispatched" value={formatDateTime(order.dispatchedAt)} /> : null}
          {order.deliveredAt ? <DetailRow label="Delivered" value={formatDateTime(order.deliveredAt)} /> : null}
          {order.notes ? <Text style={styles.body}>Notes: {order.notes}</Text> : null}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Items</SectionTitle>
        <Card>
          {order.items.map((item, index) => (
            <View key={item.id} style={styles.block}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.item}>
                <View style={styles.itemText}>
                  <Text style={styles.strong}>{item.productName}</Text>
                  <Text style={styles.muted}>
                    SKU {item.sku} · {quantityWithUnit(item.quantity, item.uom)} × {formatMoney(item.unitPrice)} excl.
                    VAT
                  </Text>
                </View>
                <View style={styles.itemTotal}>
                  <Text style={styles.strong}>{formatMoney(item.lineTotal)}</Text>
                  <Text style={styles.muted}>incl. VAT</Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Summary</SectionTitle>
        <Card>
          <DetailRow label="Subtotal (excl. VAT)" value={formatMoney(order.subtotal)} />
          {hasDiscount ? <DetailRow label="Discount" value={`−${formatMoney(order.discountTotal)}`} /> : null}
          <DetailRow
            label="Delivery"
            value={freeDelivery ? 'Free' : formatMoney(order.deliveryFee)}
            valueTone={freeDelivery ? 'success' : undefined}
          />
          <DetailRow label={`VAT (${order.vatRateBps / 100}%)`} value={formatMoney(order.vatAmount)} />
          <Divider />
          <DetailRow label="Total" value={formatMoney(order.totalAmount)} emphasis />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Payment</SectionTitle>
        <Card>
          <View style={styles.summaryTop}>
            <Text style={[styles.strong, styles.summaryText]}>
              {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : 'Not specified'}
            </Text>
            <Badge label={PAYMENT_STATUS_LABELS[order.paymentStatus]} tone={PAYMENT_STATUS_TONES[order.paymentStatus]} />
          </View>
          {order.paidAt ? <DetailRow label="Paid" value={formatDateTime(order.paidAt)} /> : null}
        </Card>
      </View>

      {events.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle>Timeline</SectionTitle>
          <Card>
            {events.map((event, index) => (
              <View key={event.id} style={styles.event}>
                <View style={styles.eventRail}>
                  <View style={[styles.eventDot, index === 0 && styles.eventDotLatest]} />
                  {index < events.length - 1 ? <View style={styles.eventLine} /> : null}
                </View>
                <View style={styles.eventText}>
                  <Text style={styles.strong}>{ORDER_STATUS_LABELS[event.toStatus]}</Text>
                  <Text style={styles.muted}>{formatDateTime(event.createdAt)}</Text>
                  {event.note ? <Text style={styles.body}>{event.note}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {order.canCancel ? <CancelOrder orderId={order.id} onCancelled={onUpdated} /> : null}
    </ScrollView>
  );
}

function ProgressTracker({ order }: { order: OrderDto }) {
  // Orders paid on delivery skip "Pending payment"; only show that step when the order used it.
  const steps = ORDER_PROGRESS.filter(
    (status) =>
      status !== 'PENDING_PAYMENT' ||
      order.status === 'PENDING_PAYMENT' ||
      order.events.some((event) => event.toStatus === 'PENDING_PAYMENT'),
  );
  const currentIndex = steps.indexOf(order.status);

  return (
    <View>
      {steps.map((status, index) => {
        const done = currentIndex >= 0 && index <= currentIndex;
        const current = index === currentIndex;
        const reached = reachedAt(order, status);
        return (
          <View
            key={status}
            style={styles.step}
            accessible
            accessibilityLabel={`${ORDER_STATUS_LABELS[status]}, ${current ? 'current step' : done ? 'completed' : 'not reached yet'}`}>
            <View style={styles.stepRail}>
              <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                {done ? <Text style={styles.stepCheck}>✓</Text> : null}
              </View>
              {index < steps.length - 1 ? (
                <View style={[styles.stepLine, index < currentIndex && styles.stepLineDone]} />
              ) : null}
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{ORDER_STATUS_LABELS[status]}</Text>
              {done && reached ? <Text style={styles.muted}>{formatDateTime(reached)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function reachedAt(order: OrderDto, status: OrderStatus): string | null {
  const times = order.events
    .filter((event) => event.toStatus === status)
    .map((event) => event.createdAt)
    .sort();
  const fromEvents = times.length > 0 ? times[times.length - 1] : undefined;
  if (fromEvents) return fromEvents;
  if (status === 'CONFIRMED') return order.confirmedAt;
  if (status === 'DISPATCHED') return order.dispatchedAt;
  if (status === 'DELIVERED') return order.deliveredAt;
  return null;
}

function CancelOrder({ orderId, onCancelled }: { orderId: string; onCancelled: (order: OrderDto) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = async (input: CancelOrderInput) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const updated = await api<OrderDto>(`/me/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        auth: true,
        body: input,
      });
      onCancelled(updated);
    } catch (error) {
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  const confirm = () => {
    if (submitting) return;
    const parsed = cancelOrderSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? 'Tell us why the order is being cancelled');
      return;
    }
    setReasonError(undefined);
    if (Platform.OS === 'web') {
      void send(parsed.data);
      return;
    }
    Alert.alert('Cancel this order?', 'This cannot be undone.', [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => void send(parsed.data) },
    ]);
  };

  if (!open) {
    return <Button label="Cancel order" variant="secondary" onPress={() => setOpen(true)} fullWidth />;
  }

  return (
    <Card>
      <Text style={styles.strong}>Cancel this order</Text>
      <Text style={styles.body}>Orders can be cancelled until our warehouse starts preparing them.</Text>
      {formError ? <InlineError message={formError} /> : null}
      <TextField
        label="Reason for cancelling"
        value={reason}
        onChangeText={setReason}
        error={reasonError}
        placeholder="e.g. Ordered the wrong size"
        multiline
        maxLength={500}
      />
      <Button label="Cancel order" variant="danger" onPress={confirm} loading={submitting} fullWidth />
      <Button label="Keep order" variant="secondary" onPress={() => setOpen(false)} disabled={submitting} fullWidth />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  block: {
    gap: 4,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  orderNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.navy,
  },
  strong: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.text,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textMuted,
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textSubtle,
  },
  cancelledCard: {
    backgroundColor: Brand.dangerTint,
    borderColor: '#FECACA',
    gap: 4,
  },
  cancelledTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.danger,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTotal: {
    alignItems: 'flex-end',
  },
  step: {
    flexDirection: 'row',
    gap: 12,
  },
  stepRail: {
    alignItems: 'center',
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Brand.borderStrong,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    borderColor: Brand.blueInk,
    backgroundColor: Brand.blueInk,
  },
  stepDotCurrent: {
    borderColor: Brand.navy,
    backgroundColor: Brand.navy,
  },
  stepCheck: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepLine: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: Brand.border,
  },
  stepLineDone: {
    backgroundColor: Brand.blueInk,
  },
  stepText: {
    flex: 1,
    paddingBottom: 16,
    gap: 2,
  },
  stepLabel: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textSubtle,
  },
  stepLabelDone: {
    fontWeight: '600',
    color: Brand.text,
  },
  event: {
    flexDirection: 'row',
    gap: 12,
  },
  eventRail: {
    alignItems: 'center',
    paddingTop: 5,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Brand.borderStrong,
  },
  eventDotLatest: {
    backgroundColor: Brand.blue,
  },
  eventLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: Brand.border,
  },
  eventText: {
    flex: 1,
    paddingBottom: 14,
    gap: 2,
  },
});
