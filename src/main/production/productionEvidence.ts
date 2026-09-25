import { createHash } from 'node:crypto';
import type { ProductionEvidence } from '../../shared/productionGraph.js';
import type { AssetPlanRecord } from '../../shared/contracts.js';
import type { GodotBuildStore } from './godotBuildStore.js';

/** A receipt of observed bytes, not another quality verdict. Old exports are omitted. */
export async function productionEvidence(input: {
  projectId: string; root: string; engine: string; builds: GodotBuildStore; assets: () => Promise<AssetPlanRecord[]>;
}): Promise<ProductionEvidence> {
  const sourceHash = await input.builds.fingerprint(input.root);
  const assets = await input.assets();
  const assetsHash = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
  const evidence: ProductionEvidence = { sourceHash, assetsHash,
    assets: assets.map(({ id, status, relativePath, sha256 }) => ({ id, status, relativePath, sha256 })) };
  if (input.engine === 'godot') {
    const build = await input.builds.latest(input.projectId);
    if (build?.record.status === 'built' && build.record.sourceHash === sourceHash) {
      try {
        await input.builds.verifyArtifacts(build);
        const report = await input.builds.report(build);
        evidence.build = { id: build.record.buildId, sourceHash, artifactHash: build.record.artifactHash,
          ...(report ? { reportHash: createHash('sha256').update(JSON.stringify(report)).digest('hex') } : {}) };
      } catch { evidence.buildUnavailable = '构建产物或报告无法核对，未作为此步证据；需要重新构建与检查'; }
    } else evidence.buildUnavailable = build ? '已有构建与当前源码不匹配，未作为此步证据' : '尚无冻结构建';
  }
  if (await input.builds.fingerprint(input.root) !== sourceHash) throw new Error('保存制作步骤时工程发生变化，请重新核对当前版本');
  return evidence;
}
