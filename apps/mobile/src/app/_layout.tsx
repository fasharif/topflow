import { DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { stackScreenOptions } from '@/constants/navigation';
import { Brand, TouchTarget } from '@/constants/theme';
import { hydrateCart } from '@/lib/cart';
import { routes } from '@/lib/routes';
import { bootstrapSession, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

/** Longest the splash stays up while the previous session is restored on a slow network. */
const SPLASH_TIMEOUT_MS = 2500;

export const unstable_settings = {
  // Deep links to a product or a modal still get the tabs underneath them.
  anchor: '(tabs)',
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Brand.blueInk,
    background: Brand.canvas,
    card: Brand.surface,
    text: Brand.navy,
    border: Brand.border,
    notification: Brand.blue,
  },
};

export default function RootLayout() {
  const { status } = useSession();

  useEffect(() => {
    void bootstrapSession();
    void hydrateCart();
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[slug]" options={{ title: 'Product details' }} />
        <Stack.Screen
          name="login"
          options={{ presentation: 'modal', title: 'Sign in', headerRight: modalCloseButton }}
        />
        <Stack.Screen
          name="register"
          options={{ presentation: 'modal', title: 'Create account', headerRight: modalCloseButton }}
        />
        <Stack.Screen
          name="quote-request"
          options={{ presentation: 'modal', title: 'Request a quote', headerRight: modalCloseButton }}
        />
      </Stack>
    </ThemeProvider>
  );
}

/** iOS sheets have no back button; Android keeps its header back arrow and system back. */
const modalCloseButton = Platform.OS === 'ios' ? () => <CloseButton /> : undefined;

function CloseButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(routes.shop))}
      style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
      <Text style={styles.closeText}>Close</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  close: {
    minHeight: TouchTarget,
    minWidth: TouchTarget,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    opacity: 0.6,
  },
  closeText: {
    fontSize: 17,
    fontWeight: '600',
    color: Brand.blueInk,
  },
});
