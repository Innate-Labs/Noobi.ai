# Phaser 3 Game Template

A standardized Phaser 3 game template for rapid 2D web game development. This template provides a consistent architecture and pre-built components that AI coding agents can use to generate games efficiently.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
src/
├── main.ts                 # Game entry point & Phaser configuration
├── gameConfig.json         # All game parameters (health, speed, damage, etc.)
├── LevelManager.ts         # Level flow management
├── utils.ts                # CRITICAL utility functions (DO NOT MODIFY)
├── characters/             # Player and enemy classes
│   ├── ExamplePlayer.ts    # Template - copy then delete/rename
│   └── ExampleEnemy.ts     # Template - copy then delete/rename
├── scenes/
│   ├── Preloader.ts        # Asset loading (STANDARD - minimal changes)
│   ├── TitleScreen.ts      # Start screen (customize UI only)
│   ├── BaseLevelScene.ts   # Optional level base class
│   ├── UIScene.ts          # In-game HUD
│   ├── VictoryUIScene.ts   # Level complete screen
│   ├── GameOverUIScene.ts  # Death/failure screen
│   └── GameCompleteUIScene.ts # All levels complete screen
├── styles/
│   └── tailwind.css        # Tailwind CSS for UI styling
└── test/
    └── setup.ts            # Test configuration

public/assets/
├── asset-pack.json         # Asset manifest for Preloader
└── animations.json         # Animation definitions with origin data
```

## Key Files Reference

### main.ts

- Configures Phaser game instance
- Imports and registers all scenes in order:
  1. Preloader (auto-start)
  2. TitleScreen
  3. Level scenes
  4. UI scenes

### gameConfig.json

All game parameters use **`{ "value": X }` wrapper format** (self-documenting):

```json
{
  "configGroup": {
    "parameterName": {
      "value": 100,
      "type": "number",
      "description": "What this does"
    }
  }
}
```

Access in code: `configGroup.parameterName.value`

### utils.ts - CRITICAL FUNCTIONS

**DO NOT MODIFY these functions. They solve Phaser quirks.**

| Function                         | Usage                                                               |
| -------------------------------- | ------------------------------------------------------------------- |
| `initScale()`                    | **ALWAYS use** for sprite scaling. Never use `setScale()` directly. |
| `resetOriginAndOffset()`         | **ALWAYS call** after `play()` animation.                           |
| `initUIDom()`                    | **ALWAYS use** for UI scene DOM elements.                           |
| `addCollider()` / `addOverlap()` | **ALWAYS use** instead of `scene.physics.add.collider/overlap`.     |
| `createTrigger()`                | Create attack/detection zones.                                      |
| `updateMeleeTrigger()`           | Update melee attack zone position.                                  |
| `createDecoration()`             | Create decorative elements.                                         |
| `computeRotation()`              | Calculate projectile rotation.                                      |

### LevelManager.ts

Manages level progression:

```typescript
// Add your level scene keys here
static readonly LEVEL_ORDER: string[] = [
  "Level1Scene",
  "Level2Scene",
  // ...
];
```

## Animation Format (animations.json)

```json
{
  "anims": [
    {
      "key": "player_idle_anim",
      "type": "frame",
      "frames": [
        { "key": "player_idle_01", "duration": 400 } // idle: 1 frame only
      ],
      "repeat": -1,
      "originX": 0.5,
      "originY": 1.0
    },
    {
      "key": "player_run_anim",
      "type": "frame",
      "frames": [
        { "key": "player_run_01", "duration": 400 }, // run: 2 frames
        { "key": "player_run_02", "duration": 400 }
      ],
      "repeat": -1,
      "originX": 0.5,
      "originY": 1.0
    }
  ]
}
```

**Important**: `originX` and `originY` are REQUIRED for `utils.resetOriginAndOffset()` to work correctly. Different animations may have different origins (e.g., attack animations often shift left/right).

## Asset Pack Format (asset-pack.json)

```json
{
  "assetPack": {
    "files": [
      { "type": "json", "key": "animations", "url": "assets/animations.json" },
      {
        "type": "image",
        "key": "player_idle_01",
        "url": "assets/player_idle_01.png"
      },
      {
        "type": "image",
        "key": "player_run_01",
        "url": "assets/player_run_01.png"
      },
      {
        "type": "image",
        "key": "player_run_02",
        "url": "assets/player_run_02.png"
      },
      {
        "type": "tilemapTiledJSON",
        "key": "level1_map",
        "url": "assets/level1_map.json"
      }
    ]
  }
}
```

## Creating a New Game

### 1. Define Game Config

Edit `gameConfig.json` to add your game's parameters.

### 2. Create Player Class

Copy `ExamplePlayer.ts` to create your player (e.g., `Player.ts`), then delete `ExamplePlayer.ts`:

- Load config values
- Implement movement in `update()`
- Implement `takeDamage()` and `die()`
- Add animations

### 3. Create Enemy Classes

Copy `ExampleEnemy.ts` for each enemy type (e.g., `EnemySoldier.ts`), then delete `ExampleEnemy.ts`:

- Configure stats
- Implement AI in `executeAI()`
- Add unique behaviors

### 4. Create Level Scenes

Either extend `BaseLevelScene` or create from scratch:

```typescript
export class Level1Scene extends BaseLevelScene {
  constructor() {
    super({ key: 'Level1Scene' });
  }

  create() {
    this.createBaseElements();
    // Level-specific setup
  }

  update(time, delta) {
    this.baseUpdate(time, delta);
    // Level-specific updates
  }

  // Implement abstract methods...
}
```

### 5. Register Levels

1. Import in `main.ts`
2. Add to `game.scene.add()`
3. Add key to `LevelManager.LEVEL_ORDER`

### 6. Customize UI

Modify the `createDOMUI()` methods in:

- `TitleScreen.ts` - Start screen design
- `UIScene.ts` - In-game HUD
- Victory/GameOver scenes - End screens

## Standard Dimensions

| Element          | Standard Height | Notes                          |
| ---------------- | --------------- | ------------------------------ |
| Player           | 128px           | Standard human-sized character |
| Small enemy      | 48-64px         | Knee to waist height           |
| Medium enemy     | 80-100px        | Slightly smaller than player   |
| Large enemy/Boss | 150-256px       | 1.5x to 2x player size         |
| Tile size        | 64px            | Standard tile dimension        |

## UI Styling

UI uses Tailwind CSS with custom pixel-art styled components:

- `game-pixel-container-*` - Pixel-styled containers
- `game-pixel-container-slot-*` - Progress bar backgrounds
- `game-pixel-container-progress-fill-*` - Progress bar fills
- `game-pixel-container-clickable-*` - Clickable buttons

## Scene Lifecycle

1. **Preloader** → Loads all assets
2. **TitleScreen** → Press Enter to start
3. **Level1Scene** + **UIScene** (parallel) → Gameplay
4. On victory: **VictoryUIScene** → Next level OR **GameCompleteUIScene** → Title
5. On death: **GameOverUIScene** → Restart level

## Common Patterns

### Playing Animations

```typescript
// CORRECT - always use this pattern
playAnimation(animKey: string): void {
  this.play(animKey, true);
  utils.resetOriginAndOffset(this, this.facingDirection);
}
```

### Scaling Sprites

```typescript
// CORRECT - always use initScale
utils.initScale(
  sprite,
  { x: 0.5, y: 1.0 }, // origin
  undefined, // maxWidth (optional)
  128, // maxHeight
  0.6, // body width factor
  0.85, // body height factor
);

// WRONG - never do this
sprite.setScale(2);
sprite.setDisplaySize(100, 100);
```

### Adding Collisions

```typescript
// CORRECT - guaranteed parameter order
utils.addCollider(this, player, enemies, (player, enemy) => {
  player.takeDamage(enemy.damage);
});

// WRONG - parameter order may be swapped
this.physics.add.collider(player, enemies, callback);
```

## Development Tips

1. **Always test animations** - Make sure `originX/Y` in animations.json are correct
2. **Use groups** - Add enemies/decorations to groups for easy management
3. **Check health** - Use `getHealthPercentage()` for UI updates
4. **Clean up events** - Always remove event listeners in `cleanupEventListeners()`
5. **Prevent double-triggers** - Use flags like `isStarting`, `isRestarting`

## License

MIT
