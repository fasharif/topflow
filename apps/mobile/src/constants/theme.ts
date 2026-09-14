/**
 * Top Flow brand palette, matched to topflow.ae: warm cream canvas, white surfaces, a deep green
 * accent and green-black ink. The app renders a light UI (see `userInterfaceStyle` in app.json).
 *
 * Key names predate the green palette and are kept so imports stay stable: `navy` is the brand ink
 * and `blue` / `blueInk` / `blueTint` are the brand accent. Text colours meet WCAG AA (≥ 4.5:1) on
 * `surface`, `canvas`, `surfaceMuted` and `blueTint`; white labels on `blueInk`, `navy` and `danger`
 * do too.
 */
export const Brand = {
  /** Brand ink (deep green-black): headings, prices, selected chips. 16.7:1 on white. */
  navy: '#12211B',
  navyMuted: '#24372F',
  /** Brand accent (deep green): icons, spinners, selection outlines. 9.8:1 on white. */
  blue: '#014D41',
  /** Accent for text and for filled buttons with white labels. 9.8:1 with white. */
  blueInk: '#014D41',
  /** Accent tint: pressed and selected backgrounds, info badges. */
  blueTint: '#E3EFEC',
  canvas: '#FAF8F3',
  surface: '#FFFFFF',
  /** Warm neutral fill: pressed rows and cards, neutral badges. */
  surfaceMuted: '#F3F0E8',
  border: '#E4DFD2',
  borderStrong: '#CFC8B6',
  text: '#12211B',
  /** Secondary text: ≥ 6:1 on every background above. */
  textMuted: '#4A5A53',
  /** Tertiary text: ≥ 4.7:1 on `surface`, `canvas`, `surfaceMuted` and `blueTint`. */
  textSubtle: '#5E6B65',
  /** Input placeholders only (3:1 on `surface`), never for content. */
  placeholder: '#8C958F',
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
