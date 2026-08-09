/**
 * Generate Assets Tool
 * A complete rewrite inspired by PiXelDa architecture
 *
 * Features:
 * - Multi-model support (Tongyi / Doubao)
 * - Image generation with auto background removal
 * - Animation generation via I2V (Image-to-Video) or I2I fallback
 * - Audio generation via ABC Notation
 * - Background images (no bg removal)
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { Config } from '../config/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

import type { ModelRouter } from '../services/assetModelRouter.js';
import { createModelRouter } from '../services/assetModelRouter.js';
import { BackgroundRemovalService } from '../utils/backgroundRemoval.js';
import { FrameExtractionService } from '../services/assetVideoService.js';
import type {
  GenerateAssetsParams,
  BackgroundRequest,
  ImageRequest,
  AnimationRequest,
  AudioRequest,
  TilesetRequest,
  AssetPack,
} from './generate-assets-types.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';

import { TilesetProcessor } from '../services/tileset-processor.js';

// ============== Constants ==============

const MAX_CONCURRENCY = 2;
const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'm4a'] as const;

interface ExistingAsset {
  filePath: string;
  url: string;
}

interface AnimationGenerationSummary {
  generatedFrames: number;
  reusedFrames: number;
  missingFrames: string[];
}

// ============== Invocation Class ==============

class GenerateAssetsInvocation extends BaseToolInvocation<
  GenerateAssetsParams,
  ToolResult
> {
  private config: Config;
  /**
   * The router (and its underlying provider services) is built lazily so
   * a missing API key surfaces as an actionable execute-time error
   * instead of crashing tool registration / invocation construction.
   */
  private modelRouter!: ModelRouter;
  private bgRemovalService: BackgroundRemovalService;
  private frameExtractionService: FrameExtractionService;
  private tilesetProcessor: TilesetProcessor;

  constructor(config: Config, params: GenerateAssetsParams) {
    super(params);
    this.config = config;

    // Initialize background removal service
    // Use BACKGROUND_REMOVAL_BACKEND env var to switch: 'imgly' (default) or 'rembg' (Python/PiXelDa)
    const bgBackend =
      (process.env.BACKGROUND_REMOVAL_BACKEND as 'imgly' | 'rembg') || 'imgly';
    this.bgRemovalService = new BackgroundRemovalService({
      projectRoot: config.getProjectRoot(),
      backend: bgBackend,
      pythonPath: process.env.PYTHON_PATH, // Optional: custom Python path
    });

    // Initialize frame extraction service
    this.frameExtractionService = new FrameExtractionService();

    // Initialize tileset processor
    this.tilesetProcessor = new TilesetProcessor();
  }

  getDescription(): string {
    return `Generating ${this.params.assets.length} assets...`;
  }

  /**
   * Build the model router on demand. Throws `MissingProviderConfigError`
   * (with an actionable message + docs link) when the user hasn't
   * configured an image provider; that error is caught at the top of
   * `execute()` and surfaced as a tool-result error rather than
   * propagated as an uncaught exception.
   */
  private ensureModelRouter(): ModelRouter {
    if (!this.modelRouter) {
      this.modelRouter = createModelRouter({
        modelType: this.params.model_type,
        providers: this.config.getOpenGameProviders(),
      });
    }
    return this.modelRouter;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const workspaceDir = this.config.getWorkspaceContext().getDirectories()[0];
    const targetDirName =
      this.params.output_dir_name || path.join('public', 'assets');
    const absoluteAssetsDir = path.join(workspaceDir, targetDirName);
    const assetPackPath = path.join(absoluteAssetsDir, 'asset-pack.json');

    // Ensure output directory exists
    await fs.mkdir(absoluteAssetsDir, { recursive: true });

    // Load or initialize asset pack
    const assetPack = await this.loadAssetPack(assetPackPath);

    const results: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];
    const activePromises = new Set<Promise<void>>();

    // Process assets with concurrency control
    for (const assetReq of this.params.assets) {
      if (signal.aborted) break;

      // Wait if at max concurrency
      if (activePromises.size >= MAX_CONCURRENCY) {
        await Promise.race(activePromises);
      }

      const task = (async () => {
        try {
          if (
            !this.params.overwrite_existing &&
            assetReq.type !== 'animation' &&
            (await this.findExistingAsset(
              assetPack,
              assetReq.key,
              assetReq.type,
              absoluteAssetsDir,
            ))
          ) {
            skipped.push(`${assetReq.key} (${assetReq.type})`);
            return;
          }

          if (assetReq.type !== 'animation') this.ensureModelRouter();

          switch (assetReq.type) {
            case 'background':
              await this.handleBackground(
                assetReq,
                assetPack,
                absoluteAssetsDir,
                signal,
              );
              break;
            case 'image':
              await this.handleImage(
                assetReq,
                assetPack,
                absoluteAssetsDir,
                signal,
              );
              break;
            case 'animation':
              {
                const summary = await this.handleAnimation(
                  assetReq,
                  assetPack,
                  absoluteAssetsDir,
                  signal,
                );
                if (summary.generatedFrames > 0) {
                  results.push(
                    `${assetReq.key} (animation, ${summary.generatedFrames} generated)`,
                  );
                }
                if (summary.reusedFrames > 0) {
                  skipped.push(
                    `${assetReq.key} (${summary.reusedFrames} existing frames)`,
                  );
                }
                if (summary.missingFrames.length > 0) {
                  errors.push(
                    `${assetReq.key}: still missing ${summary.missingFrames.join(', ')}`,
                  );
                }
              }
              break;
            case 'audio':
              await this.handleAudio(
                assetReq,
                assetPack,
                absoluteAssetsDir,
                signal,
              );
              break;
            case 'tileset':
              await this.handleTileset(
                assetReq,
                assetPack,
                absoluteAssetsDir,
                signal,
              );
              break;
            default:
              console.warn(
                `[GenerateAssets] Unknown asset type: ${(assetReq as { type: string }).type}`,
              );
              throw new Error(
                `Unsupported asset type: ${(assetReq as { type: string }).type}. Supported types: background, image, animation, audio, tileset`,
              );
          }
          if (assetReq.type !== 'animation') {
            results.push(`${assetReq.key} (${assetReq.type})`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[GenerateAssets] Failed ${assetReq.key}:`, msg);
          errors.push(`${assetReq.key}: ${msg}`);
        }
      })();

      activePromises.add(task);
      task.finally(() => activePromises.delete(task));
    }

    // Wait for all tasks to complete
    await Promise.all(activePromises);

    // Save asset pack
    await this.writeFileAtomic(
      assetPackPath,
      JSON.stringify(assetPack, null, 2),
    );

    // Generate result message
    const sections = Object.keys(assetPack).filter((k) => k !== 'meta');
    const errorSummary =
      errors.length > 0
        ? `\nGeneration errors (${errors.length}):\n${errors.join('\n')}\nThe asset batch is incomplete. Retry the same request with overwrite_existing=false; completed files will be reused.\n`
        : '\nGeneration errors: none\n';
    const instruction = `
${errors.length > 0 ? 'Asset generation is incomplete' : 'Assets are ready'} in '${targetDirName}/asset-pack.json'.
Items: ${results.join(', ')}
Reused existing: ${skipped.join(', ') || 'none'}
Sections: ${sections.join(', ')}
${errorSummary}

CODING INSTRUCTION (Phaser 3):
1. Preloader - load ALL sections:
   this.load.pack('assetPack', 'assets/asset-pack.json');

2. Or load SPECIFIC sections:
   this.load.pack('backgrounds', 'assets/asset-pack.json', 'backgrounds');
   this.load.pack('player_animations', 'assets/asset-pack.json', 'player_animations');

3. Use keys directly: this.add.image(0, 0, 'key_name');

4. For audio:
   this.load.audio('bgm', 'assets/bgm.wav');
   this.sound.play('bgm', { loop: true });
`;

    const errorMessage = errors.join('\n');
    return {
      llmContent: instruction,
      returnDisplay: `${errors.length > 0 ? '⚠️' : '✅'} Generated ${results.length} assets.\nErrors: ${errors.length}${errors.length > 0 ? '\n' + errorMessage : ''}`,
      ...(errors.length > 0
        ? {
            error: {
              message: errorMessage,
              type: ToolErrorType.EXECUTION_FAILED,
            },
          }
        : {}),
    };
  }

  // ============== Asset Handlers ==============

  private async handleBackground(
    req: BackgroundRequest,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error('Aborted');

    console.log(`[GenerateAssets] Generating background: ${req.key}`);

    const prompt = `
      Game background art, ${req.description}, ${this.params.style_anchor}.
      Full scene illustration, edge-to-edge, high detail, seamless composition.
      IMPORTANT: This is a BACKGROUND - must be fully opaque with rich colors.
      Fill entire canvas with scenery.
      
      ---FORBIDDEN (CRITICAL)---
      NO characters, NO people, NO figures, NO creatures, NO animals, NO NPCs.
      NO text, NO UI elements, NO transparency.
      PURE SCENERY ONLY - landscape, buildings, environment, sky, etc.
    `;

    const imageUrl = await this.modelRouter.generateImage(
      prompt,
      req.resolution || '1024*1024',
    );
    const buffer = await this.downloadImage(imageUrl);
    const cdnUrl = await this.saveAsset(buffer, req.key, assetsDir);

    this.updateAssetPack(assetPack, req.key, 'background', cdnUrl);
  }

  private async handleImage(
    req: ImageRequest,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error('Aborted');

    console.log(`[GenerateAssets] Generating image: ${req.key}`);

    const prompt = `
      Game asset sprite, ${req.description}, ${this.params.style_anchor}.
      Single object only, isolated on white background, centered composition, consistent size.
      ${this.params.composition_env || ''}
      IMPORTANT: Pure white background, no text, no position offset, ONE object only.
    `;

    const imageUrl = await this.modelRouter.generateImage(
      prompt,
      req.size || '1024*1024',
    );

    // Remove background
    const buffer = await this.bgRemovalService.removeBackgroundSafe(imageUrl);
    const cdnUrl = await this.saveAsset(buffer, req.key, assetsDir);

    this.updateAssetPack(assetPack, req.key, 'image', cdnUrl);
  }

  private async handleAnimation(
    req: AnimationRequest,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
  ): Promise<AnimationGenerationSummary> {
    if (signal.aborted) throw new Error('Aborted');

    const summary: AnimationGenerationSummary = {
      generatedFrames: 0,
      reusedFrames: 0,
      missingFrames: [],
    };
    const overwrite = this.params.overwrite_existing === true;
    const baseKey = `${req.key}_idle_01`;
    const existingBase = overwrite
      ? undefined
      : await this.findExistingAsset(
          assetPack,
          baseKey,
          'animation',
          assetsDir,
        );
    const missingFrameKeys = new Set<string>();
    const generatedFrameKeys = new Set<string>();

    for (const animation of req.animations) {
      for (let i = 1; i <= animation.frameCount; i++) {
        if (animation.name === 'idle' && i === 1) continue;
        const frameKey = this.animationFrameKey(req.key, animation.name, i);
        const existing = overwrite
          ? undefined
          : await this.findExistingAsset(
              assetPack,
              frameKey,
              'animation',
              assetsDir,
            );
        if (existing) summary.reusedFrames += 1;
        else missingFrameKeys.add(frameKey);
      }
    }

    if (existingBase) summary.reusedFrames += 1;
    if (existingBase && missingFrameKeys.size === 0) {
      console.log(
        `[GenerateAssets] Reusing complete animation asset: ${req.key}`,
      );
      return summary;
    }
    const plannedFrameKeys = new Set(missingFrameKeys);

    console.log(
      `[GenerateAssets] Generating animation: ${req.key} (${missingFrameKeys.size} missing frames)`,
    );
    const modelRouter = this.ensureModelRouter();

    // Step 1: Generate base image
    const basePrompt = `
      Game character sprite, ${req.description}, ${this.params.style_anchor}.
      SIDE VIEW (profile view, facing right), chibi style with big head.
      Single character only, neutral idle pose, centered composition.
      ${this.params.composition_env || ''}
      IMPORTANT: Pure white background, SIDE VIEW only, ONE character only.
    `;

    let baseImageUrl: string;
    if (existingBase) {
      baseImageUrl = await this.fileToDataUrl(existingBase.filePath);
    } else {
      baseImageUrl = await modelRouter.generateImage(basePrompt, '1024*1024');
      const baseBuffer =
        await this.bgRemovalService.removeBackgroundSafe(baseImageUrl);
      const baseCdnUrl = await this.saveAsset(baseBuffer, baseKey, assetsDir);
      this.updateAssetPack(assetPack, baseKey, 'animation', baseCdnUrl);
      summary.generatedFrames += 1;
    }

    // Step 2: Generate animation frames
    // Default to I2V (video) because I2I (wanx2.1-imageedit) may output to non-Beijing OSS
    // which is not accessible from some network environments (e.g., RunPod)
    // A resumed local base frame cannot be sent to remote I2V providers as a
    // public URL. Use I2I for missing frames while preserving the saved base.
    const useI2V = req.useI2V !== false && !existingBase;

    if (useI2V) {
      // Use I2V (Image-to-Video) approach - outputs to Beijing OSS, always accessible
      summary.generatedFrames += await this.generateAnimationViaI2V(
        req,
        baseImageUrl,
        assetPack,
        assetsDir,
        signal,
        missingFrameKeys,
        generatedFrameKeys,
      );
    } else {
      // Use I2I (Image-to-Image) approach - may have OSS accessibility issues
      console.warn(
        `[GenerateAssets] Using I2I mode - may have OSS network issues`,
      );
      summary.generatedFrames += await this.generateAnimationViaI2I(
        req,
        baseImageUrl,
        assetPack,
        assetsDir,
        signal,
        missingFrameKeys,
        generatedFrameKeys,
      );
    }

    for (const frameKey of plannedFrameKeys) {
      const complete = overwrite
        ? generatedFrameKeys.has(frameKey)
        : Boolean(
            await this.findExistingAsset(
              assetPack,
              frameKey,
              'animation',
              assetsDir,
            ),
          );
      if (!complete) {
        summary.missingFrames.push(frameKey);
      }
    }

    return summary;
  }

  private async generateAnimationViaI2V(
    req: AnimationRequest,
    baseImageUrl: string,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
    missingFrameKeys: Set<string>,
    generatedFrameKeys: Set<string>,
  ): Promise<number> {
    // Check if ffmpeg is available for local frame extraction
    const ffmpegAvailable =
      await this.frameExtractionService.isFFmpegAvailable();

    if (!ffmpegAvailable) {
      console.warn(
        `[GenerateAssets] FFmpeg not available, falling back to I2I mode`,
      );
      return this.generateAnimationViaI2I(
        req,
        baseImageUrl,
        assetPack,
        assetsDir,
        signal,
        missingFrameKeys,
        generatedFrameKeys,
      );
    }

    console.log(`[GenerateAssets] FFmpeg available: ${ffmpegAvailable}`);
    let generatedFrames = 0;
    const remainingFrameKeys = missingFrameKeys;

    for (const animation of req.animations) {
      if (signal.aborted) break;
      if (animation.name === 'idle' && animation.frameCount <= 1) continue;
      const missingForAnimation = Array.from(
        { length: animation.frameCount },
        (_, index) =>
          this.animationFrameKey(req.key, animation.name, index + 1),
      ).filter((key) => remainingFrameKeys.has(key));
      if (missingForAnimation.length === 0) continue;

      console.log(
        `[GenerateAssets] Generating I2V animation: ${animation.name}`,
      );

      const extractionDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gameagent-animation-'),
      );
      try {
        // Step 1: Generate video from base image using I2V
        const videoPrompt = `
          ${req.description}, ${animation.action_desc}.
          SIDE VIEW animation, single character only, smooth loop.
          IMPORTANT: Keep SIDE VIEW, character size MUST remain identical, stay at same position!
          ${this.params.style_anchor}
        `;

        console.log(`[GenerateAssets] Step 1: Generating video via I2V...`);
        const { videoUrl } = await this.modelRouter.generateVideo(
          baseImageUrl,
          videoPrompt,
          '480P',
        );
        console.log(
          `[GenerateAssets] Video generated: ${videoUrl.substring(0, 50)}...`,
        );

        // Step 2: Extract frames from video locally using ffmpeg
        // Use FIRST_LAST_FRAME_ONLY env var to enable first+last frame mode (for testing)
        const firstLastOnly = process.env.FIRST_LAST_FRAME_ONLY === 'true';
        console.log(
          `[GenerateAssets] Step 2: Extracting frames locally via ffmpeg (firstLastOnly=${firstLastOnly})...`,
        );
        const result = await this.frameExtractionService.extractFramesLocal(
          videoUrl,
          animation.frameCount,
          0, // fromTime
          4, // toTime (video is usually ~5s)
          extractionDir,
          firstLastOnly, // Only extract first and last frames when enabled
        );
        const frames = result.frames;
        const videoPath = result.videoPath;

        if (frames.length === 0) {
          throw new Error('Frame extraction failed - no frames extracted');
        }

        console.log(
          `[GenerateAssets] Extracted ${frames.length} frames locally (firstLastOnly=${firstLastOnly})`,
        );

        // Step 2.5: Save video file with proper name
        if (videoPath) {
          const videoKey = `${req.key}_${animation.name}_video`;
          try {
            const existingVideo = this.params.overwrite_existing
              ? undefined
              : await this.findExistingAsset(
                  assetPack,
                  videoKey,
                  'video',
                  assetsDir,
                );
            if (!existingVideo) {
              const videoBuffer = await fs.readFile(videoPath);
              const videoCdnUrl = await this.saveAsset(
                videoBuffer,
                videoKey,
                assetsDir,
                'mp4',
              );
              this.updateAssetPack(assetPack, videoKey, 'video', videoCdnUrl);
              console.log(`[GenerateAssets] Video saved: ${videoKey}.mp4`);
            }
          } catch (error) {
            console.warn(`[GenerateAssets] Failed to save video: ${error}`);
          }
        }

        // Step 3: Process frames - remove background and save
        console.log(
          `[GenerateAssets] Step 3: Processing ${frames.length} frames...`,
        );
        for (const frame of frames) {
          if (signal.aborted) break;

          const frameNumber = frame.frameIndex + 1;
          const frameKey = this.animationFrameKey(
            req.key,
            animation.name,
            frameNumber,
          );

          if (!remainingFrameKeys.has(frameKey)) continue;

          // Read frame, remove background, and save
          const frameBuffer = await fs.readFile(frame.path);
          const processedBuffer =
            await this.bgRemovalService.removeBackgroundFromBuffer(frameBuffer);
          const frameCdnUrl = await this.saveAsset(
            processedBuffer,
            frameKey,
            assetsDir,
          );
          this.updateAssetPack(assetPack, frameKey, 'animation', frameCdnUrl);
          generatedFrames += 1;
          remainingFrameKeys.delete(frameKey);
          generatedFrameKeys.add(frameKey);

          console.log(
            `[GenerateAssets] Saved frame ${frameNumber}/${animation.frameCount}: ${frameKey}`,
          );
        }

        if (missingForAnimation.some((key) => remainingFrameKeys.has(key))) {
          console.log(
            `[GenerateAssets] I2V returned fewer frames than requested; filling remaining ${animation.name} frames via I2I...`,
          );
          generatedFrames += await this.generateSingleAnimationI2I(
            req,
            animation,
            baseImageUrl,
            assetPack,
            assetsDir,
            signal,
            remainingFrameKeys,
            generatedFrameKeys,
          );
        }

        // Step 4: Extract audio from animation video (optional)
        try {
          const audioKey = `${req.key}_${animation.name}_sfx`;
          const existingAudio = this.params.overwrite_existing
            ? undefined
            : await this.findExistingAsset(
                assetPack,
                audioKey,
                'audio',
                assetsDir,
              );
          if (!existingAudio) {
            console.log(
              `[GenerateAssets] Step 4: Extracting audio from animation video (first 2s)...`,
            );
            const audioPath = await this.frameExtractionService.extractAudio(
              videoUrl,
              undefined,
              0,
              2,
            );
            const audioBuffer = await fs.readFile(audioPath);
            await fs.rm(path.dirname(audioPath), {
              recursive: true,
              force: true,
            });
            const audioCdnUrl = await this.saveAsset(
              audioBuffer,
              audioKey,
              assetsDir,
              'wav',
            );
            this.updateAssetPack(assetPack, audioKey, 'audio', audioCdnUrl);
            console.log(
              `[GenerateAssets] Extracted animation audio: ${audioKey}.wav`,
            );
          }
        } catch (error) {
          console.log(
            `[GenerateAssets] No audio extracted from animation (might be silent video): ${error}`,
          );
        }

        console.log(
          `[GenerateAssets] I2V animation ${animation.name} completed!`,
        );
      } catch (error) {
        console.warn(
          `[GenerateAssets] I2V failed for ${animation.name}: ${error}`,
        );
        console.log(
          `[GenerateAssets] Falling back to I2I for ${animation.name}...`,
        );
        generatedFrames += await this.generateSingleAnimationI2I(
          req,
          animation,
          baseImageUrl,
          assetPack,
          assetsDir,
          signal,
          remainingFrameKeys,
          generatedFrameKeys,
        );
      } finally {
        await fs.rm(extractionDir, { recursive: true, force: true });
      }
    }

    return generatedFrames;
  }

  private async generateAnimationViaI2I(
    req: AnimationRequest,
    baseImageUrl: string,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
    missingFrameKeys: Set<string>,
    generatedFrameKeys: Set<string>,
  ): Promise<number> {
    let generatedFrames = 0;
    for (const animation of req.animations) {
      if (signal.aborted) break;
      generatedFrames += await this.generateSingleAnimationI2I(
        req,
        animation,
        baseImageUrl,
        assetPack,
        assetsDir,
        signal,
        missingFrameKeys,
        generatedFrameKeys,
      );
    }
    return generatedFrames;
  }

  private async generateSingleAnimationI2I(
    req: AnimationRequest,
    animation: { name: string; frameCount: number; action_desc: string },
    baseImageUrl: string,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
    missingFrameKeys: Set<string>,
    generatedFrameKeys: Set<string>,
  ): Promise<number> {
    let previousFrameUrl: string | null = null;
    let generatedFrames = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds
    const FRAME_DELAY = 2000; // 2 seconds between frames to avoid rate limiting

    for (let i = 1; i <= animation.frameCount; i++) {
      if (signal.aborted) break;
      if (animation.name === 'idle' && i === 1) continue;

      const frameKey = `${req.key}_${animation.name}_${String(i).padStart(2, '0')}`;
      if (!missingFrameKeys.has(frameKey)) continue;

      const framePrompt = [
        `Same exact character as reference, ${animation.action_desc}.`,
        `SIDE VIEW animation, single character only, frame ${i} of ${animation.frameCount}.`,
        `IMPORTANT: Keep SIDE VIEW, same direction as reference.`,
        `IMPORTANT: Character size MUST be identical, stay at same position!`,
        `${this.params.style_anchor}, white background.`,
      ].join(' ');

      // Retry logic for I2I API failures
      let frameUrl: string | null = null;
      let lastError: Error | null = null;

      for (let retry = 0; retry < MAX_RETRIES; retry++) {
        try {
          if (retry > 0) {
            console.log(
              `[GenerateAssets] Retry ${retry}/${MAX_RETRIES} for frame ${frameKey}...`,
            );
            await this.sleep(RETRY_DELAY * retry); // Exponential backoff
          }

          frameUrl = await this.modelRouter.editImage(
            baseImageUrl,
            framePrompt,
            previousFrameUrl,
          );
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          console.warn(
            `[GenerateAssets] I2I failed (attempt ${retry + 1}/${MAX_RETRIES}): ${lastError.message}`,
          );

          // If it's a server error, retry; otherwise, throw immediately
          if (
            !lastError.message.includes('Internal server error') &&
            !lastError.message.includes('Task failed')
          ) {
            throw new Error(`${frameKey}: ${lastError.message}`, {
              cause: error,
            });
          }
        }
      }

      if (!frameUrl) {
        console.warn(
          `[GenerateAssets] Skipping frame ${frameKey} after ${MAX_RETRIES} retries`,
        );
        continue; // Skip this frame instead of failing entire animation
      }

      const frameBuffer =
        await this.bgRemovalService.removeBackgroundSafe(frameUrl);
      const frameCdnUrl = await this.saveAsset(
        frameBuffer,
        frameKey,
        assetsDir,
      );
      this.updateAssetPack(assetPack, frameKey, 'animation', frameCdnUrl);
      generatedFrames += 1;
      generatedFrameKeys.add(frameKey);
      missingFrameKeys.delete(frameKey);

      previousFrameUrl = frameUrl;

      // Add delay between frames to avoid rate limiting
      if (i < animation.frameCount) {
        await this.sleep(FRAME_DELAY);
      }
    }

    return generatedFrames;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async handleAudio(
    req: AudioRequest,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error('Aborted');

    console.log(
      `[GenerateAssets] Generating audio: ${req.key} (${req.audioType})`,
    );
    console.log(
      `[GenerateAssets] Audio request details: duration=${req.duration}, genre=${req.genre}, tempo=${req.tempo}`,
    );
    console.log(`[GenerateAssets] Output directory: ${assetsDir}`);

    const duration =
      req.audioType === 'sfx' ? req.duration || 1 : req.duration || 5;
    const audioType = req.audioType === 'bgm' ? 'bgm' : 'sfx';
    let buffer: Buffer | null = null;
    let extension = 'wav';

    // Strategy 0: dedicated text-to-audio provider. This is the preferred
    // production path for ElevenLabs, MiniMax, Stable Audio, Lyria and Mureka.
    try {
      const generated = await this.modelRouter.generateDirectAudio(req);
      if (generated) {
        buffer = generated.buffer;
        extension = generated.extension;
        console.log(
          `[GenerateAssets] Direct audio generated by provider (${buffer.length} bytes, ${extension})`,
        );
      }
    } catch (error) {
      console.warn(`[GenerateAssets] Direct audio generation failed: ${error}`);
      const provider = this.modelRouter.audioConfig?.provider;
      const professionalProvider =
        provider === 'elevenlabs' ||
        provider === 'minimax' ||
        provider === 'stability' ||
        provider === 'google-lyria' ||
        provider === 'mureka';
      const supportsRequestedType =
        req.audioType === 'bgm' ||
        provider === 'elevenlabs' ||
        provider === 'stability';
      if (professionalProvider && supportsRequestedType) throw error;
    }

    // Strategy 1: T2V → Extract audio
    const ffmpegAvailable =
      await this.frameExtractionService.isFFmpegAvailable();
    if (!buffer && ffmpegAvailable) {
      try {
        console.log(
          `[GenerateAssets] Step 1: Generating video for audio extraction (T2V)...`,
        );
        const videoPrompt = `
          ${req.description}.
          Music visualization, abstract, ${req.genre || 'ambient'}, ${req.tempo || 'medium'} tempo.
          High quality audio, clear sound.
        `;
        const { videoUrl } = await this.modelRouter.generateVideoFromText(
          videoPrompt,
          '720P',
        );
        console.log(
          `[GenerateAssets] Video generated: ${videoUrl.substring(0, 50)}...`,
        );

        console.log(`[GenerateAssets] Step 2: Extracting audio from video...`);
        const audioPath = await this.frameExtractionService.extractAudio(
          videoUrl,
          undefined,
          0,
          7,
        );
        buffer = await fs.readFile(audioPath);
        await fs.unlink(audioPath);
        try {
          await fs.rmdir(path.dirname(audioPath));
        } catch {
          // best-effort temp cleanup
        }
        console.log(`[GenerateAssets] Audio extraction successful!`);
      } catch (error) {
        console.warn(
          `[GenerateAssets] Video-based audio generation failed: ${error}`,
        );
      }
    }

    // Strategy 2: ABC notation → WAV via symusic
    if (!buffer) {
      console.log(`[GenerateAssets] Trying ABC notation via LLM...`);
      let abcNotation: string | null = null;
      try {
        abcNotation = await this.modelRouter.generateABC(req);
        console.log(
          `[GenerateAssets] ABC notation generated (${abcNotation.length} chars)`,
        );
      } catch (error) {
        console.warn(`[GenerateAssets] ABC generation failed: ${error}`);
      }

      if (abcNotation) {
        try {
          buffer = await this.modelRouter.generateAudioFromABC(
            abcNotation,
            audioType,
            duration,
          );
          console.log(`[GenerateAssets] ABC → WAV conversion successful!`);
        } catch (error) {
          console.warn(`[GenerateAssets] ABC → WAV failed: ${error}`);
        }
      }
    }

    // Strategy 3: Procedural fallback
    if (!buffer) {
      console.log(
        `[GenerateAssets] Using procedural audio generation (duration=${duration}s, type=${audioType})...`,
      );
      try {
        buffer = await this.modelRouter.generatePlaceholderAudio(
          duration,
          audioType,
        );
        console.log(
          `[GenerateAssets] Procedural audio generated successfully (${buffer.length} bytes)`,
        );
      } catch (error) {
        console.error(`[GenerateAssets] Procedural audio FAILED: ${error}`);
        throw new Error(
          `Audio generation failed for ${req.key}: All methods failed. Error: ${error}`,
        );
      }
    }

    if (!buffer || buffer.length === 0) {
      throw new Error(`Audio generation failed for ${req.key}: Empty buffer`);
    }

    const cdnUrl = await this.saveAsset(buffer, req.key, assetsDir, extension);
    console.log(
      `[GenerateAssets] Audio file written: ${req.key}.${extension} (${buffer.length} bytes)`,
    );

    this.updateAssetPack(assetPack, req.key, 'audio', cdnUrl);
    console.log(
      `[GenerateAssets] Audio saved: ${req.key}.${extension} (${audioType}, ${duration}s)`,
    );
  }

  // ============== Tileset Generation ==============

  private async handleTileset(
    req: TilesetRequest,
    assetPack: AssetPack,
    assetsDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw new Error('Aborted');

    // Force 3x3 strategy, ignore any tileset_size=7 that might be passed in
    // But we need to remember tile_size (default 64)
    const TILE_SIZE = req.tile_size || 64;

    // Final output size fixed at 7x7 (448px)
    const OUTPUT_GRID = 7;

    console.log(
      `[GenerateAssets] Generating tileset: ${req.key} using 9-Slice (3x3 -> 7x7) Strategy`,
    );

    // 1. Build Prompt: Request a perfect 3x3 core grid
    // IMPORTANT: Emphasize the theme/material from req.description
    const prompt = `
      3x3 Seamless Tileset (9 tiles total), ${this.params.style_anchor}.
      
THEME: ${req.description}. Use THIS EXACT material/theme for ALL tiles.

#1 SEAMLESS: All 9 tiles MUST touch directly. ZERO gaps. ZERO padding. ZERO spacing.
#2 FULL COVERAGE: Fill ENTIRE 1024x1024 canvas. NO margins. NO white space. NO empty areas.
#3 THEME CONSISTENCY: ALL 9 tiles must match the theme "${req.description}".

LAYOUT - exactly 3 rows × 3 columns:
Row 1: [TL corner][Top edge][TR corner]
Row 2: [Left edge][Center][Right edge]  
Row 3: [BL corner][Bottom edge][BR corner]

GRID CONTENTS (Row by Row):
- Top Row (1,2,3): Surface layer / Top Edges.
- Middle Row (4,5,6): Main Body / Center Fill. MUST BE TILEABLE.
- Bottom Row (7,8,9): Bottom Edges / Hanging base.

STYLE: Flat 2D front view. ${this.params.style_anchor}. Consistent lighting. 

---FORBIDDEN---
text, labels, numbers, letters, watermarks,
grid lines, borders, frames, padding, margins, gaps,
isometric, 3D, perspective, vignette, dark corners.
    `;

    // 2. Generate raw image (1024x1024)
    console.log(`[GenerateAssets] Step 1: Generating 3x3 source atlas...`);
    const imageUrl = await this.modelRouter.generateImage(prompt, '1024*1024');
    const rawBuffer = await this.downloadImage(imageUrl);

    // 3. Call Processor for intelligent expansion
    console.log(`[GenerateAssets] Step 2: Expanding to 7x7 Blobset...`);
    const isPixelArt = (this.params.style_anchor || '')
      .toLowerCase()
      .includes('pixel');

    const finalBuffer = await this.tilesetProcessor.expand3x3To7x7(
      rawBuffer,
      TILE_SIZE,
      isPixelArt,
    );

    // 4. Save
    const cdnUrl = await this.saveAsset(finalBuffer, req.key, assetsDir, 'png');

    // 5. Update Asset Pack
    // Note: We still mark it as "tileset" in JSON, but Phaser will load it as 7x7
    this.updateAssetPack(assetPack, req.key, 'tileset', cdnUrl);

    console.log(
      `[GenerateAssets] Tileset saved: ${req.key}.png (${OUTPUT_GRID}x${OUTPUT_GRID} grid, ${TILE_SIZE}px tiles)`,
    );
  }

  // ============== Helper Methods ==============

  private animationFrameKey(
    assetKey: string,
    animationName: string,
    frameNumber: number,
  ): string {
    return `${assetKey}_${animationName}_${String(frameNumber).padStart(2, '0')}`;
  }

  private async findExistingAsset(
    pack: AssetPack,
    key: string,
    assetType: string,
    assetsDir: string,
  ): Promise<ExistingAsset | undefined> {
    const candidateNames = new Set<string>();
    const allowedExtensions: readonly string[] =
      assetType === 'audio'
        ? AUDIO_EXTENSIONS
        : assetType === 'video'
          ? ['mp4']
          : ['png'];

    // Prefer the canonical filename emitted by this tool. A stale manifest
    // must never make one key reuse another key's file.
    for (const extension of allowedExtensions) {
      candidateNames.add(`${key}.${extension}`);
    }

    for (const section of Object.values(pack)) {
      if (!section || !Array.isArray(section.files)) continue;
      const entry = section.files.find((file) => file.key === key);
      if (entry?.url) {
        const name = path.basename(entry.url.split('?')[0]);
        if (
          path.parse(name).name === key &&
          allowedExtensions.includes(path.extname(name).slice(1).toLowerCase())
        ) {
          candidateNames.add(name);
        }
      }
    }

    for (const name of candidateNames) {
      const filePath = path.join(assetsDir, name);
      if (!(await this.isUsableAssetFile(filePath))) continue;
      const url = `assets/${name}`;
      // The file system is the source of truth during resume. Repair a stale
      // or missing manifest entry instead of paying for another generation.
      this.updateAssetPack(pack, key, assetType, url);
      return { filePath, url };
    }

    return undefined;
  }

  private async isUsableAssetFile(filePath: string): Promise<boolean> {
    try {
      const info = await fs.stat(filePath);
      if (!info.isFile() || info.size === 0) return false;
      if (path.extname(filePath).toLowerCase() !== '.png') return true;

      // A PNG signature alone is insufficient: a killed process can leave a
      // truncated file with a valid header. Require both the signature and the
      // terminal IEND chunk. New writes are also committed atomically below.
      if (info.size < 20) return false;
      const handle = await fs.open(filePath, 'r');
      try {
        const header = Buffer.alloc(8);
        const ending = Buffer.alloc(12);
        const [{ bytesRead: headerBytes }, { bytesRead: endingBytes }] =
          await Promise.all([
            handle.read(header, 0, header.length, 0),
            handle.read(ending, 0, ending.length, info.size - ending.length),
          ]);
        return (
          headerBytes === 8 &&
          endingBytes === 12 &&
          header.equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ) &&
          ending.equals(
            Buffer.from([
              0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
              0x82,
            ]),
          )
        );
      } finally {
        await handle.close();
      }
    } catch {
      return false;
    }
  }

  private async fileToDataUrl(filePath: string): Promise<string> {
    const extension = path.extname(filePath).toLowerCase();
    const mime =
      extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/png';
    const buffer = await fs.readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private async loadAssetPack(packPath: string): Promise<AssetPack> {
    try {
      const data = await fs.readFile(packPath, 'utf-8');
      const parsed: unknown = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const normalized: AssetPack = {};
      for (const [sectionName, section] of Object.entries(parsed)) {
        if (
          !section ||
          typeof section !== 'object' ||
          !Array.isArray((section as { files?: unknown }).files)
        ) {
          continue;
        }
        const files = (section as { files: unknown[] }).files.filter(
          (entry): entry is AssetPack['section']['files'][number] => {
            if (!entry || typeof entry !== 'object') return false;
            const candidate = entry as Record<string, unknown>;
            return (
              (candidate['type'] === 'image' ||
                candidate['type'] === 'audio' ||
                candidate['type'] === 'video' ||
                candidate['type'] === 'tileset') &&
              typeof candidate['key'] === 'string' &&
              typeof candidate['url'] === 'string'
            );
          },
        );
        normalized[sectionName] = { files };
      }
      return normalized;
    } catch {
      return {};
    }
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async saveAsset(
    buffer: Buffer,
    key: string,
    assetsDir: string,
    extension: string = 'png',
  ): Promise<string> {
    const filename = `${key}.${extension}`;
    const filePath = path.join(assetsDir, filename);
    await this.writeFileAtomic(filePath, buffer);
    return `assets/${filename}`;
  }

  private async writeFileAtomic(
    filePath: string,
    data: string | Uint8Array,
  ): Promise<void> {
    const filename = path.basename(filePath);
    const parentDir = path.dirname(filePath);
    const tempPath = path.join(
      parentDir,
      `.${filename}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // best-effort cleanup when the temporary file was never created
      }
      throw error;
    }
  }

  private getSectionName(assetType: string, key: string): string {
    switch (assetType) {
      case 'background':
        return 'backgrounds';
      case 'animation': {
        const entityName = key.split('_')[0];
        return `${entityName}_animations`;
      }
      case 'audio':
        return 'audio';
      case 'video': {
        const videoEntityName = key.split('_')[0];
        return `${videoEntityName}_videos`;
      }
      case 'tileset':
        return 'tilesets';
      case 'image':
      default:
        return 'images';
    }
  }

  private updateAssetPack(
    pack: AssetPack,
    key: string,
    assetType: string,
    url: string,
  ): void {
    const section = this.getSectionName(assetType, key);

    if (!pack[section]) {
      pack[section] = { files: [] };
    }

    const list = pack[section].files;
    const existing = list.find((f) => f.key === key);

    // Determine file type for asset pack (Phaser compatible)
    let fileType: 'image' | 'audio' | 'video' | 'tileset' = 'image';
    if (assetType === 'audio') {
      fileType = 'audio';
    } else if (assetType === 'video') {
      fileType = 'video';
    } else if (assetType === 'tileset') {
      fileType = 'image'; // Phaser loads tilesets as images
    }

    if (existing) {
      existing.type = fileType;
      existing.url = url;
    } else {
      list.push({ type: fileType, key, url });
    }
  }
}

// ============== Tool Class ==============

export class GenerateAssetsTool extends BaseDeclarativeTool<
  GenerateAssetsParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.GENERATE_ASSETS;

  constructor(private config: Config) {
    super(
      ToolNames.GENERATE_ASSETS,
      ToolDisplayNames.GENERATE_ASSETS,
      `Generates game assets (images, animations, audio) using AI models.
       Provider (Tongyi / Doubao / any OpenAI-compatible API) and model names
       are configured per-modality via env vars or ~/.qwen/settings.json
       (see docs/users/configuration/api-keys.md). Features auto background
       removal, I2V animation generation, and ABC-based music generation.`,
      Kind.Fetch,
      {
        type: 'object',
        properties: {
          style_anchor: {
            type: 'string',
            description:
              'Global visual style (e.g., "16-bit pixel art, vibrant colors")',
          },
          composition_env: {
            type: 'string',
            description:
              'Composition hints (e.g., "white background, centered, same size, no offset")',
          },
          output_dir_name: {
            type: 'string',
            description: 'Output directory (default: "public/assets")',
          },
          model_type: {
            type: 'string',
            enum: ['tongyi', 'doubao', 'openai-compat'],
            description:
              'Optional hint for the asset-generation provider family. ' +
              'Most users should configure providers via env vars or settings.json instead — ' +
              'see docs/users/configuration/api-keys.md.',
          },
          overwrite_existing: {
            type: 'boolean',
            description:
              'Regenerate existing files. Defaults to false so interrupted runs resume by generating only missing assets and animation frames.',
          },
          assets: {
            type: 'array',
            description: 'List of assets to generate',
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    type: { const: 'background' },
                    key: { type: 'string' },
                    description: { type: 'string' },
                    resolution: {
                      type: 'string',
                      enum: ['1024*1024', '1536*1024', '2048*2048'],
                    },
                  },
                  required: ['type', 'key', 'description'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'image' },
                    key: { type: 'string' },
                    description: { type: 'string' },
                    size: { type: 'string' },
                  },
                  required: ['type', 'key', 'description'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'animation' },
                    key: { type: 'string' },
                    description: { type: 'string' },
                    useI2V: {
                      type: 'boolean',
                      description: 'Use I2V for animation (faster, smoother)',
                    },
                    animations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          frameCount: { type: 'number' },
                          action_desc: { type: 'string' },
                        },
                        required: ['name', 'frameCount', 'action_desc'],
                      },
                    },
                  },
                  required: ['type', 'key', 'description', 'animations'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'audio' },
                    key: { type: 'string' },
                    description: { type: 'string' },
                    audioType: { type: 'string', enum: ['bgm', 'sfx'] },
                    duration: { type: 'number' },
                    genre: { type: 'string' },
                    tempo: { type: 'string', enum: ['slow', 'medium', 'fast'] },
                  },
                  required: ['type', 'key', 'description', 'audioType'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'tileset' },
                    key: { type: 'string' },
                    description: {
                      type: 'string',
                      description:
                        'Tileset theme/style (e.g., "jungle terrain", "dungeon walls")',
                    },
                    tileset_size: {
                      type: 'number',
                      description: 'Grid size (default 7 = 7x7 = 49 tiles)',
                    },
                    tile_size: {
                      type: 'number',
                      description: 'Pixel size per tile (default 64)',
                    },
                  },
                  required: ['type', 'key', 'description'],
                },
              ],
            },
          },
        },
        required: ['style_anchor', 'assets'],
      },
      false,
      true,
    );
  }

  protected createInvocation(
    params: GenerateAssetsParams,
  ): ToolInvocation<GenerateAssetsParams, ToolResult> {
    return new GenerateAssetsInvocation(this.config, params);
  }
}
