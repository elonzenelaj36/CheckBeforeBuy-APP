/**
 * Check Before Buy — Design Tokens
 *
 * Dark navy premium color system.
 * All UI should reference these constants instead of raw hex values.
 */

export const Colors = {
  // ── Backgrounds ─────────────────────────────────────────
  background: '#0B1220',
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
} as const;

export type ColorKey = keyof typeof Colors;
