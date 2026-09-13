import { formatMoney, type ProductDto } from '@topflow/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brand, Radius } from '@/constants/theme';
import { addToCart, useCartQuantity } from '@/lib/cart';
import { canPurchase, perUnit, quantityWithUnit, stockInfo } from '@/lib/format';
import { errorMessage } from '@/lib/http';
import { routes } from '@/lib/routes';

export function ProductThumbnail({ product, size }: { product: Pick<ProductDto, 'imageUrl' | 'name'>; size: number }) {
  return (
    <View style={[styles.thumb, { height: size }]}>
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={styles.thumbInitial} accessibilityElementsHidden importantForAccessibility="no">
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
        accessibilityLabel={`${product.name}, ${formatMoney(product.retailPrice)} including VAT, ${stock.label}`}
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
          <Text style={styles.price}>{formatMoney(product.retailPrice)}</Text>
          <Text style={styles.priceNote}>incl. VAT · {perUnit(product.uom)}</Text>
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
    padding: 12,
    gap: 6,
  },
  pressed: {
    backgroundColor: '#F8FAFC',
  },
  thumb: {
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  thumbInitial: {
    fontSize: 34,
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
  price: {
    fontSize: 17,
    fontWeight: '700',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  priceNote: {
    fontSize: 12,
    color: Brand.textSubtle,
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
