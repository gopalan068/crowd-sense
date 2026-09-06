/**
 * frontend/src/lib/fruinDensity.js
 *
 * Shared Fruin/Still Level-of-Service density-band constants and color helper.
 * Used by both the live-monitoring dashboard (CSS variables) and the
 * CrowdSense Planner heatmap overlay (canvas RGBA).
 *
 * Thresholds (people / m²):
 *   < 1.08  → LOS A/B  → Green   (free flow)
 *   1.08–2.15 → LOS C   → Yellow  (restricted)
 *   2.15–3.8  → LOS D/E → Orange  (constrained)
 *   > 3.8     → LOS F   → Red     (breakdown / crush risk)
 *
 * Reference: Still, G.K. (2000). Crowd Dynamics. PhD thesis, Warwick.
 *            Fruin, J.J. (1971). Pedestrian Planning and Design.
 */

/** Ordered thresholds (upper bound of each band; last band is open-ended) */
export const FRUIN_THRESHOLDS = [1.08, 2.15, 3.8]

/**
 * Fruin band definitions.
 * Each entry covers density from `min` (inclusive) up to `max` (exclusive),
 * with matching RGBA canvas color and the CSS variable name for UI text.
 */
export const FRUIN_BANDS = [
  {
    label: 'LOS A/B — Free Flow',
    shortLabel: 'FREE',
    min: 0,
    max: 1.08,
    rgba: 'rgba(5, 150, 105, 0.72)',      // --risk-green  #059669
    cssVar: 'var(--risk-green)',
    cssVarBg: 'var(--risk-green-bg)',
    cssVarBorder: 'var(--risk-green-border)',
  },
  {
    label: 'LOS C — Restricted',
    shortLabel: 'CAUTION',
    min: 1.08,
    max: 2.15,
    rgba: 'rgba(217, 119, 6, 0.72)',       // --risk-yellow #D97706
    cssVar: 'var(--risk-yellow)',
    cssVarBg: 'var(--risk-yellow-bg)',
    cssVarBorder: 'var(--risk-yellow-border)',
  },
  {
    label: 'LOS D/E — Constrained',
    shortLabel: 'WARNING',
    min: 2.15,
    max: 3.8,
    rgba: 'rgba(234, 88, 12, 0.78)',       // --risk-orange #EA580C
    cssVar: 'var(--risk-orange)',
    cssVarBg: 'var(--risk-orange-bg)',
    cssVarBorder: 'var(--risk-orange-border)',
  },
  {
    label: 'LOS F — Breakdown / Crush Risk',
    shortLabel: 'CRITICAL',
    min: 3.8,
    max: Infinity,
    rgba: 'rgba(220, 38, 38, 0.85)',       // --risk-red    #DC2626
    cssVar: 'var(--risk-red)',
    cssVarBg: 'var(--risk-red-bg)',
    cssVarBorder: 'var(--risk-red-border)',
  },
]

/**
 * Returns the Fruin band object for a given density value.
 * @param {number} densityPpm2 — density in people / m²
 * @returns {object} matching FRUIN_BANDS entry
 */
export function getDensityBand(densityPpm2) {
  for (const band of FRUIN_BANDS) {
    if (densityPpm2 < band.max) return band
  }
  return FRUIN_BANDS[FRUIN_BANDS.length - 1]
}

/**
 * Returns an RGBA string for canvas rendering at the given density.
 * @param {number} densityPpm2
 * @param {number} [alphaOverride] — optional opacity override (0–1)
 * @returns {string} e.g. 'rgba(5, 150, 105, 0.72)'
 */
export function getDensityColor(densityPpm2, alphaOverride) {
  const band = getDensityBand(densityPpm2)
  if (alphaOverride === undefined) return band.rgba
  // Parse the band rgba and replace alpha
  return band.rgba.replace(/[\d.]+\)$/, `${alphaOverride})`)
}

/**
 * Returns the CSS variable string (for React inline styles in UI elements).
 * @param {number} densityPpm2
 * @returns {string} e.g. 'var(--risk-green)'
 */
export function getDensityCssVar(densityPpm2) {
  return getDensityBand(densityPpm2).cssVar
}
