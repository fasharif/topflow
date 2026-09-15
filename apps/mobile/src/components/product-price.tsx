import { formatMoney, type ProductDto } from '@topflow/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { formatMoneyRange, perUnit } from '@/lib/format';

/**
 * A product's VAT-inclusive price. With a catalogue price range, the approximate range leads,
 * followed by the online (checkout) price and an invitation to request a quote. Without a range,
 * only the online price is shown.
 */
export function ProductPrice({
  product,
  variant,
}: {
  product: Pick<ProductDto, 'retailPrice' | 'priceRange' | 'uom'>;
  /** `card` for the product grid, `detail` for the product page. */
  variant: 'card' | 'detail';
}) {
  const large = variant === 'detail';
  const unit = perUnit(product.uom);
  const range = product.priceRange;

  if (!range) {
    return (
      <View>
        <Text style={[styles.amount, large && styles.amountLarge]}>{formatMoney(product.retailPrice)}</Text>
        <Text style={[styles.caption, large && styles.captionLarge]}>
          {large ? 'incl. 5% VAT' : 'incl. VAT'} · {unit}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.rangeBlock}>
      <View>
        <Text style={[styles.amount, large && styles.amountLarge]}>
          {formatMoneyRange(range.retailMin, range.retailMax)}
        </Text>
        <Text style={[styles.caption, large && styles.captionLarge]}>Approx. price incl. VAT · {unit}</Text>
      </View>
      <Text style={[styles.online, large && styles.onlineLarge]}>
        {'Buy online at '}
        <Text style={styles.onlinePrice}>{formatMoney(product.retailPrice)}</Text>
        {' · or request a quote for your best price'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rangeBlock: {
    gap: 4,
  },
  amount: {
    fontSize: 17,
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
  online: {
    fontSize: 12,
    lineHeight: 16,
    color: Brand.textMuted,
  },
  onlineLarge: {
    fontSize: 14,
    lineHeight: 20,
  },
  onlinePrice: {
    fontWeight: '700',
    color: Brand.text,
    fontVariant: ['tabular-nums'],
  },
});
