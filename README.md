# Noobi.ai

Noobi.ai 是一个基于 Codex App Server 的桌面游戏制作 Agent。它把自然语言创意转换成可运行的游戏工程，并提供制作阶段、流式事件、审批、实时预览，以及统一的图片、音频、3D 素材库。每个游戏都固定要求至少一张实际接入并可见的 AI 生成图片：设置了图像 API 就优先调用，未设置或路由回退时使用 Codex ImageGen；宿主只信任自己观察到的生成结果，并在完成前校验文件哈希与生产代码引用。音频/音效/语音和 3D 也可配置主要服务或同步 REST 网关；密钥只在设置表单提交时经隔离 IPC 交给 Main，由 macOS Keychain 支撑的 Electron safeStorage 加密后落盘，保存后不向 Renderer 回传，也不会进入 Agent、项目文件或 JSON-RPC。

音频工具用明确的 `purpose` 路由能力：`music` 使用 MiniMax Music，并支持 `instrumental` 与 `lyrics`；`speech` 和 `vocal-sfx` 使用 MiniMax Speech，适合对白、喊声、喘息、僵尸嘶吼等人声素材，非语言声音使用 Speech 2.8 的 `(groans)`、`(gasps)`、`(breath)`、`(hissing)` 等标签而不是描述句。枪声、爆炸、撞击、脚步与环境底噪不伪装成 MiniMax 能力，`sfx`/`ambience` 会返回程序化音频回退，再由内置 WAV 合成器、Web Audio 或导入素材完成。MiniMax Music 3.0 的实际可用性取决于账户资格，设置中的短 Speech 检查不会代替首次音乐生成验证。

每轮 Planner 还必须完成 animation needs assessment，并在检查现有工程后选择 `generate`、`reuse` 或 `not-needed`。2D/2.5D 只有缺少合格动画资产或本轮改变姿态、风格、尺度、锚点、帧尺寸或视角时才通过图像生成路由新建关键帧/sprite sheet；已有至少两个不同帧或已播放的 sheet 时应验证后复用。实际 rigged 3D 角色复用或接入真实 GLB animation clip，图像只作参考或 billboard 路径。不需要姿态形变时必须写明理由，并交付与输入或游戏状态相关的程序动画/运动反馈。Reviewer 分别验证三条分支，缺失或误判即进入 repair。

每个项目持久化 `30 | 60 | 120` FPS 制作目标，旧项目和未选择的新项目默认 60 FPS。Harness 的五类回合都收到同一个目标帧率契约：游戏逻辑使用确定性的 elapsed-time/有界 fixed-step 节拍；动画素材登记 target/source FPS、帧数、时长、timing mode 与 variant id，运行时选择匹配或明确兼容的变体。切换 FPS 会触发旧时序和动画变体审计、替换/重采样/重选；目标 FPS 不等于每秒必须生成同数量的独立位图，低采样风格动画可以按精确时长持帧或插值。

素材页支持文件选择与直接拖入 PNG/JPEG/WebP。设置工作区可管理媒体 API、Codex Skills、stdio/HTTP MCP Servers，以及 Planner、Implementer、Reviewer、Repair 四层应用私有补充提示词；固定安全、素材与帧率契约不可被这些提示词覆盖。

## 开发

```bash
npm install
npm run dev
```

可用 `NOOBI_CODEX_BIN=/absolute/path/to/codex` 指定 Codex 二进制。默认会优先使用 `@openai/codex` 安装的当前平台原生二进制，并回退到 ChatGPT App 或 PATH 中的 Codex。

Noobi 使用应用私有的 `userData/codex-home`，不会把项目信任或插件配置写入用户的全局 `~/.codex`。首次启动请在“设置 → Codex 账户”中单独完成 ChatGPT 登录。

## 验证

```bash
npm run verify
npm run smoke:codex
npm run smoke:harness
npm run smoke:media
npm run smoke:image
npm run smoke:ui
```

真实 Agent smoke 会使用已登录账户和少量 Codex 额度；`smoke:harness` 与 `smoke:image` 都会生成一张临时 PNG，以验证固定 ImageGen 契约及独立图片管线。默认只把当前 `auth.json` 复制到权限受限、测试后删除的临时 `CODEX_HOME`，不会把临时工作区加入全局信任；也可显式设置一个已登录的 `NOOBI_SMOKE_CODEX_HOME`。

## macOS 本地包

```bash
npm run package:mac
```

当前脚本按本机架构生成 DMG（本工程已验证 arm64）。本地开发包可运行；公网分发前仍必须换用 `Developer ID Application` 证书，执行 Apple notarization 并 staple 公证票据。Intel Mac 需要在 x64 构建环境另产工件。

功能拆解见 [docs/PRODUCT_FUNCTIONS.md](docs/PRODUCT_FUNCTIONS.md)，App Server 设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，源码阅读基线见 [docs/CODEX_SOURCE_NOTES.md](docs/CODEX_SOURCE_NOTES.md)。
