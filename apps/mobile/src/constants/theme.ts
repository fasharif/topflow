/**
 * Top Flow brand palette. The app renders a light UI (see `userInterfaceStyle` in app.json).
 * Text colours are chosen for WCAG AA contrast on `surface` and `canvas`.
 */
export const Brand = {
  navy: '#0A192F',
  navyMuted: '#1E3A5F',
  /** Brand blue — accents, icons, selection outlines (non-text UI, ≥ 3:1). */
  blue: '#0284C7',
  /** Darker brand blue for text and filled buttons with white labels (≥ 4.5:1). */
  blueInk: '#0369A1',
  blueTint: '#E0F2FE',
  canvas: '#F6F9FC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#475569',
  /** Tertiary text — use on `surface` only. */
  textSubtle: '#64748B',
  placeholder: '#94A3B8',
  success: '#047857',
  successTint: '#D1FAE5',
  warning: '#B45309',
  warningTint: '#FEF3C7',
  danger: '#B91C1C',
  dangerTint: '#FEE2E2',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Minimum touch target size (Apple HIG 44 pt; Material recommends 48 dp). */
export const TouchTarget = 44;
