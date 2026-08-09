import sharp from 'sharp';

/**
 * TilesetProcessor - Expands 3x3 (9-Slice) to 7x7 (47-Tile Blobset)
 *
 * Source 3x3 Grid:
 * ```
 * 0: TL Corner   1: Top Edge    2: TR Corner
 * 3: Left Edge   4: Center      5: Right Edge
 * 6: BL Corner   7: Bot Edge    8: BR Corner
 * ```
 *
 * Output 7x7 Grid includes:
 * - 4 outer corners (from source 0, 2, 6, 8)
 * - 4 edges (from source 1, 3, 5, 7)
 * - Center fills (from source 4)
 * - 4 inner corners (COMPOSITED from center + corner quadrants)
 */

// Source tile indices
const TL = 0;
const T = 1;
const TR = 2;
const L = 3;
const C = 4;
const R = 5;
const BL = 6;
const B = 7;
const BR = 8;

/**
 * 7x7 Blob Tileset Layout (matching AutoTiler expectations)
 *
 * Position meanings:
 * - 0, 6, 42, 48: Outer corners
 * - Top edge variants: 1-5
 * - Left/Right edges: 7, 13, 21, 27, etc.
 * - Center: 17, 24
 * - Inner corners: 33, 34, 40, 41
 */
const BLOB_LAYOUT = {
  // Corners (outer)
  CORNER_TL: 0,
  CORNER_TR: 6,
  CORNER_BL: 42,
  CORNER_BR: 48,

  // Edges
  EDGE_TOP: [1, 2, 3, 4, 5],
  EDGE_BOTTOM: [43, 44, 45, 46, 47],
  EDGE_LEFT: [7, 14, 21, 28, 35],
  EDGE_RIGHT: [13, 20, 27, 34, 41],

  // Center
  CENTER: 17,
  CENTER_ALT: 24,

  // Inner corners (key positions for AutoTiler)
  INNER_NW: 33,
  INNER_NE: 34,
  INNER_SW: 40,
  INNER_SE: 41,

  // T-junctions
  T_TOP: [8, 9, 10, 11, 12],
  T_BOTTOM: [36, 37, 38, 39],
  T_LEFT: [15, 22, 29],
  T_RIGHT: [19, 26],
};

export class TilesetProcessor {
  private tileSize: number = 64;
  private sourceTiles: Buffer[] = [];

  /**
   * Expands a 3x3 source grid into a full 7x7 Blobset
   * Key feature: Generates inner corners by compositing
   */
  async expand3x3To7x7(
    rawBuffer: Buffer,
    tileSize: number = 64,
    isPixelArt: boolean = true,
  ): Promise<Buffer> {
    this.tileSize = tileSize;
    const INPUT_GRID = 3;
    const OUTPUT_GRID = 7;

    // 1. Resize input to exact 3x3 grid
    const inputSize = INPUT_GRID * tileSize;
    const kernel = isPixelArt ? 'nearest' : 'lanczos3';

    const baseGridBuffer = await sharp(rawBuffer)
      .resize(inputSize, inputSize, { fit: 'fill', kernel })
      .toBuffer();

    // 2. Slice into 9 source tiles
    this.sourceTiles = [];
    for (let row = 0; row < INPUT_GRID; row++) {
      for (let col = 0; col < INPUT_GRID; col++) {
        const tile = await sharp(baseGridBuffer)
          .extract({
            left: col * tileSize,
            top: row * tileSize,
            width: tileSize,
            height: tileSize,
          })
          .toBuffer();
        this.sourceTiles.push(tile);
      }
    }

    // 3. Build output tiles array (49 tiles)
    const outputTiles: Buffer[] = new Array(49);

    // Fill with mapping
    await this.fillBasicTiles(outputTiles);

    // Generate inner corners (the key improvement!)
    await this.generateInnerCorners(outputTiles);

    // 4. Composite into final 7x7 image
    const outputSize = OUTPUT_GRID * tileSize;

    const compositeOps = outputTiles.map((buffer, index) => {
      const row = Math.floor(index / OUTPUT_GRID);
      const col = index % OUTPUT_GRID;
      return {
        input: buffer,
        top: row * tileSize,
        left: col * tileSize,
      };
    });

    return await sharp({
      create: {
        width: outputSize,
        height: outputSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(compositeOps)
      .png()
      .toBuffer();
  }

  /**
   * Fill basic tiles from 9-slice mapping
   */
  private async fillBasicTiles(output: Buffer[]): Promise<void> {
    // Default mapping: position -> source index
    const mapping: number[] = [
      // Row 0: TL, Top edges, TR
      TL,
      T,
      T,
      T,
      T,
      T,
      TR,
      // Row 1
      L,
      C,
      C,
      C,
      C,
      C,
      R,
      // Row 2
      L,
      C,
      C,
      C,
      C,
      C,
      R,
      // Row 3
      L,
      C,
      C,
      C,
      C,
      C,
      R,
      // Row 4
      L,
      C,
      C,
      C,
      C,
      C,
      R,
      // Row 5
      L,
      C,
      C,
      C,
      C,
      C,
      R,
      // Row 6: BL, Bottom edges, BR
      BL,
      B,
      B,
      B,
      B,
      B,
      BR,
    ];

    for (let i = 0; i < 49; i++) {
      output[i] = this.sourceTiles[mapping[i]];
    }
  }

  /**
   * Generate inner corner tiles by compositing
   *
   * Inner corner = Center tile with one corner replaced by outer corner's inner quadrant
   *
   * Example: Inner NW corner
   * - Base: Center tile
   * - Overlay: Bottom-right quadrant of TL corner tile
   * - Position: Top-left of result
   */
  private async generateInnerCorners(output: Buffer[]): Promise<void> {
    const half = this.tileSize / 2;

    // Inner NW: Center + TL's BR quadrant in TL position
    output[BLOB_LAYOUT.INNER_NW] = await this.compositeInnerCorner(
      this.sourceTiles[C],
      this.sourceTiles[TL],
      { srcX: half, srcY: half }, // BR quadrant of TL
      { dstX: 0, dstY: 0 }, // TL position
    );

    // Inner NE: Center + TR's BL quadrant in TR position
    output[BLOB_LAYOUT.INNER_NE] = await this.compositeInnerCorner(
      this.sourceTiles[C],
      this.sourceTiles[TR],
      { srcX: 0, srcY: half }, // BL quadrant of TR
      { dstX: half, dstY: 0 }, // TR position
    );

    // Inner SW: Center + BL's TR quadrant in BL position
    output[BLOB_LAYOUT.INNER_SW] = await this.compositeInnerCorner(
      this.sourceTiles[C],
      this.sourceTiles[BL],
      { srcX: half, srcY: 0 }, // TR quadrant of BL
      { dstX: 0, dstY: half }, // BL position
    );

    // Inner SE: Center + BR's TL quadrant in BR position
    output[BLOB_LAYOUT.INNER_SE] = await this.compositeInnerCorner(
      this.sourceTiles[C],
      this.sourceTiles[BR],
      { srcX: 0, srcY: 0 }, // TL quadrant of BR
      { dstX: half, dstY: half }, // BR position
    );
  }

  /**
   * Composite an inner corner tile
   */
  private async compositeInnerCorner(
    baseTile: Buffer,
    cornerTile: Buffer,
    src: { srcX: number; srcY: number },
    dst: { dstX: number; dstY: number },
  ): Promise<Buffer> {
    const half = this.tileSize / 2;

    // Extract quadrant from corner tile
    const quadrant = await sharp(cornerTile)
      .extract({
        left: src.srcX,
        top: src.srcY,
        width: half,
        height: half,
      })
      .toBuffer();

    // Composite onto base tile
    return await sharp(baseTile)
      .composite([
        {
          input: quadrant,
          left: dst.dstX,
          top: dst.dstY,
        },
      ])
      .toBuffer();
  }

  /**
   * Get specific source tile (for external use)
   */
  getSourceTile(index: number): Buffer | undefined {
    return this.sourceTiles[index];
  }
}

/**
 * Mapping reference for debugging
 */
export const TILESET_DEBUG = {
  sourceNames: ['TL', 'T', 'TR', 'L', 'C', 'R', 'BL', 'B', 'BR'],
  innerCornerPositions: {
    33: 'Inner NW (center with NW cutout)',
    34: 'Inner NE (center with NE cutout)',
    40: 'Inner SW (center with SW cutout)',
    41: 'Inner SE (center with SE cutout)',
  },
};
