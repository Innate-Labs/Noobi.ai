# OpenGame overview

> Learn about OpenGame, an open-source agentic framework that lives in your terminal and turns natural-language game-design prompts into fully playable web games.

## Get started in 30 seconds

Prerequisites:

- An OpenAI-compatible API key (or a local deployment of GameCoder-27B)
- [Node.js 20+](https://nodejs.org/en/download). You can run `node -v` to check the version.

### Install OpenGame (from source)

```bash
git clone https://github.com/leigest519/OpenGame.git
cd OpenGame
npm install
npm run build
npm link
```

This exposes the `opengame` command on your `PATH`.

### Start using OpenGame

```bash
mkdir my-game && cd my-game
opengame
```

Then describe the game you want, for example:

```
Build a 2D platformer where a cat collects yarn balls while avoiding dogs.
```

OpenGame will scaffold the project, write the code, run the game in a sandbox, and iteratively debug it until it is playable. When done, open the generated `index.html` (or run the printed dev-server command) in your browser to play.

[Continue with Quickstart (5 mins) →](./quickstart)

> [!tip]
>
> See [troubleshooting](./support/troubleshooting) if you hit issues.

## What OpenGame does for you

- **Prompt → playable game**: describe a game in plain language; OpenGame plans the architecture, picks an appropriate template (canvas, Phaser, three.js, etc.), writes the code, and tests it.
- **Game Skill**: a reusable agent capability composed of _Template Skill_ (stable scaffolding) and _Debug Skill_ (systematic resolution of integration and runtime errors), so the agent ships working games rather than plausible-looking code.
- **Iterate naturally**: ask OpenGame to add a power-up, change the art style, tune difficulty, or fix a bug — it edits files, re-runs the game, and verifies the change.
- **Headless / scriptable**: run `opengame -p "..."` for CI, batch generation, and benchmark runs.

## Why developers love OpenGame

- **Works in your terminal**: meets you where you already work, with the tools you already use.
- **Takes action**: OpenGame can directly edit files, run commands, install dependencies, and launch the game in a sandboxed browser to verify it actually works.
- **Open and composable**: framework, GameCoder-27B model, training data, and OpenGame-Bench evaluation pipeline are all open-source. You can swap in your own model via the OpenAI-compatible API.

## Inherited from upstream

OpenGame is built on top of [qwen-code](https://github.com/leigest519/OpenGame) (which itself is based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)). Many features documented in this guide — Plan Mode, SubAgents, MCP, the Skills system, IDE integrations, the TypeScript SDK — come from that lineage and continue to work in OpenGame.
