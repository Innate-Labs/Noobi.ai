import Phaser from 'phaser';

// ============================================================================
// CORE UTILS - Universal utilities for ALL game types
// ============================================================================

// ============================================================================
// ANIMATION ORIGIN SYSTEM (CRITICAL!)
// ============================================================================

/**
 * Reset origin and offset for sprite after playing animation
 *
 * IMPORTANT: Must be called every time after playing any animation!
 * Also recommended to call every frame in update() for sprites with varying frame sizes.
 * This reads origin data from animations.json and adjusts collision body offset.
 *
 * @param sprite - The sprite to adjust
 * @param facingDirection - Current facing direction
 */
export const resetOriginAndOffset = (
  sprite: any,
  facingDirection: 'left' | 'right' | 'up' | 'down',
): void => {
  if (
    facingDirection !== 'up' &&
    facingDirection !== 'down' &&
    facingDirection !== 'left' &&
    facingDirection !== 'right'
  ) {
    throw new Error(
      'resetOriginAndOffset: facingDirection must be up, down, left, or right',
    );
  }

  // STEP 1: Normalize frame size (make all frames display at same height)
  // This prevents visual "jumping" when switching between frames of different sizes
  const targetDisplayHeight = (sprite as any)._targetDisplayHeight;
  if (targetDisplayHeight && sprite.height > 0) {
    const newScale = targetDisplayHeight / sprite.height;
    sprite.setScale(newScale);
  }

  // STEP 2: Determine origin
  // Try to read per-animation origin from animations.json (optional)
  let baseOriginX = 0.5;
  let baseOriginY = 1.0;
  const animationsData = sprite.scene?.cache?.json?.get('animations');
  if (animationsData?.anims) {
    const currentAnim = sprite.anims?.currentAnim;
    if (currentAnim) {
      const animConfig = animationsData.anims.find(
        (anim: any) => anim.key === currentAnim.key,
      );
      if (animConfig) {
        baseOriginX = animConfig.originX ?? 0.5;
        baseOriginY = animConfig.originY ?? 1.0;
      }
    }
  }

  // Mirror origin for left-facing
  const animOriginX =
    facingDirection === 'left' ? 1 - baseOriginX : baseOriginX;
  const animOriginY = baseOriginY;

  sprite.setOrigin(animOriginX, animOriginY);

  // STEP 3: Adjust body offset
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  if (!body) return;

  // Get body dimensions (these are set once in initScale and don't change)
  const unscaledBodyWidth = body.sourceWidth;
  const unscaledBodyHeight = body.sourceHeight;

  // Calculate offset to align body bottom-center with sprite anchor point (feet)
  const offsetX = sprite.width * animOriginX - unscaledBodyWidth / 2;
  const offsetY = sprite.height * animOriginY - unscaledBodyHeight;

  body.setOffset(offsetX, offsetY);
};

// ============================================================================
// SAFE AUDIO LOADING (Prevents crashes from missing audio files)
// ============================================================================

/**
 * Safely add a sound effect - returns undefined if audio key doesn't exist
 *
 * IMPORTANT: Always use this instead of scene.sound.add() directly!
 * This prevents game crashes when audio assets are missing.
 *
 * Usage:
 *   this.jumpSound = safeAddSound(this.scene, "jump_sfx", { volume: 0.3 });
 *   // Later: this.jumpSound?.play();  // Safe to call even if undefined
 *
 * @param scene - The scene to add sound to
 * @param key - Audio key to load
 * @param config - Optional sound config
 * @returns Sound object or undefined if key doesn't exist
 */
export const safeAddSound = (
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): Phaser.Sound.BaseSound | undefined => {
  // Check if audio key exists in cache
  if (!scene.cache.audio.exists(key)) {
    // Silently return undefined - audio not loaded is common during development
    return undefined;
  }

  try {
    return scene.sound.add(key, config);
  } catch (e) {
    console.warn(`Failed to add sound: ${key}`, e);
    return undefined;
  }
};

/**
 * Check if an audio key exists in the cache
 */
export const audioExists = (scene: Phaser.Scene, key: string): boolean => {
  return scene.cache.audio.exists(key);
};

/**
 * Check if a texture key exists
 */
export const textureExists = (scene: Phaser.Scene, key: string): boolean => {
  return scene.textures.exists(key);
};

// ============================================================================
// SPRITE SCALING SYSTEM (CRITICAL!)
// ============================================================================

/**
 * Initialize sprite scale, size, and offset
 *
 * IMPORTANT: All image assets must use initScale for scaling!
 * DO NOT use setScale or setDisplaySize directly!
 *
 * This function correctly handles both DynamicBody and StaticBody:
 * - DynamicBody: setSize needs unscaled dimensions (body auto-scales with sprite)
 * - StaticBody: setSize needs scaled dimensions (body does NOT auto-scale)
 * - StaticBody.setOffset has a BUG - use position.set instead!
 */
export const initScale = (
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  origin: { x: number; y: number },
  maxDisplayWidth?: number,
  maxDisplayHeight?: number,
  bodyWidthFactorToDisplayWidth?: number,
  bodyHeightFactorToDisplayHeight?: number,
): void => {
  sprite.setOrigin(origin.x, origin.y);

  // CRITICAL: Save initial texture dimensions for resetOriginAndOffset!
  // This prevents body position shifts when animation frames have different sizes.
  (sprite as any)._initWidth = sprite.width;
  (sprite as any)._initHeight = sprite.height;

  let displayScale: number;
  let displayHeight: number;
  let displayWidth: number;

  if (maxDisplayHeight && maxDisplayWidth) {
    if (sprite.height / sprite.width > maxDisplayHeight / maxDisplayWidth) {
      displayHeight = maxDisplayHeight;
      displayScale = maxDisplayHeight / sprite.height;
      displayWidth = sprite.width * displayScale;
    } else {
      displayWidth = maxDisplayWidth;
      displayScale = maxDisplayWidth / sprite.width;
      displayHeight = sprite.height * displayScale;
    }
  } else if (maxDisplayHeight) {
    displayHeight = maxDisplayHeight;
    displayScale = maxDisplayHeight / sprite.height;
    displayWidth = sprite.width * displayScale;
  } else if (maxDisplayWidth) {
    displayWidth = maxDisplayWidth;
    displayScale = maxDisplayWidth / sprite.width;
    displayHeight = sprite.height * displayScale;
  } else {
    throw new Error(
      'initScale: maxDisplayHeight and maxDisplayWidth cannot both be undefined',
    );
  }

  // CRITICAL: Save target display height for normalizing animation frames!
  // This allows resetOriginAndOffset to adjust scale when frame sizes differ.
  (sprite as any)._targetDisplayHeight = displayHeight;

  sprite.setScale(displayScale);

  // Provide default values for body factor parameters
  const widthFactor = bodyWidthFactorToDisplayWidth ?? 1.0;
  const heightFactor = bodyHeightFactorToDisplayHeight ?? 1.0;

  const displayBodyWidth = displayWidth * widthFactor;
  const displayBodyHeight = displayHeight * heightFactor;

  if (sprite.body instanceof Phaser.Physics.Arcade.Body) {
    // DynamicBody: setSize needs UNSCALED dimensions (body scales with sprite)
    const unscaledBodyWidth = displayBodyWidth / displayScale;
    const unscaledBodyHeight = displayBodyHeight / displayScale;
    sprite.body.setSize(unscaledBodyWidth, unscaledBodyHeight);

    // setOffset also needs UNSCALED values
    const unscaledOffsetX =
      sprite.width * origin.x - unscaledBodyWidth * origin.x;
    const unscaledOffsetY =
      sprite.height * origin.y - unscaledBodyHeight * origin.y;
    sprite.body.setOffset(unscaledOffsetX, unscaledOffsetY);
  } else if (sprite.body instanceof Phaser.Physics.Arcade.StaticBody) {
    // StaticBody: setSize needs SCALED dimensions (body does NOT scale with sprite)
    sprite.body.setSize(displayBodyWidth, displayBodyHeight);

    // BUG: Don't use StaticBody.setOffset - use position.set instead!
    const displayTopLeft = sprite.getTopLeft();
    const bodyPositionX =
      displayTopLeft.x +
      (sprite.displayWidth * origin.x - displayBodyWidth * origin.x);
    const bodyPositionY =
      displayTopLeft.y +
      (sprite.displayHeight * origin.y - displayBodyHeight * origin.y);
    sprite.body.position.set(bodyPositionX, bodyPositionY);
  }
};

// ============================================================================
// COLLISION SYSTEM (CRITICAL! Fixes Phaser parameter order bug)
// ============================================================================

/**
 * Add collider with guaranteed parameter order
 *
 * IMPORTANT: Use this instead of scene.physics.add.collider!
 * Phaser has an internal bug where callback parameters can be swapped
 * when object1 is a physics group or tilemap.
 */
export const addCollider = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any,
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.collider(
      object1,
      object2,
      (obj1: any, obj2: any) => {
        collideCallback?.call(callbackContext, obj2, obj1);
      },
      (obj1: any, obj2: any) => {
        return processCallback?.call(callbackContext, obj2, obj1);
      },
      callbackContext,
    );
  } else {
    return scene.physics.add.collider(
      object1,
      object2,
      collideCallback,
      processCallback,
      callbackContext,
    );
  }
};

/**
 * Add overlap with guaranteed parameter order
 *
 * IMPORTANT: Use this instead of scene.physics.add.overlap!
 */
export const addOverlap = (
  scene: Phaser.Scene,
  object1: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  object2: Phaser.Types.Physics.Arcade.ArcadeColliderType,
  collideCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  processCallback?: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  callbackContext?: any,
): Phaser.Physics.Arcade.Collider => {
  if (shouldSwap(object1, object2)) {
    return scene.physics.add.overlap(
      object1,
      object2,
      (obj1: any, obj2: any) => {
        collideCallback?.call(callbackContext, obj2, obj1);
      },
      (obj1: any, obj2: any) => {
        return processCallback?.call(callbackContext, obj2, obj1);
      },
      callbackContext,
    );
  } else {
    return scene.physics.add.overlap(
      object1,
      object2,
      collideCallback,
      processCallback,
      callbackContext,
    );
  }
};

/**
 * Determine if callback parameters should be swapped
 * Phaser internally swaps parameters in certain cases
 */
const shouldSwap = (object1: any, object2: any): boolean => {
  const object1IsPhysicsGroup =
    object1 &&
    (object1 as any).isParent &&
    !((object1 as any).physicsType === undefined);
  const object1IsTilemap = object1 && (object1 as any).isTilemap;
  const object2IsPhysicsGroup =
    object2 &&
    (object2 as any).isParent &&
    !((object2 as any).physicsType === undefined);
  const object2IsTilemap = object2 && (object2 as any).isTilemap;

  return (
    (object1IsPhysicsGroup && !object2IsPhysicsGroup && !object2IsTilemap) ||
    (object1IsTilemap && !object2IsPhysicsGroup && !object2IsTilemap) ||
    (object1IsTilemap && object2IsPhysicsGroup)
  );
};

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Initialize UI DOM element for UI scenes
 * IMPORTANT: Always use this instead of add.dom and createFromHTML
 */
export const initUIDom = (
  scene: Phaser.Scene,
  html: string,
): Phaser.GameObjects.DOMElement => {
  const dom = scene.add
    .dom(0, 0, 'div', 'width: 100%; height: 100%;')
    .setHTML(html);
  dom.pointerEvents = 'none';
  dom.setOrigin(0, 0);
  dom.setScrollFactor(0);
  return dom;
};

/**
 * Create a decoration and add it to a group
 * Height is relative to a standard character height of 128px
 */
export const createDecoration = (
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  key: string,
  x: number,
  y: number,
  maxDisplayHeight: number,
): Phaser.GameObjects.Image => {
  const decoration = scene.add.image(x, y, key);
  initScale(decoration, { x: 0.5, y: 1.0 }, undefined, maxDisplayHeight);
  group.add(decoration);
  return decoration;
};
