declare module 'three-stdlib' {
  import type { AnimationClip, BufferGeometry, Object3D } from 'three';

  export interface NoobiGltfExporterOptions {
    animations?: AnimationClip[];
    binary?: boolean;
    onlyVisible?: boolean;
    trs?: boolean;
  }

  export class GLTFExporter {
    parseAsync(
      input: Object3D | Object3D[],
      options?: NoobiGltfExporterOptions,
    ): Promise<ArrayBuffer | Record<string, unknown>>;
  }

  export function mergeBufferGeometries(
    geometries: BufferGeometry[],
    useGroups?: boolean,
  ): BufferGeometry | null;
}
