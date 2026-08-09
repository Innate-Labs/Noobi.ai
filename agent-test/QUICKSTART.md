# Agent Test — Quick Start Guide

This guide helps you set up and run the Game Coding Agent test environment, covering dependency installation, core library builds, environment configuration, and integration testing.

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **API Keys**: An OpenRouter API key (or any OpenAI-compatible provider), plus DashScope API keys for reasoning and image generation models

## 1. Build Core

This project uses a monorepo structure. `agent-test` depends on `packages/core`. After any changes to tool code in `packages/core`, you **must** rebuild before testing.

From the project root directory:

```bash
# Install all dependencies
npm install

# Build the Core package (required)
npm run build --workspace=@opengame/core
```

## 2. Configuration

API keys should never be hardcoded. Create a `.env` file in the `agent-test/` directory:

```bash
cd agent-test
touch .env
```

Edit `.env` with the following:

```bash
# --- OpenRouter / LLM Provider ---
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxxxxxx

# --- Reasoning Model (used by GameTypeClassifier, GenerateGDD) ---
REASONING_MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
REASONING_MODEL_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
REASONING_MODEL_NAME=qwen-max

# --- Image Generation Model (used by GenerateAssets) ---
IMAGE_MODEL_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
IMAGE_MODEL_BASE_URL=https://dashscope-intl.aliyuncs.com
IMAGE_MODEL_NAME_GENERATION=z-image-turbo
IMAGE_MODEL_NAME_EDITING=wan2.5-i2i-preview

# --- (Optional) Custom bin directory for tools like ffmpeg ---
# CUSTOM_BIN_DIR=/path/to/your/bin
```

## 3. Running the Integration Test

The integration test launches the full Qwen-Code Agent pipeline. The agent autonomously plans, invokes tools, and writes game code based on the selected test case prompt.

```bash
cd agent-test

# Run with the default test case (MetalSlug)
npm run test

# Run a specific test case by name
npm run test -- marvel
npm run test -- squidGame
npm run test -- pikachu
```

### Available Test Cases

| Name               | Game Type     | Description                           |
| ------------------ | ------------- | ------------------------------------- |
| `game` / `default` | Platformer    | Metal Slug-style jungle shooter       |
| `marvel`           | Platformer    | Marvel Avengers arcade brawler        |
| `kombat`           | UI Heavy      | 2-player quiz battle (KoF style)      |
| `starWars`         | Top-Down      | Mandalorian twin-stick shooter        |
| `harryPotter`      | UI Heavy      | Harry Potter educational card battler |
| `squidGame`        | Top-Down      | Squid Game "Red Light, Green Light"   |
| `hajimi`           | Tower Defense | Cat tower defense game                |
| `pikachu`          | Grid Logic    | Pikachu grid puzzle game              |

**Note**: Before running the integration test, make sure you have completed the `npm run build` step in Section 1. The agent cannot use newly registered tools without a fresh build.

## 4. Development Workflow

When modifying tool code:

1. **Edit**: Modify `.ts` files in `packages/core/src/tools/`.
2. **Rebuild**: Run `npm run build --workspace=@opengame/core` from the project root.
3. **Test**: Run `npm run test` in `agent-test/` to verify the full pipeline.

## 5. Project Structure

```
agent-test/
├── scripts/
│   └── test.ts              # Test runner (SDK integration)
├── test-cases/
│   └── game-test.ts         # All game test case prompts
├── prompts/
│   ├── default.md            # Default system prompt
│   └── custom.md             # Custom system prompt template
├── docs/
│   ├── debug_protocol.md     # Debug & verification checklist
│   ├── asset_protocol.md     # Asset generation protocol
│   └── ...                   # Module-specific design docs
├── templates/
│   ├── core/                 # Base Phaser game template
│   └── modules/              # Game archetype modules
│       ├── platformer/
│       ├── top_down/
│       ├── grid_logic/
│       ├── tower_defense/
│       └── ui_heavy/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 6. Troubleshooting

**Error: 401 Unauthorized**

- Verify that `.env` exists in the `agent-test/` directory.
- Check that your API keys are valid and the base URLs match your provider's region.

**Tool not invoked by the agent**

- Ensure the tool is registered in `packages/core/src/config/config.ts`.
- Ensure you ran `npm run build` to update the compiled output.
- Check that the test case prompt is specific enough to trigger the tool.

**ffmpeg / external tool not found**

- Set `CUSTOM_BIN_DIR` in your `.env` to the directory containing the binary (e.g., a conda environment's `bin/` folder).
