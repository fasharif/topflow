import { Brand } from '@/constants/theme';

/** Header styling shared by every native stack in the app. */
export const stackScreenOptions = {
  headerTintColor: Brand.navy,
  headerTitleStyle: { fontWeight: '600', color: Brand.navy },
  headerStyle: { backgroundColor: Brand.surface },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: Brand.canvas },
} as const;
