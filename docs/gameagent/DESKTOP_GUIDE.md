# Noobi.ai 桌面客户端使用说明

## 支持平台

- macOS Apple Silicon：DMG 安装版。
- Windows 11 x64：NSIS Setup EXE 候选版；须通过 Windows 原生 CI、安装/卸载与签名验收后才作为
  正式发行版发布。Windows on ARM、32 位 Windows 和便携版尚未支持。

普通用户安装客户端不需要源码开发环境。Node.js、uv、Godot、Blender 与 Unity Hub 是插件或
外部引擎工作流的可选依赖，不是打开 Noobi.ai 的前置条件。

## 首次启动

1. 打开“设置 → API 管理”。
2. 至少配置主 Agent 的 Provider、Base URL、Model 与 API Key。
3. 点击“基础测速”，确认当前服务可访问。
4. 新建项目，选择一个专用本地目录并输入游戏创意。

API Key 由当前操作系统的安全存储加密。macOS 使用 Keychain 相关能力，Windows 使用当前
Windows 用户的系统凭据保护；把配置文件复制到另一台电脑或另一系统后，需要重新输入密钥。

## 创建游戏

1. 点击“新建游戏”。
2. 输入项目名、保存目录与游戏创意。
3. 创建后点击“启动 Agent”。
4. 中央区域查看制作阶段与真实工具调用。
5. 右侧“文件”查看生成产物；构建完成后在“预览”中试玩。

当前内置流程主要面向 2D Phaser Web 游戏。Unity、Godot、Unreal Engine 和 Blender 需要对应
插件、MCP Server、编辑器侧组件与本机软件；安装目录条目不代表连接已经就绪。

## 插件：Skills 与 MCP

- **用户级 Skill**：macOS/Linux 位于 `~/.qwen/skills/`；Windows 位于
  `%USERPROFILE%\.qwen\skills\`。
- **项目级 Skill**：位于项目的 `.qwen/skills/`，同名时优先于用户级 Skill。
- **MCP Server**：支持 STDIO、Streamable HTTP 和 SSE，可设置启动参数、Working Directory、
  Env、Headers、Timeout 与启停状态。
- Env/Header 中的秘密值由系统安全存储加密，界面重新打开后只显示“已配置”。
- 插件变更从下一次启动或继续 Agent 时生效，不会中途改变正在运行的回合。

第三方 Skill、MCP 和编辑器插件都应视为不可信输入。安装前检查来源、许可证、依赖和风险；
精选推荐不会绕过校验或工具确认。

## Windows 依赖管理

Windows 版只通过主进程内置的 WinGet 白名单管理以下项目：

| 能力          | 固定包                      | 说明                             |
| ------------- | --------------------------- | -------------------------------- |
| Node.js / npx | `OpenJS.NodeJS.LTS`         | npm 分发的 MCP 与项目工具        |
| uv / uvx      | `astral-sh.uv`              | Python MCP 工具                  |
| Godot         | `GodotEngine.GodotEngine`   | 标准版，不含 Mono/.NET 版        |
| Blender       | `BlenderFoundation.Blender` | 3D 内容制作                      |
| Unity Hub     | `Unity.UnityHub`            | Unity Editor 与模块仍由 Hub 管理 |

Noobi.ai 不接受界面传入的 executable、package ID 或额外参数，也不会在缺少 WinGet 时改用
任意 PowerShell 下载脚本。WinGet 缺失时，请从 Microsoft Store 安装或更新“应用安装程序”。
安装某些机器级工具可能触发 Windows UAC；取消后 Noobi.ai 会保留原状态。

macOS 使用对应的固定 Homebrew formula/cask 白名单。Unity Editor 在两个平台都只通过 Unity Hub
安装和更新。

## 停止与恢复

- macOS 会先发送终止信号；Windows 会终止 Agent 对应的进程树，超时后强制结束。
- 会话记录与已经写入的项目文件不会删除。
- 再次输入要求并点击“继续执行”，应用会使用保存的 `sessionId` 恢复。
- 如果超大历史会话无法恢复，可新建会话，并要求 Agent 先审计 `GAME_DESIGN.md` 与现有文件。

桌面调度器当前在整个应用中只有一个执行槽位，不支持隐藏的多项目后台队列。

## 权限与安全边界

桌面版的完整游戏流程使用“完整自动化 / yolo”，允许 Agent 在当前项目目录写文件并运行项目
命令。请使用专用工作目录，不要选择已有重要资料目录；建议用 Git 或其他方式备份。

- 不要把 API Key 写进提示词、项目 `.env` 或代码。
- 密钥只通过受控 fd 通道传给 Agent Runtime，不放进命令行、常规环境变量或调用历史。
- 已在聊天、截图或日志中公开的 Key 应立即在服务商后台吊销并重建。
- Web 游戏预览运行在没有 Node 权限的 iframe sandbox 中。

## 从源码启动

```bash
git clone https://github.com/Innate-Labs/Noobi.ai.git
cd Noobi.ai
npm install
npm run bundle
npm run desktop
```

源码开发要求 Node.js 20+、npm 与 Git。Windows 建议在 PowerShell 中执行；目录可以包含空格或
中文，但不要使用 `CON`、`PRN`、`AUX`、`NUL`、`COM0`—`COM9`、`LPT0`—`LPT9` 等 Windows
保留设备名。

## 本机打包

当前平台通用入口：

```bash
npm run desktop:package
```

macOS DMG：

```text
packages/desktop/release/Noobi.ai-<version>-arm64.dmg
```

Windows 11 x64 Setup EXE：

```powershell
npm run desktop:package:win
npm run desktop:verify:win
```

```text
packages/desktop/release/Noobi.ai-<version>-windows-x64-setup.exe
```

普通本地构建默认未签名，只能用于开发验证。Windows 正式版必须通过 Authenticode 验证，macOS
正式版必须完成 Developer ID 签名与公证。

## 升级与卸载

当前没有内置自动更新。安装器配置为在手动覆盖安装和卸载时保留应用数据，也不以用户主动选择
的游戏项目目录为目标。正式发布前仍必须在干净系统执行 N→N+1 覆盖安装和卸载测试，确认兼容
配置、凭据与项目保持可用。
