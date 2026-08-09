export const gameTestCase = {
  id: 'metal-slug-shooter',
  name: 'MetalSlug',
  prompt: `Create a side-scrolling pixel-art jungle shooter inspired by the Metal Slug series. The game should feature a brave commando armed with heavy weapons, fighting enemies hidden in dense tropical vegetation. Include smooth run, jump, and shoot animations, destructible objects, and Japanese samurai boss battles. Style is pixel art with retro arcade aesthetics, vibrant colors, and dramatic lighting.
`,
};

export const marvelTestCase = {
  id: 'marvel-action-platformer',
  name: 'MarvelHeroes',
  prompt: `
# Create "Avengers: Infinity Strike"

I want to create a highly polished Marvel-themed Action Platformer. The game must capture the epic, cinematic scale of the Marvel Universe, in favor of a hardcore arcade brawler style.

Please follow the Platformer Archetype workflow.

## 1. Game Concept & Art Direction

- **Genre:** Side-scrolling Action Platformer / Arcade Brawler.
- **Visual Style:** Late-90s Capcom Arcade Pixel Art. Authentic Marvel comic book color palette. High contrast shading, thick dramatic outlines, crisp pixel-perfect edges.
- **VFX & Juice:** Heavy use of screen shake, hit-stop (brief pause on impact), glowing particle effects (repulsor beams, lightning, gamma radiation), and dynamic lighting.

## 2. Controls (Keyboard)

- A / D: Move Left / Right.
- W / Space: Jump (Can Double Jump for Iron Man & Thor).
- K (Basic Attack): Primary melee or quick ranged combo.
- L (Special Skill): Signature hero ability (Short cooldown).
- Q (Ultimate): Devastating screen-clearing ultimate (Requires full energy / long cooldown).

## 3. Character Roster (Selectable Heroes)

### A. Iron Man (Mark VII Armor)

- **Visual:** Sleek metallic red and gold armor, glowing blue arc reactor and eyes. Hovering slightly during idle.
- **Basic (K):** Repulsor Blast - Fires rapid blue energy projectiles horizontally.
- **Skill (L):** Micro-Missiles - Launches a spread of 3 tracking missiles that explode on impact (AoE damage).
- **Ultimate (Q):** Unibeam - Plants feet and fires a massive cylindrical blue laser from his chest, destroying everything in its path.

### B. Thor (God of Thunder)

- **Visual:** Asgardian armor, flowing red cape, crackling with blue/white electricity. Wields Mjolnir.
- **Basic (K):** Mjolnir Strike - Heavy hammer swings.
- **Skill (L):** Hammer Throw - Throws Mjolnir forward like a boomerang, hitting enemies on the way out and the way back.
- **Ultimate (Q):** Thunder's Wrath - Leaps into the air and slams Mjolnir into the ground, calling down massive vertical lightning bolts across the entire screen.

### C. The Hulk (The Incredible)

- **Visual:** Towering, hyper-muscular green giant with torn purple pants. Takes up 2x the screen space of other heroes.
- **Basic (K):** Gamma Smash - Devastating punches. Slow but very high damage.
- **Skill (L):** Hulk Charge - Rushes forward with shoulder lowered, ignoring enemy projectiles and knocking back all enemies in his path.
- **Ultimate (Q):** Earthquake Slam - Smashes the ground with both fists. Massive screen shake, causing the ground floor to deal high damage to all grounded enemies.

## 4. Epic Level Design & Environments

The game features 3 distinct stages, moving from Earth to the cosmos.

### Level 1: The Battle of New York (City Ruins)

- **Terrain:** Destroyed asphalt, crushed yellow taxi cabs acting as platforms.
- **Background (3-Layers Parallax):**
  - Far: Bright blue sky with a swirling alien wormhole portal.
  - Mid: Stark Tower with the glowing "A" logo, surrounded by smoking skyscrapers.
  - Near: Broken bridge railings and burning debris.
- **Enemies:** Ultron Sentries (Standard Enemy).

### Level 2: S.H.I.E.L.D. Helicarrier (Internal Breach)

- **Terrain:** Steel grating floors, multi-level indoor catwalks, and containment cells.
- **Background (3-Layers Parallax):**
  - Far: Massive reinforced glass viewports showing the high-altitude blue sky and fast-moving clouds outside.
  - Mid: Deep, cavernous hangar bays featuring parked Quinjets and giant glowing blue energy cores.
  - Near: Dark metallic structural pillars, flashing red alarm lights, and hanging industrial cables.
- **Enemies:** Ultron Sentries (Standard Enemy).

### Level 3: Ruins of Titan (The Final Stand)

- **Terrain:** Jagged purple/black alien rock formations, floating gravity-defying asteroids.
- **Background (3-Layers Parallax):**
  - Far: Deep space void, purple cosmic nebula, shattered moons.
  - Mid: Crashed Q-Ship (alien donut ship) buried in the dirt.
  - Near: Ominous floating rocks and golden dust particles.
- **Boss Fight:** Thanos.

## 5. Enemies & Bosses

### Standard Enemy: Ultron Sentry

- **Visual:** Silver robotic humanoid with glowing red eyes and exposed metallic joints.
- **AI Logic:** Basic patrol AI (strictly ground-based, no flying). Marches relentlessly towards the player when in range to deliver heavy metallic punches (Melee). Used in both Level 1 and Level 2 to unify the robotic threat.

### Boss Fight: Thanos (The Mad Titan)

- **Visual:** Huge, imposing figure in golden armor, wearing the Infinity Gauntlet. The stones glow brightly.
- **AI Logic:** Does not patrol. Aggressively targets the player. High HP.
- **Attacks:**
  - Power Punch (Melee): A heavy, slow punch with a purple glow (Power Stone).
  - Space Dash (Skill): Turns into blue smoke and teleports instantly behind the player, followed by a strike (Space Stone).

## 6. UI & HUD (Marvel Style)

- **Portraits:** Highly detailed pixel-art face of the chosen hero in the top-left corner.
- **Health Bar:** Angled, aggressive comic-book style frames (metallic gray and gold borders). Bright green health that turns red when low.
- **Energy/Ult Bar:** A glowing blue meter underneath the health bar that charges up.
- **Text:** Damage numbers should use a bold, comic-book "BAM!" or "POW!" style font (yellow with black outline).

## 7. Asset Generation Constraints (For the Agent)

- Ensure ALL character sprite sheets (Player, Ultron Sentry, Thanos) contain: idle, walk (or run), attack_basic, attack_skill, and attack_ult (if applicable).
- Backgrounds must explicitly follow the 3-layer parallax structure described above to give a cinematic 3D depth to the 2D plane.
`,
};

export const harryPotterTestCase = {
  id: 'harry-potter-education',
  name: 'HarryPotter',
  prompt: `# Create "Wizard's Duel: The Arithmancy Academy"

I want to build a **Turn-Based Educational Card Battler** inspired by the **Harry Potter** universe. The game simulates a magic duel at Hogwarts, where casting spells requires academic knowledge.

## 1. Game Concept & Theme
*   **Genre:** Turn-Based Strategy / Card Game / Quiz.
*   **Visual Style:** **Gothic Fantasy Pixel Art**. Parchment textures, gold borders, magical particle effects (sparkles, runes).
*   **Setting:** "The Dueling Club" at the School of Magic.
*   **Characters:**
    *   **Player:** "Apprentice Alaric" (Gryffindor-style robes, wand ready).
    *   **Enemy:** "Rival Draco" (Slytherin-style robes, sneering expression).
    *   **Mentor:** "Headmaster Dumbledore" (Pixel art version, appearing in tutorials/feedback).

## 2. Gameplay Loop (The Magic Cycle)

The game consists of a **Duel**.
State Machine: \`START_DIALOGUE\` -> \`PLAYER_TURN\` -> \`QUIZ_PHASE\` -> \`FEEDBACK_PHASE\` -> \`ACTION_PHASE\` -> \`ENEMY_TURN\`.

### **Core Mechanics:**
1.  **Magic Resonance (Combo System):**
    *   The player has a "Resonance Meter".
    *   **Correct Answer:** Meter +1. Damage Multiplier increases (1x -> 1.2x -> 1.5x -> 2.0x MAX).
    *   **Wrong Answer:** Meter resets to 0. Damage Multiplier resets to 1x.
    *   *Visual:* The wand glows brighter as combo increases.

2.  **Concept Mapping:**
    *   Cards = Spells (Incantations).
    *   Quiz = Casting Cost (Mental Focus).
    *   Subjects: Math (Arithmancy), Chemistry (Potions), History (Magic History).

### **Player's Turn Logic:**
1.  **Draw Phase:** Hand contains 3 Spell Cards.
2.  **Cast Phase:** Click a card (e.g., "Incendio").
3.  **The Incantation (Quiz):**
    *   A parchment modal pops up with a question.
    *   **Correct:** Trigger **Magic Resonance** (Combo UP), show "CAST SUCCESS", then deal damage.
    *   **Wrong:** Spell backfires (0 damage), Combo resets.
4.  **The Feedback (Education):**
    *   Regardless of result, show a brief "Grimoire Note" explaining the answer (e.g., "Correct! Gravity is 9.8m/s²").

## 3. Key Features & Systems (UI Heavy)

### A. The Spellbook (Card System)
*   Cards act as buttons with hover states (float up + glow).
*   **Card Types:**
    *   *Expelliarmus (Attack):* 10 Dmg.
    *   *Stupefy (Heavy Attack):* 25 Dmg.
    *   *Protego (Shield):* Blocks next attack.
    *   *Episkey (Heal):* Restores 15 HP.

### B. The Dialogue System (Narrative)
*   **Visual:** Parchment style text box at the bottom.
*   **Effect:** Typewriter text.
*   **Content:** Draco mocks the player's muggle studies; Dumbledore explains the duel rules.

### C. The Quiz & Feedback Interface
*   **Quiz Modal:** Looks like an open magical book.
*   **Feedback Modal:** A small scroll that unrolls after the answer, showing the "Why".
*   **Buttons:** Look like wax seals or rune stones.

### D. HUD (Heads-Up Display)
*   **Portrait Frames:** Gothic stone frames.
*   **HP Bar:** Liquid potion tube style (Green potion for player, Red for enemy).
*   **Resonance Indicator:** A counter showing "x1.5 Combo!" with flame effects.
*   **Floating Text:** Damage numbers style as magical runes.

## 4. Assets Requirements (For Generation)
*   **Background:** \`dueling_club_hall\` (Stone walls, floating candles, high windows).
*   **Characters:** \`wizard_student_idle\` (side view), \`rival_student_idle\` (side view).
*   **UI:** \`parchment_panel\`, \`wax_seal_button\`, \`spell_card_frame\`, \`potion_hp_bar\`.
*   **FX:** \`spell_sparkle\`, \`fizzle_smoke\`, \`combo_fire\`.

## 5. Technical Constraints
*   **Data Structure:** \`questions.json\` must include \`explanation\` field for the feedback system.
*   **Tweening:** Heavy use of tweens for UI (Book opening, Scroll unrolling).
*   **Managers:**
    *   \`ComboManager\`: Tracks streaks and calculates multipliers.
    *   \`QuizManager\`: Handles question randomization and validation.
*   **Resolution:** 1024x768 (Landscape).

**End Condition:**
*   **Victory:** Enemy HP <= 0. Show "O.W.L.s Passed" (Victory) screen.
*   **Defeat:** Player HP <= 0. Show "Expelled" (Defeat) screen.`,
};

export const kombatTestCase = {
  id: 'kombat-education',
  name: 'Kombat',
  prompt: `
  # Create "Knowledge Arena"

I want to build a **Local 2-Player Quiz Battle Game** styled like a retro 90s Arcade Fighting Game (like King of Fighters or Street Fighter). Instead of punching, players fight by answering Physics questions faster than their opponent.

## 1. Game Concept & Theme
* **Genre:** Educational / Arcade / Quiz / Local PvP.
* **Visual Style:** **16-bit Arcade Pixel Art**. a grand martial arts tournament arena, traditional stone ring, ancient Asian temple architecture in the distance, mountains and clouds, sunset lighting, highly detailed, SNES style, Neo Geo aesthetic, side view perspective --no characters, no people, no UI, no health bars, no text, no overlay, no hud.
* **Setting:** "The High-Voltage Arena" - A dojo where heroes duel.
* **Characters (Selectable):** Both parties can choose their own characters from multiple characters at the beginning. The characters come from well-known IPs: Street Fighter (Chun-Li and Ryu), Dragon Ball (Goku and Vegeta), The Nezha series (Nezha and Ao Bing),The King of Fighters (Kyo Kusanagi and Iori Yagami), Journey to the West (Monkey King and Erlang Shen) and JoJo's Bizarre Adventure (Jotaro Kujo and DIO) . There are 12 optional characters.

## 2. Gameplay Loop (The Battle System)

The game is a **First-to-Zero-HP** battle.
State Machine: \`CHARACTER_SELECT\` -> \`ROUND_START\` -> \`QUESTION_PHASE\` -> \`BUZZER_PHASE\` -> \`ANSWER_PHASE\` -> \`RESOLUTION_PHASE\` -> \`GAME_OVER\`.

### **Core Mechanics:**
1. **The Buzzer System (Race to Answer):** 
* A question appears. Both players race to hit their "Buzzer Key". 
* The first to press gets 5 seconds to choose an answer. The other player is locked out.

2. **Damage Logic:** 
* **Correct Answer:** Attacker plays "Attack" animation -> Opponent takes **20 Damage** (Flash Red). 
* **Wrong Answer:** Attacker plays "Hurt" animation -> Attacker takes **15 Self-Damage** (Backfire). 
* **Timeout:** If the buzzer winner doesn't answer in time, they take **10 Damage**.

### **Turn Flow:**
1. **Ready? Fight!**: UI shows dramatic text.
2. **Question**: A large panel slides in with a Physics question and 4 options (A, B, C, D).
3. **Buzz In**: Players press keys. 
* *Visual:* The winner's side lights up; the loser's side darkens.
4. **Answer**: Winner clicks the option button.
5. **Resolve**: Health bars drain with animation. Floating numbers appear ("-20").

## 3. Key Features & Systems (UI Heavy)

### A. Character Select Screen
* large portraits side-by-side.
* Click arrows to swap characters.
* "LOCK IN" button starts the game.

### B. Battle HUD
* **Health Bars:** Classic fighting game style. Thick bars that drain from outer edges inward. Yellow -> Red color shift.
* **Portraits:** Small pixel faces next to HP bars.
* **Timer:** A 99-second countdown (for the match) and a small 8s countdown (for answering).

### C. The Quiz Interface
* **Style:** Looks like a holographic tech panel overlaying the fight.
* **Feedback:** 
* Correct: Screen flashes white, "CRITICAL HIT!" text. 
* Wrong: Screen shakes, "MISS!" text.

### D. Animations (Tween-based)
* **Attack:** Move the character sprite forward quickly, then back (Tween x/y).
* **Hurt:** Shake the character sprite left/right + tint Red.
* **KO:** Slow motion effect (time scale) + "K.O." text stamps on screen.

## 4. Assets Requirements
* **Background:** \`dojo_bg\` (Animated neon lights in background).
* **Characters:** 
* *(Note: Use simple 2-frame animations or static sprites manipulated by code)*
* **UI:** \`health_frame\`, \`question_panel\`, \`buzzer_button_p1\`, \`buzzer_button_p2\`.
* **Audio:** \`punch_sfx\` (for correct answer), \`buzz_error_sfx\`, \`fight_announce\`.

## 5. Technical Constraints
* **Input:** Use the Q key (Player 1) and the P key (Player 2) to control the buzzer for answering, and use the mouse to select the answer.
* **Resolution:** 1536*1024.

**End Condition:**
* **HP = 0:** Trigger "KO" sequence. Show "PLAYER [X] WINS".`,
};

export const starWarsTestCase = {
  id: 'star-wars-top-down',
  name: 'StarWars',
  prompt: `
  # Create "The Mandalorian: Beskar Run"

I want to create a high-intensity **Action RPG / Twin-Stick Shooter** set in the Star Wars universe. The player controls The Mandalorian (Din Djarin) fighting through an Imperial Base to rescue Baby Yoda (Grogu).

## 1. Game Concept & Theme
*   **Genre:** Action RPG / Shooter / Dungeon Crawler.
*   **Perspective:** **Bird's-eye view (Overhead)**. The camera looks down at the map.
*   **Movement Physics:** The character walks freely on the ground (X and Y axes). **Gravity is ZERO**. When keys are released, the character stops immediately (no sliding).
*   **Visual Style:** Retro 16-bit Pixel Art, "Chibi" (big head) proportions, vibrant comic colors.

## 2. Gameplay Mechanics

### **Controls**
*   **WASD:** Move freely in 8 directions (Up, Down, Left, Right, Diagonals).
*   **Mouse:** Aiming reticle (Crosshair).
*   **Left Click:** Fire Blaster Rifle (Ranged).
*   **Right Click:** Beskar Spear Stab (Melee).
*   **Spacebar:** Jetpack Dash (Quick burst of speed in movement direction).

### **Combat System**
1.  **The Player (Mando):**
    *   Can switch seamlessly between shooting and melee.
    *   **Jetpack Dash:** Grants temporary invulnerability (i-frames) while dashing.
2.  **The Projectiles:**
    *   Blaster shots travel in a straight line towards the mouse cursor.
    *   Shots must be destroyed when hitting walls or enemies.

### **Enemy Logic (The Empire)**
1.  **Stormtrooper (Ranged):**
    *   Patrols corridors.
    *   Stops when seeing the player and fires red blaster bolts.
    *   Tries to keep distance (doesn't run into player).
2.  **Dark Trooper Droid (Melee):**
    *   Chases the player relentlessly (Pathfinding).
    *   High HP, moves slowly but hits hard.

### **Environment Interaction**
*   **Depth Sorting is CRITICAL:** When the player walks *in front* of a crate, they cover it. When walking *behind* a crate, the crate covers them. This applies to all characters and props.
*   **Room Clearing:** The exit door is locked. It only opens when ALL enemies in the current area are defeated.

## 5. Game Flow
1.  **Title Screen:** "The Mandalorian" logo with theme music.
2.  **Mission Start:** Player spawns in the south.
3.  **Victory:** Clear all Stormtroopers.`,
};

export const squidTestCase = {
  id: 'squid-game',
  name: 'SquidGame',
  prompt: `
  # Create "Squid Game" (top_down)

I want to recreate the intense atmosphere of the first round of Squid Game. The focus is on the **Massive Crowd**, the **Giant Doll**, and the **Permanent Accumulation of Corpses**. (top_down)

---

## 1. Visual Concept & Perspective (Crucial)

- **Genre:** Survival Reflex Arena.
- **Perspective:** Pseudo-3D Side-Scrolling Field.
  - Although gameplay is 2D, the field should have **depth**.
  - Characters closer to the bottom (higher Y) should visually overlap characters behind them (lower Y).
- **Crowd Formation:** The player and 30+ NPCs should **NOT** stand in a single straight line. They must be spawned at random Y positions across the height of the field to form a dense "mob" or "horde".
- **Art Style:** 16-bit SNES style. Gritty, realistic proportions (not cute).
- **Color Palette:**
  - **Ground:** Sandy yellow/brown dirt texture (The Arena).
  - **Living:** Bright Teal/Green tracksuits.
  - **Dead:** Darkened sprites, gruesome corpses.
  - **Doll:** Bright Yellow and Orange (High contrast).

---

## 2. Character & Entity Design

### A. The Giant Doll (The Threat)

- **Scale:** The Doll must be **MASSIVE**. About 1.5x to 2x taller than the player.
- **Position:** Fixed on the far **Right Center** of the screen. To the **right** of the Doll: a **giant withered tree**.
- **Visual States:**
  - **Back View:** Facing right (away from crowd). Static.
  - **Turning:** A stiff head-rotation animation. Only the head rotates; the body doesn't move!
  - **Front View (Scanning):** Facing left (towards crowd). The body remains facing right, only the face faces left.
- **The "Kill Zone" Line:** A bright **Pink line** drawn on the ground just in front of (on the left of) the Doll.

### B. The Crowd (Player + NPCs)

- **Appearance:** All wear identical **Green Tracksuits**.
- **Scale:** e.g., 64px–96px height.
- **Variations (NPCs):**
  - **Archetypes:** Uncle (bulky), Auntie (short hair), Old Man (hunched), Youth (slim).
- **Player Distinction:** Omit the player indicator arrow. The player blends into the crowd, enhancing tension.

### C. The Corpses (Visual Core)

- **Persistence:** When a character dies, they **NEVER disappear**. They become part of the background.
- **Tragic Scene:** The corpse sprite shows the body lying gruesomely on the ground. **No separate blood pools**; the corpse itself is the visual.
- **Layering (Depth):**

| Depth | Layer | Contents |
|-------|-------|----------|
| -10   | Ground | Background image |
| -1    | Dead Bodies | Darkened tint, gruesome corpses |
| 0+    | Living Characters | Y-sorted (higher Y = higher depth) |

- **Effect:** Survivors effectively "run over" the bodies of the fallen.

---

## 3. Gameplay Mechanics

### Controls

- **D (Hold):** Run Right.
- **Release D:** Stop instantly.
- **Note:** Although controls only affect X-axis, the character's Y-position is **fixed at spawn**. The crowd moves like a "wall" of people pressing forward.
- **Speed:** Overall movement is **slow** (~30–35 px/s) to create a tense, cautious rhythm — not a fast sprint.

### The Game Loop

1. **Singing (Safe):** Doll faces Back. BGM plays. Crowd runs right.
2. **Silence (Sudden Stop):** BGM cuts off **instantly**. Doll Turns Head (**Fast!(0.3s)**).
3. **Scan (Danger):** Doll faces Front for a while(1-2s).
   - **Detection:** If \`velocity.x > 0\`, the character dies.
   - **Feedback:** SFX plays. Character sprite changes to \`die\` frame (corpse). Character input disabled.
4. **Repeat:** Doll turns back. BGM resumes.

### Win / Lose

- **Win:** Player crosses the **finish line** (pink line near the Doll).
- **Lose:** Player is detected moving during Scan phase, OR timer runs out (60s).
- NPCs crossing the finish line do **NOT** end the game — only the player matters.

---

## 4. Asset Requirements (For Generation)

**Composition Setting:** *"Side view pixel art, 16-bit SNES style, neutral lighting"*

| Type | Key | Description | Frames |
|------|-----|-------------|--------|
| background | \`field_bg\` | Sandy arena floor, high walls in background, blue sky; **giant withered tree** on the right (near Doll) | 1536×1024 (Wide) |
| animation | doll_back | Giant girl facing away (Safe). | static(1) |
| animation | doll_turn_scan | Head turning towards screen (Warning). | frames: 3 (Back->Front) |
| animation | doll_front | Giant girl facing screen (Kill Zone). | static(1) |
| animation | doll_turn_reset | Head turning away from screen (Reset). | frames: 3 (Front->Back) |
| animation | \`player\` | Green tracksuit participant | idle(1), run(2), die(2) |
| animation | \`npc_uncle\` | Green tracksuit, heavy build middle-aged man | idle(1), run(2), die(2) |
| animation | \`npc_auntie\` | Green tracksuit, woman with ponytail | idle(1), run(2), die(2) |
| animation | \`npc_oldman\` | Green tracksuit, white hair, hunched frail elder | idle(1), run(2), die(2) |
| animation | \`npc_youth\` | Green tracksuit, slim young person | idle(1), run(2), die(2) |
| image | \`finish_line\` | A vertical bright pink line texture | — |
| audio | \`bgm_singing\` | Iconic "Mugunghwa" doll singing melody | Loop |
| audio | \`sfx_gunshot\` | Sharp rifle crack | One-shot |
| audio | \`sfx_victory\` | Triumphant fanfare | One-shot |
| audio | \`sfx_gameover\` | Somber defeat tone | One-shot |

**Visual Note for \`die\` frame:** The character should be lying flat on the ground, face down, gruesomely dead — the corpse sprite conveys the tragic state. No separate blood pool asset.

---

## 5. Technical Implementation Details

> These notes map the design above to the existing **BaseArenaScene / BaseGameScene** template API.

### Sub-mode

- Use **Arena** (\`BaseArenaScene\`). No tilemap.

### Background

- **Static image**, not scrolling. Use \`this.add.image(...)\` in \`createBackground()\`.
- Do **NOT** use \`setupScrollingBg()\` — that is only for space shooters / vertical scrollers.

### NPC Spawning (Pre-placed, NOT Timer-based)

- Create **all 40 NPCs** in a loop inside \`createEntities()\`.
  - \`x\`: Random between \`50\` and \`200\` (start zone).
  - \`y\`: Random between \`100\` and \`screenHeight - 100\`.
- Cycle through the 4 NPC types: \`uncle → auntie → oldman → youth → uncle → ...\`
- **Disable the automatic spawner:**
  - Override \`getSpawnInterval()\` to return \`Infinity\`.
  - Override \`spawnEnemy()\` to return \`null\`.

### Depth Sorting (Built-in)

- Add all **living** player + NPCs to \`this.ySortGroup\` after creation.
- The template's \`updateYSort()\` (called automatically in \`baseUpdate()\`) will sort by Y-coordinate each frame so lower characters render in front.
- Dead characters are removed from \`ySortGroup\` and given a fixed low depth.

### Movement

- Player uses **D key only** → \`setVelocityX(+speed)\`. Release D → \`setVelocityX(0)\`.
- Speed: ~30–35 px/s (player and NPCs same) for tense, cautious rhythm.
- No vertical movement (W/A/S disabled). Y-position is fixed at spawn.
- Override \`onUpdate()\` in Player class. Disable melee/ranged/dash input hooks (return \`false\`).

### Doll Logic

- Implement Doll as a standalone \`Phaser.GameObjects.Sprite\` (not a BaseEnemy).
- Use \`Phaser.Time.TimerEvent\` for the phase cycle: Safe → Turn → Danger → repeat.
- **Randomize** the Safe duration (1–3s) to trick the player. Danger duration: 1–1.5s. Turn animation: ~0.3s.
- Doll sprite keys: \`doll_back_01\`, \`doll_turn_scan_01/02/03\`, \`doll_front_01\`, \`doll_turn_reset_01/02/03\`.

### NPC AI

- During **Safe** phase: move right at assigned speed. Reset decision flags.
- During **Turn** phase: each NPC decides **once** (50% chance) whether to stop. Use a \`hasDecided\` flag — do NOT re-roll every frame.
- During **Danger** phase: NPCs that didn't stop keep their velocity → scene detects and eliminates them.

### Death & Corpse Logic

When a character is detected moving during Danger:

1. npc.setVelocity(0, 0)          // Stop immediately
2. npc.body.enable = false         // Disable physics
3. Play death animation (die frame — corpse)
4. npc.setTint(0x999999)           // Darken sprite
5. npc.setDepth(-1)                // Move to dead body layer
6. this.enemies.remove(npc, false, false)  // Remove from enemies group
7. Remove from this.ySortGroup
8. Play sfx_gunshot

- Dead characters are **NEVER destroyed or faded out**. They persist for the entire game. **No blood pool** — the corpse sprite is the only visual.

### Win Condition

- \`player.x > finishLine.x\` → call \`this.onLevelComplete()\`.
- Use \`protected override checkWinCondition()\` (NOT \`private\`) — the base class defines it as \`protected\`.

### Timer

- 60-second countdown displayed in **top-right corner**, red monospace font.
- No "Red Light" / "Green Light" text. No state labels. The Doll's orientation is the **only** signal.

### Game Over / Restart

- When launching \`GameOverUIScene\`, **must** pass \`currentLevelKey: this.scene.key\`, otherwise restart will fail.

---

## 6. Goal

Create a chaotic, tense visual where the screen fills with bodies, forcing the player to run past their fallen comrades. The accumulation of corpses is the **defining visual identity** of this game.
  `,
};

export const hajimiTestCase = {
  id: 'hajimi-tower_defense',
  name: 'hajimi',
  prompt: `
  # Create "Hajimi Defense: The Mung Bean Crisis"

I want to create a hilarious Tower Defense Game where cute cats (Hajimi) defend their "Golden Tuna Can" from an invasion of household nightmares (Cucumbers and Vacuum Cleaners). The cats attack by spitting various beans and snacks!

## 1. Game Concept & Theme

- **Genre:** Tower Defense (Fixed Path)
- **Visual Style:** Cute & Meme Pixel Art. Bright, cartoonish, "Kawaii" but funny. High saturation.
- **Setting:** The Living Room floor.
- **Core Objective:** Prevent enemies from following the path and reaching the "Golden Tuna Can" at the end.
- **Economy:** Player uses "Kibble" (Cat Food) to place and upgrade cats.

## 2. Gameplay Mechanics

### The Loop

- **Preparation:** Player spends Kibble to place Cats on specific "Tower Slots" (Cushions/Rugs) alongside the path. Tower slots are invisible by default -- they only appear as round fluffy cushion images when the player selects a cat type to place, keeping the game view clean until placement mode is entered.
- **Wave Start:** Enemies spawn from the "Door" and follow a winding path toward the "Tuna Can". A countdown timer appears between waves showing how long until the next wave arrives.
- **Defense:** Cats automatically aim and spit their unique projectiles at enemies within range. Each cat type fires a visually distinct projectile (green beans, fish bones, red buns, boba pearls) -- players can instantly tell which cat fired what.
- **Reward:** Killing enemies drops Kibble. Killing multiple enemies in quick succession triggers a Combo bonus (displayed as "COMBO x3!" on screen) for extra Kibble.
- **Wave Clear:** Completing a wave awards a bonus Kibble reward, displayed as "WAVE BONUS! +20" on screen.
- **Game Over:** If 10 enemies reach the Tuna Can, the "Sanity Meter" drops to 0 and the game ends.

### Controls

- **Mouse Hover (on placed cat):** Shows the cat's attack range as a colored circle (orange for Tabby, blue for Siamese, red for Chonky, purple for Boba).
- **Mouse Left Click:** Select a Tower Slot to build a cat.
- **Mouse Left Click (on existing cat):** Upgrade the cat (costs Kibble) or Sell it (refunds 70% of invested Kibble).
- **Spacebar:** Force start the next wave immediately (skips the countdown timer).
- **ESC:** Pause the game.

### Obstacles

Scattered around the living room floor are **Cardboard Boxes** and **Shoe Piles** -- destructible obstacles that block tower placement. Players can click on them repeatedly to break them apart (each takes 5 clicks to destroy). Destroying an obstacle rewards 15 Kibble and clears the space, allowing a new cat to be placed there. This adds a strategic layer: invest time clicking obstacles early to unlock premium tower positions.

## 3. Entities & Systems

### A. The Towers (The Cats)

Each cat type has a unique projectile with its own dedicated image asset. When a cat fires, it plays a subtle "puff" animation (slight scale bounce). Projectiles that hit enemies show a brief impact flash effect.

1. **Spitfire Tabby (Basic)**
   - Attack: Spits rapid-fire Green Mung Beans. Each bean is a small round green projectile image.
   - Stats: Moderate speed, moderate damage, single target.
   - Visual: Orange tabby cat, cheeks puffed out. Orange range circle on hover.
   - Upgrades: Level 2 increases fire rate, Level 3 increases damage and range.

2. **Sniper Siamese (Long Range)**
   - Attack: Spits sharp Fish Bones. Each bone is an elongated white projectile image.
   - Stats: Slow speed, very high range, high damage.
   - Visual: Elegant Siamese cat with squinting eyes. Blue range circle on hover.
   - Upgrades: Level 2 increases damage, Level 3 increases range significantly.

3. **Chonky Orange (Area of Effect)**
   - Attack: Throws heavy Red Bean Buns. Each bun is a round brown-red projectile image. On impact, buns deal splash damage in a circle -- enemies at the center take full damage, those at the edge take reduced damage (distance falloff).
   - Stats: Very slow, splashes damage in a circle (AOE).
   - Visual: Fat orange cat lying down, lazily throwing food. Red range circle on hover.
   - Upgrades: Level 2 increases splash radius, Level 3 increases damage.

4. **Boba Calico (Slow/Crowd Control)**
   - Attack: Spits sticky Tapioca Pearls (Boba). Each pearl is a round black projectile image. On hit, enemies are tinted blue and slowed to 50% speed for 2 seconds.
   - Stats: Low damage, but slows down enemies on hit.
   - Visual: Calico cat drinking milk tea. Purple range circle on hover.
   - Upgrades: Level 2 increases slow duration, Level 3 increases slow intensity.

### B. The Enemies (Household Threats)

Each enemy type has a health bar above it that changes color as health decreases (green > yellow > red). When hit, enemies briefly flash red. When slowed, enemies are tinted blue.

1. **The Cucumber (Speedy):** Fast, low HP. Scares cats (lore only). Small green sprite, zips along the path.
2. **The Dust Bunny (Swarm):** Spawns in groups of 5-8, very weak individually. Tiny grey puffball sprites.
3. **The Robot Vacuum (Tank):** Very slow, huge HP, metallic clanking sound. Large round sprite with a menacing red light.
4. **Boss: The Mailman (Giant):** Huge sprite, huge HP. Appears at the end of Wave 3. Requires all cats to focus fire. Takes 5 lives if it reaches the Tuna Can.

### C. The Map (The Path)

- **Background:** A single full-screen image of wooden floorboards with scattered toys, drawn in the pixel art style. The background is purely decorative -- it does not define the path or placement zones.
- **Path Visualization:** A semi-transparent brown line is drawn on top of the background, clearly showing the winding enemy route from the Door (top-left) to the Tuna Can (bottom-right). This ensures the path is always visible regardless of the background art.
- **Tower Slots:** Round fluffy cushion images placed at specific positions alongside the path. **Hidden by default** -- they only appear when the player selects a cat type to build, then fade away when placement is cancelled. This keeps the map clean and uncluttered during gameplay. Towers can ONLY be placed on these cushion slots.
- **Obstacles:** 3-4 Cardboard Boxes placed on blocked cells near strategic path corners. Destroying them reveals new tower placement positions.
- **Spawn Point:** An open door image at the top-left corner.
- **Defense Target:** The "Golden Tuna Can" image at the bottom-right corner, clearly visible as the thing being defended.

## 4. Assets Requirements (For Generation)

**Style Anchor:** "Cute pixel art, bright colors, top-down perspective for map, side/front view for characters. All assets should be soft and rounded — avoid sharp corners, use smooth curves and chubby shapes for a more Q (cute) and cartoonish feel."

**IMPORTANT:** Each tower type MUST have its own dedicated projectile image. Projectiles must be visually distinct from each other in shape and color. Tower slot cushions need their own image asset. Obstacles need their own image assets.

| Type      | Key             | Description                              | Params              |
| --------- | --------------- | ---------------------------------------- | ------------------- |
| background| living_room_bg  | Wooden floor with rugs and toys (full map background) | resolution: "1536*1024" |
| image     | tower_slot      | A round fluffy cushion (empty tower placement indicator) | - |
| image     | defense_target  | A golden can of tuna (The Goal, the object being defended) | - |
| image     | spawn_door      | An open door (The Spawn Point)            | - |
| image     | obstacle_box    | A cardboard box (destructible, 5 clicks to break) | - |
| image     | obstacle_shoe   | A pile of shoes (destructible, 5 clicks to break) | - |
| image     | cat_tabby       | Orange tabby cat spitting, cheeks puffed  | - |
| image     | cat_siamese     | Siamese cat aiming with squinting eyes    | - |
| image     | cat_fat         | Fat orange cat holding a bun, lying down  | - |
| image     | cat_calico      | Calico cat with boba straw, drinking      | - |
| image     | proj_mung       | Small round green mung bean (Tabby projectile) | - |
| image     | proj_bone       | Elongated white fish bone (Siamese projectile) | - |
| image     | proj_bun        | Round brown-red bean bun (Chonky projectile) | - |
| image     | proj_boba       | Round black tapioca pearl (Boba projectile) | - |
| image     | enemy_cucumber  | Walking green cucumber, small and fast    | - |
| image     | enemy_dust      | Grey dust ball with eyes, tiny            | - |
| image     | enemy_vacuum    | Round robot vacuum cleaner with red light, large | - |
| image     | enemy_mailman   | Giant mailman figure, huge sprite         | - |
| ui_image  | icon_kibble     | Icon for currency (cat food bowl)         | - |
| audio     | sfx_tower_place | Soft "plop" sound (cat placed on cushion) | - |
| audio     | sfx_tower_sell  | Quick "whoosh" sound (cat removed/sold)   | - |
| audio     | sfx_tower_upgrade | Sparkle/chime sound (cat upgraded)      | - |
| audio     | sfx_spit        | Cute "Pfft" sound (cat firing)            | - |
| audio     | sfx_bonk        | Hit sound (projectile impact)             | - |
| audio     | sfx_break       | Cracking/breaking sound (obstacle destroyed) | - |
| audio     | sfx_combo       | Exciting chime (combo kill)               | - |
| audio     | sfx_wave_clear  | Triumphant jingle (wave completed)        | - |
| audio     | sfx_enemy_death | Soft pop (enemy killed)                   | - |
| audio     | bgm_playful     | Funny, bouncy 8-bit music                 | - |

## 5. Technical Constraints (Tower Defense Module)

- **Path System:** Must use a defined array of waypoints for enemies to follow. Path is visualized with a semi-transparent line overlay on the background.
- **Tower Placement:** Click-to-place on grid cells marked as BUILDABLE. Visual cushion images appear only during placement mode (when a cat is selected). No dashed border markers needed -- the cushions provide clear placement guidance.
- **Projectiles:** Each tower type has a unique projectile image. Splash projectiles (Chonky) use distance-based damage falloff. Slow projectiles (Boba) apply a timed speed debuff with blue tint.
- **Obstacles:** Cardboard boxes and shoe piles are destructible. 5 clicks to destroy, 15 Kibble reward each. Destroyed obstacles convert their cell to BUILDABLE.
- **Combo System:** Killing 2+ enemies within 2 seconds triggers combo bonuses (2 Kibble per combo level). Displayed as "COMBO xN!" in the UI.
- **Waves:** Define 3 waves in gameConfig.json.
  - Wave 1: Cucumbers only (5 enemies, 1200ms interval). Reward: 20 Kibble.
  - Wave 2: Dust Bunnies (8) + Vacuums (2), 800ms interval. Reward: 30 Kibble.
  - Wave 3: Cucumbers (4) + Dust Bunnies (6) + Boss Mailman (1). Reward: 100 Kibble.
- **Targeting Logic:** Towers auto-target the "Front-most enemy within range" (first targeting mode). Projectiles use target prediction (lead shots) for better accuracy against fast enemies.
- **Tower Interaction:** Clicking a placed cat shows upgrade/sell options. Hovering shows the range circle in the cat's signature color.
- **Visual Feedback:** Tower fire animation (scale pulse), projectile hit effect (scale+fade), floating reward text (+Kibble), combo display, wave bonus display.
- **UI:** Display "KIBBLE: [Amount]", "SANITY: [X]", and "WAVE: [X]/3" at the top with themed color-coded panels (gold for Kibble, red for Sanity, blue for Wave). Tower selection panel at the bottom with warm wooden-themed buttons showing cat names and costs -- buttons should feel like part of the game world, not generic gray boxes. Selected cat button highlights in blue with a yellow border. Wave countdown timer between waves. "CATS:" label on the tower panel. Controls hint: "Click cat > Click map | Click placed cat: Upgrade/Sell | Space: Next wave | ESC: Pause".
- **Resolution:** 1152*768 (template standard, do not change).
- **Win Condition:** Survive all 3 waves with > 0 Sanity (lives).
- **Lose Condition:** Sanity reaches 0 (10 enemies leak).
  `,
};

export const pikachuTestCase = {
  id: 'pikachu-grid-logic',
  name: 'pikachu',
  prompt: `
# Create "Pikachu's Electric Puzzle Lab"

I want to create a hardcore turn-based grid puzzle game featuring Pikachu. Professor Oak has built a series of experimental puzzle rooms to test Pikachu's electric abilities. Each room combines ice physics, portal teleportation, elemental conduction, and turret timing puzzles. Pikachu must use Sparkle Zap strategically -- electrifying water puddles for AOE damage, powering up mechanical generators to open doors, sliding across ice to reach otherwise inaccessible areas, and timing movement through turret firing lines -- to reach the Exit Switch and clear each room.

---

## 1. Game Concept and Theme

- **Genre:** Grid-Based Puzzle with elemental interaction (step mode)
- **Sub-Type:** Puzzle (step mode -- each direction key press = one full game turn)
- **Visual Style:** Clean laboratory aesthetic. Polished metal floors, glowing neon accents, soft blue and white color palette with electric yellow highlights. Think "Pokemon research lab meets Portal test chambers."
- **Lighting:** Cool fluorescent lighting with warm electric-yellow glows around active elements.
- **Vibe:** Cerebral, satisfying, "just one more try." Challenging but fair -- every death teaches something.
- **Perspective:** Top-down orthographic grid view.
- **Core Objective:** Reach the Exit Switch cell in each room. Some rooms require activating generators (powering doors open) or eliminating all Voltorb enemies before the exit becomes accessible.

---

## 2. Gameplay Mechanics

### The Turn Loop

Each player input (direction key or Spacebar) triggers one full turn, which resolves in this exact order:

1. **Player Action:** Pikachu moves, pushes a crate, uses Sparkle Zap, or slides on ice.
2. **World Reaction:** Terrain effects resolve (portal teleportation, item pickup, puddle damage check).
3. **Enemy Actions:** Turrets fire if it's their firing turn. Voltorbs take one step.
4. **Evaluate:** Win and lose conditions are checked after all actions resolve.

### A. Movement and Grid

- **Grid:** A code-defined rectangular grid (10x10). Movement is discrete -- one cell per turn. No physics engine. No continuous movement.
- **Cell Size:** 64px. Grid is centered on screen. Grid lines are rendered by code on top of the background image. No tilemap. No tileset.
- **Animation:** Smooth tween between cells (200ms). Input is locked during all animations automatically.
- **Undo:** Every player action can be undone with the Z key. Undo restores the full board state: entity positions, cell types, AND custom game state (Pikachu HP, Sparkle Zap cooldown counter, generator activation states, turret turn counters, destroyed entity revival). Move count and turn number are also decremented.

### B. Cell Types and Terrain

The grid is defined as a 2D array of cell type values:

| Cell Name | Symbol | CellType | Meaning |
|-----------|--------|----------|---------|
| Metal Floor (walkable ground) | \`_\` | FLOOR (2) | Standard walkable surface |
| Lab Wall | \`#\` | WALL (1) | Impassable barrier. Blocks movement, pushes, projectiles, and sliding |
| Water Puddle | \`!\` | HAZARD (4) | Impassable water. Can be electrified by Sparkle Zap for AOE damage. Becomes FLOOR when a crate is pushed in |
| Generator (mechanical switch) | \`*\` | SPECIAL (6) | Walkable. When hit by Sparkle Zap, activates: opens a linked door (a specific WALL cell becomes FLOOR). Visual: glows yellow when activated |
| Exit Switch | \`G\` | GOAL (3) | Win condition cell. May be blocked behind a door that requires generator activation |
| Pikachu Spawn | \`S\` | SPAWN (5) | Pikachu's starting position (treated as FLOOR after placement) |
| Ice Panel | \`~\` | ICE (7) | Slippery surface. Pikachu and pushed crates slide continuously in the movement direction until hitting a wall, entity, or non-ICE cell |
| Portal Pad | \`O\` | PORTAL (8) | Teleportation pad. Comes in pairs (same color). Stepping onto one instantly teleports to the paired pad |

**Water Puddle Conduction:** When Sparkle Zap hits a Water Puddle cell, electricity conducts through all connected water. If multiple HAZARD (water) cells are adjacent to each other (forming a pool), the electricity spreads through the entire connected body of water (flood-fill). All entities standing on or adjacent to (Manhattan distance 1) any cell in the connected pool take 1 damage. The puddle cells are NOT destroyed -- they remain as HAZARD. This is the primary way to defeat Voltorbs that are standing in or near water. Larger pools conduct further, rewarding players who observe terrain shapes.

**Crate-into-Puddle Conversion:** When a crate is pushed into a Water Puddle cell, the crate sinks and the cell permanently becomes FLOOR. The crate entity is removed. This creates new walkable paths but removes the puddle's conduction potential -- a key strategic tradeoff.

**Generator Activation:** When Sparkle Zap hits a Generator (SPECIAL) cell, the generator activates permanently. A specific WALL cell linked to that generator becomes FLOOR (the "door opens"). Each generator has exactly one linked door. The generator sprite changes to a glowing state. Generators cannot be deactivated.

### C. Ice Sliding

When Pikachu moves onto an ICE cell, Pikachu continues sliding in the same direction until one of these conditions is met:
- The next cell is a WALL or out of bounds
- The next cell contains a non-walkable entity (crate, Voltorb)
- The next cell is any type other than ICE (FLOOR, HAZARD, PORTAL, etc. all stop sliding)

Pikachu interacts with each cell passed through during a slide:
- Sliding onto a PORTAL cell mid-slide: Pikachu teleports to the paired portal, then continues sliding in the same direction from the destination
- Sliding onto a HAZARD cell: not possible (HAZARD is impassable, so sliding stops before it)

Crates pushed onto ICE also slide until stopped by the same rules.

Animation: Each slide step is a fast tween (80ms per cell) to convey momentum. A subtle trail effect follows Pikachu during slides.

### D. Portal Teleportation

Portal pads come in color-coded pairs (e.g., Blue Portal A and Blue Portal B). When Pikachu steps onto a portal pad, Pikachu instantly appears at the paired pad's location. Teleportation does NOT consume an extra turn -- it happens as part of the movement step.

One-way rule: After teleporting, Pikachu does NOT re-teleport from the destination pad (prevents infinite loops). The destination pad becomes inert for that step.

Portals are walkable entities placed on PORTAL cells. They have a visual glow matching their pair color.

### E. Entity Types

**Pikachu (Player)**
- HP: 3 Hearts. Displayed as heart icons in the HUD.
- Faces the direction of the last move (used for Sparkle Zap targeting).
- When damaged: shake animation + brief red tint + HUD heart icons update.
- When HP reaches 0: game over.

**Metal Crate (Pushable Object)**
- Pikachu can push crates by moving into them. The crate moves one cell in the same direction.
- One push = one cell. Standard Sokoban rule.
- Cannot push a crate into a wall, another crate, or an enemy.
- If pushed onto ICE: the crate slides until stopped (same ice rules as Pikachu).
- If pushed into a Water Puddle: the crate sinks (removed from board), the puddle becomes FLOOR permanently.
- Crates block turret projectiles (can be used as shields).
- Feedback: metallic clank sound and bounce animation on crate after push.

**Voltorb (Enemy -- Explosive Hazard)**
- HP: 1. Stationary by default. Does NOT chase Pikachu.
- Voltorbs are placed in strategic positions -- often near water puddles or in narrow corridors.
- If Pikachu bumps into a Voltorb (moves into its cell), Voltorb explodes: Voltorb is destroyed AND Pikachu takes 1 damage. Mutual destruction.
- Voltorbs can be safely eliminated via water conduction (Sparkle Zap a puddle adjacent to the Voltorb) or direct Sparkle Zap hit.
- When defeated: explosion animation (flash + expand + fade), removed from board.

**Turret (Turn-Based Auto-Fire)**
- Not a traditional enemy -- a mechanical hazard. Fires a laser beam in a fixed direction every 3 turns.
- Each turret has an initial delay (turns before first fire). Different turrets can have different initial delays, creating staggered firing patterns (e.g., Turret A fires on turns 3,6,9... while Turret B fires on turns 1,4,7...). This enables timing puzzles where the player must find safe windows between alternating turret volleys.
- The turret has a visible direction indicator (arrow or barrel pointing in its firing direction).
- On its firing turn: a laser beam travels instantly along the entire row/column in the firing direction, damaging the first entity hit (Pikachu or Voltorb) for 1 damage. The beam stops at walls and crates.
- Turrets are indestructible and immovable. They are NOT walkable.
- A turn counter is displayed near each turret showing turns until next fire (e.g., "2", "1", "FIRE!").
- Players must count turns and time their movement to cross turret firing lines safely.

### F. Sparkle Zap (Spacebar -- Special Ability)

- Pikachu fires an electric bolt in the direction Pikachu is currently facing.
- Range: 3 cells in front of Pikachu. Stops at the first wall or entity hit.
- **Context-sensitive effects based on what it hits:**
  - **Hits a Voltorb:** Deals 1 damage (destroys it). Standard ranged attack.
  - **Hits a Water Puddle (HAZARD cell):** Electricity conducts through the water. All entities on or adjacent to the puddle take 1 damage (AOE). The puddle remains.
  - **Hits a Generator (SPECIAL cell):** Activates the generator. The linked door (WALL cell) permanently becomes FLOOR.
  - **Hits a Crate:** Blocked. No effect. The bolt stops.
  - **Hits a Wall:** Blocked. No effect.
  - **Hits a Turret:** Blocked. Turrets are immune to damage.
- Cooldown: 2 turns after use. Cannot use again until cooldown expires. If on cooldown, the ability does nothing and no turn is consumed. A "Recharging!" floating text appears briefly.
- Cooldown display: HUD status line shows "Zap: READY" or "Zap: Xturns".
- Feedback: yellow electric bolt VFX along the path. Bounce animation on Pikachu. Sparkle sound.

### G. Stats and HUD

- **HP (Hearts):** 3 max HP. Displayed as heart icons in the HUD. Updates after any damage.
- **Sparkle Zap Cooldown:** Displayed in the HUD status line as "Zap: READY" or "Zap: Xturns".
- **Turn Counter:** Displayed in the HUD. Shows current turn number (used for turret timing).
- **UI Style:** Clean, futuristic lab panels. Blue-white color scheme with yellow electric accents.
- **Controls hint (persistent):** "Arrow keys: Move | Space: Sparkle Zap | Z: Undo | ESC: Pause"
- **Goal reminder (persistent):** "Reach the Exit Switch to clear the room"

---

## 3. Level Design

### Grid Specification

- **Size:** 10x10 grid. Three levels total.
- **Cell Size:** 64px. Grid is centered on screen (10 x 64 = 640px wide, centered in 1152\*768 viewport).
- **Background:** Single full-screen image (\`lab_bg\`) stretched to 1152\*768. Grid lines rendered by code on top. No tilemap. No tileset.
- **Map definition:** Each level uses dual-layer ASCII maps -- one layer for terrain (cell types) and one layer for entity placement. This separates terrain from entities so a crate on a FLOOR cell can be represented clearly.
- **Layering (back to front):**
  1. Background image (\`lab_bg\`) -- full screen, depth -10
  2. Grid line overlay -- subtle, semi-transparent, depth -5
  3. Cell visual sprites (ice panel images at ICE cells, portal pad images at PORTAL cells, generator images at SPECIAL cells, puddle images at HAZARD cells) -- depth -3
  4. Entity sprites (crates, Voltorbs, turrets, Pikachu) -- depth 0
  5. Turret firing line indicators (semi-transparent red lines showing turret direction) -- depth 1
  6. DOM-based HUD (UIScene) -- always on top

### Puzzle Design Principles

- Each level is a self-contained puzzle room with a clear solution path.
- **Level 1 introduces:** Ice sliding and portal teleportation. No combat. Pure movement puzzle.
- **Level 2 introduces:** Water conduction, generators, and Voltorbs. Teaches elemental interaction.
- **Level 3 combines:** All mechanics -- ice, portals, water conduction, generators, turrets with staggered timing, and Voltorbs. The full challenge.
- Ice patches force committed movement -- plan before you slide.
- Portals create non-linear paths that require spatial reasoning.
- Water conduction rewards creative use of Sparkle Zap (AOE to hit enemies you can't reach directly).
- Generator puzzles require reaching specific cells to open doors blocking the exit.
- Turret timing requires counting turns and choosing safe windows to cross.
- Crates serve dual purpose: fill puddles to create paths OR leave puddles intact for conduction attacks. This is the core strategic tradeoff.

### Level Progression

- **Level 1 (Ice & Portals):** A room with ice panels forming a sliding maze and one pair of portals. Pikachu must slide across ice and use portals to reach the Exit Switch on the opposite side. One crate blocks a key path and must be pushed onto ice to slide it out of the way. No enemies, no turrets. Teaches ice sliding and portal mechanics.
- **Level 2 (Water & Generators):** A room focused on elemental interaction. Two Voltorbs guard the path near a connected pool of water puddles (use conduction to eliminate them with a single Sparkle Zap via flood-fill AOE). One generator must be activated to open the door blocking the Exit Switch. One crate available for puddle bridging. No ice, no turrets. Teaches water conduction and generator mechanics.
- **Level 3 (Full Lab):** A room with all mechanics combined. Voltorbs near water, a generator behind ice, two turrets with staggered initial delays firing across corridors Pikachu must cross. Ice panels and one portal pair create alternate routes. Two crates available -- one for puddle bridging, one for turret shielding. Requires combining all mechanics to solve.

---

## 4. Visual Feedback

### Animation Rules

- **Move:** Smooth tween between cells (200ms).
- **Ice Slide:** Fast tween per cell (80ms). Subtle motion blur or trail effect.
- **Portal Teleport:** Brief fade-out at source, fade-in at destination (150ms total).
- **Push:** Metallic clank. Bounce animation on crate after push.
- **Sparkle Zap (standard):** Yellow electric bolt VFX along the path to target. Bounce on Pikachu.
- **Sparkle Zap (water conduction):** Electric bolt hits puddle, then electric ripple VFX expands outward from the puddle to adjacent cells. All affected entities shake.
- **Sparkle Zap (generator):** Electric bolt hits generator, generator sprite changes to glowing yellow state. Linked door WALL cell plays a brief "opening" animation (scale pulse) then disappears.
- **Turret Fire:** Red laser beam VFX flashes along the firing line (200ms). Screen shake if Pikachu is hit.
- **Voltorb Death:** Explosion flash (white expand + fade). Removed from board.
- **Damage Taken:** Shake animation on Pikachu. Brief red tint. HUD hearts update.
- **Crate Sink:** Crate scales down into the puddle cell and disappears. Splash VFX.

---

## 5. Win and Lose Conditions

### Win

- Pikachu steps onto the Exit Switch (GOAL) cell. In Level 2, the door blocking the Exit Switch must be opened first (generator activated).
- Victory screen: "Room Cleared!" with electric celebration VFX. Option to continue to next level or restart.

### Lose

- Pikachu's HP reaches 0.
- Game over screen: "Experiment Failed..." with a gentle tone. Option to restart the current level.

---

## 6. Onboarding and Controls

### Tutorial Hints (Level 1 only)

- Brief on-screen hints at level start: "Slide on ice panels -- you won't stop until you hit something! Step on portals to teleport. Reach the Exit Switch."
- Hints fade after 5 seconds or on the first player input.

### Control Hint (Persistent)

- Displayed at the bottom of the screen via the HUD: "Arrow keys: Move | Space: Sparkle Zap | Z: Undo | ESC: Pause"

### Goal Reminder

- Displayed at the top of the HUD: "Reach the Exit Switch to clear the room"

---

## 7. Asset Requirements

**Style Anchor:** "Clean laboratory aesthetic, polished metal and glass surfaces, neon blue-white lighting with electric yellow accents. Top-down orthographic view. Futuristic but friendly -- Pokemon research lab meets Portal test chambers."

| type | key | description | params |
|------|-----|-------------|--------|
| background | lab_bg | Top-down view of a polished metal laboratory floor with subtle grid patterns, blue-white neon strip lighting along edges, clean and futuristic. Full scene environment view. | resolution: "1536*1024" |
| image | pikachu | Round, chubby Pikachu from top-down view, determined expression, yellow fur, red cheeks. Clear silhouette on lab floor. Centered on canvas. | |
| image | crate_metal | Brushed steel crate with yellow hazard stripes, top-down view, slightly smaller than a grid cell. | |
| image | voltorb | Red and white Voltorb (Pokeball-like sphere) from top-down view, angry expression. Clear silhouette. | |
| image | turret | Mechanical turret device on a base plate, top-down view, with a visible barrel pointing in one direction. Metallic grey with red warning light. | |
| image | portal_blue | Glowing blue circular portal pad on the floor, top-down view. Soft blue energy glow. | |
| image | portal_orange | Glowing orange circular portal pad on the floor, top-down view. Soft orange energy glow. | |
| image | generator | Mechanical generator box with lightning bolt symbol, top-down view. Default state: dark/inactive. | |
| image | generator_active | Same generator box but glowing yellow with electric arcs, top-down view. Activated state. | |
| image | cell_ice | Frosted glass panel on the floor, top-down view, light blue with subtle frost patterns. Fills a grid cell. | |
| image | cell_puddle | Shallow water puddle on metal floor, top-down view, reflective blue surface. Fills a grid cell. | |
| image | cell_exit | Glowing green floor panel with "EXIT" marking, top-down view. The goal cell. | |
| image | vfx_electric | Yellow electric bolt and spark burst, top-down view. Used as floating VFX overlay for Sparkle Zap. | |
| image | vfx_ripple | Blue-white electric ripple expanding outward, top-down view. Used for water conduction AOE effect. | |
| audio | bgm_lab | Electronic ambient music with subtle beeps and hums, loopable, cerebral and focused. Think puzzle game soundtrack. | audioType: "bgm" |
| audio | sfx_move | Clean footstep on metal floor. | audioType: "sfx" |
| audio | sfx_slide | Smooth sliding sound on ice, whooshing. | audioType: "sfx" |
| audio | sfx_push | Metallic scrape and clank (crate push on metal floor). | audioType: "sfx" |
| audio | sfx_portal | Sci-fi teleport whoosh with electric crackle. | audioType: "sfx" |
| audio | sfx_zap | Electric zap sound, sharp and bright. | audioType: "sfx" |
| audio | sfx_conduction | Electric crackling spreading through water, buzzing. | audioType: "sfx" |
| audio | sfx_generator | Mechanical power-up hum with electric spark. | audioType: "sfx" |
| audio | sfx_turret | Laser beam firing sound, sharp red energy. | audioType: "sfx" |
| audio | sfx_explosion | Voltorb explosion, sharp pop with electric discharge. | audioType: "sfx" |
| audio | sfx_damage | Brief electric shock sound (Pikachu hurt). | audioType: "sfx" |
| audio | sfx_win | Triumphant electronic fanfare, satisfying completion chime. | audioType: "sfx" |
| audio | sfx_gameover | Powering-down sound, gentle electronic fade. | audioType: "sfx" |

**CRITICAL asset rules:**
- \`type: "image"\` assets: params column MUST be empty. No size, no resolution.
- \`type: "background"\` assets: use \`resolution: "1536*1024"\`.
- NO tileset assets. This game does NOT use tilemaps or tilesets. The grid is code-defined.

---

## 8. Technical Constraints

- **Grid type:** Code-defined 10x10 grid. No tilemap. No tileset. No generate_tilemap tool.
- **Movement:** Discrete grid steps only. No physics engine. No continuous movement.
- **Turn structure:** Step mode -- one direction key press = one full turn (Player Action -> World Reaction -> Enemy Actions -> Evaluate).
- **Collision:** All collision is manual grid lookup. No Phaser Arcade Physics.
- **Background:** Single \`lab_bg\` image stretched to full screen. Grid lines drawn by code on top.
- **Cell sprites:** Ice panels, puddles, portals, generators, and exit switch are image sprites placed by code at specific grid positions. They are NOT entities (except portals, which are entities with isWalkable: true) and NOT tilemaps.
- **Ice sliding:** Uses the built-in slide mechanic. Entity slides continuously in one direction until blocked. Each intermediate cell triggers interactions (portal teleport mid-slide is possible).
- **Portal teleportation:** Portals are paired entities. Teleport is instant (no animation delay beyond fade effect). One-way per step to prevent loops.
- **Elemental conduction:** Sparkle Zap hitting a HAZARD (water) cell triggers flood-fill through all connected HAZARD cells, then AOE damage to all entities on or within Manhattan distance 1 of any cell in the connected pool.
- **Generator activation:** Sparkle Zap hitting a SPECIAL (generator) cell permanently converts a linked WALL cell to FLOOR.
- **Turret firing:** Turrets fire every 3 turns during Enemy Phase. Beam travels instantly along the row/column, damages first entity hit. Blocked by walls and crates.
- **Win condition:** Pikachu is standing on the Exit Switch (GOAL) cell. In Level 2, the linked door must be opened first.
- **Lose condition:** Pikachu's HP reaches 0.
- **Undo:** Full board state undo on Z key press. Restores entity positions, cell types, AND custom state (HP, cooldown, generator states, turret counters, destroyed entities). Move count and turn number are also decremented.
- **Resolution:** 1152*768 (template standard, do not change).
  `,
};

export const defaultTestCase = gameTestCase;

export const allTestCases = {
  default: defaultTestCase,
  game: gameTestCase,
  marvel: marvelTestCase,
  kombat: kombatTestCase,
  starWars: starWarsTestCase,
  harryPotter: harryPotterTestCase,
  squidGame: squidTestCase,
  hajimi: hajimiTestCase,
  pikachu: pikachuTestCase,
  'harry-potter-education': harryPotterTestCase,
  'metal-slug-shooter': gameTestCase,
  'marvel-action-platformer': marvelTestCase,
  'kombat-education': kombatTestCase,
  'star-wars-top-down': starWarsTestCase,
  'squid-game': squidTestCase,
  'hajimi-tower_defense': hajimiTestCase,
  'pikachu-grid-logic': pikachuTestCase,
};
