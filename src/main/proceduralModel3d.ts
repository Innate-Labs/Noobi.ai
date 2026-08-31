import { createHash } from 'node:crypto';

import * as THREE from 'three';
import { GLTFExporter, mergeBufferGeometries } from 'three-stdlib';

const GENERATOR_ID = 'threejs-procedural-v1';
const MAX_GLB_BYTES = 16 * 1024 * 1024;

export type ProceduralModel3dPreset =
  | 'rigged-character'
  | 'crate'
  | 'tree'
  | 'rock'
  | 'structure'
  | 'artifact';

export interface ProceduralModel3dInput {
  name: string;
  prompt: string;
  animation?: boolean;
}

export interface ProceduralModel3dResult {
  bytes: Buffer;
  generator: typeof GENERATOR_ID;
  preset: ProceduralModel3dPreset;
  rigged: boolean;
  animated: boolean;
  animations: string;
  vertexCount: number;
  triangleCount: number;
  promptSha256: string;
}

interface BuiltModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  preset: ProceduralModel3dPreset;
  rigged: boolean;
}

/**
 * Produces a bounded, self-contained GLB with Three.js in the Electron main process.
 * Three.js is an authoring/export dependency only: the returned GLB is the runtime asset.
 */
export async function createProceduralModel3dGlb(
  input: ProceduralModel3dInput,
): Promise<ProceduralModel3dResult> {
  const name = cleanName(input.name);
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('Procedural 3D prompt is required');

  const promptSha256 = createHash('sha256').update(prompt, 'utf8').digest('hex');
  const seed = createHash('sha256').update(`${name}\0${prompt}`, 'utf8').digest().readUInt32LE(0);
  const palette = seededPalette(seed);
  const preset = choosePreset(prompt, Boolean(input.animation));
  const built = preset === 'rigged-character'
    ? buildRiggedCharacter(name, palette, Boolean(input.animation))
    : buildStaticModel(name, preset, palette, seed);

  const scene = new THREE.Scene();
  scene.name = `${name}-export`;
  scene.userData = {
    generator: GENERATOR_ID,
    preset,
    promptSha256,
    units: 'meters',
    upAxis: 'Y',
  };
  scene.add(built.root);
  scene.updateMatrixWorld(true);

  const { vertexCount, triangleCount } = geometryCounts(scene);
  if (vertexCount < 3 || triangleCount < 1) {
    disposeScene(scene);
    throw new Error('Three.js fallback did not produce renderable mesh geometry');
  }

  try {
    installNodeFileReaderAdapter();
    const exporter = new GLTFExporter();
    const exported = await exporter.parseAsync(scene, {
      binary: true,
      onlyVisible: true,
      trs: true,
      animations: built.animations,
    });
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error('Three.js exporter did not return a binary GLB');
    }
    const bytes = Buffer.from(exported);
    assertGlbEnvelope(bytes);
    if (bytes.length > MAX_GLB_BYTES) {
      throw new Error('Three.js fallback exceeded the 16 MiB GLB budget');
    }
    return {
      bytes,
      generator: GENERATOR_ID,
      preset,
      rigged: built.rigged,
      animated: built.animations.length > 0,
      animations: built.animations.map((clip) => clip.name).join(','),
      vertexCount,
      triangleCount,
      promptSha256,
    };
  } finally {
    disposeScene(scene);
  }
}

function buildRiggedCharacter(
  name: string,
  palette: readonly [THREE.Color, THREE.Color, THREE.Color],
  animation: boolean,
): BuiltModel {
  const rootBone = bone('Root', 0, 0, 0);
  const hips = bone('Hips', 0, 0.92, 0);
  const spine = bone('Spine', 0, 0.55, 0);
  const head = bone('Head', 0, 0.76, 0);
  const leftArm = bone('LeftArm', -0.58, 0.36, 0);
  const rightArm = bone('RightArm', 0.58, 0.36, 0);
  const leftLeg = bone('LeftLeg', -0.23, -0.08, 0);
  const rightLeg = bone('RightLeg', 0.23, -0.08, 0);
  rootBone.add(hips);
  hips.add(spine, leftLeg, rightLeg);
  spine.add(head, leftArm, rightArm);

  const segments: Array<{ geometry: THREE.BufferGeometry; bone: number }> = [
    { geometry: box(0.82, 0.38, 0.42, 0, 0.98, 0), bone: 1 },
    { geometry: box(0.9, 0.9, 0.48, 0, 1.55, 0), bone: 2 },
    { geometry: box(0.54, 0.5, 0.52, 0, 2.33, 0), bone: 3 },
    { geometry: box(0.25, 0.82, 0.28, -0.7, 1.54, 0), bone: 4 },
    { geometry: box(0.25, 0.82, 0.28, 0.7, 1.54, 0), bone: 5 },
    { geometry: box(0.3, 0.86, 0.34, -0.24, 0.45, 0), bone: 6 },
    { geometry: box(0.3, 0.86, 0.34, 0.24, 0.45, 0), bone: 7 },
    { geometry: box(0.42, 0.2, 0.58, -0.24, 0.06, -0.12), bone: 6 },
    { geometry: box(0.42, 0.2, 0.58, 0.24, 0.06, -0.12), bone: 7 },
  ];
  for (const segment of segments) addSkinAttributes(segment.geometry, segment.bone);
  const merged = mergeBufferGeometries(segments.map((segment) => segment.geometry), true);
  for (const segment of segments) segment.geometry.dispose();
  if (!merged) throw new Error('Could not merge procedural character geometry');

  const materials = segments.map((_, index) => new THREE.MeshStandardMaterial({
    name: `NoobiMaterial${index + 1}`,
    color: index === 2 ? palette[2] : palette[index % 2],
    roughness: index === 2 ? 0.62 : 0.78,
    metalness: index < 3 ? 0.16 : 0.05,
  }));
  const mesh = new THREE.SkinnedMesh(merged, materials);
  mesh.name = `${name}-rigged-mesh`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(rootBone);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([rootBone, hips, spine, head, leftArm, rightArm, leftLeg, rightLeg]));

  const container = new THREE.Group();
  container.name = name;
  container.userData = { proceduralFallback: true, rigged: true };
  container.add(mesh);
  return {
    root: container,
    animations: animation
      ? characterAnimationClips({ spine, head, leftArm, rightArm, leftLeg, rightLeg })
      : [],
    preset: 'rigged-character',
    rigged: true,
  };
}

function buildStaticModel(
  name: string,
  preset: Exclude<ProceduralModel3dPreset, 'rigged-character'>,
  palette: readonly [THREE.Color, THREE.Color, THREE.Color],
  seed: number,
): BuiltModel {
  const root = new THREE.Group();
  root.name = name;
  root.userData = { proceduralFallback: true, rigged: false };
  const materials = palette.map((color, index) => new THREE.MeshStandardMaterial({
    name: `NoobiMaterial${index + 1}`,
    color,
    roughness: index === 2 ? 0.55 : 0.82,
    metalness: index === 2 ? 0.42 : 0.05,
  }));
  const add = (geometry: THREE.BufferGeometry, materialIndex: number, objectName: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, materials[materialIndex]);
    mesh.name = objectName;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  if (preset === 'crate') {
    add(new THREE.BoxGeometry(1.4, 1.4, 1.4), 0, 'CrateBody').position.y = 0.7;
    for (const rotation of [0, Math.PI / 2]) {
      const band = add(new THREE.BoxGeometry(1.48, 0.18, 1.48), 2, 'CrateBand');
      band.position.y = 0.7;
      band.rotation.z = rotation;
    }
  } else if (preset === 'tree') {
    const trunk = add(new THREE.CylinderGeometry(0.22, 0.34, 1.7, 10), 0, 'Trunk');
    trunk.position.y = 0.85;
    const crown = add(new THREE.IcosahedronGeometry(0.9, 1), 1, 'Crown');
    crown.position.y = 2.05;
    crown.scale.set(1.0, 1.18, 0.92);
  } else if (preset === 'rock') {
    const rock = add(new THREE.DodecahedronGeometry(0.9, 1), 0, 'Rock');
    rock.position.y = 0.66;
    rock.scale.set(1.25, 0.78, 1.0);
    rock.rotation.set(0.08, seededUnit(seed, 3) * Math.PI, -0.06);
  } else if (preset === 'structure') {
    const base = add(new THREE.BoxGeometry(2.4, 0.35, 1.8), 0, 'Foundation');
    base.position.y = 0.175;
    for (const x of [-0.8, 0.8]) {
      const tower = add(new THREE.BoxGeometry(0.62, 2.2, 0.72), 0, 'Tower');
      tower.position.set(x, 1.28, 0);
      const roof = add(new THREE.ConeGeometry(0.55, 0.65, 4), 2, 'TowerRoof');
      roof.position.set(x, 2.72, 0);
      roof.rotation.y = Math.PI / 4;
    }
    const lintel = add(new THREE.BoxGeometry(1.3, 0.42, 0.55), 1, 'Lintel');
    lintel.position.set(0, 1.88, 0);
  } else {
    const body = add(new THREE.CylinderGeometry(0.68, 0.88, 1.5, 8), 0, 'ArtifactBody');
    body.position.y = 0.78;
    const core = add(new THREE.OctahedronGeometry(0.47, 0), 2, 'ArtifactCore');
    core.position.y = 1.72;
    core.rotation.y = seededUnit(seed, 7) * Math.PI;
    const ring = add(new THREE.TorusGeometry(0.78, 0.09, 8, 24), 1, 'ArtifactRing');
    ring.position.y = 1.72;
    ring.rotation.x = Math.PI / 2;
  }

  return { root, animations: [], preset, rigged: false };
}

function characterAnimationClips(bones: {
  spine: THREE.Bone;
  head: THREE.Bone;
  leftArm: THREE.Bone;
  rightArm: THREE.Bone;
  leftLeg: THREE.Bone;
  rightLeg: THREE.Bone;
}): THREE.AnimationClip[] {
  const idleTimes = [0, 1, 2];
  const idle = new THREE.AnimationClip('idle', 2, [
    quaternionTrack(bones.spine, idleTimes, [-0.025, 0.025, -0.025], 'x'),
    quaternionTrack(bones.head, idleTimes, [0.04, -0.04, 0.04], 'y'),
    quaternionTrack(bones.leftArm, idleTimes, [0.05, -0.02, 0.05], 'z'),
    quaternionTrack(bones.rightArm, idleTimes, [-0.05, 0.02, -0.05], 'z'),
  ]);
  const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
  const walk = new THREE.AnimationClip('walk', 0.8, [
    quaternionTrack(bones.leftArm, walkTimes, [0.55, 0, -0.55, 0, 0.55], 'x'),
    quaternionTrack(bones.rightArm, walkTimes, [-0.55, 0, 0.55, 0, -0.55], 'x'),
    quaternionTrack(bones.leftLeg, walkTimes, [-0.48, 0, 0.48, 0, -0.48], 'x'),
    quaternionTrack(bones.rightLeg, walkTimes, [0.48, 0, -0.48, 0, 0.48], 'x'),
  ]);
  const runTimes = [0, 0.1375, 0.275, 0.4125, 0.55];
  const run = new THREE.AnimationClip('run', 0.55, [
    quaternionTrack(bones.leftArm, runTimes, [0.9, 0, -0.9, 0, 0.9], 'x'),
    quaternionTrack(bones.rightArm, runTimes, [-0.9, 0, 0.9, 0, -0.9], 'x'),
    quaternionTrack(bones.leftLeg, runTimes, [-0.75, 0.1, 0.75, 0.1, -0.75], 'x'),
    quaternionTrack(bones.rightLeg, runTimes, [0.75, 0.1, -0.75, 0.1, 0.75], 'x'),
    quaternionTrack(bones.spine, runTimes, [-0.14, -0.11, -0.14, -0.11, -0.14], 'x'),
  ]);
  return [idle, walk, run].map((clip) => clip.optimize());
}

function quaternionTrack(
  boneValue: THREE.Bone,
  times: number[],
  angles: number[],
  axis: 'x' | 'y' | 'z',
): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  for (const angle of angles) {
    const euler = new THREE.Euler(
      axis === 'x' ? angle : 0,
      axis === 'y' ? angle : 0,
      axis === 'z' ? angle : 0,
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${boneValue.name}.quaternion`, times, values);
}

function addSkinAttributes(geometry: THREE.BufferGeometry, boneIndex: number): void {
  const vertexCount = geometry.getAttribute('position').count;
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    indices[index * 4] = boneIndex;
    weights[index * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}

function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(x, y, z);
  return geometry;
}

function bone(name: string, x: number, y: number, z: number): THREE.Bone {
  const value = new THREE.Bone();
  value.name = name;
  value.position.set(x, y, z);
  return value;
}

function choosePreset(prompt: string, animation: boolean): ProceduralModel3dPreset {
  if (animation || /(character|player|hero|robot|zombie|enemy|creature|humanoid|角色|人物|玩家|机器人|僵尸|敌人|怪物)/iu.test(prompt)) {
    return 'rigged-character';
  }
  if (/(crate|box|chest|container|箱|木箱|宝箱)/iu.test(prompt)) return 'crate';
  if (/(tree|plant|forest|树|植物|森林)/iu.test(prompt)) return 'tree';
  if (/(rock|stone|boulder|岩|石头|巨石)/iu.test(prompt)) return 'rock';
  if (/(building|house|tower|gate|castle|建筑|房屋|塔|城堡|大门)/iu.test(prompt)) return 'structure';
  return 'artifact';
}

function seededPalette(seed: number): readonly [THREE.Color, THREE.Color, THREE.Color] {
  const hue = seededUnit(seed, 1);
  return [
    new THREE.Color().setHSL(hue, 0.46, 0.36),
    new THREE.Color().setHSL((hue + 0.12) % 1, 0.58, 0.52),
    new THREE.Color().setHSL((hue + 0.5) % 1, 0.72, 0.62),
  ];
}

function seededUnit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function geometryCounts(root: THREE.Object3D): { vertexCount: number; triangleCount: number } {
  let vertexCount = 0;
  let triangleCount = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    vertexCount += positions.count;
    triangleCount += object.geometry.index
      ? Math.floor(object.geometry.index.count / 3)
      : Math.floor(positions.count / 3);
  });
  return { vertexCount, triangleCount };
}

function assertGlbEnvelope(bytes: Buffer): void {
  if (bytes.length < 20 || bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error('Three.js fallback returned an invalid GLB signature');
  }
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Three.js fallback returned an invalid GLB envelope');
  }
}

function cleanName(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '');
  return cleaned || 'procedural-model';
}

function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const values = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of values) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

interface NodeFileReaderShape {
  result: ArrayBuffer | string | null;
  error: Error | null;
  onloadend: ((event: { target: NodeFileReaderShape }) => void) | null;
  onerror: ((event: { target: NodeFileReaderShape }) => void) | null;
  readAsArrayBuffer(blob: Blob): void;
}

class NodeFileReaderAdapter implements NodeFileReaderShape {
  result: ArrayBuffer | string | null = null;
  error: Error | null = null;
  onloadend: ((event: { target: NodeFileReaderShape }) => void) | null = null;
  onerror: ((event: { target: NodeFileReaderShape }) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.({ target: this });
    }).catch((error: unknown) => {
      this.error = error instanceof Error ? error : new Error('Could not read exporter Blob');
      this.onerror?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}

function installNodeFileReaderAdapter(): void {
  const globals = globalThis as typeof globalThis & { FileReader?: typeof NodeFileReaderAdapter };
  if (typeof globals.FileReader !== 'function') globals.FileReader = NodeFileReaderAdapter;
}
