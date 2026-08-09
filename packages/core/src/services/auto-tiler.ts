/**
 * AutoTiler - 47-Tile Blob Autotiling with Bitmasking
 *
 * Optimized to work with TilesetProcessor's 9-slice expansion.
 *
 * ## Bitmask Neighbor Positions (8-bit):
 * ```
 *   NW(1)  N(2)   NE(4)
 *   W(8)   [X]    E(16)
 *   SW(32) S(64)  SE(128)
 * ```
 *
 * ## 7x7 Tileset Layout (generated from 3x3):
 * ```
 *  0   1   2   3   4   5   6     <- TL, Top edges, TR
 *  7   8   9  10  11  12  13     <- Left, Centers, Right
 * 14  15  16  17  18  19  20     <- Left, Centers, Right
 * 21  22  23  24  25  26  27     <- Left, Centers, Right
 * 28  29  30  31  32  33  34     <- Left, Centers+InnerNW, Right+InnerNE
 * 35  36  37  38  39  40  41     <- Left, Centers, InnerSW, InnerSE
 * 42  43  44  45  46  47  48     <- BL, Bottom edges, BR
 * ```
 *
 * Key positions (must match TilesetProcessor):
 * - Outer corners: 0 (TL), 6 (TR), 42 (BL), 48 (BR)
 * - Inner corners: 33 (NW), 34 (NE), 40 (SW), 41 (SE)
 * - Center: 17
 * - Edges: 3 (Top), 21 (Left), 27 (Right), 45 (Bottom)
 */

export class AutoTiler {
  private width: number;
  private height: number;
  private solidGrid: boolean[][];

  constructor(width: number, height: number, solidGrid: boolean[][]) {
    this.width = width;
    this.height = height;
    this.solidGrid = solidGrid;
  }

  /**
   * Check if position is solid (out of bounds = not solid)
   */
  private isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    return this.solidGrid[y][x];
  }

  /**
   * Get tile ID for a position (1-indexed for Tiled format).
   * Returns 0 for non-solid tiles (air/empty).
   */
  getTileId(x: number, y: number): number {
    if (!this.isSolid(x, y)) {
      return 0;
    }

    // Check 8 neighbors
    const n = this.isSolid(x, y - 1);
    const ne = this.isSolid(x + 1, y - 1);
    const e = this.isSolid(x + 1, y);
    const se = this.isSolid(x + 1, y + 1);
    const s = this.isSolid(x, y + 1);
    const sw = this.isSolid(x - 1, y + 1);
    const w = this.isSolid(x - 1, y);
    const nw = this.isSolid(x - 1, y - 1);

    // Corners only matter if both adjacent edges exist
    const hasNW = nw && n && w;
    const hasNE = ne && n && e;
    const hasSW = sw && s && w;
    const hasSE = se && s && e;

    // Count edges
    const edgeCount = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);

    // Compute tile index based on neighbor configuration
    const tileIndex = this.computeTileIndex(
      n,
      e,
      s,
      w,
      hasNW,
      hasNE,
      hasSW,
      hasSE,
      edgeCount,
    );

    // Tiled uses 1-indexed tile IDs (0 = empty, 1 = first tile)
    return tileIndex + 1;
  }

  /**
   * Compute tile index based on neighbors
   * Optimized for 9-slice expanded tileset
   */
  private computeTileIndex(
    n: boolean,
    e: boolean,
    s: boolean,
    w: boolean,
    hasNW: boolean,
    hasNE: boolean,
    hasSW: boolean,
    hasSE: boolean,
    edgeCount: number,
  ): number {
    // === NO NEIGHBORS (Island) ===
    // Use center tile as fallback (can't generate true island from 9-slice)
    if (edgeCount === 0) {
      return 17; // Center
    }

    // === ONE NEIGHBOR (End caps) ===
    // These are edge tiles pointing toward the neighbor
    if (edgeCount === 1) {
      if (n) return 45; // South edge (open at top, closed at bottom)
      if (s) return 3; // North edge (open at bottom, closed at top)
      if (w) return 6; // Right edge (use TR corner as closest match)
      if (e) return 0; // Left edge (use TL corner as closest match)
    }

    // === TWO OPPOSITE NEIGHBORS (Corridors) ===
    // Use center tile for corridors
    if (edgeCount === 2) {
      if (n && s && !e && !w) return 17; // Vertical corridor
      if (e && w && !n && !s) return 17; // Horizontal corridor
    }

    // === TWO ADJACENT NEIGHBORS (Outer Corners) ===
    if (edgeCount === 2) {
      if (n && e) return 42; // BL corner (open to NE)
      if (n && w) return 48; // BR corner (open to NW)
      if (s && e) return 0; // TL corner (open to SE)
      if (s && w) return 6; // TR corner (open to SW)
    }

    // === THREE NEIGHBORS (T-junctions / Edge pieces) ===
    if (edgeCount === 3) {
      if (!n) return 3; // Top edge (no N neighbor)
      if (!s) return 45; // Bottom edge (no S neighbor)
      if (!w) return 27; // Right edge (no W neighbor)
      if (!e) return 21; // Left edge (no E neighbor)
    }

    // === FOUR NEIGHBORS (Center or Inner Corners) ===
    if (edgeCount === 4) {
      // Count missing corners
      const missingCorners =
        (!hasNW ? 1 : 0) +
        (!hasNE ? 1 : 0) +
        (!hasSW ? 1 : 0) +
        (!hasSE ? 1 : 0);

      // All corners present = full center
      if (missingCorners === 0) {
        return 17; // Center
      }

      // Single missing corner = inner corner
      if (missingCorners === 1) {
        if (!hasNW) return 33; // Inner corner NW
        if (!hasNE) return 34; // Inner corner NE
        if (!hasSW) return 40; // Inner corner SW
        if (!hasSE) return 41; // Inner corner SE
      }

      // Two missing corners
      if (missingCorners === 2) {
        // Diagonal missing = use center (can't represent well)
        if ((!hasNW && !hasSE) || (!hasNE && !hasSW)) {
          return 17;
        }
        // Adjacent missing on same side
        if (!hasNW && !hasNE) return 3; // Top edge
        if (!hasSW && !hasSE) return 45; // Bottom edge
        if (!hasNW && !hasSW) return 21; // Left edge
        if (!hasNE && !hasSE) return 27; // Right edge
      }

      // Three or four missing corners = use edges
      if (missingCorners >= 3) {
        // Find which corner IS present and use opposite edge
        if (hasNW) return 27; // Only NW present, use right edge
        if (hasNE) return 21; // Only NE present, use left edge
        if (hasSW) return 3; // Only SW present, use top edge
        if (hasSE) return 45; // Only SE present, use bottom edge
        return 17; // All missing = center
      }
    }

    // Fallback to center
    return 17;
  }

  /**
   * Process entire grid and return tile data array
   */
  processGrid(): number[] {
    const data: number[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        data.push(this.getTileId(x, y));
      }
    }

    return data;
  }

  /**
   * Create solid grid from ASCII layout and legend
   */
  static createSolidGrid(
    layout: string[],
    legend: Record<string, number>,
    autoTileChars: string[],
  ): boolean[][] {
    const height = layout.length;
    const width = layout[0]?.length || 0;
    const grid: boolean[][] = [];

    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const char = layout[y]?.[x] || '.';
        const isSolid =
          autoTileChars.includes(char) ||
          (legend[char] !== undefined && legend[char] > 0);
        row.push(isSolid);
      }
      grid.push(row);
    }

    return grid;
  }

  /**
   * Get dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}

/**
 * Tile position reference
 * Matches TilesetProcessor output
 */
export const TILE_POSITIONS = {
  // Outer corners
  CORNER_TL: 0,
  CORNER_TR: 6,
  CORNER_BL: 42,
  CORNER_BR: 48,

  // Edges
  EDGE_TOP: 3,
  EDGE_BOTTOM: 45,
  EDGE_LEFT: 21,
  EDGE_RIGHT: 27,

  // Center
  CENTER: 17,

  // Inner corners (generated by TilesetProcessor)
  INNER_NW: 33,
  INNER_NE: 34,
  INNER_SW: 40,
  INNER_SE: 41,
} as const;
