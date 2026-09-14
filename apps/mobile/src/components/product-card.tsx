import type { ProductDto } from '@topflow/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProductPrice } from '@/components/product-price';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brand, Radius } from '@/constants/theme';
import { resolveImageUrl } from '@/lib/assets';
import { addToCart, useCartQuantity } from '@/lib/cart';
import { canPurchase, priceAccessibilityLabel, quantityWithUnit, stockInfo } from '@/lib/format';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';

/**
 * A product photo shown whole (`contain`) on white, as catalogue photos are shot on white. Falls back
 * to the product's initial when there is no photo, its URL cannot be resolved (see
 * `resolveImageUrl`) or it fails to load.
 */
export function ProductThumbnail({
  product,
  size,
  style,
}: {
  product: Pick<ProductDto, 'imageUrl' | 'name'>;
  /** Height in points. The width follows the container unless `style` sets one. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const resolved = resolveImageUrl(product.imageUrl);
  const uri = resolved !== failedUri ? resolved : null;

  return (
    <View style={[styles.thumb, !uri && styles.thumbPlaceholder, { height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          onError={() => setFailedUri(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[styles.thumbInitial, { fontSize: Math.min(34, Math.round(size * 0.4)) }]}
          accessibilityElementsHidden
          importantForAccessibility="no">
          {product.name.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export function ProductCard({ product, style }: { product: ProductDto; style?: StyleProp<ViewStyle> }) {
  const inCart = useCartQuantity(product.id);
  const stock = stockInfo(product);
  const purchasable = canPurchase(product);
  const meta = [product.sku, product.brand].filter(Boolean).join(' · ');

  const handleAdd = () => {
    try {
      addToCart(product);
    } catch (error) {
      Alert.alert('Could not add to cart', errorMessage(error));
    }
  };

  return (
    <View style={[styles.card, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${priceAccessibilityLabel(product)}, ${stock.label}`}
        accessibilityHint="Opens product details"
        onPress={() => router.push(routes.product(product.slug))}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <ProductThumbnail product={product} size={112} />
        <Badge label={stock.label} tone={stock.tone} />
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        <View style={styles.priceBlock}>
          <ProductPrice product={product} variant="card" />
        </View>
      </Pressable>

      <View style={styles.footer}>
        {inCart > 0 ? (
          <Text style={styles.inCart} numberOfLines={1}>
            ✓ {quantityWithUnit(inCart, product.uom)} in cart
          </Text>
        ) : product.minOrderQty > 1 ? (
          <Text style={styles.moq} numberOfLines={1}>
            Min. order {quantityWithUnit(product.minOrderQty, product.uom)}
          </Text>
        ) : null}
        <Button
          label={!purchasable ? 'Unavailable' : inCart > 0 ? 'Add 1 more' : 'Add to cart'}
          accessibilityLabel={inCart > 0 ? `Add one more ${product.name}` : `Add ${product.name} to cart`}
          variant={inCart > 0 ? 'secondary' : 'primary'}
          size="sm"
          disabled={!purchasable}
          onPress={handleAdd}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
  },
  body: {
    // Cards in a grid row share the tallest card's height; keep the footers aligned.
    flexGrow: 1,
    padding: 12,
    gap: 6,
  },
  pressed: {
    backgroundColor: Brand.surfaceMuted,
  },
  thumb: {
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  thumbPlaceholder: {
    backgroundColor: Brand.blueTint,
  },
  thumbInitial: {
    fontWeight: '700',
    color: Brand.blue,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Brand.navy,
    minHeight: 40,
  },
  meta: {
    fontSize: 12,
    color: Brand.textSubtle,
  },
  priceBlock: {
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  inCart: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.success,
  },
  moq: {
    fontSize: 12,
    color: Brand.textSubtle,
  },
});
