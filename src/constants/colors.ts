/**
 * Check Before Buy — Design Tokens
 *
 * Dark navy premium color system.
 * All UI should reference these constants instead of raw hex values.
 */

export const Colors = {
  // ── Backgrounds ─────────────────────────────────────────
  // Two navigation-depth tiers, not a free color choice: `background` is the
  // root/tab level (Home, My Home, Saved, Profile). `backgroundElevated` is
  // used one level deeper (a room, a flow step, a detail screen) together
  // with stronger header/card treatment, so drilling into the app reads as
  // going somewhere rather than four identical screens.
  background: '#0B1220',
  backgroundElevated: '#0F172A',
  surface: '#111C2E',
  surface2: '#162238',
  surfaceRaised: '#1A2840',

  // ── Borders ─────────────────────────────────────────────
  border: '#24344D',
  borderSubtle: '#1B2A40',

  // ── Text ────────────────────────────────────────────────
  textPrimary: '#F0F4FF',
  textSecondary: '#8B98AA',
  textMuted: '#556070',
  textInverse: '#0B1220',

  // ── Accent ──────────────────────────────────────────────
  accent: '#4F8CFF',
  accentDim: '#1E3A6E',
  accentText: '#7AAEFF',

  // ── Semantic ─────────────────────────────────────────────
  success: '#34C78A',
  successDim: '#0E3D28',
  successText: '#5DD9A4',

  warning: '#F5A623',
  warningDim: '#3D2A0A',
  warningText: '#F7BB5A',

  danger: '#E05252',
  dangerDim: '#3D1010',
  dangerText: '#E87070',

  // ── White/Highlight card (main CTA) ──────────────────────
  cardHighlight: '#FFFFFF',
  cardHighlightText: '#0B1220',
  cardHighlightTextMuted: '#556070',

  // ── Home (bright variant) ─────────────────────────────────
  // Additive only — used exclusively by the Home screen, which wants a
  // noticeably brighter/more energetic foundation than the rest of the app.
  // Every other screen keeps using the tokens above untouched.
  homeBackground: '#101B30',
  homeSurface: '#1B2B4A',
  homeSurfaceRaised: '#22355C',
  homeBorder: '#33487A',

  homeAccent: '#3D82F7',
  homeAccentDim: '#1D3B6E',
  homeAccentText: '#8FC0FF',

  homeCyan: '#38D6E0',
  homeCyanDim: '#123A44',
  homeCyanText: '#7FEAF0',

  // ── Check Product (icy blue variant) ───────────────────────
  // Additive only — used exclusively by the Check Product screen, which
  // wants a lighter/icier blue feel than the rest of the app. No existing
  // token above is modified, so every other screen is unaffected.
  checkBackground: '#0E1B30',
  checkSurface: '#1A2C4C',
  checkSurfaceRaised: '#223A63',
  checkBorder: '#3C5680',

  // Refined toward a calmer, less-saturated "icy" blue (was a brighter
  // cyan-leaning tone) — premium/trustworthy rather than neon or electric.
  checkAccent: '#6FADE8',
  checkAccentDim: '#15304A',
  checkAccentText: '#B4D9F7',
} as const;

export type ColorKey = keyof typeof Colors;
