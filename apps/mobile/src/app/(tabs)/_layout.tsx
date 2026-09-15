import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { Brand } from '@/constants/theme';
import { useCartLineCount } from '@/lib/cart';

export default function TabsLayout() {
  const cartCount = useCartLineCount();

  return (
    <NativeTabs
      tintColor={Brand.blue}
      iconColor={{ default: Brand.textSubtle, selected: Brand.blue }}
      labelStyle={{
        default: { color: Brand.textMuted },
        selected: { color: Brand.blueInk, fontWeight: '600' },
      }}
      badgeBackgroundColor={Brand.blueInk}
      backgroundColor={Platform.OS === 'android' ? Brand.surface : undefined}
      indicatorColor={Brand.blueTint}
      labelVisibilityMode="labeled"
      // Screens use FlatList, whose scroll-edge detection is unreliable with native tabs.
      disableTransparentOnScrollEdge>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bag.fill" md="shopping_bag" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="cart">
        <NativeTabs.Trigger.Label>Cart</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="cart.fill" md="shopping_cart" />
        {cartCount > 0 ? (
          <NativeTabs.Trigger.Badge>{cartCount > 99 ? '99+' : String(cartCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox.fill" md="receipt_long" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
