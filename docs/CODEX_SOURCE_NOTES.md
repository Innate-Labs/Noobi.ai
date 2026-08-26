# Codex App Server 源码阅读记录

## 阅读基线

- 仓库：`openai/codex`
- 上游 HEAD 阅读基线：`83d1fe0e67b1323f71febc2925817732b449f1d9`
- 固定运行时 tag：`rust-v0.148.0`（`3ba0f711`）
- 产品固定运行时：`codex-cli 0.148.0`
- 重点目录：`codex-rs/app-server`、`codex-rs/app-server-protocol`
- 本项目生成契约：`src/generated/codex` 与 `schemas/codex`

运行时升级后必须执行 `npm run protocol:generate`，审查生成差异，再调整手写的产品 DTO。网页文档中的示例不是版本锁；固定二进制生成的枚举与字段才是本产品 wire contract 的依据。

## 源码确认的集成规则

1. stdio transport 是每行一条 JSON；消息形状近似 JSON-RPC 2.0，但不携带 `jsonrpc` 字段。
2. 客户端先发 `initialize`，成功后只发一次 `initialized` notification。
3. `id + result/error` 是请求响应；`id + method` 是 App Server 发给宿主的双向请求；只有 `method` 是通知。
4. `thread/start` / `thread/resume` 建立或恢复会话；`turn/start` 发起一次工作；`turn/completed` 才是回合终态。
5. `item/started → delta → item/completed` 是工具和消息的标准生命周期；completed item 覆盖流式临时状态。
6. 命令、文件、权限和用户输入由 App Server 发起 server request。未知请求必须 fail closed，Renderer 不能直接操作 RPC。
7. `turn/interrupt` 的响应只表示取消已请求；宿主仍需等 `turn/completed` 的 `interrupted` 状态。
8. stdio 没有独立 shutdown 方法。正常退出应先结束活动回合与请求，再关闭 stdin 并等待子进程；强制信号仅作有界兜底。
9. `dynamicTools` 只在 `thread/start` 注册，并随线程持久化；`thread/resume` 不能给旧线程补装工具。
10. 原生 `image_gen.imagegen` 会发出含 PNG base64 与 `savedPath` 的 `imageGeneration` item；宿主不能把 item 原样写日志。

## Noobi.ai 的产品取舍

- 直接把官方 App Server 作为 Harness 内核，不安装旧 `codex-harness` 插件。
- 在 Electron main 内实现 Planner → 单 Implementer → Reviewer → 最多一次 Repair → 最终复审的宿主级游戏编排。
- Planner/Reviewer 为 ephemeral + read-only；Implementer 为 durable + workspace-write，避免并行写入冲突。
- 每项目保存 Codex thread id，Codex rollout 是会话权威；Noobi 只保存适合 UI 的事件摘要。
- 新项目永远可直接启动，不设置旧历史迁移门禁。
- Renderer 不开放任意 dynamic tool。Main 仅分发白名单 `noobi_asset_list`、`noobi_asset_register`、`noobi_audio_synthesize`、`noobi_image_generate`、`noobi_audio_generate`、`noobi_model3d_generate`，未知请求 fail closed；工具响应只含有界文本和项目相对路径。
- Harness 在每轮 Planner、Implementer、Reviewer、Repair 和复审提示中注入 animation needs contract：Planner 检查现有资产后选择 `generate`、`reuse` 或 `not-needed`；2D/2.5D 只在真实缺口/不兼容变化时通过图像生成路由生产关键帧，已有合格帧则验证复用，实际 rigged 3D 使用真实 GLB animation clip，不需要姿态变化时记录理由并验证程序运动反馈；Reviewer 对误判或不满足分支返回 repair。
- 产品不暴露跳过素材的策略：图像 API 配置存在时优先调用，没有时启用 Codex ImageGen 回退；两条路径都要求生成、登记和实际接入图片。宿主不信任可编辑 manifest 的 `provider`，仅在应用私有的路径/SHA-256/provider 证明与生产代码引用门禁都通过后标记完成。
- Codex 0.148.0 没有内建游戏音频或 3D 生成工具，因此这些能力通过宿主白名单 Dynamic Tools 和用户配置 API 提供；无服务时返回明确回退，不能伪造成功。音频 Dynamic Tool 显式携带 `purpose`：MiniMax Music 只处理 `music`，MiniMax Speech 只处理 `speech`/`vocal-sfx`；枪声、爆炸、撞击、脚步和 ambience 等通用音效不虚构为 MiniMax 原生能力，返回 `procedural-audio` 后使用内置合成、Web Audio 或导入素材。
- Skills 管理使用 `skills/list` 与 `skills/config/write`；MCP 管理使用 `config/read`、`config/value/write`、`config/mcpServer/reload`、`mcpServerStatus/list`，并保持在应用私有 `CODEX_HOME`。

## 核心验收

- transport 单元测试覆盖响应、通知、server request、协议错误和非法 JSON。
- 真实二进制 smoke 覆盖 initialize、account、model、thread、turn、写文件和 terminal event。
- Electron smoke 覆盖生产构建、隔离 preload、页面加载、静态游戏预览和截图。
