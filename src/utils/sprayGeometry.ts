import type { AtBatResult } from '../types/game';
import { Colors } from '../constants/theme';

// ── SVG Canvas ────────────────────────────────────────────────────────────────
export const SVG_W = 280;
export const SVG_H = 280;
export const HP_X  = SVG_W / 2;  // 140 — home plate X
export const HP_Y  = SVG_H - 20; // 260 — home plate Y

// ── Field Scale ───────────────────────────────────────────────────────────────
// MAX_R px = outfield fence (~330 ft display radius)
export const MAX_R      = 175;
export const PX_PER_FT  = MAX_R / 330;

// ── Diamond geometry (exact baseball dimensions) ──────────────────────────────
export const SIN45      = Math.sin(Math.PI / 4); // 0.7071
export const BASE_PX    = 90 * PX_PER_FT;                  // ≈47.7 px  (90 ft base path)
export const SECOND_PX  = 90 * Math.SQRT2 * PX_PER_FT;     // ≈67.5 px  (diagonal to 2B)
export const MOUND_PX   = 60.5 * PX_PER_FT;                // ≈32.1 px  (60.5 ft to mound)

// Key positions (computed once at module load)
export const FIRST  = { x: HP_X + BASE_PX * SIN45, y: HP_Y - BASE_PX * SIN45 };
export const SECOND = { x: HP_X,                   y: HP_Y - SECOND_PX };
export const THIRD  = { x: HP_X - BASE_PX * SIN45, y: HP_Y - BASE_PX * SIN45 };
export const MOUND  = { x: HP_X,                   y: HP_Y - MOUND_PX };

// Foul-line endpoints at MAX_R from home (±45° from straight-up)
export const LEFT_FOUL  = { x: HP_X - MAX_R * SIN45, y: HP_Y - MAX_R * SIN45 };
export const RIGHT_FOUL = { x: HP_X + MAX_R * SIN45, y: HP_Y - MAX_R * SIN45 };

// ── SVG Paths ─────────────────────────────────────────────────────────────────
// Outfield sector: home → left foul end → 90° arc → right foul end → home
export const outfieldPath = [
  `M ${HP_X} ${HP_Y}`,
  `L ${LEFT_FOUL.x.toFixed(1)} ${LEFT_FOUL.y.toFixed(1)}`,
  // A rx ry x-rot large-arc sweep x y  (sweep=1 → CW → arc curves away from home)
  `A ${MAX_R} ${MAX_R} 0 0 1 ${RIGHT_FOUL.x.toFixed(1)} ${RIGHT_FOUL.y.toFixed(1)}`,
  'Z',
].join(' ');

// Infield diamond: home → 1B → 2B → 3B → home
export const diamondPath = [
  `M ${HP_X} ${HP_Y}`,
  `L ${FIRST.x.toFixed(1)} ${FIRST.y.toFixed(1)}`,
  `L ${SECOND.x.toFixed(1)} ${SECOND.y.toFixed(1)}`,
  `L ${THIRD.x.toFixed(1)} ${THIRD.y.toFixed(1)}`,
  'Z',
].join(' ');

// ── Coordinate transform ──────────────────────────────────────────────────────
// fieldX : 0 = left foul line · 0.5 = center · 1 = right foul line
// fieldY : 0 = deep outfield  · 1 = home plate
export function fieldToSvg(fieldX: number, fieldY: number): { x: number; y: number } {
  const dist  = (1 - fieldY) * MAX_R;
  const angle = (fieldX - 0.5) * (Math.PI / 2); // −π/4 to +π/4
  return {
    x: HP_X + dist * Math.sin(angle),
    y: HP_Y - dist * Math.cos(angle),
  };
}

// ── Hit result color ──────────────────────────────────────────────────────────
export function resultColor(result: AtBatResult | null): string {
  if (!result) return Colors.textSecondary;
  if (['single', 'double', 'triple', 'home_run'].includes(result)) return Colors.primary;
  if (result === 'error') return Colors.accent;
  return Colors.textSecondary;
}
