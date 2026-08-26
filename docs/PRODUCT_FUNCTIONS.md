# Noobi.ai 功能拆解

## 产品目标

Noobi.ai 是一个面向独立开发者和创意团队的游戏制作 Agent。用户用自然语言描述游戏，Codex 在受控项目目录内完成策划、脚手架、素材接入、动画需求判断、代码实现、构建验证和持续迭代；产品负责把 Codex App Server 的线程、回合、工具、审批与文件变化转化成可理解的制作工作台。

新工程只继承旧 Noobi.ai 的产品能力和前端信息架构，不继承旧项目的迁移状态、私有运行时封装或历史数据门禁。

## 从现有产品拆出的功能域

### 1. 项目与工作区

- 创建游戏项目：名称、创意描述、存放目录、模型、30/60/120 FPS 制作目标（默认 60）；AI 图片素材生产是固定要求，不提供跳过策略。
- 项目轨：切换项目、查看状态、继续最近会话。
- 初始化标准游戏工作区：`AGENTS.md`、Noobi Skill、项目元数据和可运行网页游戏入口。
- 在 Finder 中显示项目、刷新文件、读取文本文件。
- 项目数据与 Codex thread id 独立持久化。

### 2. 游戏制作管线

保留八个对用户可见的阶段：

1. Brief：整理创意与约束。
2. Scaffold：选择技术栈并建立工程。
3. GDD：沉淀玩法、循环、规则和验收标准。
4. Assets：准备视觉、音频和数据资产；根据 animation needs assessment 新生成或复用一致关键帧/sprite sheet、接入真实 GLB animation clip，或定义程序动画反馈路径。
5. World：场景、关卡、地图与实体编排。
6. Code：实现游戏逻辑和 UI。
7. Verify：运行构建、测试和可玩性检查。
8. Complete：交付可运行版本和变更摘要。

阶段来自 Agent 事件推断，只用于展示，不作为执行门禁。独立于阶段展示，宿主有一条固定的素材完成门禁：项目必须存在并实际接入至少一张由已配置图像 API 或 Codex ImageGen 回退生成、且由宿主私有 ledger 证明的图片。

### 3. Codex Agent 会话

- App Server `initialize` / `initialized` 握手。
- `account/read`、ChatGPT 登录、模型目录和运行时健康检查。
- 新项目 `thread/start`，既有项目 `thread/resume`。
- `turn/start` 发起制作或继续修改；`turn/interrupt` 停止。
- 实时展示 `turn/*`、`item/*`、文本 delta、命令、文件修改和计划事件。
- Planner 每轮检查现有工程后输出 `generate` / `reuse` / `not-needed` 动画判断和 2D/2.5D/实际 3D 表现类型；理由、对象/状态、已有证据和生产路径随计划事件展示，并传入 Implementer 与 Reviewer。
- 当前项目帧率随每次 Planner/Implementer/Reviewer/Repair/Re-review 注入：Agent 分离 simulation、presentation、显示器刷新率和动画 source sample rate，生成/复用带 target/source FPS 与时长/variant 元数据的素材，并由生产代码选择匹配变体。切换帧率时必须审计和替换/重选 stale 素材与时序。
- 持久化 thread id，应用重启后继续上下文。
- 命令和文件变更审批由用户在界面处理。

### 4. 制作工作台

- 中央事件时间线：用户指令、Agent 信息、推理摘要、工具调用、错误和完成状态。
- Prompt Composer：固定显示 `IMAGE ROUTER / REQUIRED` 生产要求、模型、推理强度、30/60/120 FPS、继续修改、快捷键发送和停止；外部图像 API 与 Codex ImageGen 都不可用时阻止启动并解释原因。
- 项目制作可选择 30、60 或 120 FPS；选择值持久化到项目并用于下一轮素材与代码生产，旧项目默认 60。
- 制作阶段条：突出当前阶段及完成状态。
- 右侧 Inspector：实时预览、文件树、文件内容和素材索引。
- 素材工作台：等比例图片缩略图、音频试听、GLB 索引、批量导入、PNG/JPEG/WebP 拖入和 Agent 生成结果实时同步，并明确显示 AI 图片门禁是否满足。
- 运行时状态：Codex 位置、版本、账号、模型、启动错误。

### 5. 设置与扩展

- ChatGPT 登录/退出与账户状态。
- 默认工作区、默认模型、推理强度、主题；不提供关闭生成图片门禁的设置。
- 媒体 API：图像服务优先、Codex ImageGen 回退；音频请求按 `music | speech | vocal-sfx | sfx | ambience` 明确分类，MiniMax Music 负责音乐、MiniMax Speech 负责人声/人声音效，通用 SFX 与 ambience 返回程序化回退；3D 使用主要模型/同步 REST 网关；密钥由 macOS Keychain 支撑的 Electron safeStorage 加密，磁盘只保存密文。
- Codex Skills：读取原生 Skills 目录并即时启停，不删除 Skill 文件；固定素材门禁依赖的宿主 ImageGen 标记为 `NOOBI REQUIRED`，不可停用。
- MCP Servers：管理 stdio 命令与 HTTP Endpoint，保存后通过 App Server 重载；HTTP Token 只引用主进程环境变量名。
- 提示词管理：Planner、Implementer、Reviewer、Repair 分层启停、编辑和恢复；未保存草稿受离开保护，内容作为不可信偏好放在固定安全/素材/FPS 契约之前，不能覆盖宿主门禁。
- 旧历史导入只能是显式、可取消的工具，永远不阻断新项目或新线程。

## 垂直切片顺序

### Slice A：可运行核心

- 创建项目并生成工作区。
- 启动 App Server，完成账号和模型探测。
- 启动/恢复线程，发送回合，流式显示事件。
- Agent 在项目目录写入游戏文件。
- 预览服务器展示生成的 `index.html`。

### Slice B：可控生产

- 审批命令与文件修改。
- 中断、错误恢复、进程退出清理。
- 文件浏览、素材索引、项目状态持久化。
- 运行时诊断和登录 UX。

### Slice C：游戏能力扩展（当前已落地基础层）

- 固定执行“配置图像 API 优先、Codex ImageGen 回退”的图片生成并校验实际使用；2D/2.5D 动画为 `generate` 时才额外生产风格、尺度、锚点、单帧尺寸与视角一致的关键帧/sprite sheet，`reuse` 时验证并复用已有多姿态帧与实际播放，实际 3D 则复用/接入真实 rigged-GLB animation clip，`not-needed` 时验证具体理由和程序运动反馈；同时提供媒体 API、程序化音效、图片拖入、音频/GLB 导入与统一 manifest。
- 30/60/120 FPS 目标驱动确定性引擎 cadence、动画素材 target/source FPS 标记和 runtime variant selection；Harness 启动前先同步宿主元数据/指令策略，随后要求 Agent 替换、重采样、重标记或重选不兼容素材并由 Reviewer 验收。不会机械生成每秒 120 张位图，而是按运动/风格选择关键帧密度并用持帧、插值、骨骼/morph 或引擎采样保持时长与质量。
- 安全 Dynamic Tool dispatcher、工具契约版本化和素材 UI。
- Dynamic Tools 已提供图片、音频、3D 生成入口；`noobi_audio_generate` 透传 `purpose`、`instrumental`、`lyrics` 等有界参数，音乐与人声音效分别路由到 MiniMax Music/Speech。枪声、爆炸、撞击、脚步或环境底噪不虚构成 MiniMax 能力，统一走 `procedural-audio`、Web Audio 或导入素材。Codex 没有原生音频/3D 生成时使用用户配置 API 或明确的程序化/无服务回退，不虚构能力。
- Settings 已接入 Codex 原生 Skills 与 MCP 配置/状态，并提供应用私有的分角色提示词管理。
- 构建产物导出与平台打包。
- 可选历史导入，不设置 hard cut。

## 明确不复制的旧复杂度

- 不引入全量旧会话迁移 hard cut。
- 不使用 `migration-required` 作为新项目 backend。
- 不维护多份镜像 binding 状态。
- 不在应用启动前要求历史、模型、Skill、MCP 全量迁移成功。
- 不把开发安装的签名策略和 Agent 可用性混成同一条不可恢复门禁。
