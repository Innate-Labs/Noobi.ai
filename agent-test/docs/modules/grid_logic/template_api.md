# Grid Logic -- Template Capability Reference

> What the template provides: project structure, available systems, hooks, utilities, and operation patterns.
> This document ensures GDD designs stay within template capabilities -- no custom code needed.

---

## Hook Integrity Rule (CRITICAL)

Every hook name referenced in the GDD and implementation code **MUST** exist in this document's hook tables (Sections 4-6). Do NOT invent, hallucinate, or assume hooks that aren't listed here. If a hook isn't documented below, it **does not exist** -- design around the hooks that DO exist. Using a non-existent hook will cause a compilation failure.

---

## 1. Project Structure

```
src/
  main.ts              # UPDATE: register level scenes via game.scene.add()
  LevelManager.ts      # UPDATE: set LEVEL_ORDER array with level scene keys
  gameConfig.json      # UPDATE: set gridConfig values, add game-specific config
  utils.ts             # KEEP (all utilities -- core + grid-specific, never modify)
  scenes/
    Preloader.ts           # KEEP (asset loading)
    TitleScreen.ts         # KEEP (uses LevelManager to start first level)
    BaseGridScene.ts       # KEEP (main grid engine: board, input, turns, entities)
    _TemplateGridLevel.ts  # COPY -> rename for each grid level
    UIScene.ts             # KEEP (grid HUD: moves, score, undo, pause)
    index.ts               # KEEP (barrel exports)
  entities/
    BaseGridEntity.ts      # KEEP (grid-bound entity base)
    _TemplateEntity.ts     # COPY -> rename for each entity type
    index.ts               # KEEP (barrel exports)
  systems/
    BoardManager.ts        # KEEP (2D grid state, entity tracking, undo)
    TurnManager.ts         # KEEP (turn/step/realtime cycle)
    AnimationQueue.ts      # KEEP (sequential/parallel animation system)
    index.ts               # KEEP (barrel exports)
```

### Scene Hierarchy

```
BaseGridScene             <- board, input, turns, entities, animation queue
  └── _TemplateGridLevel  <- COPY: level-specific grid, entities, rules
```

- All grid logic games extend `BaseGridScene`, copy `_TemplateGridLevel.ts`
- No sub-modes -- the `TurnManager` mode config handles all timing variants

**TitleScreen** navigates to `LevelManager.LEVEL_ORDER[0]`. Default is empty -- level keys MUST be added, or the game will crash on start.

**Scene flow**: TitleScreen -> Level1 -> (Victory -> Level2 -> ...) -> GameComplete. Win/lose -> VictoryUIScene/GameOverUIScene.

**Key difference from other modules**: No physics engine, no continuous movement. Everything is discrete grid positions. Input is locked during animations. All game state lives in BoardManager.

---

## 2. Available Systems

### 2.1 BoardManager

| Property / Method                | Type                  | Purpose                                             |
| -------------------------------- | --------------------- | --------------------------------------------------- |
| `width`                          | `number`              | Grid width in cells                                 |
| `height`                         | `number`              | Grid height in cells                                |
| `cellSize`                       | `number`              | Cell size in pixels                                 |
| `offsetX`, `offsetY`             | `number`              | Grid pixel offset from screen origin                |
| `cells`                          | `number[][]`          | 2D array of cell state values                       |
| `getCell(x, y)`                  | `number`              | Get cell value at position                          |
| `setCell(x, y, value)`           | `void`                | Set cell value (emits 'cellChanged')                |
| `isInBounds(x, y)`               | `boolean`             | Check if position is within grid                    |
| `fill(value)`                    | `void`                | Fill entire board with one value                    |
| `placeEntity(entity)`            | `void`                | Track an entity on the grid                         |
| `removeEntity(entityId)`         | `void`                | Remove entity tracking                              |
| `moveEntity(entityId, toX, toY)` | `void`                | Update entity position in tracking                  |
| `getEntityAt(x, y)`              | `BoardEntity \| null` | Get first entity at position                        |
| `getAllEntitiesAt(x, y)`         | `BoardEntity[]`       | Get all entities at position                        |
| `getEntitiesOfType(type)`        | `BoardEntity[]`       | Get all entities of a type                          |
| `getEntityById(id)`              | `BoardEntity \| null` | Get entity by unique ID                             |
| `getAllEntities()`               | `BoardEntity[]`       | Get all tracked entities                            |
| `pushState()`                    | `void`                | Save current state for undo                         |
| `popState()`                     | `boolean`             | Restore previous state (returns true if successful) |
| `canUndo`                        | `boolean`             | Whether undo stack has entries                      |
| `clearHistory()`                 | `void`                | Clear undo stack                                    |
| `serialize()`                    | `string`              | Serialize board to JSON string                      |
| `deserialize(data)`              | `void`                | Restore board from JSON string                      |
| `gridToWorld(gridX, gridY)`      | `{x, y}`              | Grid -> world center coordinates                    |
| `worldToGrid(worldX, worldY)`    | `GridPoint`           | World -> grid coordinates                           |

**Events emitted**:

| Event                | Args                               | When                        |
| -------------------- | ---------------------------------- | --------------------------- |
| `'cellChanged'`      | `(x, y, oldValue, newValue)`       | Cell state changes          |
| `'entityPlaced'`     | `(entity)`                         | Entity added to board       |
| `'entityRemoved'`    | `(entity)`                         | Entity removed from board   |
| `'entityMoved'`      | `(entity, fromX, fromY, toX, toY)` | Entity position changes     |
| `'boardRestored'`    | `()`                               | Board restored from undo    |
| `'undoStackChanged'` | `(stackSize)`                      | Undo stack grows or shrinks |

### 2.2 TurnManager

| Property / Method         | Type             | Purpose                                                                                                           |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `mode`                    | `GridTimingMode` | Current timing mode                                                                                               |
| `phase`                   | `GridPhase`      | Current phase (WAITING/PROCESSING/ANIMATING/CHECKING)                                                             |
| `turnNumber`              | `number`         | Current turn (1-based)                                                                                            |
| `moveCount`               | `number`         | Total moves performed                                                                                             |
| `maxMoves`                | `number`         | Move limit (-1 = unlimited)                                                                                       |
| `isWaitingForInput`       | `boolean`        | True when ready for player input                                                                                  |
| `hasMovesRemaining`       | `boolean`        | True if under move limit                                                                                          |
| `isStarted`               | `boolean`        | Whether game has started                                                                                          |
| `start()`                 | `void`           | Begin the turn cycle                                                                                              |
| `stop()`                  | `void`           | Stop the turn cycle                                                                                               |
| `update(delta)`           | `void`           | Frame update (for realtime ticks)                                                                                 |
| `recordAction()`          | `void`           | Signal a player action was taken                                                                                  |
| `endTurn()`               | `void`           | Explicitly end turn ('turn' mode)                                                                                 |
| `beginAnimating()`        | `void`           | Transition to ANIMATING phase                                                                                     |
| `finishAnimating()`       | `void`           | Transition to CHECKING phase                                                                                      |
| `finishChecking()`        | `void`           | Transition back to WAITING                                                                                        |
| `skipToWaiting()`         | `void`           | Skip directly to WAITING (advance turn)                                                                           |
| `setRealtimeInterval(ms)` | `void`           | Change realtime tick speed                                                                                        |
| `undoAction()`            | `void`           | Reverse one recorded action (decrements moveCount and turnNumber). Called automatically by `BaseGridScene.undo()` |
| `pauseRealtime()`         | `void`           | Pause realtime ticks                                                                                              |
| `resumeRealtime()`        | `void`           | Resume realtime ticks                                                                                             |

**Timing Modes**:

| Mode         | Behavior                                       | Use Case                 |
| ------------ | ---------------------------------------------- | ------------------------ |
| `'step'`     | Each input = one game step, auto-process       | Sokoban, sliding puzzles |
| `'turn'`     | N actions per turn, manual or auto end-turn    | Tactics, chess           |
| `'realtime'` | Timer-driven ticks, player input between ticks | Snake, Tetris            |
| `'freeform'` | No turn structure, immediate processing        | Match-3                  |

**Events emitted**:

| Event                | Args                   | When                      |
| -------------------- | ---------------------- | ------------------------- |
| `'phaseChanged'`     | `(newPhase, oldPhase)` | Phase transition          |
| `'turnStart'`        | `(turnNumber)`         | New turn begins           |
| `'turnEnd'`          | `(turnNumber)`         | Turn ends                 |
| `'moveCountChanged'` | `(count, max)`         | Move counter changes      |
| `'realtimeTick'`     | `()`                   | Realtime interval elapsed |

### 2.3 AnimationQueue

| Property / Method              | Type            | Purpose                                  |
| ------------------------------ | --------------- | ---------------------------------------- |
| `isPlaying`                    | `boolean`       | Whether animations are currently playing |
| `isEmpty`                      | `boolean`       | Whether queue is empty                   |
| `length`                       | `number`        | Number of queued steps                   |
| `enqueue(callback)`            | `void`          | Add sequential animation step            |
| `enqueueParallel(callbacks[])` | `void`          | Add parallel animation group             |
| `play()`                       | `Promise<void>` | Play all queued animations in order      |
| `clear()`                      | `void`          | Clear queue (does not stop current)      |

**Static Animation Factories** (convenience methods):

| Factory                                                                | Purpose                 |
| ---------------------------------------------------------------------- | ----------------------- |
| `AnimationQueue.move(scene, target, toX, toY, duration?, ease?)`       | Move game object        |
| `AnimationQueue.movePath(scene, target, path[], stepDuration?, ease?)` | Move along path         |
| `AnimationQueue.fade(scene, target, toAlpha, duration?)`               | Fade in/out             |
| `AnimationQueue.scale(scene, target, toScale, duration?)`              | Scale transform         |
| `AnimationQueue.destroy(scene, target, duration?)`                     | Shrink + fade + destroy |
| `AnimationQueue.shake(scene, target, intensity?, duration?)`           | Shake effect            |
| `AnimationQueue.delay(scene, duration)`                                | Wait/pause              |
| `AnimationQueue.popIn(scene, target, targetScale?, duration?)`         | Pop-in spawn effect     |
| `AnimationQueue.bounce(scene, target, bounceScale?, duration?)`        | Bounce feedback         |

**Events emitted**:

| Event         | Args | When                           |
| ------------- | ---- | ------------------------------ |
| `'started'`   | `()` | Queue playback begins          |
| `'completed'` | `()` | All queued animations finished |

---

## 3. Available Groups (BaseGridScene)

| Group           | Type                       | Purpose           |
| --------------- | -------------------------- | ----------------- |
| `entitiesGroup` | `Phaser.GameObjects.Group` | All grid entities |

### Built-in State

| Property                     | Type                     | Purpose                     |
| ---------------------------- | ------------------------ | --------------------------- |
| `entities`                   | `BaseGridEntity[]`       | All active entities         |
| `selectedEntity`             | `BaseGridEntity \| null` | Currently selected entity   |
| `selectedCell`               | `GridPoint \| null`      | Currently selected cell     |
| `cellSize`                   | `number`                 | Cached cell size            |
| `gridCols`, `gridRows`       | `number`                 | Cached grid dimensions      |
| `gridOffsetX`, `gridOffsetY` | `number`                 | Cached grid offset          |
| `cells`                      | `number[][]`             | Cached cell array reference |

---

## 4. BaseGridScene Hooks

### 4.1 Abstract Methods (MUST implement in every level)

| Method                 | Returns       | Purpose                                     |
| ---------------------- | ------------- | ------------------------------------------- |
| `getBoardConfig()`     | `BoardConfig` | Grid dimensions, cell size, 2D cell array   |
| `createEnvironment()`  | `void`        | Background image, grid overlay, decorations |
| `createEntities()`     | `void`        | Create and place all game entities          |
| `checkWinCondition()`  | `boolean`     | Return true to trigger victory              |
| `checkLoseCondition()` | `boolean`     | Return true to trigger game over            |

### 4.2 Optional Configuration

| Method            | Default            | Purpose                        |
| ----------------- | ------------------ | ------------------------------ |
| `getTurnConfig()` | `{ mode: 'step' }` | Turn/step timing configuration |

### 4.3 Hook Methods (CAN override -- default does nothing)

**Lifecycle Hooks:**

| Hook                        | Purpose                              |
| --------------------------- | ------------------------------------ |
| `onPreCreate()`             | Before scene creation begins         |
| `onPostCreate()`            | After all scene creation is complete |
| `onPreUpdate(time, delta)`  | Before each frame update             |
| `onPostUpdate(time, delta)` | After each frame update              |

**Input Hooks:**

| Hook                          | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `onCellClicked(gridX, gridY)` | Grid cell clicked/tapped                                              |
| `onCellHovered(gridX, gridY)` | Mouse hovers over grid cell                                           |
| `onDirectionInput(direction)` | Arrow key / WASD pressed                                              |
| `onActionInput()`             | Action key (Spacebar) pressed -- for abilities, attacks, interactions |
| `onEntityClicked(entity)`     | Entity on the board clicked                                           |

**Entity Event Hooks:**

| Hook                                                  | Purpose                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `onEntityMoved(entity, fromX, fromY, toX, toY)`       | Entity moved to new cell                                                          |
| `onEntityEnteredCell(entity, gridX, gridY, cellType)` | Entity entered a cell -- handle tile interactions (traps, items, terrain effects) |
| `onEntityDeath(entity)`                               | Entity health reached 0 -- handle death (remove, animate, check lose)             |

**Turn Hooks:**

| Hook                      | Purpose         |
| ------------------------- | --------------- |
| `onTurnStart(turnNumber)` | New turn begins |
| `onTurnEnd(turnNumber)`   | Turn ends       |

**Processing Pipeline Hooks (called in order during `runProcessingPipeline`):**

| Hook                                  | Purpose                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `onProcessComplete()`                 | **Player Phase**: enqueue animations for the player's action                    |
| `onWorldPhase()`                      | **World Phase**: traps activate, tiles transform, items collected               |
| `onEnemyPhase()`                      | **Enemy Phase**: enemies take their step (AI, patrol, emit effects)             |
| `onAnimationComplete()`               | After all queued animations finish                                              |
| `onMoveProcessed()` -> return boolean | After full cycle; return `true` for chain reactions (Match-3 cascades, gravity) |

**Outcome Hooks:**

| Hook                    | Default                | Purpose                               |
| ----------------------- | ---------------------- | ------------------------------------- |
| `onWinConditionMet()`   | Launch VictoryUIScene  | Win condition triggered               |
| `onLoseConditionMet()`  | Launch GameOverUIScene | Lose condition triggered              |
| `onBoardStateChanged()` | no-op                  | After any board state modification    |
| `onUndoPerformed()`     | no-op                  | After an undo operation               |
| `onRealtimeTick()`      | no-op                  | Realtime mode: timer interval elapsed |

### 4.4 Built-in Methods (available in level scenes)

**Entity Management:**

| Method                                                      | Returns                  | Purpose                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addEntity(entity)`                                         | `void`                   | Add entity to board (auto-scales, positions, tracks)                                                                                                                                                                                                     |
| `removeEntity(entity)`                                      | `void`                   | Remove entity from board and destroy sprite                                                                                                                                                                                                              |
| `moveEntity(entity, toX, toY, animate?, duration?)`         | `Promise<void>`          | Move entity (data + visual). Auto-triggers `onEntityEnteredCell`                                                                                                                                                                                         |
| `damageEntity(entity, amount)`                              | `void`                   | Deal damage. Auto-triggers `onEntityDeath` if health reaches 0                                                                                                                                                                                           |
| `getEntityAt(gridX, gridY)`                                 | `BaseGridEntity \| null` | First entity at position                                                                                                                                                                                                                                 |
| `getAllEntitiesAt(gridX, gridY)`                            | `BaseGridEntity[]`       | All entities at position                                                                                                                                                                                                                                 |
| `getEntitiesOfType(type)`                                   | `BaseGridEntity[]`       | All entities of a type                                                                                                                                                                                                                                   |
| `stepAllEntities(turnNumber?)`                              | `void`                   | Call `onStep()` on all active entities                                                                                                                                                                                                                   |
| `stepEntitiesOfType(type, turnNumber?)`                     | `void`                   | Call `onStep()` on entities of a specific type                                                                                                                                                                                                           |
| `slideEntity(entity, direction, shouldStop, stepDuration?)` | `Promise<GridPoint>`     | Slide entity continuously in a direction until `shouldStop(nextX, nextY)` returns true. Calls `moveEntity()` at each step so `onEntityEnteredCell` fires at every intermediate cell. Generic for ice, conveyor belts, wind, etc. Returns final position. |

**Selection & Highlighting:**

| Method                                       | Returns | Purpose                               |
| -------------------------------------------- | ------- | ------------------------------------- |
| `selectEntity(entity)`                       | `void`  | Select entity + show highlight        |
| `deselectEntity()`                           | `void`  | Clear selection                       |
| `setHighlightedCells(cells, color?, alpha?)` | `void`  | Highlight cells (movement range, etc) |
| `clearHighlights()`                          | `void`  | Remove cell highlights                |

**Input & State:**

| Method                    | Returns         | Purpose                                                                                              |
| ------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `lockInput()`             | `void`          | Prevent input processing                                                                             |
| `unlockInput()`           | `void`          | Resume input processing                                                                              |
| `saveUndoState()`         | `void`          | Save board state + custom data for undo. Calls `getCustomUndoData()`                                 |
| `undo()`                  | `void`          | Restore previous board state + custom data. Calls `restoreCustomUndoData()` then `onUndoPerformed()` |
| `runProcessingPipeline()` | `Promise<void>` | Full move processing pipeline                                                                        |

**Custom Undo Data (override for games with HP, cooldowns, inventory, etc.):**

| Method                        | Returns                   | Purpose                                                                                                                                                     |
| ----------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getCustomUndoData()`         | `Record<string, unknown>` | Return a snapshot of custom game state (HP, cooldowns, inventory flags, patrol directions). Called automatically by `saveUndoState()`. Default returns `{}` |
| `restoreCustomUndoData(data)` | `void`                    | Restore custom game state from the snapshot. Called automatically by `undo()` before `onUndoPerformed()`. Default is no-op                                  |

> **Undo system scope**: `BoardManager` automatically saves/restores cell types and entity grid positions. It does NOT save entity HP, cooldowns, facing direction, inventory flags, or any game-specific state. Override `getCustomUndoData()` and `restoreCustomUndoData()` to handle these. Destroyed entities are automatically re-shown by `syncEntitiesToBoard()` on undo.

---

## 5. BaseGridEntity Hooks

| Hook                             | Default | Purpose                                                                      |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `onPlaced()`                     | no-op   | Entity first added to board                                                  |
| `onMoved(fromX, fromY)`          | no-op   | Entity moved to new position                                                 |
| `onRemoved()`                    | no-op   | Entity removed from board                                                    |
| `onSelected()`                   | no-op   | Entity selected by player                                                    |
| `onDeselected()`                 | no-op   | Entity deselected                                                            |
| `onInteraction(type)`            | no-op   | Entity interacted with (push, click, etc)                                    |
| `onStep(turnNumber)`             | no-op   | Per-step entity logic (AI, timers, cooldowns). Called by `stepAllEntities()` |
| `onDamage(amount, oldHP, newHP)` | no-op   | Entity takes damage (visual feedback)                                        |
| `onDeath()`                      | no-op   | Entity health reaches 0                                                      |
| `onCellEntered(cellType)`        | no-op   | Entity enters a new cell (tile reactions)                                    |

### Entity Properties

| Property          | Type                                  | Description                                     |
| ----------------- | ------------------------------------- | ----------------------------------------------- |
| `gridX`           | `number`                              | Current grid X position                         |
| `gridY`           | `number`                              | Current grid Y position                         |
| `entityId`        | `string`                              | Unique instance identifier                      |
| `entityType`      | `string`                              | Type identifier (for queries)                   |
| `isWalkable`      | `boolean`                             | Can other entities walk through                 |
| `isPushable`      | `boolean`                             | Can be pushed by another entity                 |
| `isDestructible`  | `boolean`                             | Can be destroyed                                |
| `facingDirection` | `'up' \| 'down' \| 'left' \| 'right'` | Current facing direction (get/set)              |
| `health`          | `number`                              | Current HP (get/set, clamped to [0, maxHealth]) |
| `maxHealth`       | `number`                              | Maximum HP (0 = no HP system)                   |
| `isAlive`         | `boolean`                             | True if entity is alive (or has no HP system)   |

### Entity Methods

| Method                                                  | Returns         | Description                                                      |
| ------------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| `setGridPosition(gridX, gridY)`                         | `void`          | Instant position update                                          |
| `animateToGridPosition(gridX, gridY, duration?, ease?)` | `Promise<void>` | Smooth position tween                                            |
| `syncWorldPosition()`                                   | `void`          | Sync sprite to grid position                                     |
| `initGridParams(cellSize, offsetX, offsetY)`            | `void`          | Set grid parameters                                              |
| `scaleToGrid(cellSize, padding?)`                       | `void`          | Scale sprite to fit cell                                         |
| `takeDamage(amount)`                                    | `void`          | Deal damage. Triggers `onDamage`, then `onDeath` if HP reaches 0 |
| `heal(amount)`                                          | `void`          | Restore HP (clamped to maxHealth)                                |

### Entity Config

```typescript
interface GridEntityConfig {
  id: string; // unique instance identifier
  entityType: string; // type for queries
  textureKey: string; // asset key
  gridX: number; // starting grid X
  gridY: number; // starting grid Y
  displaySize?: number;
  isWalkable?: boolean;
  isPushable?: boolean;
  isDestructible?: boolean;
  maxHealth?: number; // 0 = no HP system. Set > 0 for combat entities.
}
```

---

## 6. Type Definitions

### Board Types

```typescript
interface BoardConfig {
  cols: number;
  rows: number;
  cellSize: number;
  cells: number[][];
  offsetX?: number;
  offsetY?: number;
}

enum CellType {
  EMPTY = 0,
  WALL = 1,
  FLOOR = 2,
  GOAL = 3,
  HAZARD = 4,
  SPAWN = 5,
  SPECIAL = 6,
  ICE = 7,
  PORTAL = 8,
}

interface GridPoint {
  gridX: number;
  gridY: number;
}
```

### Turn Types

```typescript
type GridTimingMode = 'step' | 'turn' | 'realtime' | 'freeform';
type GridPhase = 'WAITING' | 'PROCESSING' | 'ANIMATING' | 'CHECKING';

interface TurnManagerConfig {
  mode: GridTimingMode;
  maxMoves?: number; // -1 = unlimited
  realtimeIntervalMs?: number; // ms between realtime ticks
  actionsPerTurn?: number; // for 'turn' mode
}
```

---

## 7. Utility Functions (utils.ts)

### Core Utilities (shared with all modules)

| Function                                                  | Purpose                            |
| --------------------------------------------------------- | ---------------------------------- |
| `initScale(sprite, origin, maxW?, maxH?, bodyW?, bodyH?)` | Scale sprite with body alignment   |
| `resetOriginAndOffset(sprite, direction)`                 | Per-animation origin recalculation |
| `safeAddSound(scene, key, config?)`                       | Safe audio with cache check        |
| `addCollider(scene, obj1, obj2, cb?, proc?, ctx?)`        | Fixed parameter order collider     |
| `addOverlap(scene, obj1, obj2, cb?, proc?, ctx?)`         | Fixed parameter order overlap      |
| `initUIDom(scene, html)`                                  | Create DOM UI overlay              |
| `createDecoration(scene, group, key, x, y, height)`       | Scaled static decoration           |
| `textureExists(scene, key)`                               | Check if texture is loaded         |
| `audioExists(scene, key)`                                 | Check if audio is loaded           |

### Grid-Specific Utilities

**Coordinate Conversion:**

| Function                                                    | Purpose                          |
| ----------------------------------------------------------- | -------------------------------- |
| `gridToWorld(gridX, gridY, cellSize, offsetX?, offsetY?)`   | Grid -> pixel center             |
| `worldToGrid(worldX, worldY, cellSize, offsetX?, offsetY?)` | Pixel -> grid cell               |
| `isInBounds(gridX, gridY, width, height)`                   | Check if position is within grid |

**Direction & Neighbors:**

| Function                                                      | Purpose                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `getDirectionDelta(direction)`                                | Get (dx, dy) for a cardinal direction                      |
| `getNeighbors(gridX, gridY, width, height, mode?)`            | Get adjacent cells (4-dir/8-dir)                           |
| `getDirection(fromX, fromY, toX, toY)`                        | Get 4-way movement direction from delta                    |
| `getCellsInDirection(startX, startY, direction, range, w, h)` | Cells in a straight line from origin -- for ranged attacks |
| `getCellsInRadius(centerX, centerY, radius, w, h)`            | All cells within Manhattan radius -- for area effects      |

**Distance:**

| Function                            | Purpose                   |
| ----------------------------------- | ------------------------- |
| `manhattanDistance(x1, y1, x2, y2)` | Manhattan (taxi) distance |
| `chebyshevDistance(x1, y1, x2, y2)` | Chebyshev (king) distance |

**Pathfinding & Search:**

| Function                                                            | Purpose                     |
| ------------------------------------------------------------------- | --------------------------- |
| `getReachableCells(startX, startY, range, w, h, isWalkable, mode?)` | BFS reachable cells         |
| `findPath(startX, startY, endX, endY, w, h, isWalkable, mode?)`     | A\* pathfinding             |
| `floodFill(startX, startY, w, h, predicate, mode?)`                 | Connected region detection  |
| `getLine(x1, y1, x2, y2)`                                           | Bresenham line of sight     |
| `hasLineOfSight(x1, y1, x2, y2, isTransparent)`                     | LOS check between two cells |
| `findMatches(cells, width, height, minLength?)`                     | Match-3 line detection      |

**Visual:**

| Function                                                                                                           | Purpose                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `drawGridLines(scene, cols, rows, cellSize, offsetX?, offsetY?, color?, alpha?)`                                   | Visual grid overlay                  |
| `drawCellTypeOverlay(scene, cells, cols, rows, cellSize, offsetX?, offsetY?, colorMap?)`                           | Debug cell type colors               |
| `highlightCells(scene, cells[], cellSize, offsetX?, offsetY?, fillColor?, fillAlpha?, borderColor?, borderAlpha?)` | Highlight cell set                   |
| `highlightSelectedCell(scene, gridX, gridY, cellSize, offsetX?, offsetY?, color?)`                                 | Pulsing selection indicator          |
| `showFloatingText(scene, x, y, text, color?, fontSize?, duration?, riseDistance?)`                                 | Rising/fading text effect            |
| `scaleToCell(sprite, cellSize, padding?)`                                                                          | Scale sprite to fit within grid cell |

---

## 8. gameConfig.json Structure

```json
{
  "screenSize": { ... },
  "debugConfig": { ... },
  "renderConfig": { ... },
  "gridConfig": {
    "cellSize": { "value": 64, "type": "number", "description": "..." },
    "gridWidth": { "value": 10, "type": "number", "description": "..." },
    "gridHeight": { "value": 10, "type": "number", "description": "..." },
    "maxMoves": { "value": -1, "type": "number", "description": "..." },
    "animationSpeed": { "value": 200, "type": "number", "description": "..." },
    "inputDebounceMs": { "value": 150, "type": "number", "description": "..." }
  }
}
```

---

## 9. Operation Patterns

| Pattern    | Files                                                                                                                       | Description                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **KEEP**   | `BaseGridScene.ts`, `BaseGridEntity.ts`, `BoardManager.ts`, `TurnManager.ts`, `AnimationQueue.ts`, `UIScene.ts`, `utils.ts` | Engine files -- never modify                              |
| **COPY**   | `_TemplateGridLevel.ts`, `_TemplateEntity.ts`                                                                               | Copy -> rename -> implement abstract methods / fill hooks |
| **UPDATE** | `main.ts`, `LevelManager.ts`, `gameConfig.json`                                                                             | Add scene registrations, level order, config values       |

---

## 10. UI Communication Protocol

### Game Scene -> UIScene (via events on game scene)

| Event                | Data             | Purpose                                     |
| -------------------- | ---------------- | ------------------------------------------- |
| `'moveCountChanged'` | `(count, max)`   | Update move counter                         |
| `'turnChanged'`      | `(turnNumber)`   | Update turn display                         |
| `'scoreChanged'`     | `(score)`        | Update score display                        |
| `'hpChanged'`        | `(current, max)` | Update HP display (shows hearts)            |
| `'statusChanged'`    | `(text)`         | Update status line (energy, inventory, etc) |
| `'undoAvailable'`    | `(boolean)`      | Enable/disable undo button                  |
| `'showLevelTitle'`   | `(title)`        | Show level name briefly                     |

### UIScene -> Game Scene (via events on game scene)

| Event             | Data | Purpose                                                    |
| ----------------- | ---- | ---------------------------------------------------------- |
| `'undoRequested'` | `()` | Player pressed undo button (auto-handled by BaseGridScene) |

---

## 11. Built-in Controls

| Input             | Action                                                |
| ----------------- | ----------------------------------------------------- |
| Arrow Keys / WASD | Trigger `onDirectionInput()` hook                     |
| Spacebar          | Trigger `onActionInput()` hook                        |
| Left Click        | Trigger `onCellClicked()` / `onEntityClicked()` hooks |
| Mouse Move        | Trigger `onCellHovered()` hook                        |
| Z                 | Undo last move                                        |
| ESC               | Open pause menu                                       |

---

## 12. Processing Pipeline

The built-in `runProcessingPipeline()` method executes this sequence:

```
1. lockInput()
2. recordAction() -> phase: WAITING -> PROCESSING
3. PLAYER PHASE:  onProcessComplete() -> enqueue player animations -> play
4. WORLD PHASE:   onWorldPhase()      -> enqueue world animations -> play
5. ENEMY PHASE:   onEnemyPhase()      -> enqueue enemy animations -> play
6. onAnimationComplete()
7. checkWinCondition() -> if true: onWinConditionMet() [STOP]
8. checkLoseCondition() -> if true: onLoseConditionMet() [STOP]
9. onMoveProcessed() -> if returns true: LOOP back to step 3 (chain reactions)
10. skipToWaiting() -> phase -> WAITING (advances turn)
11. onBoardStateChanged()
12. unlockInput()
```

The three-phase pipeline supports the common turn structure of grid games:

- **Player Phase** (`onProcessComplete`): Resolve and animate the player's action (move, push, attack)
- **World Phase** (`onWorldPhase`): Traps activate, tiles transform, items are collected
- **Enemy Phase** (`onEnemyPhase`): Enemy AI takes a step, patrol units move, area effects emit

Each phase can enqueue animations independently. All three phases complete before win/lose checks. The `onMoveProcessed()` chain reaction loop is for cascading effects (Match-3 gravity, recursive destruction) -- it is separate from the enemy phase.

**Typical usage in onEnemyPhase:**

```typescript
protected override onEnemyPhase(): void {
  this.stepAllEntities();
  // or for finer control:
  this.stepEntitiesOfType('chaser');
  this.stepEntitiesOfType('patroller');
}
```
