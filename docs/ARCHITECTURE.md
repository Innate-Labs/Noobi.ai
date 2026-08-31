# Noobi.ai 架构

## 核心选择

- 桌面容器：Electron。
- 前端：React + TypeScript + Vite。
- Agent：官方 `@openai/codex` 原生二进制的 `codex app-server --listen stdio://`。
- 协议：省略 `jsonrpc` 字段的 JSON-RPC 2.0；stdio 上每行一条 JSON。
- 持久化：Electron `userData` 中的单一项目存储；Codex 自己持久化线程。项目记录同时持久化 `web | godot` 引擎和宿主管理的内部 FPS 目标；新项目固定为 60 FPS，旧项目缺省值回填为 Web、60 FPS，升级前已有的有效 30/60/120 FPS 值原样保留。
- 游戏输出：每个项目一个独立工作区。Web 项目生产输出为 `dist/`；Godot 4 项目生产输出为 `build/web/`；两者均由本地只读 HTTP Preview Server 展示。
- Godot：Godot 4 / GDScript、Compatibility renderer、单线程 Web export；编辑器和 Export Templates 必须精确版本匹配。

## 为什么使用 App Server

App Server 是 Codex 为富客户端提供的正式深度集成面，覆盖认证、会话历史、审批和流式 Agent 事件。Noobi.ai 是交互式桌面产品，因此使用 App Server，而不是面向 CI/自动作业的 SDK。

## 进程边界

```text
React Renderer
  │ typed IPC only
  ▼
Electron Main
  ├─ ProjectStore
  ├─ PreviewServer (Web: dist/source fallback · Godot: build/web only)
  ├─ AssetStore (PNG/JPEG/WebP · WAV/MP3/OGG · self-contained GLB)
  ├─ AssetPlanStore (宿主私有预期素材 · 生成状态 · 失败重试)
  ├─ MediaProviderStore (app-private API config · redacted IPC)
  ├─ MediaGenerationService (image/audio/3D API-first · Three.js GLB fallback · bounded ingest)
  ├─ MediaToolBroker (dynamic tools · fixed routing · procedural media)
  ├─ PromptTemplateStore
  ├─ McpConfigManager
  ├─ GodotEnvironmentService
  │    ├─ Godot 4 executable discovery / configured override
  │    ├─ exact-version Export Templates inspection
  │    └─ fixed headless import / validate / export tasks
  └─ GameHarness
       ├─ Planner (ephemeral / read-only)
       ├─ Implementer (durable / workspace-write)
       ├─ Reviewer (ephemeral / read-only)
       └─ CodexRuntime
            └─ codex app-server --listen stdio:// --strict-config
            ├─ stdin: requests / notifications / approval responses
            ├─ stdout: responses / notifications / server requests
            └─ stderr: sanitized runtime diagnostics
```

Renderer 永远不直接获得 shell、任意文件系统或 child process 能力。

## 双引擎工作区

引擎是项目记录的一部分，而不是由 Agent 自行猜测。`CreateProjectInput.engine` 只接受 `web | godot`，默认值为 `web`，因此旧项目不会因升级而改变运行时。

| 契约 | Web | Godot 4 |
| --- | --- | --- |
| 生产源 | `index.html`、`src/`、`public/` | `project.godot`、`scenes/**/*.tscn`、`resources/**/*.tres`、`scripts/**/*.gd` |
| Agent 运行时 | 浏览器 API、JavaScript、可选 Three.js | Godot Scene/Resource、GDScript、physics/navigation、AnimationPlayer/AnimationTree |
| 构建目录 | `dist/` | `build/web/` |
| Preview 内容根 | 优先 `dist/`，未构建时只允许安全源码回退 | 只允许 `build/web/`，`sourceFallback=false` |
| 自动验收 | 类型/构建/浏览器 smoke | headless import、场景与脚本检查、Web release export、产物存在性 |

Godot starter 由宿主直接生成，包含：

- `.noobi/project.json`：记录 `engine=godot`、`starter=noobi-godot-4` 和宿主管理的内部 FPS 目标。
- `project.godot`：主场景、1280×720 viewport、Compatibility renderer，以及内部目标对应的 physics tick；新项目为 60 Hz。
- `scenes/main.tscn`、`scripts/main.gd`：具有移动、收集、碰撞、胜负和重开状态的可运行起点；`Engine.max_fps` 使用项目内部目标。
- `export_presets.cfg`：名为 `Web` 的单线程 Web 预设，输出 `build/web/index.html`。
- `public/assets/asset-pack.json` 和素材目录：继续通过现有 AssetStore、SHA-256 ledger 与生产引用门禁管理；Godot 使用 `res://public/assets/...` 引用。
- `AGENTS.md`、项目 Skill、`GAME_DESIGN.md` 与项目 README：注入 Godot 资源、动画、FPS、headless 验证与交付约束。
- `project.godot` 固定 `application/boot_splash/show_image=false`，Web preset 固定 `html/export_icon=false`；每次 Harness 前和正式导出前由宿主安全同步，Preview Server 还会隐藏旧构建中的默认 Godot splash。

项目创建时若选择 Godot，Main 会先要求兼容的 Godot 4，再落盘 starter，并立即执行一次宿主验证与 Web 导出。失败项目保留工作区，但状态转为 `failed`、阶段停在 `verify` 并记录具体错误。每次 Harness 修改完成后会停止旧预览、重新执行同一套 Godot 验收，再开放新构建预览。

## 环境管理与 Godot 发现

设置页的“环境管理”通过 typed IPC 读取 Main 侧的只读快照；Renderer 不执行版本命令，也不接触通用进程接口。快照包含 Node.js、Codex、Godot 的状态，以及 Export Templates 的版本、目录、平台目标和问题列表。

Godot 可执行文件按以下来源查找：

1. 已保存的用户选择；macOS 允许选择 `.app` bundle，再解析 `Contents/MacOS/Godot` 或 `Godot_mono`。
2. `NOOBI_GODOT_BIN` 环境变量；无效的可选覆盖不会阻止后续自动发现。
3. 系统应用目录：macOS 的 `/Applications` 与 `~/Applications`；Windows 的用户 Applications 路径。
4. `PATH` 中的 `godot4` / `godot`（Windows 为 `.exe`）。
5. Linux Flatpak 的系统或用户导出路径。

候选项必须是可执行的常规文件，并解析为 realpath。Main 使用 `--version` 在 5 秒超时内探测，只接受 major version 为 4 的编辑器。用户选择以版本化 JSON 原子写入应用私有 `userData/godot-environment.json`；清空选择后恢复自动发现。

`EnvironmentStatusSnapshot` 将工具状态区分为 `ready | missing | incompatible | error`，环境整体区分为：

- `ready`：Node.js、Codex、Godot 4 与导出能力就绪，并且没有缺失平台模板告警。
- `attention`：可创建 Godot 项目，但导出能力不可用或仍有平台模板需要处理。
- `blocked`：创建 Godot 项目所需的 Node.js、Codex 或 Godot 4 未就绪。

新建对话框会提前展示环境结论；Main 在创建和运行入口再次校验，避免绕过 Renderer。创建 Godot 项目只要求兼容编辑器；启动 Godot Agent 还明确要求可用的精确版本 Web template。

## 精确 Export Templates 契约

模板目录不能只按相近 minor 版本猜测。`templateVersionForGodot` 从编辑器完整版本删除官方 build 后缀，但保留 patch、发布通道与 Mono 标记，例如：

- `4.7.1.stable.official.a13da4feb` → `4.7.1.stable`
- `4.4.stable.mono.official.demo` → `4.4.stable.mono`

只有同名目录被视为匹配；已安装 `4.7.stable` 时不会放行 `4.7.1.stable` 编辑器。默认搜索目录为：

- self-contained：Godot 二进制旁的 `editor_data/export_templates/`。
- macOS：`~/Library/Application Support/Godot/export_templates/`。
- Windows：`%APPDATA%/Godot/export_templates/`。
- Linux：`${XDG_DATA_HOME:-~/.local/share}/godot/export_templates/`。

Main 只根据精确目录内真实模板文件标记 `web`、`macos`、`windows`、`linux` 目标。当前项目 scaffold 与自动构建只定义 `Web` 预设；桌面模板检测用于向用户呈现完整环境状态，不代表原生桌面构建已经接通。

## Godot headless 验收与 Web 预览

`GodotEnvironmentService.execute` 只暴露闭合的 `import | validate | export` 任务联合，不提供任意命令字符串。Main 使用 argv 数组和 `shell:false` 启动已验证二进制：

```text
import   godot --headless --recovery-mode --path <project> --editor --quit
validate godot --headless --recovery-mode --path <project> --editor --quit-after 1
export   godot --headless --recovery-mode --path <project> --export-release Web <project>/build/web/index.html
```

执行边界包括：

- 项目路径必须是绝对路径并含有可读的 `project.godot`。
- 三类任务都固定启用 `--recovery-mode`，不加载项目提供的 Tool Script、Editor Plugin 或 GDExtension；Godot 子进程只接收最小环境变量 allowlist，不继承宿主 Provider 密钥。
- export preset 禁止空值、前导 `-`、换行和 NUL；输出必须位于项目根目录内。
- import、validate、export 超时分别为 120 秒、60 秒、10 分钟；stdout/stderr 各自通过有界收集逻辑限制总体内存。
- 非零退出、超时、`ERROR:`、`SCRIPT ERROR:`、crash marker 或 export-failed marker 均失败；退出码 0 不能覆盖错误诊断。
- Web export 必须生成非空的 `index.html`、`index.wasm` 与 `index.pck`；缺少任一文件都失败关闭。

验收通过后，Preview Server 以独立 loopback 端口从 `build/web/` 提供 Godot Web 输出。服务器只接受预期 Host 的 GET/HEAD 请求，设置适合 WASM 的 CSP 与 `application/wasm` MIME，并由 Renderer 继续放入 sandboxed iframe。Godot 源文件和未完成构建不会作为预览回退。

## App Server 生命周期

1. 定位随 npm 包安装的 Codex 原生二进制；开发环境可使用 `NOOBI_CODEX_BIN` 覆盖。
2. 以应用私有 `userData/codex-home` 启动 `codex app-server --listen stdio:// --strict-config`。
3. 发送一次 `initialize`，声明 `clientInfo` 和实验能力。
4. 收到响应后发送 `initialized` notification。
5. 读取账户、模型目录和 provider 的 ImageGen 能力。
6. 首次执行使用 `thread/start` 并为 Implementer 注册受控 Dynamic Tools；后续执行使用 `thread/resume`。工具契约版本变化时创建新线程，避免恢复一个没有新工具的旧会话。
7. 使用 `turn/start` 发送用户输入，持续消费通知。
8. 使用 `turn/interrupt` 停止活动回合。
9. 应用退出时先 interrupt 活动回合、关闭 stdin 等待正常退出，再以 TERM/KILL 作有界兜底。

## 宿主级 Game Harness

每次制作请求按以下顺序执行：

1. 宿主读取项目记录中的引擎。Godot 项目先检查兼容编辑器与精确版本 Web template；Web 项目不依赖 Godot 环境。
2. 宿主检查已启用的图像 API；存在时选择 `configured-api` 路由，不存在时预检 Codex ImageGen capability 与 Skill。两条路都不可用才阻止启动。
3. Planner 在只读临时线程检查工作区并给出计划，五类角色提示均注入固定的引擎、`required_image_generation`、`model3d_generation_contract`、`animation_needs_contract` 与项目内部 `target_frame_rate_contract` 契约；Planner 每轮先分类 2D/2.5D/实际 3D，再从 `generate`、`reuse`、`not-needed` 三态中选择，并给出理由、对象/状态、现有证据、生产路径、确定性引擎时序和帧率素材变体路径。
4. 唯一 Implementer 在项目的耐久线程写文件、通过 `noobi_image_generate` 优先调用配置 API、按返回结果使用 Codex ImageGen 回退，并运行引擎对应的验证。`generate` 只在动画资产缺失/失效或本轮需求使其不兼容时生产新资产；`reuse` 必须验证并实际播放现有多帧/sheet 或 rigged-GLB clip，不重复生图；`not-needed` 必须实现可见的程序动画或状态反馈。
5. Reviewer 在只读临时线程检查实际文件、manifest、生产代码引用和可见结果；分别验证 generate 的真实缺口和新资产、reuse 的多姿态帧/真实 GLB clip 与播放代码、not-needed 的理由与程序运动反馈。Godot 项目还必须检查 Scene/Resource 引用、AnimationPlayer/AnimationTree 或真实骨骼/morph track。缺失、误判或无证据复用都返回 repair。
6. 宿主验证 Web `dist/` 的新鲜度与资源闭包，或执行 Godot import / validate / export，再用单独的严格 Preview Server 和隐藏 BrowserWindow 按 `.noobi/playtest.json` 自动试玩。评测只允许有界 key / pointer / look / drag / wait 输入，记录画面变化、动作中间帧、运行错误和步骤截图到宿主拥有的 `artifacts/playtest/latest/`。
7. Reviewer 要求修复，或 Reviewer 通过但构建、核心视觉、生成证明、生产引用、必需素材工单、体验评测任一宿主门禁未通过时，权威 findings 会退回同一 Implementer；每轮修复后先重建并重跑宿主门禁，再由同一 Reviewer 复核当前报告与截图，最多连续修复 3 轮。
8. 只有 Reviewer 与最终宿主验收同时通过，Harness 才发送 completed，Main 才把项目标记为 Complete。修复上限耗尽会明确失败；API Key、账户余额、套餐或模型权限等外部阻塞进入可继续的 waiting 状态，不伪装成半成品交付。

角色线程结束后 unsubscribe；只有 Implementer thread id 持久化，供下次 `thread/resume` 使用。

## 多媒体素材管线

- 图片：`noobi_image_generate` 优先调用已启用的外部图像 API；没有 API 时返回明确的 `codex-imagegen` 回退，Implementer 再调用应用私有 `imagegen` Skill。API 返回与 Codex `savedPath` 都在 Main 内完成格式/大小/路径校验、AssetStore 入库和私有 ledger 签发，base64 不进入 JSON-RPC。2D/2.5D animation assessment 为 `generate` 时，生成提示固定角色设计、风格、色板、光照、尺度、单帧尺寸、锚点和视角，并由生产代码选择/裁切多个帧播放；`reuse` 时验证现有至少两个不同帧或 sheet 的多姿态区域和播放代码，不因新回合重复生成；移动单张静态图不算关键帧动画。
- 3D 动画：实际 rigged 3D mesh 使用自包含 GLB 中的真实 animation clip，并由引擎 mixer/action 播放；ImageGen 只可作为角色参考图或明确的 billboard 替代路线，不能证明 GLB clip 存在。整体旋转/位移静态 mesh 也不算 clip 播放。
- 帧率变体：新项目使用 60 FPS 内部目标；为兼容既有工程，项目记录和 Harness 仍识别原有 30/60/120 FPS 技术目标，但 Renderer 不提供选择或切换入口。素材 manifest 或邻接元数据记录 `targetFps`、`sourceAnimationFps`、`frameCount`、`durationMs`、`timingMode` 与稳定 variant/group id；生产代码选择匹配目标或经验证明确兼容的共享变体。目标 FPS 与位图姿态数分离，禁止用重复位图伪装高帧率；确定性持帧、插值、骨骼/morph 或引擎采样用于保持时长和运动质量。
- 音频：`noobi_audio_generate` 要求 Agent 明确传入 `purpose=music|speech|vocal-sfx|sfx|ambience`。MiniMax 路由中，`music` 调用 Music 模型并透传 `instrumental`/`lyrics`，`speech` 与 `vocal-sfx` 调用 Speech 模型；后者只代表对白、喊声、喘息、嘶吼等人声素材，不冒充通用 Foley/SFX 模型。`sfx` 与 `ambience`（枪声、爆炸、撞击、脚步、风声、房间底噪等）不调用 MiniMax，而是返回 `purpose-not-supported + procedural-audio`，随后由 `noobi_audio_synthesize` 生成最长 8 秒、24 kHz mono PCM16 WAV，或使用确定性 Web Audio / 导入 WAV、MP3、OGG。没有可用音频 Provider 时同样返回明确的程序化回退。
- MiniMax API 密钥只在 Main 中短暂解密使用；Provider Store 仅保存由 macOS Keychain 支撑的 Electron safeStorage 密文。Renderer 只在用户提交设置时经隔离 IPC 发送新值，后续查询仅得到 `hasApiKey`，不会回传密钥明文。Agent、Dynamic Tool 参数、JSON-RPC 响应、文档和项目文件也不会获得密钥。
- 3D：`noobi_model3d_generate` 是唯一的 3D 生成入口。存在 active Provider 时先调用 Meshy、Tripo、Rodin 或自定义同步 REST 网关；只有未配置 Provider 时，Electron Main 才用 Three.js + `GLTFExporter` 构造纯色 PBR 模型、导出二进制 GLB，并通过同一 AssetStore 入库为 `source=procedural`。`animation=true` 生成真实 SkinnedMesh 与 idle / walk / run clips。Three.js 仅是宿主构建期素材工具，Godot 运行时只实例化 `res://public/assets/models/...`。配置的 API 若 401、429、超时或返回坏文件会显式失败，不静默回退，以免掩盖付费调用或重复扣费。同步网关应直接返回受支持媒体、内联 base64，或与配置 Endpoint 同源的下载 URL；跨源二次下载和重定向均被拒绝。宿主拒绝外部 URI、无效 chunk、超预算结构和普通多文件 glTF。
- 统一登记：`public/assets/asset-pack.json` 是项目清单，但始终视为不可信 Agent 数据；Main 重算 MIME、大小和 SHA-256，拒绝路径逃逸与 symlink。
- 预期素材：`AssetPlanStore` 独立保存在 Electron `userData`，不写入 Agent 可改的 workspace。`noobi_asset_plan` 和所有生成工具用稳定 `planId` 串起 planned → generating → generated → ready；失败进入 failed/waiting-agent，Inspector 仍展示占位并允许重新生成。Codex ImageGen 的完成通知由宿主关联最近的对应工单。
- UI：Inspector 素材页等比例展示图片、播放音频并索引 GLB；文件选择器支持全部素材，拖拽区只接受 PNG/JPEG/WebP。Web 项目在开发态把 `/assets/*` 映射到 Vite `public/assets/*`；Godot 只预览 `build/web/` 中完成验收的导出。
- Dynamic Tool 响应只返回有界文本与项目相对路径，不把媒体 base64、绝对路径或完整 prompt 写入事件日志。

## 可靠性原则

- 每个 RPC 有超时并关联唯一 id。
- stdout 只按 JSONL 解码；stderr 不参与协议。
- 原生 ImageGen 通知允许有界的大 JSONL 输入；超过 48 MiB 会立即终止该 Runtime 并使回合失败，不会静默等待超时。宿主输出仍限制在 16 MiB，媒体工具实际限制为 32 KiB 文本。
- App Server 意外退出后，当前运行标记失败；下一次显式操作可重启。
- thread id 只在 `thread/start` 成功后持久化。
- 新项目无需任何旧历史迁移即可运行。
- 审批默认由用户决定；没有 UI 消费者时超时拒绝。
- 审批绑定当前 App Server 生命周期；Runtime 退出或重启会立即使旧请求失效，避免 request id 跨进程错配。
- 单实例锁防止两个桌面进程同时覆盖项目目录和项目存储。
- 上次异常退出遗留的 `running` 项目在启动时恢复为 `stopped`，要求用户检查后显式继续。

## 游戏 Agent 指令层

每个项目拥有：

- `AGENTS.md`：项目目标、制作流程、验证和安全边界。
- `.codex/skills/noobi-game-builder/SKILL.md`：游戏制作专用工作流。
- `.noobi/project.json`：渲染安全的项目元数据。

工作区模板会根据引擎生成不同的固定契约。Web 项目要求浏览器、Vite 与 iframe 行为；Godot 项目要求使用 Scene/Resource/GDScript、Compatibility Web 输出、Godot 原生动画组件和 headless 验收。Agent 可以扩展项目内容，但不能把 Godot 项目改回伪装成引擎工程的浏览器实现。

系统不修改用户全局 `~/.codex`。项目级指令随工作区版本管理，并可被用户审阅。

宿主注入的固定生成图片契约优先于工作区内的建议或旧模板：配置图像 API 时先调用 API，没有时使用 Codex ImageGen。即使旧项目仍提到 Canvas、SVG 或程序化几何作为表现方式，它们也只能作为辅助或加载失败回退，不能满足素材完成门禁。

设置中的 Planner、Implementer、Reviewer、Repair 补充提示词存放在 app-private `PromptTemplateStore`。宿主将其编码为不可信偏好数据，放在固定安全、素材、动画与 FPS 契约之前，并在回合末重申固定策略；补充词不能闭合宿主标签、强制 Reviewer 通过或覆盖完成门禁。Skills 启停通过 App Server 原生 `skills/config/write`，其中宿主必需的 ImageGen 不可停用；MCP 使用 `config/value/write` 和 `config/mcpServer/reload`，HTTP 认证只保存环境变量名。

同一提示层还注入动画判断契约：Planner 每轮输出 `generate` / `reuse` / `not-needed` assessment；Implementer 必须完成对应的新资产生产、已验证资产/clip 复用播放或程序运动反馈；Reviewer 必须从实际资源与代码验证，不能只相信角色摘要。若 Planner 遗漏，Implementer 在 `GAME_DESIGN.md` 补记恢复后的判断，Reviewer 仍应要求 repair 后再通过。

目标帧率契约同样由宿主逐回合注入，旧工作区模板不能覆盖。新项目的内部目标固定为 60 FPS；既有项目继续使用其已持久化的有效目标，避免在没有同步引擎代码和素材变体时静默改速。每次 Harness 启动前，Main 会原子同步 `.noobi/project.json.targetFrameRate` 以及 AGENTS/项目 Skill 顶部的宿主管理策略块。引擎必须将 simulation、presentation、物理显示刷新率和 source animation sample rate 分开处理，使用 elapsed time 或有界 fixed-step 避免速度随显示器变化。Reviewer 对 stale FPS、错误变体、逐帧速度、无界 catch-up 和未经测量的帧率声明返回 repair。

## 测试策略

- 单元：JSONL request/response/notification/server request；路径约束；新项目内部 60 FPS、legacy 缺省回填与既有 30/60/120 FPS 值保留；Web 与 Godot starter；Godot 4 自动发现、手动 `.app` 解析、精确 Export Templates 版本、平台目标、固定 headless argv、路径约束、fatal 输出和缺失产物失败关闭；媒体 Provider 密钥隔离、API 响应签名、Three.js 静态/SkinnedMesh GLB、API 优先级、音频合成与 Dynamic Tool broker；MCP 配置校验/重载；提示词持久化和五类 Harness 注入；外部 API/Codex fallback、动画和内部 FPS 契约；私有生成证明、文件哈希与生产路径引用门禁。
- 协议 smoke：真实 Codex 二进制完成 initialize、account/read、model/list、ephemeral thread/start、turn/start。
- 产品 smoke：在隔离 Codex Home 与临时项目中让完整 Harness 写入验证文件，等待审查终态并检查文件。
- 媒体 smoke：真实 App Server 调用程序化音频工具；真实 Codex ImageGen 生成 PNG，并由 AssetStore 复制和登记。
- 3D smoke：无 Provider 时经 MediaGenerationService 产出并登记 Three.js GLB，再由真实 Godot headless import 实例化并断言 MeshInstance3D、Skeleton3D 与 idle / walk / run clips。
- 体验 smoke：真实 Electron 隐藏窗口加载严格 `dist/`，执行启动、移动、主要动作、暂停/恢复和重开，验证截图、连续帧、错误采集与最终报告。
- UI smoke：构建 Renderer，启动 Electron，断言已进入工作台，再截图检查项目与游戏预览。
- 构建：Renderer 与 Main 分别 typecheck，随后生成生产 bundle。
