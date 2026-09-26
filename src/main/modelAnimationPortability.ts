/** Self-contained: also serialized into the isolated, author-free GLB reviewer. */
export function assertPortableSkinTracks(document: unknown): void {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!object(document)) throw new Error('Missing decoded GLB document');
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const animations = Array.isArray(document.animations) ? document.animations : [];
  for (const animation of animations) {
    if (!object(animation) || !Array.isArray(animation.channels)) continue;
    for (const channel of animation.channels) {
      if (!object(channel) || !object(channel.target)) continue;
      const target = channel.target;
      if (!['translation', 'rotation', 'scale'].includes(String(target.path))) continue;
      const node = typeof target.node === 'number' ? nodes[target.node] : undefined;
      if (object(node) && typeof node.skin === 'number') {
        throw new Error(`GODOT_SKIN_TRACK: clip ${String(animation.name ?? '(unnamed)').slice(0,120)} targets ${String(node.name ?? target.node).slice(0,120)}.${String(target.path)} directly on a skinned mesh. Godot can drop this transform track; animate a non-skinned parent containing the mesh and skeleton, or a weighted bone instead.`);
      }
    }
  }
}
