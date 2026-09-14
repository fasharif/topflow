import {
  formatMoney,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type OrderSummaryDto,
  type Paginated,
} from '@topflow/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/states';
import { Brand, Radius } from '@/constants/theme';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { api } from '@/lib/api';
import { formatDateTime, orderStatusTone, pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useSession } from '@/lib/session';

const PAGE_SIZE = 20;

const orderKey = (order: OrderSummaryDto) => order.id;
const fetchOrders = (page: number) =>
  api<Paginated<OrderSummaryDto>>('/me/orders', { auth: true, query: { page, pageSize: PAGE_SIZE } });

export default function OrdersScreen() {
  const session = useSession();

  if (session.status === 'loading') return <LoadingState />;
  if (!session.user) {
    return (
      <EmptyState
        title="Sign in to see your orders"
        message="Track deliveries, check order totals and cancel orders that have not been processed yet."
        action={<Button label="Sign in" onPress={() => router.push(routes.login)} />}
      />
    );
  }
  // Keyed by user so a different account never sees the previous account's list.
  return <OrderList key={session.user.id} />;
}

function OrderList() {
  const orders = usePaginatedList(fetchOrders, orderKey);
  const { refresh } = orders;
  const hasFocused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // The first focus is the initial load; afterwards refresh quietly (e.g. after checkout or a cancellation).
      if (hasFocused.current) void refresh({ silent: true });
      hasFocused.current = true;
    }, [refresh]),
  );

  const renderEmpty = () => {
    if (orders.loading) return <LoadingState label="Loading your orders…" />;
    if (!orders.loaded && orders.error) {
      return (
        <ErrorState
          title="Could not load your orders"
          message={orders.error}
          onRetry={() => void refresh()}
          retrying={orders.refreshing}
        />
      );
    }
    return (
      <EmptyState
        title="No orders yet"
        message="When you place an order it will appear here so you can follow its progress."
        action={<Button label="Start shopping" onPress={() => router.navigate(routes.shop)} />}
      />
    );
  };

  return (
    <FlatList
      data={orders.items}
      keyExtractor={orderKey}
      renderItem={({ item }) => <OrderRow order={item} />}
      contentContainerStyle={styles.listContent}
      contentInsetAdjustmentBehavior="automatic"
      onEndReached={orders.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={orders.refreshing && orders.loaded}
          onRefresh={() => void refresh()}
          tintColor={Brand.blue}
          colors={[Brand.blue]}
        />
      }
      ListHeaderComponent={orders.loaded && orders.error ? <InlineError message={orders.error} /> : null}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={
        orders.loadingMore ? (
          <ActivityIndicator style={styles.footerSpinner} color={Brand.blue} />
        ) : orders.hasMore && orders.error ? (
          <Button label="Load more orders" variant="secondary" onPress={orders.loadMore} />
        ) : null
      }
    />
  );
}

function OrderRow({ order }: { order: OrderSummaryDto }) {
  const status = ORDER_STATUS_LABELS[order.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.orderNumber}, ${status}, ${formatMoney(order.totalAmount)}`}
      accessibilityHint="Opens order details"
      onPress={() => router.push(routes.order(order.id))}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowTop}>
        <Text style={styles.orderNumber} numberOfLines={1}>
          {order.orderNumber}
        </Text>
        <Badge label={status} tone={orderStatusTone(order.status)} />
      </View>
      <Text style={styles.date}>Placed {formatDateTime(order.createdAt)}</Text>
      <View style={styles.rowBottom}>
        <Text style={styles.meta}>
          {pluralize(order.itemCount, 'item')} · {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </Text>
        <Text style={styles.total}>{formatMoney(order.totalAmount)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  row: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 16,
    gap: 6,
  },
  rowPressed: {
    backgroundColor: Brand.surfaceMuted,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderNumber: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  date: {
    fontSize: 13,
    color: Brand.textSubtle,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: 14,
    color: Brand.textMuted,
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  footerSpinner: {
    paddingVertical: 16,
  },
});
