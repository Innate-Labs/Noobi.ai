/**
 * Background Removal Utility
 * Supports two backends:
 * 1. @imgly/background-removal-node (Node.js, default)
 * 2. rembg + u2net (Python, like PiXelDa) - higher quality
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import {
  removeBackground,
  type Config as ImglyConfig,
} from '@imgly/background-removal-node';

// Create require function for resolving package paths in ESM
const require = createRequire(import.meta.url);

export type BackgroundRemovalBackend = 'imgly' | 'rembg';

export interface BackgroundRemovalOptions {
  projectRoot: string;
  debug?: boolean;
  backend?: BackgroundRemovalBackend; // 'imgly' (default) or 'rembg' (Python)
  pythonPath?: string; // Path to Python executable (for rembg)
}

export class BackgroundRemovalService {
  private options: BackgroundRemovalOptions;
  private backend: BackgroundRemovalBackend;
  private rembgAvailable: boolean | null = null;

  constructor(options: BackgroundRemovalOptions) {
    this.options = options;
    this.backend = options.backend || 'imgly';
  }

  /**
   * Check if rembg (Python) is available
   */
  async isRembgAvailable(): Promise<boolean> {
    if (this.rembgAvailable !== null) {
      return this.rembgAvailable;
    }

    return new Promise((resolve) => {
      const pythonPath = this.options.pythonPath || 'python3';
      const proc = spawn(pythonPath, ['-c', 'import rembg; print("ok")'], {
        stdio: 'pipe',
      });

      proc.on('close', (code) => {
        this.rembgAvailable = code === 0;
        resolve(this.rembgAvailable);
      });

      proc.on('error', () => {
        this.rembgAvailable = false;
        resolve(false);
      });
    });
  }

  /**
   * Remove background from image URL
   * Returns a Buffer with transparent background
   */
  async removeBackground(imageUrl: string): Promise<Buffer> {
    console.log(
      `[BackgroundRemoval] Processing: ${imageUrl.substring(0, 50)}...`,
    );

    // Download image first
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    return this.removeBackgroundFromBuffer(imageBuffer);
  }

  /**
   * Remove background with fallback to original image on failure
   * Downloads the image ONCE and reuses the buffer for fallback
   */
  async removeBackgroundSafe(imageUrl: string): Promise<Buffer> {
    console.log(
      `[BackgroundRemoval] Processing (safe): ${imageUrl.substring(0, 60)}...`,
    );

    // Download image FIRST - only once
    let imageBuffer: Buffer;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
      console.log(
        `[BackgroundRemoval] Downloaded image: ${imageBuffer.length} bytes`,
      );
    } catch (fetchError) {
      console.error(`[BackgroundRemoval] Download failed:`, fetchError);
      throw new Error(`fetch failed: ${fetchError}`);
    }

    // Try to remove background
    try {
      const result = await this.removeBackgroundFromBuffer(imageBuffer);
      console.log(`[BackgroundRemoval] Background removal succeeded`);
      return result;
    } catch (bgRemovalError) {
      console.warn(
        `[BackgroundRemoval] Background removal failed:`,
        bgRemovalError,
      );
      console.warn(
        `[BackgroundRemoval] Returning original image (no bg removal)`,
      );
      // Return the already-downloaded original image buffer
      return imageBuffer;
    }
  }

  /**
   * Remove background from a Buffer (for local files)
   * Returns a Buffer with transparent background
   */
  async removeBackgroundFromBuffer(imageBuffer: Buffer): Promise<Buffer> {
    const backendToUse = this.backend;
    console.log(
      `[BackgroundRemoval] Processing buffer (${imageBuffer.length} bytes) with ${backendToUse}...`,
    );

    if (backendToUse === 'rembg') {
      // Check if rembg is available
      const available = await this.isRembgAvailable();
      if (available) {
        return this.removeBackgroundWithRembg(imageBuffer);
      } else {
        console.warn(
          `[BackgroundRemoval] rembg not available, falling back to imgly`,
        );
      }
    }

    // Use imgly (default)
    return this.removeBackgroundWithImgly(imageBuffer);
  }

  /**
   * Remove background using @imgly/background-removal-node (Node.js)
   */
  private async removeBackgroundWithImgly(
    imageBuffer: Buffer,
  ): Promise<Buffer> {
    try {
      // Use require.resolve to find the actual package location (works regardless of projectRoot)
      // This resolves the package from the SDK's node_modules, not user's project
      const imglyPackagePath =
        require.resolve('@imgly/background-removal-node');
      const imglyDistPath = path.dirname(imglyPackagePath);
      const localModelPath = `file://${imglyDistPath}/`;

      console.log(
        `[BackgroundRemoval] Using imgly model path: ${localModelPath}`,
      );

      const config: ImglyConfig = {
        publicPath: localModelPath,
        debug: this.options.debug || false,
      };

      // Convert buffer to Blob for the library
      // Note: Type assertion needed due to Node.js Buffer vs browser ArrayBuffer incompatibility
      const blob = new Blob([imageBuffer as unknown as ArrayBuffer], {
        type: 'image/png',
      });
      const resultBlob = await removeBackground(blob, config);
      const buffer = Buffer.from(await resultBlob.arrayBuffer());

      console.log(
        `[BackgroundRemoval] Success (imgly), output size: ${buffer.length} bytes`,
      );
      return buffer;
    } catch (error) {
      console.error(`[BackgroundRemoval] imgly failed:`, error);
      console.warn(`[BackgroundRemoval] Returning original buffer`);
      return imageBuffer;
    }
  }

  /**
   * Remove background using rembg + u2net (Python, like PiXelDa)
   * Higher quality but requires Python environment
   */
  private async removeBackgroundWithRembg(
    imageBuffer: Buffer,
  ): Promise<Buffer> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rembg-'));
    const inputPath = path.join(tempDir, 'input.png');
    const outputPath = path.join(tempDir, 'output.png');

    try {
      // Write input image
      await fs.writeFile(inputPath, imageBuffer);

      // Call rembg via Python
      const pythonPath = this.options.pythonPath || 'python3';
      const pythonScript = `
import sys
from rembg import remove, new_session
import cv2

input_path = sys.argv[1]
output_path = sys.argv[2]

# Read image
img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)

# Create session with u2net model (like PiXelDa)
session = new_session("u2net")

# Remove background
result = remove(img, session=session, alpha_matting=False)

# Save result
cv2.imwrite(output_path, result)
print("ok")
`;

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          pythonPath,
          ['-c', pythonScript, inputPath, outputPath],
          {
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );

        let stderr = '';
        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`rembg failed with code ${code}: ${stderr}`));
          }
        });

        proc.on('error', (err) => {
          reject(new Error(`rembg spawn error: ${err.message}`));
        });
      });

      // Read result
      const resultBuffer = await fs.readFile(outputPath);
      console.log(
        `[BackgroundRemoval] Success (rembg/u2net), output size: ${resultBuffer.length} bytes`,
      );
      return resultBuffer;
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(inputPath);
        await fs.unlink(outputPath);
        await fs.rmdir(tempDir);
      } catch {
        // best-effort temp cleanup
      }
    }
  }
}

/**
 * Simple function wrapper for one-off usage
 */
export async function removeBackgroundFromUrl(
  imageUrl: string,
  projectRoot: string,
  fallbackOnError: boolean = true,
): Promise<Buffer> {
  const service = new BackgroundRemovalService({ projectRoot });

  if (fallbackOnError) {
    return service.removeBackgroundSafe(imageUrl);
  }
  return service.removeBackground(imageUrl);
}
