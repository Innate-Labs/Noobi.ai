# Noobi.ai 架构

## 核心选择

- 桌面容器：Electron。
- 前端：React + TypeScript + Vite。
- Agent：官方 `@openai/codex` 原生二进制的 `codex app-server --listen stdio://`。
- 协议：省略 `jsonrpc` 字段的 JSON-RPC 2.0；stdio 上每行一条 JSON。
- 持久化：Electron `userData` 中的单一项目存储；Codex 自己持久化线程。项目记录同时持久化 `30 | 60 | 120` FPS 制作目标，旧/未指定项目默认 60。
- 游戏输出：每个项目一个独立工作区；本地只读 HTTP Preview Server。

## 为什么使用 App Server

App Server 是 Codex 为富客户端提供的正式深度集成面，覆盖认证、会话历史、审批和流式 Agent 事件。Noobi.ai 是交互式桌面产品，因此使用 App Server，而不是面向 CI/自动作业的 SDK。

## 进程边界

```text
React Renderer
  │ typed IPC only
  ▼
Electron Main
  ├─ ProjectStore
  ├─ PreviewServer
  ├─ AssetStore (PNG/JPEG/WebP · WAV/MP3/OGG · self-contained GLB)
  ├─ MediaProviderStore (app-private API config · redacted IPC)
  ├─ MediaGenerationService (image/audio/3D REST · bounded ingest)
  ├─ MediaToolBroker (dynamic tools · API routing · procedural audio)
  ├─ PromptTemplateStore
  ├─ McpConfigManager
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

1. 宿主先检查已启用的图像 API；存在时选择 `configured-api` 路由，不存在时预检 Codex ImageGen capability 与 Skill。两条路都不可用才阻止启动。
2. Planner 在只读临时线程检查工作区并给出计划，五类角色提示均注入固定的 `required_image_generation`、`animation_needs_contract` 与所选 `target_frame_rate_contract` 契约；Planner 每轮先分类 2D/2.5D/实际 3D，再从 `generate`、`reuse`、`not-needed` 三态中选择，并给出理由、对象/状态、现有证据、生产路径、确定性引擎时序和帧率素材变体路径。
3. 唯一 Implementer 在项目的耐久线程写文件、通过 `noobi_image_generate` 优先调用配置 API、按返回结果使用 Codex ImageGen 回退，并运行验证。`generate` 只在动画资产缺失/失效或本轮需求使其不兼容时生产新资产；`reuse` 必须验证并实际播放现有多帧/sheet 或 rigged-GLB clip，不重复生图；`not-needed` 必须实现可见的程序动画或状态反馈。
4. Reviewer 在只读临时线程检查实际文件、manifest、生产代码引用和可见结果；分别验证 generate 的真实缺口和新资产、reuse 的多姿态帧/真实 GLB clip 与播放代码、not-needed 的理由与程序运动反馈。缺失、误判或无证据复用都返回 repair。
5. 若 Reviewer 要求修复，同一 Implementer 仅执行一次有界修复，再由 Reviewer 二次确认；仍有 blocker 时任务失败，不伪装成完成。
6. Harness 返回后，宿主等待图片入库完成，再用 Agent 无法写入的私有 ledger 校验 `projectId + 相对路径 + SHA-256 + 宿主观察到的 provider` 生成证明；同时要求该精确资源路径出现在生产源码或构建产物中。两项门禁通过后才把项目标记为完成，工作区 manifest 的 `provider` 字段本身不构成证明。

角色线程结束后 unsubscribe；只有 Implementer thread id 持久化，供下次 `thread/resume` 使用。

## 多媒体素材管线

- 图片：`noobi_image_generate` 优先调用已启用的外部图像 API；没有 API 时返回明确的 `codex-imagegen` 回退，Implementer 再调用应用私有 `imagegen` Skill。API 返回与 Codex `savedPath` 都在 Main 内完成格式/大小/路径校验、AssetStore 入库和私有 ledger 签发，base64 不进入 JSON-RPC。2D/2.5D animation assessment 为 `generate` 时，生成提示固定角色设计、风格、色板、光照、尺度、单帧尺寸、锚点和视角，并由生产代码选择/裁切多个帧播放；`reuse` 时验证现有至少两个不同帧或 sheet 的多姿态区域和播放代码，不因新回合重复生成；移动单张静态图不算关键帧动画。
- 3D 动画：实际 rigged 3D mesh 使用自包含 GLB 中的真实 animation clip，并由引擎 mixer/action 播放；ImageGen 只可作为角色参考图或明确的 billboard 替代路线，不能证明 GLB clip 存在。整体旋转/位移静态 mesh 也不算 clip 播放。
- 帧率变体：项目目标只能是 30/60/120 FPS。素材 manifest 或邻接元数据记录 `targetFps`、`sourceAnimationFps`、`frameCount`、`durationMs`、`timingMode` 与稳定 variant/group id；生产代码选择匹配目标或经验证明确兼容的共享变体。切换目标后，旧 timing constant、缓存、导出和 target-specific 变体在审计前均视为 stale，必须替换、重采样、重标记或重选。目标 FPS 与位图姿态数分离，禁止用 120 张重复位图伪装 120 FPS；确定性持帧、插值、骨骼/morph 或引擎采样用于保持时长和运动质量。
- 音频：`noobi_audio_generate` 要求 Agent 明确传入 `purpose=music|speech|vocal-sfx|sfx|ambience`。MiniMax 路由中，`music` 调用 Music 模型并透传 `instrumental`/`lyrics`，`speech` 与 `vocal-sfx` 调用 Speech 模型；后者只代表对白、喊声、喘息、嘶吼等人声素材，不冒充通用 Foley/SFX 模型。`sfx` 与 `ambience`（枪声、爆炸、撞击、脚步、风声、房间底噪等）不调用 MiniMax，而是返回 `purpose-not-supported + procedural-audio`，随后由 `noobi_audio_synthesize` 生成最长 8 秒、24 kHz mono PCM16 WAV，或使用确定性 Web Audio / 导入 WAV、MP3、OGG。没有可用音频 Provider 时同样返回明确的程序化回退。
- MiniMax API 密钥只在 Main 中短暂解密使用；Provider Store 仅保存由 macOS Keychain 支撑的 Electron safeStorage 密文。Renderer 只在用户提交设置时经隔离 IPC 发送新值，后续查询仅得到 `hasApiKey`，不会回传密钥明文。Agent、Dynamic Tool 参数、JSON-RPC 响应、文档和项目文件也不会获得密钥。
- 3D：`noobi_model3d_generate` 调用 Meshy、Tripo、Rodin 或自定义同步 REST 网关；未配置时明确返回 `none`，Agent 使用导入的自包含 GLB 2.0 或 Three.js 程序化建模。同步网关应直接返回受支持媒体、内联 base64，或与配置 Endpoint 同源的下载 URL；跨源二次下载和重定向均被拒绝。宿主拒绝外部 URI、无效 chunk、超预算结构和普通多文件 glTF。
- 统一登记：`public/assets/asset-pack.json` 是项目清单，但始终视为不可信 Agent 数据；Main 重算 MIME、大小和 SHA-256，拒绝路径逃逸与 symlink。
- UI：Inspector 素材页等比例展示图片、播放音频并索引 GLB；文件选择器支持全部素材，拖拽区只接受 PNG/JPEG/WebP；Preview 在开发态把 `/assets/*` 映射到 Vite `public/assets/*`。
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

系统不修改用户全局 `~/.codex`。项目级指令随工作区版本管理，并可被用户审阅。

宿主注入的固定生成图片契约优先于工作区内的建议或旧模板：配置图像 API 时先调用 API，没有时使用 Codex ImageGen。即使旧项目仍提到 Canvas、SVG 或程序化几何作为表现方式，它们也只能作为辅助或加载失败回退，不能满足素材完成门禁。

设置中的 Planner、Implementer、Reviewer、Repair 补充提示词存放在 app-private `PromptTemplateStore`。宿主将其编码为不可信偏好数据，放在固定安全、素材、动画与 FPS 契约之前，并在回合末重申固定策略；补充词不能闭合宿主标签、强制 Reviewer 通过或覆盖完成门禁。Skills 启停通过 App Server 原生 `skills/config/write`，其中宿主必需的 ImageGen 不可停用；MCP 使用 `config/value/write` 和 `config/mcpServer/reload`，HTTP 认证只保存环境变量名。

同一提示层还注入动画判断契约：Planner 每轮输出 `generate` / `reuse` / `not-needed` assessment；Implementer 必须完成对应的新资产生产、已验证资产/clip 复用播放或程序运动反馈；Reviewer 必须从实际资源与代码验证，不能只相信角色摘要。若 Planner 遗漏，Implementer 在 `GAME_DESIGN.md` 补记恢复后的判断，Reviewer 仍应要求 repair 后再通过。

目标帧率契约同样由宿主逐回合注入，旧工作区模板不能覆盖。每次 Harness 启动前，Main 还会原子同步 `.noobi/project.json.targetFrameRate` 以及 AGENTS/项目 Skill 顶部的宿主管理策略块；旧代码与 target-specific 素材仍由 Agent 审计、替换、重采样或重选。引擎必须将 simulation、presentation、物理显示刷新率和 source animation sample rate 分开处理，使用 elapsed time 或有界 fixed-step 避免速度随显示器变化。120 Hz simulation 在 60 Hz 显示器可每个回调执行两步，但不能宣称显示了 120 个独立画面。Reviewer 对 stale FPS、错误变体、逐帧速度、无界 catch-up 和未经测量的帧率声明返回 repair。

## 测试策略

- 单元：JSONL request/response/notification/server request；路径约束；项目存储与 legacy 60 FPS 回填；媒体 Provider 密钥隔离、API 响应签名、GLB、音频合成与 Dynamic Tool broker；MCP 配置校验/重载；提示词持久化和五类 Harness 注入；外部 API/Codex fallback、动画和 30/60/120 FPS 契约；私有生成证明、文件哈希与生产路径引用门禁。
- 协议 smoke：真实 Codex 二进制完成 initialize、account/read、model/list、ephemeral thread/start、turn/start。
- 产品 smoke：在隔离 Codex Home 与临时项目中让完整 Harness 写入验证文件，等待审查终态并检查文件。
- 媒体 smoke：真实 App Server 调用程序化音频工具；真实 Codex ImageGen 生成 PNG，并由 AssetStore 复制和登记。
- UI smoke：构建 Renderer，启动 Electron，断言已进入工作台，再截图检查项目与游戏预览。
- 构建：Renderer 与 Main 分别 typecheck，随后生成生产 bundle。
