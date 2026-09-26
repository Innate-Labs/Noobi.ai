export const MODEL_ASSET_GUIDE = `# Model asset contract v2

Create .noobi/art-bible.json from the chosen plan before authoring model code:

    {"version":1,"id":"selected-style-v1","style":"Describe chosen shape/material language","palette":["#88bbaa","#ddbb88"],"units":"meters","up":"+Y","forward":"-Z","budgets":{"triangles":50000,"nodes":512,"materials":16,"textureSize":2048}}

These are per-model maxima, not whole-scene performance proof. Hard ceilings are 100000 triangles, 2048 nodes, 64 materials, 2048px textures and 16 MiB GLB. Use a coherent shared palette and actual plan style; do not blindly copy example colors. Changing this file invalidates previously bound model evidence; revalidate affected assets, not unrelated game files.

Write model-sources/<name>.spec.json with the usual actual referenceImage, parts [{name,shape,material}], criticalFeatures and inferredSurfaces, plus:

    {"version":2,"artBiblePath":".noobi/art-bible.json","game":{"dimensions":[1,2,1],"tolerance":0.1,"pivot":{"node":"ActorRoot","position":[0,0,0]},"sockets":[{"id":"hand","node":"HandSocket","position":[0.4,1.2,0]}],"collision":{"kind":"capsule","purpose":"Independent movement collider at feet; weapon is visual only"}},"animation":{"mode":"transform","required":["idle","walk"]}}

Replace every value with this model's intended measurements. dimensions are the exported model's rest-pose X/Y/Z bounds in meters; tolerance is a relative maximum 0.001–0.25. Named pivot/socket positions are exported world coordinates with 0.02m tolerance, before the preview centers the scene. Retain unique, meaningful node names through GLB export. Use +Y up/-Z forward consistently and inspect front/side/back views; host numeric checks cannot infer a character's semantic front from a mesh.

The host loads GLB in an independent renderer, measures dimensions/nodes/materials/decoded textures, checks named pivot/socket positions, and plays required clips with bounded key-time and endpoint sampling. It measures sampled rendered vertex displacement, not just changing track values; moving an empty node cannot qualify. Skeletal clips also require weighted skin deformation, not an unused bone or translating a rigid skinned object. animation.mode is none (required=[]), transform (actual transform clips), or skeletal (exported skin AND clips). Tool animation=true requires skeletal data. Rigid part animation is valid when explicitly selected, but is not skinning. Bind actual imported clips in Godot, verify foot contact, sockets, collision/occlusion and gameplay feedback. The host samples at most 8192 vertices and 17 times per clip with a scale-relative motion threshold; it may miss very local or short motion. This is not proof of convincing gait, grounded feet, no clipping, full pose coverage or visible screen-space change.

Collision is an explicit assembly intent, not automatically generated physics. Actual shape and model alignment are checked in the running scene. Materials/palette/style are separately reviewed visually. A model passing this contract remains runtime/visual-review pending. Legacy specs without version 2 can still load, but are marked assembly-unverified. Never describe them as v2 certified.

Repeat calls reuse output only when name, image, source, spec, art bible, animation request and host-renderer version match and the private evidence hashes still verify. Failed calls never replace the last completed model. Editing source invalidates reuse; preserve the same plan ID for targeted retries. No monetary cost is invented for local modeling or unknown upstream image calls.
`;
