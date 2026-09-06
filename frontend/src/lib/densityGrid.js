/**
 * frontend/src/lib/densityGrid.js
 *
 * Grid-based crowd density calculator for the CrowdSense Planner.
 * Divides the venue canvas into cells, counts agents per cell,
 * converts to people/m², and renders as a Fruin-band color overlay.
 *
 * Imports getDensityColor() from fruinDensity.js — same color logic
 * as the live-monitoring dashboard.
 */

import { getDensityColor } from './fruinDensity.js'

/** Default grid cell size in meters */
export const DEFAULT_CELL_SIZE_M = 1.0

/**
 * Build grid metadata from venue dimensions.
 *
 * @param {number} canvasWidth   — canvas width in pixels
 * @param {number} canvasHeight  — canvas height in pixels
 * @param {number} pxPerMeter    — venue scale factor
 * @param {number} [cellSizeM]   — grid cell size in meters (default 1.0)
 * @returns {{ cols, rows, cellSizeM, cellSizePx, cellAreaM2 }}
 */
export function buildGrid(canvasWidth, canvasHeight, pxPerMeter, cellSizeM = DEFAULT_CELL_SIZE_M) {
  const cellSizePx = cellSizeM * pxPerMeter
  const cols = Math.ceil(canvasWidth / cellSizePx)
  const rows = Math.ceil(canvasHeight / cellSizePx)
  return {
    cols,
    rows,
    cellSizeM,
    cellSizePx,
    cellAreaM2: cellSizeM * cellSizeM,
  }
}

/**
 * Compute density (people/m²) for each grid cell.
 *
 * @param {Array}  agents      — array of agent objects with pos {x, y} in METERS
 * @param {object} grid        — grid metadata from buildGrid()
 * @param {number} pxPerMeter  — to convert agent meter coords → cell index
 * @returns {Float32Array}     — density[row * cols + col] in people/m²
 */
export function computeDensity(agents, grid, pxPerMeter) {
  const { cols, rows, cellSizePx, cellAreaM2 } = grid
  const counts = new Int32Array(cols * rows)

  for (const agent of agents) {
    if (agent.reachedExit) continue
    // Agent pos is in meters; convert to canvas pixels, then to cell index
    const px = agent.pos.x * pxPerMeter
    const py = agent.pos.y * pxPerMeter
    const col = Math.floor(px / cellSizePx)
    const row = Math.floor(py / cellSizePx)
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      counts[row * cols + col]++
    }
  }

  const density = new Float32Array(cols * rows)
  for (let i = 0; i < density.length; i++) {
    density[i] = counts[i] / cellAreaM2
  }
  return density
}

/**
 * Render the density heatmap as semi-transparent colored rectangles on ctx.
 * Only cells with density > 0 are drawn (performance optimization).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} densityArray  — from computeDensity()
 * @param {object}       grid          — from buildGrid()
 * @param {number}       alpha         — overall heatmap opacity (0–1)
 */
export function renderHeatmap(ctx, densityArray, grid, alpha = 0.45) {
  if (alpha < 0.01) return
  const { cols, rows, cellSizePx } = grid
  ctx.save()
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const d = densityArray[row * cols + col]
      if (d < 0.01) continue  // Skip empty cells
      // Get Fruin color with caller-specified alpha
      const color = getDensityColor(d, alpha)
      ctx.fillStyle = color
      ctx.fillRect(
        col * cellSizePx,
        row * cellSizePx,
        cellSizePx,
        cellSizePx,
      )
    }
  }
  ctx.restore()
}

/**
 * Find the maximum density value across all cells.
 * Used to display the "peak density" stat in the control panel.
 *
 * @param {Float32Array} densityArray
 * @returns {number} maximum density in people/m²
 */
export function getMaxDensity(densityArray) {
  let max = 0
  for (let i = 0; i < densityArray.length; i++) {
    if (densityArray[i] > max) max = densityArray[i]
  }
  return max
}
