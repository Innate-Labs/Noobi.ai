# Noobi.ai

Noobi.ai 是基于 OpenGame 源码能力构建的桌面版 AI 游戏制作工作台。它保留原项目的 Agent 循环、Function Call、GDD、模板、素材、Tilemap、Memory、会话恢复与构建验证能力，并增加：

- Electron 桌面工作台与中文游戏制作提示词。
- 项目、制作阶段、工具调用、文件和游戏预览的可视化管理。
- Skills 与 MCP 管理：浏览经过来源/许可证审阅的游戏制作精选库，或从本地、GitHub 安装用户级/项目级 Skill（支持仓库子目录、分支与 Tag）；配置 STDIO、Streamable HTTP 与 SSE Server。
- DeepSeek / OpenAI Compatible 主模型，以及独立 reasoning、image、video、audio Provider 配置。
- API Key 系统安全存储；密钥不会进入 renderer、项目文件或日志。
- 每个回合独立 Agent 进程，支持停止、崩溃隔离和显式 session 恢复。
- 针对大工具结果的 IPC 截断，避免超长会话 structured clone 导致内存耗尽。

## 启动桌面版

```bash
git clone https://github.com/Innate-Labs/Noobi.ai.git
cd Noobi.ai
npm install
npm run bundle
npm run desktop
```

仅构建桌面界面：

```bash
npm run desktop:build
```

生成可安装的 macOS DMG（在 Apple Silicon 机器上生成 arm64 版本）：

```bash
npm run desktop:package
```

该命令会自动构建 Agent Runtime、桌面界面和运行时依赖，完成 Runtime 冒烟测试，随后生成并挂载检查 DMG。安装包位于 `packages/desktop/release/Noobi.ai-0.2.2-arm64.dmg`。双击 DMG 后，将 `Noobi.ai` 拖入 `Applications` 即可安装。

本地构建没有 Apple Developer ID 时不会获得 Apple 公证。首次打开可在 Finder 中按住 Control 点击应用并选择“打开”，或前往“系统设置 → 隐私与安全性”确认打开。面向其他用户无警告分发时，需要配置 `CSC_LINK`、`CSC_KEY_PASSWORD` 与 Apple 公证凭据，然后运行：

```bash
npm run desktop:package:signed
```

仅生成未封装 `.app` 用于本机调试：

```bash
npm run desktop:package:app
```

详细架构见 [`docs/gameagent/ARCHITECTURE.md`](docs/gameagent/ARCHITECTURE.md)，桌面使用说明见 [`docs/gameagent/DESKTOP_GUIDE.md`](docs/gameagent/DESKTOP_GUIDE.md)。
API 配置与当前推荐模型见 [`docs/gameagent/API_CONFIGURATION.md`](docs/gameagent/API_CONFIGURATION.md)。

### DeepSeek Harness 与卡死恢复

桌面版会监控 Agent Runtime 的模型与工具输出：连续 90 秒无输出时显示等待提示，连续 4 分钟无输出时停止本轮并保留项目文件与 session ID，可从原会话继续。单次模型请求默认限制为 3 分钟、最多重试 1 次，避免网络异常叠加成十几分钟的假死。

可在启动桌面版前通过以下环境变量覆盖默认值：

```bash
GAMEAGENT_AGENT_IDLE_TIMEOUT_MS=360000 npm run desktop
```

> 本项目保留 OpenGame 与其上游 qwen-code 的 Apache-2.0 许可证和版权声明。以下为上游项目原始说明。

---

<div align="center">

# OpenGame: Open Agentic Coding for Games

Yilei Jiang, Jinyuan Hu, Qianyin Xiao, Yaozhi Zheng, Ruize Ma, Kaituo Feng,<br>
Jiaming Han, Tianshuo Peng, Kaixuan Fan, Manyuan Zhang, Xiangyu Yue\*

_CUHK MMLab_<br>
`yljiang@link.cuhk.edu.hk`, `xyyue@ie.cuhk.edu.hk`<br>
_\*Corresponding author_

<br>

[![Project Page](https://img.shields.io/badge/Project-Page-blue.svg)](https://www.opengame-project-page.com/)
[![arXiv](https://img.shields.io/badge/arXiv-b31b1b.svg)](https://arxiv.org/abs/2604.18394)
[![Hugging Face Paper](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Paper-yellow)](https://huggingface.co/papers/2604.18394)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

**An open-source agentic framework for end-to-end web game creation from a prompt.**

</div>

<div align="center">
  <img src="assets/opengame_teaser.png" alt="OpenGame Teaser" width="100%">
</div>

## Abstract

> Game development sits at the intersection of creative design and intricate software engineering, demanding the joint orchestration of game engines, real-time loops, and tightly coupled state across many files. While Large Language Models (LLMs) and code agents now solve isolated programming tasks with ease, they consistently stumble when asked to produce a fully playable game from a high-level design, collapsing under cross-file inconsistencies, broken scene wiring, and logical incoherence. We bridge this gap with **OpenGame**, the first open-source agentic framework explicitly designed for end-to-end web game creation. At its core lies **Game Skill**, a reusable, evolving capability composed of a _Template Skill_ that grows a library of project skeletons from experience and a _Debug Skill_ that maintains a living protocol of verified fixes—together enabling the agent to scaffold stable architectures and systematically repair integration errors rather than patch isolated syntax bugs. Powering this framework is **GameCoder-27B**, a code LLM specialized for game engine mastery through a three-stage pipeline of continual pre-training, supervised fine-tuning, and execution-grounded reinforcement learning. Since verifying interactive playability is fundamentally harder than checking static code, we further introduce **OpenGame-Bench**, an evaluation pipeline that scores agentic game generation along Build Health, Visual Usability, and Intent Alignment via headless browser execution and VLM judging. Across 150 diverse game prompts, OpenGame establishes a new state-of-the-art. We hope OpenGame pushes code agents beyond discrete software engineering problems and toward building complex, interactive real-world applications.

## 📢 News

- **[2026-04-21]** 🚀 We have officially released the **OpenGame** framework! You can now access our [Project Page](https://www.opengame-project-page.com/), read the [arXiv Paper](https://arxiv.org/abs/2604.18394), and start generating your own web games end-to-end.

## Playable Demos

A curated gallery of web games generated end-to-end by OpenGame from a single prompt. Hover any tile to preview the gameplay; click through for the live build or the full source archive used by the agent.

<table align="center" width="100%">
  <tr>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">Marvel Avengers: Infinity Strike</font></b></p>
      <video src="https://github.com/user-attachments/assets/5c8d1ef9-48cb-4916-abd2-fc201e478306"
             poster="assets/posters/marvel.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Build an epic side-scrolling action platformer starring the Avengers. I want to select between Iron Man (lasers & flight), Thor (hammer melee & lightning), or Hulk (smash attacks) to fight through 3 distinct levels: a ruined City, a SHIELD Helicarrier, and finally Titan. Each hero needs a basic attack, a special skill, and a screen-clearing Ultimate move. The final boss must be Thanos using Infinity Stone powers. The art style should be hardcore 90s Capcom arcade pixel art, not cute/chibi."</i></p>
        <p><b>Intro:</b> Choose your superhero. Clear stages with epic beatdowns and crush the mastermind.<br/>选择你的超级英雄，清除关卡并击败Boss。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_platformer_marvel.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">Harry Potter: Arithmancy Academy</font></b></p>
      <video src="https://github.com/user-attachments/assets/d70015c5-e2f2-4c5d-b842-8d97f95cd765"
             poster="assets/posters/harryPotter.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Create a turn-based card battle game set in a pixel art Hogwarts. I want to play as a wizard student dueling a rival in the Dueling Club. The twist is that magic requires knowledge: to cast spell cards like 'Expelliarmus' or 'Stupefy', I must answer trivia questions (Math/Science) correctly. Include a 'Magic Resonance' combo system where getting consecutive right answers boosts my spell damage. The style should be atmospheric Gothic fantasy pixel art with parchment-style UI and magical particle effects."</i></p>
        <p><b>Intro:</b> Cast spell cards by answering trivia correctly. Chain combos for bonus damage.<br/>正确答题释放魔法卡牌，连续答对触发魔力共振连击。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_uiHeavy_harryPotter.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">K.O.F: Celestial Showdown</font></b></p>
      <video src="https://github.com/user-attachments/assets/35fb22d9-2378-416d-8656-ef3c965a2d36"
             poster="assets/posters/kombat.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Make a local 2-player quiz fighting game that looks and feels like a classic 90s SNK retro arcade fighter (like The King of Fighters). Instead of punching, players fight by racing to hit a 'Buzzer Key' to answer physics questions. If you answer fast and correctly, you deal damage; if you're wrong, you take self-damage. The setting is a grand fighting tournament stage located in a majestic 'Heavenly Court' (Chinese celestial realm), complete with ancient jade gates, floating auspicious clouds, and golden traditional motifs. Include dramatic health bars, screen shake on hits, and a 'K.O.' sequence. Visuals should be highly detailed 16-bit pixel art, typical of 90s arcade cabinets."</i></p>
        <p><b>Intro:</b> Two players race to buzz in and answer physics questions. Right answers deal damage; wrong answers backfire.<br/>双人抢答物理题，答对造成伤害，答错反噬自身。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_uiHeavy_kombat.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">Hajimi Defense: The Tuna Crisis</font></b></p>
      <video src="https://github.com/user-attachments/assets/06287b6f-4da0-49a5-8cf7-ef5de4bc45e3"
             poster="assets/posters/hajimi.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Make a hilarious tower defense game called 'Hajimi Defense' where cute cats defend a 'Golden Tuna Can' from an invasion of household pests (Cucumbers and Vacuums). The towers should be funny cat memes: a spitting Tabby, a sniper Siamese, and a fat orange cat that throws buns for AOE damage. Include a mechanic where players can click to break obstacles (like boxes) to free up building space. The art style should be hand-drawn, pastel, and super cute (Kawaii)."</i></p>
        <p><b>Intro:</b> Deploy cat towers to defend the Golden Tuna Can from waves of household invaders.<br/>部署猫猫炮塔，保卫金枪鱼罐头抵御入侵者。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_towerDefense_hajimi.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">StarWars: Mandalorian Protocol</font></b></p>
      <video src="https://github.com/user-attachments/assets/3dd63ca5-447c-45fc-b06b-a6dbec0a6b16"
             poster="assets/posters/starWars.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Create a high-intensity top-down action RPG shooter set in the Star Wars universe. Play as The Mandalorian fighting through an Imperial Base to rescue Grogu. The gameplay should be a Twin-Stick Shooter style where I can use a Blaster (ranged), a Beskar Spear (melee), and a Jetpack Dash to dodge. Include Stormtrooper enemies and a tactical depth system where characters can walk behind crates and walls. The visuals should be metallic sci-fi pixel art."</i></p>
        <p><b>Intro:</b> Fight through the Imperial Base as the Mandalorian. Shoot, slash, and dash to rescue Grogu.<br/>扮演曼达洛人突入帝国基地，射击、喷射闪避，营救古古。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_topDown_starWars.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
    <td align="center" valign="top" width="50%">
      <p align="center"><b><font size="4">Squid Game: Red Light, Green Light</font></b></p>
      <video src="https://github.com/user-attachments/assets/a9f51ac6-56b2-4bab-95dd-27e39ca612f5"
             poster="assets/posters/squidGame.png"
             width="100%" loop muted autoplay playsinline preload="metadata">
      </video>
      <div align="left" style="padding: 0 15px;">
        <p><b>Prompt:</b> <i>"Recreate the intense 'Red Light, Green Light' scene from Squid Game as a survival reflex game. The player controls a character in a green tracksuit running across a sandy field towards a finish line. There is a Giant Robot Doll on the right; when she sings, we run; when she turns her head, we must stop instantly or get shot. Crucial visual detail: Dead bodies and blood pools should NOT disappear, they must pile up on the field to create a chaotic atmosphere. Use a gritty, realistic 16-bit pixel art style."</i></p>
        <p><b>Intro:</b> Run when she sings, freeze when she turns. One wrong move and you're eliminated.<br/>她唱歌时跑，她转头时定住。一步走错，当场淘汰。</p>
      </div>
      <p align="center">
        <a href="https://www.opengame-project-page.com/#demo"><b>▶&nbsp;&nbsp;Live Demo</b></a>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="https://github.com/leigest519/OpenGame/raw/main/assets/downloads/demo_topDown_squidGame.zip"><b>↓&nbsp;&nbsp;Source</b></a>
      </p>
      <br/>
    </td>
  </tr>
</table>

**To run a demo locally:**

```bash
unzip demo_*.zip && cd demo_*
npm install
npm run dev   # opens at http://localhost:5173
```

## Installation

#### Prerequisites

```bash
# Node.js 20+
curl -qL https://www.npmjs.com/install.sh | sh
```

#### From source (recommended while we prepare the npm release)

```bash
git clone https://github.com/leigest519/OpenGame.git
cd OpenGame
npm install
npm run build
npm link
```

This exposes the `opengame` command on your `PATH`.

## Quick Start

OpenGame is currently driven from the command line in **headless mode** —
you give it a one-shot prompt and it builds the game end-to-end.

```bash
# Create an empty folder for your new game
cd agent-test
mkdir -p games/my-game && cd games/my-game

# Generate the game from a single prompt
opengame -p "Build a Snake clone with WASD controls and a dark theme." --yolo
```

When the agent finishes, open the generated `index.html` (or run the printed
dev-server command) in your browser to play your game.

> If you prefer to create games anywhere on disk, set absolute paths instead:
>
> ```bash
> export GAME_TEMPLATES_DIR="/absolute/path/to/OpenGame/agent-test/templates"
> export GAME_DOCS_DIR="/absolute/path/to/OpenGame/agent-test/docs"
> ```
>
> Headless runs auto-elevate the approval mode to `auto-edit` so the agent
> can write/edit files. Shell commands stay disabled by default — pass
> `--yolo` (or `--approval-mode yolo`) if you want the agent to also run
> shell commands. See
> [`docs/users/features/headless.md`](docs/users/features/headless.md) for
> the full headless reference.

#### Authentication

OpenGame's agent runtime supports an OpenAI-compatible API. Set the following environment variables:

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"     # optional
export OPENAI_MODEL="gpt-4o"                            # optional, swap in GameCoder-27B when running it locally
```

#### Asset / GDD provider keys (image, video, audio, reasoning)

Beyond the main agent LLM, OpenGame's asset-generation tools talk to image,
video, and audio providers. You bring your own keys for each — OpenGame ships
with no defaults. Each modality is configured **independently**, so you can
mix providers (e.g. DashScope for image, Doubao for video, OpenAI for
reasoning, and ElevenLabs or MiniMax for audio):

```bash
export OPENGAME_IMAGE_PROVIDER=tongyi         # tongyi | doubao | openai-compat
export OPENGAME_IMAGE_API_KEY=sk-...
export OPENGAME_AUDIO_PROVIDER=elevenlabs     # also minimax | stability | google-lyria | mureka
export OPENGAME_AUDIO_API_KEY=your-audio-provider-key
# ...and similarly for OPENGAME_REASONING_* and OPENGAME_VIDEO_*
```

A complete env-var reference, settings.json schema, and examples for OpenAI /
fal.ai / OpenRouter / DashScope / Doubao plus professional audio providers live in
[`docs/users/configuration/api-keys.md`](docs/users/configuration/api-keys.md).
A copy-paste template is at [`.env.example`](.env.example).

OpenGame prints a one-line provider-status banner at startup so you can
confirm which modalities are wired up before the run begins.

## Game Skill

OpenGame's agent is bootstrapped with **Game Skill**, a reusable capability split into two parts:

- **Template Skill** — picks an appropriate engine/template (canvas, Phaser, three.js, etc.) and scaffolds a stable, conventional project structure so later edits stay coherent.
- **Debug Skill** — runs the game in a sandbox, catches integration errors, console errors, and broken interactions, and systematically resolves them until the game is playable end-to-end.

Together they let the agent move from "writes plausible code" to "ships a working game."

## Configuration

OpenGame can be configured via `settings.json`, environment variables, and CLI flags.

- **User settings**: `~/.qwen/settings.json`
- **Project settings**: `.qwen/settings.json`

> The on-disk settings directory is currently still named `.qwen` for backward compatibility with the upstream agent runtime. We plan to migrate this to `.opengame` in a future release.

## GameCoder-27B

`GameCoder-27B` is a Code LLM purpose-built for OpenGame. It is trained with:

1. **Supervised Fine-Tuning (SFT)** on curated game-development trajectories covering engine APIs, project scaffolding, and bug-fix workflows.
2. **Reinforcement Learning** with reward signals derived from real game playability (using OpenGame-Bench-style verifiers).

## OpenGame-Bench

`OpenGame-Bench` is a benchmark for evaluating agents that build interactive web games. Unlike static code-evaluation benchmarks, it dynamically launches generated games, drives them with scripted interactions, and verifies playability criteria (rendering, controls, game-loop progression, win/loss states, etc.).

The evaluation pipeline will be released soon.

## Acknowledgments

OpenGame builds on the excellent open-source work of:

- **[qwen-code](https://github.com/QwenLM/qwen-code)** — the agent runtime and CLI scaffolding that OpenGame extends with Game Skill, GameCoder-27B integration, and OpenGame-Bench tooling.
- **[Google Gemini CLI](https://github.com/google-gemini/gemini-cli)** — the original CLI architecture that qwen-code is itself based on.
- **[Phaser](https://github.com/phaserjs/phaser)** — the fast, free, and open-source HTML5 game framework used for game rendering and mechanics.

We thank these teams and communities for making their work openly available.
