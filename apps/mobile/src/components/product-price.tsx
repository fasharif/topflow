import { formatMoney, UOM_LABELS, type ProductDto } from '@topflow/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { formatApproxPrice, priceAccessibilityLabel } from '@/lib/format';

/**
 * A product's consumer price including VAT, laid out like the web storefront. With a catalogue price
 * range: "Approx. price", "≈ AED 22.05 – 30.45", "per pc · incl. VAT" and an invitation to request a
 * quote. Without a range: the online price.
 */
export function ProductPrice({
  product,
  variant,
}: {
  product: Pick<ProductDto, 'retailPrice' | 'priceRange' | 'uom'>;
  /** `card` for the product grid (read as part of the card), `detail` for the product page. */
  variant: 'card' | 'detail';
}) {
  const large = variant === 'detail';
  const range = product.priceRange;

  return (
    <View style={styles.block}>
      <View accessible={large} accessibilityLabel={large ? priceAccessibilityLabel(product) : undefined}>
        {range ? <Text style={[styles.eyebrow, large && styles.eyebrowLarge]}>Approx. price</Text> : null}
        <Text style={[styles.amount, large && styles.amountLarge]}>
          {range ? formatApproxPrice(range.retailMin, range.retailMax) : formatMoney(product.retailPrice)}
        </Text>
        <Text style={[styles.caption, large && styles.captionLarge]}>
          per {UOM_LABELS[product.uom]} · incl. VAT
        </Text>
      </View>
      {range ? <Text style={[styles.note, large && styles.noteLarge]}>Request a quote for your best price</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Brand.textSubtle,
  },
  eyebrowLarge: {
    fontSize: 12,
    marginBottom: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.navy,
    fontVariant: ['tabular-nums'],
  },
  amountLarge: {
    fontSize: 28,
    fontWeight: '800',
  },
  caption: {
    fontSize: 12,
    color: Brand.textSubtle,
  },
  captionLarge: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  note: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: Brand.blueInk,
  },
  noteLarge: {
    fontSize: 14,
    lineHeight: 20,
  },
});
