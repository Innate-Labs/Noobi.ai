/**
 * Asset Generation Types - V2
 * Inspired by PiXelDa architecture
 */

// ============== Model Configuration ==============

export interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  modelType:
    | 'tongyi'
    | 'doubao'
    | 'openai-compat'
    | 'elevenlabs'
    | 'minimax'
    | 'stability'
    | 'google-lyria'
    | 'mureka';
}

export interface ImageModelConfig extends ModelConfig {
  modelNameGeneration: string;
  modelNameEditing: string;
  temperature?: number;
  timeout?: number;
}

export interface VideoModelConfig extends ModelConfig {
  modelNameVideo: string;
  modelNameVideoText?: string;
  resolution?: '480P' | '720P';
}

export interface AudioModelConfig extends ModelConfig {
  modelNameChat: string;
  maxTokens?: number;
}

// ============== Request Types ==============

export interface BaseAssetRequest {
  key: string;
  description: string;
}

export interface BackgroundRequest extends BaseAssetRequest {
  type: 'background';
  resolution?: '1024*1024' | '1536*1024' | '2048*2048';
}

export interface ImageRequest extends BaseAssetRequest {
  type: 'image';
  size?: '512*512' | '1024*1024';
}

export interface AnimationDef {
  name: string;
  frameCount: number;
  action_desc: string;
}

export interface AnimationRequest extends BaseAssetRequest {
  type: 'animation';
  animations: AnimationDef[];
  /**
   * Use I2V (Image-to-Video) for animation generation
   * Default: true (recommended - outputs to Beijing OSS which is accessible)
   * If set to false, uses I2I (Image-to-Image) which may have OSS network issues
   */
  useI2V?: boolean;
}

export interface AudioRequest extends BaseAssetRequest {
  type: 'audio';
  audioType: 'bgm' | 'sfx';
  duration?: number;
  genre?: string;
  tempo?: 'slow' | 'medium' | 'fast';
}

export interface TilesetRequest extends BaseAssetRequest {
  type: 'tileset';
  /** Grid size (default 7 = 7x7 = 49 tiles) */
  tileset_size?: number;
  /** Pixel size per tile (default 64) */
  tile_size?: number;
}

export type AssetRequest =
  | BackgroundRequest
  | ImageRequest
  | AnimationRequest
  | AudioRequest
  | TilesetRequest;

// ============== Generation Parameters ==============

export interface GenerateAssetsParams {
  style_anchor: string;
  composition_env?: string;
  output_dir_name?: string;
  model_type?: 'tongyi' | 'doubao' | 'openai-compat';
  /** Regenerate files that already exist. Defaults to false for safe resume. */
  overwrite_existing?: boolean;
  assets: AssetRequest[];
}

// ============== Response Types ==============

export interface GenerationResult {
  success: boolean;
  key: string;
  url?: string;
  error?: string;
}

export interface ImageGenerationResponse {
  url: string;
  taskId?: string;
}

export interface VideoGenerationResponse {
  videoUrl: string;
  taskId: string;
}

export interface AudioGenerationResponse {
  originalUrl: string;
  chiptuneUrl?: string;
}

// ============== Asset Pack Types ==============

export interface AssetPackFile {
  type: 'image' | 'audio' | 'video' | 'tileset';
  key: string;
  url: string;
}

export interface AssetPack {
  [section: string]: { files: AssetPackFile[] };
}

// ============== Frame Split Types ==============

export interface FrameSplitRequest {
  videoUrl: string;
  fromTime: number;
  toTime: number;
  frameCount: number;
}

export interface FrameSplitResult {
  frames: Buffer[];
  frameUrls?: string[];
}
