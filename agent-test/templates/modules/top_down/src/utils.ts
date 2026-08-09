import Phaser from 'phaser';

// ============================================================================
// TOP-DOWN UTILS - Complete utilities for top-down games
// ============================================================================
// This file contains ALL utilities needed for top-down games:
// - Core utilities (animation, scaling, collision fixes, UI)
// - Top-down-specific utilities (direction, triggers, projectiles)
//
// When this module is copied to a game project, this file replaces core/utils.ts
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

// ============================================================================
// DIRECTION HELPERS (Top-Down specific)
// ============================================================================

/**
 * Convert an angle (in radians) to a 4-direction facing string.
 *
 * Angle convention (Phaser standard):
 *   0     = right
 *   π/2   = down
 *   π/-π  = left
 *   -π/2  = up
 *
 * @param angle - Angle in radians
 * @returns One of 'right', 'down', 'left', 'up'
 */
export function angleToDirection(
  angle: number,
): 'left' | 'right' | 'up' | 'down' {
  // Normalize to [0, 2π)
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  if (normalized < Math.PI * 0.25 || normalized >= Math.PI * 1.75) {
    return 'right';
  } else if (normalized < Math.PI * 0.75) {
    return 'down';
  } else if (normalized < Math.PI * 1.25) {
    return 'left';
  } else {
    return 'up';
  }
}

/**
 * Convert a 4-direction string to an angle in radians.
 * Useful for dash/projectile direction when only facing direction is known.
 */
export function directionToAngle(
  direction: 'left' | 'right' | 'up' | 'down',
): number {
  switch (direction) {
    case 'right':
      return 0;
    case 'down':
      return Math.PI * 0.5;
    case 'left':
      return Math.PI;
    case 'up':
      return -Math.PI * 0.5;
  }
}

// ============================================================================
// COLLISION TRIGGER SYSTEM (for melee attacks)
// ============================================================================

interface TriggerOrigin {
  x: number;
  y: number;
}

interface ZoneWithOwner extends Phaser.GameObjects.Zone {
  owner?: any;
}

/**
 * Create collision trigger - useful for attack area detection
 * IMPORTANT: Use this for melee attack detection zones
 */
export const createTrigger = (
  scene: Phaser.Scene,
  owner: any,
  x: number,
  y: number,
  width: number,
  height: number,
  origin: TriggerOrigin = { x: 0.5, y: 0.5 },
): ZoneWithOwner => {
  const zoneWithOwner = scene.add
    .zone(x, y, width, height)
    .setOrigin(origin.x, origin.y) as ZoneWithOwner;
  zoneWithOwner.owner = owner;
  scene.physics.add.existing(zoneWithOwner);
  (zoneWithOwner.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  (zoneWithOwner.body as Phaser.Physics.Arcade.Body).setImmovable(true);
  return zoneWithOwner;
};

/**
 * Update melee attack trigger position and size based on character facing direction
 * Supports 4 directions: left, right, up, down
 */
export const updateMeleeTrigger = (
  character: any,
  meleeTrigger: ZoneWithOwner,
  facingDirection: 'left' | 'right' | 'up' | 'down',
  attackRange: number,
  attackWidth: number,
): void => {
  if (
    facingDirection !== 'up' &&
    facingDirection !== 'down' &&
    facingDirection !== 'left' &&
    facingDirection !== 'right'
  ) {
    throw new Error(
      'updateMeleeTrigger: facingDirection must be up, down, left, or right',
    );
  }

  const characterBody = character.body as Phaser.Physics.Arcade.Body;
  const triggerBody = meleeTrigger.body as Phaser.Physics.Arcade.Body;

  let triggerX = 0;
  let triggerY = 0;

  const characterCenterX = characterBody.center.x;
  const characterCenterY = characterBody.center.y;

  switch (facingDirection) {
    case 'right':
      triggerX = characterCenterX + attackRange / 2;
      triggerY = characterCenterY;
      triggerBody.setSize(attackRange, attackWidth);
      break;
    case 'left':
      triggerX = characterCenterX - attackRange / 2;
      triggerY = characterCenterY;
      triggerBody.setSize(attackRange, attackWidth);
      break;
    case 'up':
      triggerX = characterCenterX;
      triggerY = characterCenterY - attackRange / 2;
      triggerBody.setSize(attackWidth, attackRange);
      break;
    case 'down':
      triggerX = characterCenterX;
      triggerY = characterCenterY + attackRange / 2;
      triggerBody.setSize(attackWidth, attackRange);
      break;
  }

  meleeTrigger.setPosition(triggerX, triggerY);
};

// ============================================================================
// PROJECTILE SYSTEM (Top-Down specific)
// ============================================================================

/**
 * Standard projectile display sizes (in pixels)
 */
export const PROJECTILE_SIZES = {
  BULLET_SMALL: 8,
  BULLET_MEDIUM: 12,
  GRENADE: 20,
  ARROW: 24,
  LARGE: 32,
} as const;

/**
 * Create default bullet textures if not loaded
 * Call this in preload() or before creating bullets
 */
export function createBulletTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('player_bullet')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xffff00);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('player_bullet', 8, 8);
    graphics.destroy();
  }
  if (!scene.textures.exists('enemy_bullet')) {
    const graphics = scene.add.graphics();
    graphics.fillStyle(0xff0000);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('enemy_bullet', 8, 8);
    graphics.destroy();
  }
}

/**
 * Create a projectile sprite with proper scaling
 */
export function createProjectile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  targetSize: number = PROJECTILE_SIZES.BULLET_SMALL,
  hasGravity: boolean = false,
  damage?: number,
): Phaser.Physics.Arcade.Sprite {
  const projectile = scene.physics.add.sprite(x, y, textureKey);
  const maxDimension = Math.max(projectile.width, projectile.height);
  const scale = targetSize / maxDimension;
  projectile.setScale(scale);
  const bodySize = Math.min(targetSize, 16);
  (projectile.body as Phaser.Physics.Arcade.Body).setSize(bodySize, bodySize);
  const offsetX = (projectile.width - bodySize / scale) / 2;
  const offsetY = (projectile.height - bodySize / scale) / 2;
  (projectile.body as Phaser.Physics.Arcade.Body).setOffset(offsetX, offsetY);
  (projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(hasGravity);
  if (damage !== undefined) {
    (projectile as any).damage = damage;
  }
  return projectile;
}

/**
 * Create a projectile and launch it at a specific angle
 * This is the primary projectile creation method for top-down games
 */
export function createProjectileAtAngle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  angle: number,
  speed: number,
  targetSize: number = PROJECTILE_SIZES.BULLET_SMALL,
  damage?: number,
): Phaser.Physics.Arcade.Sprite {
  const projectile = createProjectile(
    scene,
    x,
    y,
    textureKey,
    targetSize,
    false,
    damage,
  );
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  projectile.setVelocity(vx, vy);
  projectile.setRotation(angle);
  return projectile;
}

// ============================================================================
// COLLECTIBLE SIZES (Top-Down specific)
// ============================================================================

/**
 * Standard collectible display sizes (in pixels)
 */
export const COLLECTIBLE_SIZES = {
  COIN: 32,
  SMALL_ITEM: 24,
  MEDIUM_ITEM: 32,
  LARGE_ITEM: 48,
} as const;

/**
 * Scale a collectible sprite to standard size
 */
export function scaleCollectible(
  sprite: Phaser.GameObjects.Sprite,
  targetSize: number = COLLECTIBLE_SIZES.COIN,
): void {
  const maxDimension = Math.max(sprite.width, sprite.height);
  const scale = targetSize / maxDimension;
  sprite.setScale(scale);
}

// ============================================================================
// ROTATION HELPER (for projectiles)
// ============================================================================

/**
 * Calculate rotation for projectiles
 */
export function computeRotation(
  assetDirection: Phaser.Math.Vector2,
  targetDirection: Phaser.Math.Vector2,
): number {
  const assetAngle = Math.atan2(assetDirection.y, assetDirection.x);
  const targetAngle = Math.atan2(targetDirection.y, targetDirection.x);
  return targetAngle - assetAngle;
}
