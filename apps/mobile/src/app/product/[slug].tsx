import { formatMoney, UOM_LABELS, type ProductDto } from '@topflow/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductThumbnail } from '@/components/product-card';
import { ProductPrice } from '@/components/product-price';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, DetailRow, SectionTitle } from '@/components/ui/card';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Brand } from '@/constants/theme';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { addToCart, MAX_LINE_QUANTITY, useCartQuantity } from '@/lib/cart';
import { canPurchase, perUnit, quantityWithUnit, stockInfo } from '@/lib/format';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';

export default function ProductDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const validSlug = typeof slug === 'string' && slug.length > 0 ? slug : null;

  const fetchProduct = useCallback(
    () => api<ProductDto>(`/catalog/products/${encodeURIComponent(validSlug ?? '')}`),
    [validSlug],
  );
  const product = useResource(validSlug ? fetchProduct : null);

  if (!validSlug) {
    return <ErrorState title="Product not found" message="This link is not valid." />;
  }
  if (product.loading) {
    return <LoadingState label="Loading product…" />;
  }
  if (!product.data) {
    return (
      <ErrorState
        title="Product unavailable"
        message={product.error ?? 'This product is no longer available.'}
        onRetry={() => void product.refresh()}
        retrying={product.refreshing}
      />
    );
  }

  return (
    <ProductDetail product={product.data} refreshing={product.refreshing} onRefresh={() => void product.refresh()} />
  );
}

function ProductDetail({
  product,
  refreshing,
  onRefresh,
}: {
  product: ProductDto;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  const inCart = useCartQuantity(product.id);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  const stock = stockInfo(product);
  const purchasable = canPurchase(product);
  const minimum = Math.max(1, product.minOrderQty);
  const maximum = Math.max(minimum, Math.min(MAX_LINE_QUANTITY, product.stockQuantity));
  const selected = Math.min(maximum, Math.max(minimum, quantity ?? minimum));
  const specifications = Object.entries(product.specifications ?? {});
  const unit = UOM_LABELS[product.uom];

  const handleAdd = () => {
    try {
      addToCart(product, selected);
      setAdded(selected);
    } catch (error) {
      Alert.alert('Could not add to cart', errorMessage(error));
    }
  };

  const handleRequestQuote = () => {
    try {
      // A quote covers the whole cart, so make sure this product is part of it.
      if (inCart === 0) addToCart(product, minimum);
      router.push(routes.quoteRequest);
    } catch (error) {
      Alert.alert('Could not add to cart', errorMessage(error));
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.blue} colors={[Brand.blue]} />
        }>
        <Card style={styles.imageCard}>
          <ProductThumbnail product={product} size={240} />
        </Card>

        <View style={styles.titleBlock}>
          <View style={styles.badges}>
            <Badge label={stock.label} tone={stock.tone} />
            {product.category ? <Badge label={product.category.name} tone="info" /> : null}
          </View>
          <Text style={styles.name} accessibilityRole="header">
            {product.name}
          </Text>
          <Text style={styles.meta}>
            {[product.brand, `SKU ${product.sku}`].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <Card>
          <ProductPrice product={product} variant="detail" />
          <Button
            label="Request a quote"
            variant="secondary"
            accessibilityHint={
              inCart > 0
                ? 'Opens the quote request form for the products in your cart'
                : `Adds ${quantityWithUnit(minimum, product.uom)} to your cart and opens the quote request form`
            }
            onPress={handleRequestQuote}
            fullWidth
          />
          <DetailRow
            label={product.priceRange ? 'Online price excl. VAT' : 'Price excl. VAT'}
            value={`${formatMoney(product.unitPrice)} ${perUnit(product.uom)}`}
          />
          <DetailRow
            label="Availability"
            value={
              product.stockQuantity > 0
                ? `${quantityWithUnit(product.stockQuantity, product.uom)} available`
                : stock.label
            }
          />
          <DetailRow label="Minimum order" value={quantityWithUnit(minimum, product.uom)} />
          <DetailRow label="Sold per" value={unit} />
        </Card>

        {product.description ? (
          <View style={styles.section}>
            <SectionTitle>Description</SectionTitle>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        ) : null}

        {specifications.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle>Specifications</SectionTitle>
            <Card style={styles.specCard}>
              {specifications.map(([key, value], index) => (
                <View key={key} style={[styles.specRow, index > 0 && styles.specRowDivider]}>
                  <Text style={styles.specLabel}>{key}</Text>
                  <Text style={styles.specValue}>{formatSpecification(value)}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {added !== null ? (
          <View style={styles.addedRow} accessibilityLiveRegion="polite">
            <Text style={styles.addedText}>
              ✓ Added {quantityWithUnit(added, product.uom)} · {quantityWithUnit(inCart, product.uom)} in cart
            </Text>
            <Button label="View cart" variant="ghost" size="sm" onPress={() => router.navigate(routes.cart)} />
          </View>
        ) : !purchasable ? (
          <Text style={styles.unavailable}>
            Not enough stock to meet the minimum order right now. Request a quote or check back soon.
          </Text>
        ) : null}
        <View style={styles.actionRow}>
          <QuantityStepper
            value={selected}
            min={minimum}
            max={maximum}
            unit={unit}
            itemName={product.name}
            disabled={!purchasable}
            onChange={(next) => {
              setQuantity(next);
              setAdded(null);
            }}
          />
          <Button
            label={inCart > 0 ? 'Add more' : 'Add to cart'}
            accessibilityLabel={`Add ${quantityWithUnit(selected, product.uom)} of ${product.name} to cart`}
            onPress={handleAdd}
            disabled={!purchasable}
            style={styles.addButton}
          />
        </View>
      </View>
    </View>
  );
}

function formatSpecification(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.canvas,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  imageCard: {
    padding: 8,
  },
  titleBlock: {
    gap: 6,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  name: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: Brand.navy,
  },
  meta: {
    fontSize: 14,
    color: Brand.textMuted,
  },
  section: {
    gap: 8,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.text,
  },
  specCard: {
    paddingVertical: 4,
    gap: 0,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
  },
  specRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderStrong,
  },
  specLabel: {
    flex: 1,
    fontSize: 14,
    color: Brand.textMuted,
  },
  specValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.text,
    textAlign: 'right',
  },
  actionBar: {
    backgroundColor: Brand.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.borderStrong,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  addedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Brand.success,
  },
  unavailable: {
    fontSize: 14,
    color: Brand.warning,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    flex: 1,
  },
});
