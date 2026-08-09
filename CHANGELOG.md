# Changelog

All notable changes to OpenGame will be documented in this file.

## 0.6.0 — Initial OpenGame release

OpenGame is a fork and rebrand of [qwen-code](https://github.com/leigest519/OpenGame), specialized for end-to-end web game creation from natural-language prompts.

Highlights of this initial release:

- **OpenGame agent framework**: end-to-end pipeline that turns a high-level game design prompt into a fully playable web game.
- **Game Skill**: a reusable agent capability composed of _Template Skill_ (stable project scaffolding for canvas / Phaser / three.js / etc.) and _Debug Skill_ (systematic resolution of integration and runtime errors).
- **GameCoder-27B integration**: configurable as the underlying Code LLM, optimized via Supervised Fine-Tuning and Reinforcement Learning for game-engine mastery.
- **OpenGame-Bench hooks**: integration points for dynamically evaluating agent-built games against playability criteria.
- **Rebranded CLI**: the agent is invoked via the `opengame` command.
- **Inherited from upstream**: rich tool suite (Skills, SubAgents, Plan Mode), interactive and headless run modes, OpenAI-compatible API, IDE integrations, and the TypeScript SDK from qwen-code / Gemini CLI.

> Note: settings still live under `~/.qwen/settings.json` and `.qwen/settings.json` for backward compatibility with the upstream agent runtime. A migration to `~/.opengame/` is planned for a future release.

---

For the upstream change history that this project inherits, see the [qwen-code releases](https://github.com/leigest519/OpenGame/releases).
