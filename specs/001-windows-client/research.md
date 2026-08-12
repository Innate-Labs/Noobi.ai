# 调研记录：Windows 客户端

## 决策 1：首版发行目标为 Windows 11 x64 + NSIS

- **决策**：使用 electron-builder 的 NSIS target，采用引导式、当前用户安装；不提供 portable、
  Microsoft Store、ia32 或 ARM64。
- **原因**：NSIS 是 electron-builder 的标准 Windows 消费者安装目标，支持开始菜单、桌面快捷方式、
  覆盖安装和卸载；范围与规格中的首发平台一致。
- **否决方案**：portable 缺少标准安装/卸载契约；MSIX/Store 会引入新的签名、商店和沙箱约束；
  同时发布多架构会扩大未经验证的原生依赖矩阵。

## 决策 2：必须在 Windows 原生 Runner 构建

- **决策**：Windows 产物由 `windows-latest` 或 Windows 11 x64 测试机执行 `npm ci`、Runtime
  staging、smoke、electron-builder 和安装器验证。
- **原因**：应用 Runtime 含 Sharp、ONNX Runtime 与 PTY 原生二进制；Mac 上的 `node_modules`
  不能作为 Windows 原生闭包的可信来源。
- **否决方案**：虽然 electron-builder 可通过 Wine 交叉组装 NSIS，但无法证明本仓库 Runtime
  中的平台原生模块正确。

## 决策 3：保留兼容性应用身份

- **决策**：产品名称和图标使用 Noobi.ai，继续保留 `appId=com.gameagent.desktop`，并在 Windows
  启动前设置同值 App User Model ID。
- **原因**：应用身份关联设置目录、凭据、安装升级和系统集成；品牌清理不能破坏既有数据。
- **否决方案**：直接改成新的 `appId` 会让系统把升级当作另一应用，并可能造成凭据与配置迁移问题。

## 决策 4：Windows 使用原生标题栏

- **决策**：macOS 保持 `hiddenInset`；Windows 首版使用系统原生标题栏。
- **原因**：现有 Renderer 没有最小化、最大化和关闭按钮。原生标题栏是最小、可访问、可验证的方案。
- **否决方案**：Window Controls Overlay 或自绘按钮需要额外 IPC、命中区域、缩放与无障碍测试，
  不应阻塞首个可靠 Windows 包。

## 决策 5：依赖管理使用固定 WinGet allowlist

- **决策**：Windows 安装和升级只调用检测到的 `winget.exe`，包 ID 固定为
  `OpenJS.NodeJS.LTS`、`astral-sh.uv`、`GodotEngine.GodotEngine`、
  `BlenderFoundation.Blender`、`Unity.UnityHub`；Unity Editor 继续只通过 Unity Hub 管理。
- **原因**：固定 ID 与固定参数满足主进程白名单和 `shell:false` 约束，也能复用系统包管理能力。
- **否决方案**：接受 Renderer 包名/命令、任意 PowerShell 脚本、自动下载未知安装器都会扩大执行面。
- **降级**：缺少 WinGet 时只显示 Microsoft App Installer 指引，不自动引导脚本安装。

## 决策 6：跨平台工程脚手架不再依赖 Bash

- **决策**：分类工具在可信 Runtime 中使用 Node `fs.cp`/`fs.mkdir` 复制固定模板和文档；提示词不再要求
  Agent 执行 `cp -R`、`mkdir -p`。
- **原因**：Windows Shell 默认不是 Bash；文件 API 能正确处理空格、中文与路径分隔符，也避免命令注入。
- **否决方案**：按平台拼接 cmd/PowerShell 命令仍增加转义和执行风险。

## 决策 7：Windows PATH 只保留一个规范键

- **决策**：对环境变量键大小写不敏感地提取并删除所有 PATH 变体，再按当前平台构造唯一 `PATH`。
  Windows 候选来自用户目录、AppData、Program Files 与原系统 PATH；不注入 POSIX 目录。
- **原因**：Windows 环境键大小写不敏感，`Path` 与 `PATH` 共存可能导致真实系统 PATH 被覆盖。

## 决策 8：开发构建和公开签名构建分离

- **决策**：PR/普通 CI 可生成明确标记为 unsigned 的开发安装包；`package:win:signed` 启用
  `forceCodeSigning`，验证器在 release 模式要求 Authenticode `Valid`。发布页另附 SHA-256。
- **原因**：仓库中没有签名凭据；不能把“可打包”描述成“公开可信发行”。
- **否决方案**：允许 release job 静默产出未签名 EXE 会违反规格和宪章。

## 决策 9：修复 electron-builder 依赖覆盖冲突

- **决策**：移除根级对 `ansi-regex@6` 的全局强制覆盖，并更新 lockfile。
- **原因**：它把 CommonJS `strip-ansi@6` 所需的 `ansi-regex@5` 替换成 ESM-only 版本，导致
  electron-builder 在 Node 20 启动时报 `ansiRegex is not a function`。

## 参考

- Electron 跨平台文档：https://www.electronjs.org/docs/latest/
- electron-builder Windows targets：https://www.electron.build/docs/targets/
- electron-builder NSIS：https://www.electron.build/docs/nsis/
- electron-builder Windows 签名：https://www.electron.build/docs/features/code-signing/code-signing-win/
- WinGet 社区 manifests：https://github.com/microsoft/winget-pkgs
