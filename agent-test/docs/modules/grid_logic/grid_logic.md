# Grid Logic Module Manual

> Implementation reference and code guide for the coding agent.
> For hook tables, system APIs, and capability reference -> see `template_api.md`.
> For game design rules, level templates, and balance -> see `design_rules.md`.

---

## 1. Template Guide

### Creating an Entity Type

1. **Read**: `src/entities/_TemplateEntity.ts`
2. **Copy**: `cp _TemplateEntity.ts Player.ts`
3. **Modify**:
   - Rename class to `Player`
   - Update `TEMPLATE_ENTITY_CONFIG` -> `PLAYER_CONFIG` with GDD values
   - Set `textureKey` (from asset-pack.json -- must match Preloader key)
   - Set `entityType` (unique string identifier)
   - Set `isWalkable`, `isPushable`, `isDestructible` flags
   - Set `maxHealth` if entity participates in combat (0 = no HP system)
   - Override hooks as needed (`onPlaced`, `onMoved`, `onStep`, `onDamage`, `onDeath`, `onCellEntered`)
4. **Export** the config object AND class from the file
5. **Add** to `entities/index.ts` barrel exports

### Creating a Level

1. **Read**: `src/scenes/_TemplateGridLevel.ts`
2. **Copy**: `cp _TemplateGridLevel.ts Level1.ts`
3. **Modify**:
   - Rename class to `Level1`
   - Update constructor scene key: `super({ key: 'Level1' })`
   - Implement all abstract methods (see Section 2)
   - Import your entity classes at the top
   - Override hooks as needed
4. **Register** in `main.ts`:
   ```typescript
   import Level1 from './scenes/Level1';
   game.scene.add('Level1', Level1);
   ```
5. **Register** in `LevelManager.ts`:
   ```typescript
   static readonly LEVEL_ORDER: string[] = ['Level1'];
   ```

---

## 2. Abstract Method Implementation Guide

### 2.1 getBoardConfig()

Returns the grid layout. Use CellType enum values.

```typescript
import { CellType } from '../utils';

protected getBoardConfig(): BoardConfig {
  const cellSize = CONFIG.gridConfig.cellSize.value;
  const cols = CONFIG.gridConfig.gridWidth.value;
  const rows = CONFIG.gridConfig.gridHeight.value;
  const screenW = CONFIG.screenSize.width.value;
  const screenH = CONFIG.screenSize.height.value;
  const mapW = cols * cellSize;
  const mapH = rows * cellSize;
  const offsetX = Math.floor((screenW - mapW) / 2);
  const offsetY = Math.floor((screenH - mapH) / 2);

  // From GDD Section 4 -- level grid
  // #=WALL(1), _=FLOOR(2), G=GOAL(3), S=SPAWN(5)
  const cells: number[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 5, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 2, 1, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 1, 2, 1, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 3, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];

  return { cols, rows, cellSize, cells, offsetX, offsetY };
}
```

**CRITICAL**:

- Use number literals (0-6) in the cells array
- Calculate `offsetX`/`offsetY` to center the grid on screen
- Grid dimensions must match the `cells` array size

### 2.2 getTurnConfig()

Configure timing mode based on game sub-type.

```typescript
// Puzzle (default -- step-based)
protected getTurnConfig(): TurnManagerConfig {
  return { mode: 'step', maxMoves: 30 };
}

// Tactics (turn-based)
protected getTurnConfig(): TurnManagerConfig {
  return { mode: 'turn', actionsPerTurn: 2 };
}

// Arcade (realtime)
protected getTurnConfig(): TurnManagerConfig {
  return { mode: 'realtime', realtimeIntervalMs: 300 };
}

// Match-3 (freeform)
protected getTurnConfig(): TurnManagerConfig {
  return { mode: 'freeform', maxMoves: 20 };
}
```

### 2.3 createEnvironment()

Set up the visual layer.

```typescript
protected createEnvironment(): void {
  const screenW = CONFIG.screenSize.width.value;
  const screenH = CONFIG.screenSize.height.value;

  // Background image -- stretch to FULL SCREEN
  if (textureExists(this, 'level1_bg')) {
    const bg = this.add.image(0, 0, 'level1_bg').setOrigin(0, 0);
    bg.setDisplaySize(screenW, screenH);
    bg.setDepth(-10);
  }

  // Grid lines (optional visual aid)
  this.gridLinesGraphics = drawGridLines(
    this, this.gridCols, this.gridRows, this.cellSize,
    this.gridOffsetX, this.gridOffsetY,
    0xffffff, 0.15
  );
}
```

### 2.4 createEntities()

Place all game entities on the board.

```typescript
import { Player } from '../entities/Player';
import { Box } from '../entities/Box';

protected createEntities(): void {
  // Player at spawn position
  this.player = new Player(this, 1, 1);
  this.addEntity(this.player);

  // Boxes from GDD Section 4
  const box1 = new Box(this, 3, 3);
  this.addEntity(box1);

  const box2 = new Box(this, 5, 4);
  this.addEntity(box2);
}
```

**CRITICAL**: Always use `this.addEntity()` -- it handles grid params, scaling, and board tracking.

### 2.5 checkWinCondition() / checkLoseCondition()

```typescript
// Sokoban: all boxes on goals
protected checkWinCondition(): boolean {
  const boxes = this.getEntitiesOfType('box');
  return boxes.length > 0 && boxes.every(
    b => this.boardManager.getCell(b.gridX, b.gridY) === CellType.GOAL
  );
}

// Move limit exceeded
protected checkLoseCondition(): boolean {
  return !this.turnManager.hasMovesRemaining;
}
```

---

## 3. Import Guide

### Utility Imports

```typescript
import {
  CellType,
  gridToWorld,
  worldToGrid,
  isInBounds,
  getNeighbors,
  getDirection,
  getDirectionDelta,
  getCellsInDirection,
  getCellsInRadius,
  manhattanDistance,
  chebyshevDistance,
  getReachableCells,
  findPath,
  floodFill,
  getLine,
  hasLineOfSight,
  findMatches,
  drawGridLines,
  drawCellTypeOverlay,
  highlightCells,
  highlightSelectedCell,
  showFloatingText,
  scaleToCell,
  textureExists,
  safeAddSound,
  initScale,
} from '../utils';
```

### Type Imports

Always use `import type` for interfaces:

```typescript
import type { BoardConfig, BoardEntity } from '../systems/BoardManager';
import type {
  TurnManagerConfig,
  GridTimingMode,
  GridPhase,
} from '../systems/TurnManager';
import type { AnimationCallback } from '../systems/AnimationQueue';
import type { GridEntityConfig } from '../entities/BaseGridEntity';
import type { GridPoint, Direction } from '../utils';
```

### Config Import

```typescript
import * as CONFIG from '../gameConfig.json';
// Usage: CONFIG.gridConfig.cellSize.value
```

---

## 4. Cross-Script Consistency Rules

### Scene Keys

- Scene keys in constructor MUST match `main.ts` registration and `LevelManager.ts` order
- UIScene is always `'UIScene'`, PauseUIScene is `'PauseUIScene'`, etc.
- Level scenes: `'Level1'`, `'Level2'`, etc.

### Config Keys

- All config values accessed via `CONFIG.gridConfig.{key}.value`
- Entity configs defined in `GridEntityConfig` objects, not in gameConfig.json

### Asset Keys

- Player: `player` or `player_{variant}` (e.g., `player_idle`, `player_push`)
- Entities: `{entityType}` (e.g., `box`, `gem_red`, `enemy_skeleton`)
- Background: `{level}_bg` (e.g., `level1_bg`)
- Cell visuals: `cell_{type}` (e.g., `cell_goal`, `cell_ice`) -- optional
- SFX: `sfx_{action}` (e.g., `sfx_move`, `sfx_push`, `sfx_win`)
- BGM: `bgm_{name}` (e.g., `bgm_puzzle`, `bgm_battle`)

### Entity Type String Mapping

Entity `entityType` strings must be consistent between:

- `GridEntityConfig.entityType` in entity files
- `getEntitiesOfType('...')` calls in level scenes
- Board queries via `boardManager.getEntitiesOfType('...')`

---

## 5. Implementing Common Game Patterns

### 5.1 Movement with Push and Bump Attack (Roguelike / Dungeon Crawler)

Override `onDirectionInput` with bump-attack, push, and movement:

```typescript
protected onDirectionInput(direction: Direction): void {
  if (!this.player) return;

  const delta = getDirectionDelta(direction);
  this.player.facingDirection = direction;
  const targetX = this.player.gridX + delta.gridX;
  const targetY = this.player.gridY + delta.gridY;

  if (!this.boardManager.isInBounds(targetX, targetY)) return;
  if (this.boardManager.getCell(targetX, targetY) === CellType.WALL) return;

  const target = this.getEntityAt(targetX, targetY);

  // Bump attack: move into enemy = attack instead of move
  if (target && target.entityType === 'enemy') {
    this.saveUndoState();
    this.damageEntity(target, 1);
    this.runProcessingPipeline();
    return;
  }

  // Push: move into pushable = push it
  if (target?.isPushable) {
    const pushX = targetX + delta.gridX;
    const pushY = targetY + delta.gridY;
    if (!this.canMoveTo(pushX, pushY)) return;

    this.saveUndoState();
    this.moveEntity(target, pushX, pushY, true);
    this.moveEntity(this.player, targetX, targetY, true);
    this.runProcessingPipeline();
    return;
  }

  // Normal move
  if (!target || target.isWalkable) {
    this.saveUndoState();
    this.moveEntity(this.player, targetX, targetY, true);
    this.runProcessingPipeline();
  }
}

private canMoveTo(gridX: number, gridY: number): boolean {
  if (!this.boardManager.isInBounds(gridX, gridY)) return false;
  if (this.boardManager.getCell(gridX, gridY) === CellType.WALL) return false;
  const entity = this.getEntityAt(gridX, gridY);
  if (entity && !entity.isWalkable) return false;
  return true;
}
```

### 5.2 Tactics Unit Selection & Movement

Override `onEntityClicked` and `onCellClicked`:

```typescript
protected onEntityClicked(entity: BaseGridEntity): void {
  if (entity.entityType === 'player_unit') {
    this.selectEntity(entity);
    const reachable = getReachableCells(
      entity.gridX, entity.gridY,
      CONFIG.tacticsConfig.moveRange.value,
      this.gridCols, this.gridRows,
      (x, y) => this.canMoveTo(x, y)
    );
    this.setHighlightedCells(reachable, 0x0088ff, 0.3);
  }
}

protected onCellClicked(gridX: number, gridY: number): void {
  if (this.selectedEntity) {
    this.saveUndoState();
    this.clearHighlights();
    this.moveEntity(this.selectedEntity, gridX, gridY);
    this.deselectEntity();
    this.runProcessingPipeline();
  }
}
```

### 5.3 Match-3 Swap & Cascade

Override `onCellClicked` and `onMoveProcessed`:

```typescript
private firstPick: GridPoint | null = null;

protected onCellClicked(gridX: number, gridY: number): void {
  if (!this.firstPick) {
    this.firstPick = { gridX, gridY };
    this.selectionGraphics = highlightSelectedCell(
      this, gridX, gridY, this.cellSize, this.gridOffsetX, this.gridOffsetY
    );
  } else {
    const dist = manhattanDistance(
      this.firstPick.gridX, this.firstPick.gridY, gridX, gridY
    );
    if (dist === 1) {
      this.saveUndoState();
      this.swapCells(this.firstPick.gridX, this.firstPick.gridY, gridX, gridY);
      this.clearSelectionHighlight();
      this.firstPick = null;
      this.runProcessingPipeline();
    } else {
      this.clearSelectionHighlight();
      this.firstPick = { gridX, gridY };
      this.selectionGraphics = highlightSelectedCell(
        this, gridX, gridY, this.cellSize, this.gridOffsetX, this.gridOffsetY
      );
    }
  }
}

protected onMoveProcessed(): boolean {
  const matches = findMatches(this.cells, this.gridCols, this.gridRows);
  if (matches.length > 0) {
    this.clearMatches(matches);
    this.applyGravity();
    this.spawnNewPieces();
    return true;
  }
  return false;
}
```

### 5.4 Realtime Arcade (Snake-style)

Override `onDirectionInput` and `onRealtimeTick`:

```typescript
private currentDirection: 'up' | 'down' | 'left' | 'right' = 'right';

protected onDirectionInput(direction: 'up' | 'down' | 'left' | 'right'): void {
  // Prevent 180-degree turns
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (direction !== opposites[this.currentDirection]) {
    this.currentDirection = direction;
  }
}

protected onRealtimeTick(): void {
  const dx = this.currentDirection === 'left' ? -1 : this.currentDirection === 'right' ? 1 : 0;
  const dy = this.currentDirection === 'up' ? -1 : this.currentDirection === 'down' ? 1 : 0;
  const nextX = this.player.gridX + dx;
  const nextY = this.player.gridY + dy;

  if (!this.canMoveTo(nextX, nextY)) {
    this.onLoseConditionMet();
    return;
  }

  this.moveEntity(this.player, nextX, nextY, true, 100);
  this.runProcessingPipeline();
}
```

### 5.5 Ranged Attack via Action Key

Override `onActionInput` for special abilities (Thunderbolt, laser, etc):

```typescript
private abilityCooldown: number = 0;

protected onActionInput(): void {
  if (!this.player || this.abilityCooldown > 0) return;

  const targets = getCellsInDirection(
    this.player.gridX, this.player.gridY,
    this.player.facingDirection, 2,
    this.gridCols, this.gridRows
  );

  let hit = false;
  for (const t of targets) {
    const enemy = this.getEntityAt(t.gridX, t.gridY);
    if (enemy && enemy.entityType !== 'player') {
      this.damageEntity(enemy, 2);
      hit = true;
    }
  }

  if (hit) {
    this.abilityCooldown = 3;
    this.runProcessingPipeline();
  }
}
```

### 5.6 Enemy AI via Enemy Phase

Implement enemy behaviors in `onEnemyPhase`:

```typescript
protected onEnemyPhase(): void {
  // Chasers: A* pathfinding toward player
  for (const enemy of this.getEntitiesOfType('chaser')) {
    if (manhattanDistance(enemy.gridX, enemy.gridY,
        this.player.gridX, this.player.gridY) > 5) continue;

    const path = findPath(
      enemy.gridX, enemy.gridY,
      this.player.gridX, this.player.gridY,
      this.gridCols, this.gridRows,
      (x, y) => this.canMoveTo(x, y)
    );
    if (path.length > 1) {
      this.moveEntity(enemy, path[1].gridX, path[1].gridY);
    }
  }

  // Patrollers: fixed back-and-forth
  this.stepEntitiesOfType('patroller');

  // Area emitters: periodic effects (e.g. Smog every 3 turns)
  const turn = this.turnManager.turnNumber;
  if (turn % 3 === 0) {
    for (const emitter of this.getEntitiesOfType('emitter')) {
      const aoe = getCellsInRadius(
        emitter.gridX, emitter.gridY, 1,
        this.gridCols, this.gridRows
      );
      for (const cell of aoe) {
        const victim = this.getEntityAt(cell.gridX, cell.gridY);
        if (victim) this.damageEntity(victim, 1);
      }
    }
  }
}
```

### 5.7 Interactive Tiles via Cell Enter Hook

Handle tile interactions in `onEntityEnteredCell`:

```typescript
protected onEntityEnteredCell(
  entity: BaseGridEntity,
  gridX: number, gridY: number,
  cellType: number
): void {
  // Player steps on hazard = take damage
  if (entity.entityType === 'player' && cellType === CellType.HAZARD) {
    this.damageEntity(entity, 1);
    this.animationQueue.enqueue(AnimationQueue.shake(this, entity, 4, 200));
  }

  // Box pushed onto hazard = fill hole (convert to floor)
  if (entity.isPushable && cellType === CellType.HAZARD) {
    this.boardManager.setCell(gridX, gridY, CellType.FLOOR);
    this.animationQueue.enqueue(AnimationQueue.destroy(this, entity, 300));
    this.removeEntity(entity);
  }

  // Player steps on SPECIAL (key item)
  if (entity.entityType === 'player' && cellType === CellType.SPECIAL) {
    this.registry.set('hasKey', true);
    this.boardManager.setCell(gridX, gridY, CellType.FLOOR);
    showFloatingText(this, entity.x, entity.y - 20, 'Key!', '#ffdd00');
    this.events.emit('statusChanged', 'Key Card: 1/1');
  }
}
```

### 5.8 HP Display via UIScene Events

Emit HP events from level scene:

```typescript
protected onPostCreate(): void {
  this.events.emit('hpChanged', this.player.health, this.player.maxHealth);
}

protected onEntityDeath(entity: BaseGridEntity): void {
  if (entity.entityType === 'player') {
    this.events.emit('hpChanged', 0, entity.maxHealth);
  } else {
    this.removeEntity(entity);
    this.events.emit('scoreChanged', this.score += 10);
  }
}
```

### 5.9 Using the AnimationQueue

Enqueue animations in `onProcessComplete()`:

```typescript
protected onProcessComplete(): void {
  // Example: animate a chain of entity removals
  for (const entity of this.entitiesToRemove) {
    this.animationQueue.enqueue(
      AnimationQueue.destroy(this, entity, 300)
    );
  }

  // Parallel gravity drop
  const drops = this.getGravityDrops();
  if (drops.length > 0) {
    this.animationQueue.enqueueParallel(
      drops.map(d => AnimationQueue.move(
        this, d.entity, d.toWorldX, d.toWorldY, 150, 'Bounce.easeOut'
      ))
    );
  }
}
```

---

## 6. Common Mistakes

### ERROR: Forgetting to register scene in main.ts

Every level scene must be added:

```typescript
game.scene.add('Level1', Level1);
```

### ERROR: Forgetting to add scene key to LevelManager

```typescript
static readonly LEVEL_ORDER: string[] = ['Level1', 'Level2'];
```

### ERROR: Not calling saveUndoState() before moves

Always call `this.saveUndoState()` before any move that should be undoable. If you forget, undo will restore an incorrect state.

### ERROR: Not calling runProcessingPipeline() after moves

Without `runProcessingPipeline()`, the turn manager won't advance, win/lose conditions won't be checked, and animations won't play.

### ERROR: Modifying cells array directly instead of using boardManager.setCell()

Direct modification bypasses event emission. Always use:

```typescript
this.boardManager.setCell(x, y, CellType.FLOOR);
```

### ERROR: Creating entities without addEntity()

Using `new Player(this, x, y)` without `this.addEntity()` means the entity won't be tracked by the board, won't be properly scaled, and won't respond to grid queries.

### ERROR: Moving entities without moveEntity()

Using `entity.setGridPosition()` directly won't update the BoardManager tracking. Always use:

```typescript
this.moveEntity(entity, toX, toY);
```

### ERROR: Modifying KEEP files

Never modify `BaseGridScene.ts`, `BaseGridEntity.ts`, `BoardManager.ts`, `TurnManager.ts`, `AnimationQueue.ts`, `UIScene.ts`, or `utils.ts`. Only modify COPY templates and UPDATE files.

### ERROR: Not centering the grid on screen

Calculate offsets in `getBoardConfig()`:

```typescript
const offsetX = Math.floor((screenW - cols * cellSize) / 2);
const offsetY = Math.floor((screenH - rows * cellSize) / 2);
```

### ERROR: Forgetting the processing pipeline handles input locking

`runProcessingPipeline()` automatically locks input, plays animations, checks conditions, and unlocks input. Do NOT manually lock/unlock around it.

### ERROR: Using physics for grid movement

Grid logic games do NOT use Phaser physics. Entities are Sprites (not Physics sprites). Movement is handled by tweens and grid position updates.

### ERROR: Wrong entity gridX/gridY after animation

`moveEntity()` automatically updates both visual position AND grid data. After `moveEntity()` resolves, `entity.gridX` and `entity.gridY` are correct.

---

## 7. Operation Checklist

When implementing a grid logic game from a GDD, follow this order:

### Phase 5 Steps (in order):

1. **Read** GDD Section 4 (grid layout, entity placements, win conditions)
2. **Create entity types** -- COPY `_TemplateEntity.ts` for each entity, fill config + hooks
3. **Create level scene** -- COPY `_TemplateGridLevel.ts`, implement all abstract methods
4. **Update** `main.ts` -- import and register level scene
5. **Update** `LevelManager.ts` -- add scene key to `LEVEL_ORDER`
6. **Update** `gameConfig.json` -- add any game-specific config values

### Verification:

- [ ] All entity `textureKey` values have corresponding assets in asset-pack.json
- [ ] Entity configs exported and imported in level scene
- [ ] Scene key matches between constructor, main.ts, and LevelManager
- [ ] Grid dimensions match the actual cells array size
- [ ] Board is centered on screen (offsetX/offsetY calculated)
- [ ] Win condition correctly evaluates the intended game goal
- [ ] Lose condition correctly evaluates (move limit, entity death, etc.)
- [ ] `saveUndoState()` called before every move
- [ ] `runProcessingPipeline()` called after every move
- [ ] All entity types have unique `entityType` strings
- [ ] Background image scaled to screen size, not grid size
- [ ] `getTurnConfig().mode` matches the game's timing requirement
