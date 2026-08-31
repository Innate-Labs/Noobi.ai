import type { GameAssetRecord, GameEngine } from '../shared/contracts.js';
import { findProductionAssetReference } from './imageGenerationAttestation.js';

const CARD_GAME = /(?:卡牌|卡片|卡组|牌组|集换式|deck[ -]?builder|card[ -]?game|\btcg\b|\bccg\b)/iu;
const MINIMUM_CARD_SUBJECTS = 4;

export type VisualAssetCoverageResult =
  | {
      ok: true;
      profile: 'generic' | 'card-game';
      referencedPaths: string[];
    }
  | {
      ok: false;
      profile: 'card-game';
      reason: 'missing-core-card-art' | 'insufficient-card-coverage' | 'missing-production-reference';
      detail: string;
    };

/**
 * Genre-aware host gate for core visual entities. The public role metadata is
 * classification only, never provenance; origin remains protected by the
 * private image-generation attestation gate.
 */
export async function verifyVisualAssetCoverage(input: {
  name: string;
  idea: string;
  engine: GameEngine;
  root: string;
  assets: readonly GameAssetRecord[];
}): Promise<VisualAssetCoverageResult> {
  if (!CARD_GAME.test(`${input.name}\n${input.idea}`)) {
    return { ok: true, profile: 'generic', referencedPaths: [] };
  }

  const images = input.assets.filter((asset) => asset.kind === 'image');
  const atlases = images.filter((asset) => metadataText(asset, 'role') === 'card-art-atlas');
  let atlasWithoutReference = false;
  let atlasWithoutCoverage = false;
  for (const atlas of atlases) {
    const columns = metadataInteger(atlas, 'columns');
    const rows = metadataInteger(atlas, 'rows');
    const subjects = metadataSubjects(atlas);
    if (columns * rows < MINIMUM_CARD_SUBJECTS || subjects.size < MINIMUM_CARD_SUBJECTS) {
      atlasWithoutCoverage = true;
      continue;
    }
    const referencedBy = await findProductionAssetReference(input.root, atlas.relativePath);
    if (!referencedBy) {
      atlasWithoutReference = true;
      continue;
    }
    return { ok: true, profile: 'card-game', referencedPaths: [atlas.relativePath] };
  }

  const individualFaces = images.filter((asset) => {
    const role = metadataText(asset, 'role');
    return role === 'card-art' || role === 'card-face';
  });
  const referencedFaces = new Map<string, string>();
  for (const face of individualFaces) {
    const subjectId = metadataText(face, 'subjectId');
    if (!subjectId || referencedFaces.has(subjectId)) continue;
    if (await findProductionAssetReference(input.root, face.relativePath)) {
      referencedFaces.set(subjectId, face.relativePath);
    }
  }
  if (referencedFaces.size >= MINIMUM_CARD_SUBJECTS) {
    return {
      ok: true,
      profile: 'card-game',
      referencedPaths: [...referencedFaces.values()],
    };
  }

  if (atlasWithoutReference || individualFaces.length >= MINIMUM_CARD_SUBJECTS) {
    return {
      ok: false,
      profile: 'card-game',
      reason: 'missing-production-reference',
      detail: '卡牌图片已经登记，但没有被游戏生产源码或 Godot 场景实际引用。',
    };
  }
  if (atlasWithoutCoverage || atlases.length > 0 || individualFaces.length > 0) {
    return {
      ok: false,
      profile: 'card-game',
      reason: 'insufficient-card-coverage',
      detail: '卡牌素材没有覆盖至少四个可寻址的 cardId；背景图或重复区域不能代替卡面。',
    };
  }
  return {
    ok: false,
    profile: 'card-game',
    reason: 'missing-core-card-art',
    detail: '项目只有背景或通用图片，没有登记 card-art/card-face/card-art-atlas 核心卡牌素材。',
  };
}

function metadataText(asset: GameAssetRecord, key: string): string {
  const value = asset.metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function metadataInteger(asset: GameAssetRecord, key: string): number {
  const value = asset.metadata?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function metadataSubjects(asset: GameAssetRecord): Set<string> {
  const value = metadataText(asset, 'subjects');
  return new Set(value.split(',').map((subject) => subject.trim()).filter(Boolean));
}
