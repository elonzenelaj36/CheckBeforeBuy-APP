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

  // ── My Home (soft aqua / mint-blue variant) ────────────────
  // Additive only — used exclusively by the My Home / Add Room / Room Detail
  // flow, which wants its own calm, personal "home" identity distinct from
  // Home's vivid blue and Check Product's icy blue. Background/surfaces stay
  // deep navy (not green) — only the accent family carries the aqua/mint hue.
  // Lightened as a family (background raised the most) so the screen reads
  // as a softer blue-gray rather than near-black, while keeping the same
  // relative contrast steps between background → surface → surfaceRaised.
  myHomeBackground: '#182A3A',
  myHomeSurface: '#223648',
  myHomeSurfaceRaised: '#2A4052',
  myHomeBorder: '#365062',

  myHomeAccent: '#5ED6C4',
  myHomeAccentDim: '#12332E',
  myHomeAccentText: '#A6EDE0',

  // ── Saved (soft lavender / violet-blue variant) ────────────
  // Additive only — used exclusively by the Saved screen. Background/
  // surfaces stay on the same blue foundation as the rest of the app
  // (not purple) — only the accent family carries the lavender hue, kept
  // soft/desaturated rather than neon purple or magenta.
  savedBackground: '#17233A',
  savedSurface: '#202D4A',
  savedSurfaceRaised: '#28375A',
  savedBorder: '#3A4568',

  savedAccent: '#ACA3F2',
  savedAccentDim: '#241F3D',
  savedAccentText: '#D3CDFA',

  // ── Light theme (Home, Check Product, Saved, My Home, Room) ───
  // Additive only — the dark navy system above stays exactly as-is for
  // every screen not explicitly migrated to these tokens (Profile,
  // History, Search, Recommendations, the product-detail/visualization
  // flow, etc).
  //
  // Depth ladder: same soft blue-gray family throughout, but each
  // navigation depth gets a fractionally darker background, mirroring the
  // dark theme's `background` → `backgroundElevated` idea above — just
  // within a light palette instead of a dark one, so drilling in
  // (Home → My Home → Room) still reads as going somewhere:
  //   tier 0 (root/tab level)  — Home, Check Product, Saved
  //   tier 1 (one level in)    — My Home hub
  //   tier 2 (two levels in)   — Room / Room Detail / Add Room
  //   tier 3 (three levels in) — Product Captured
  //   tier 4 (four levels in)  — Visualisation
  // Cards stay white and text stays dark navy at every tier — only the
  // page background steps down, and only by a few points of lightness, so
  // it stays "light + premium", never dark.
  lightBackground: '#EAF0F7',
  lightBackgroundElevated: '#E1E9F2',
  lightBackgroundDeep: '#D7E1EC',
  lightBackgroundDeeper: '#CDD9E6',
  lightBackgroundDeepest: '#C4D0DD',

  lightSurface: '#FFFFFF',
  lightSurfaceRaised: '#F1F5F9',
  lightBorder: '#E2E8F0',

  lightTextPrimary: '#0F172A',
  lightTextSecondary: '#64748B',
  lightTextMuted: '#94A3B8',
  // Stronger ladder for dense list areas (Recently Checked, History).
  lightTextStrong: '#0B1220',
  lightTextBody: '#334155',

  // Home + Check Product identity — refined blue.
  lightAccent: '#3B82F6',
  lightAccentDim: '#DBEAFE',
  lightAccentText: '#2563EB',

  lightCyan: '#38BDF8',
  lightCyanDim: '#E0F2FE',
  lightCyanText: '#0369A1',

  // My Home + Room + Add Room identity — soft aqua/mint-blue, kept from
  // the dark theme's `myHome*` family, just re-tuned for light surfaces.
  lightMyHomeAccent: '#14B8A6',
  lightMyHomeAccentDim: '#D9F5F0',
  lightMyHomeAccentText: '#0D9488',

  // Saved identity — soft lavender/violet-blue, kept from the dark
  // theme's `saved*` family, re-tuned for light surfaces.
  lightSavedAccent: '#8B7FE8',
  lightSavedAccentDim: '#EEECFB',
  lightSavedAccentText: '#6D5FD1',

  // Light-surface semantic banners — for standalone warning/danger/success
  // cards that sit directly on a light page (not an overlay on a photo,
  // where the existing dark-theme `warning*`/`danger*`/`success*` above
  // already read fine as-is). Borders reuse `Colors.warning`/`Colors.danger`/
  // `Colors.success` directly, which work unchanged on a light background.
  lightWarningBg: '#FFFBEB',
  lightWarningText: '#B45309',
  lightDangerBg: '#FEF2F2',
  lightDangerText: '#B91C1C',
  lightSuccessBg: '#F0FDF4',
  lightSuccessText: '#15803D',
} as const;

export type ColorKey = keyof typeof Colors;
