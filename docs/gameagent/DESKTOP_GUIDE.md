# GameAgent Desktop 使用说明

## 首次启动

1. 在项目根目录执行 `npm install`。
2. 执行 `npm run bundle`，构建 Agent Runtime。
3. 执行 `npm run desktop`，打开桌面工作台。
4. 进入“模型与素材服务”，至少配置主 Agent API Key。

DeepSeek 推荐配置：

| 服务     | Provider        | Base URL                         | Model                |
| -------- | --------------- | -------------------------------- | -------------------- |
| 主 Agent | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-flash`  |
| 策划模型 | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-pro`    |
| 图像模型 | `tongyi`        | `https://dashscope.aliyuncs.com` | `wan2.5-t2i-preview` |
| 视频模型 | `tongyi`        | `https://dashscope.aliyuncs.com` | `wan2.5-i2v-preview` |
| 音频模型 | `openai-compat` | `https://api.deepseek.com`       | `deepseek-v4-flash`  |

`deepseek-chat` 与 `deepseek-reasoner` 已于 2026-07-24 停用，不应继续使用。DeepSeek 不能生成图像或视频；推荐用一枚北京地域的阿里云百炼 DashScope Key 同时提供图像和视频。GameAgent 会在 Provider 相同时自动复用密钥：策划/音频复用主 Agent Key，视频复用图像 Key，无需重复粘贴。

## 创建游戏

1. 点击“新建游戏”。
2. 输入项目名、保存目录与游戏创意。
3. 创建后点击“启动 Agent”。
4. 中央区域查看制作阶段与真实工具调用。
5. 右侧“文件”查看生成产物；构建完成后在“预览”中试玩。

## Skills 与 MCP

左侧点击“Skills 与 MCP”进入扩展能力管理：

- **Skills**：可导入到用户级 `~/.qwen/skills/`，或导入到当前项目的 `.qwen/skills/`。项目级同名 Skill 会覆盖用户级 Skill。导入目录必须包含有效 `SKILL.md`。
- **MCP Servers**：支持 STDIO、Streamable HTTP 和 SSE。可配置启动参数、Working Directory、Env、Headers、Timeout 与启停状态。
- Env/Header 的值由系统安全存储加密；界面重新打开后只显示“已配置”，不会回传明文。
- Skills 与 MCP 的变更从下一次启动或继续 Agent 时生效，不会中途改变正在运行的回合。

## 停止与恢复

- 点击“停止”会先发送 SIGTERM，超时后强制终止。
- 会话记录与已经写入的项目文件不会删除。
- 再次输入要求并点击“继续执行”，应用会使用保存的 `sessionId` 恢复。
- 如果超大历史会话恢复失败，可新建会话，并要求 Agent 先审计 `GAME_DESIGN.md` 与现有文件后继续。

## 权限模式

桌面版固定使用 `完整自动化 / yolo`：允许 Agent 在当前游戏项目目录内写文件，并运行 `npm install`、`build`、`test`、`dev`。这是因为无头 CLI 回合没有可交互的逐条审批通道；请把项目建在专用工作目录中，不要选择已有代码或重要资料目录。

## 安全说明

- 不要把 API Key 写进游戏提示词、项目 `.env` 或代码。
- 密钥由系统安全存储加密，仅通过匿名 fd 通道传给内置 Agent；不会放进命令行、环境变量或 Shell 子进程。
- 已经在聊天、截图或日志中公开过的 Key 应立即在服务商后台吊销并重新创建。
- 游戏预览运行在无 Node 权限的 iframe sandbox 中。

## 本地打包

执行 `npm run desktop:package`。脚本会自动重新打包 Agent Runtime、收集原生依赖、执行隔离冒烟测试，再生成未签名的本地 macOS `.app`。产物位于 `packages/desktop/release/mac-arm64/GameAgent.app`。
