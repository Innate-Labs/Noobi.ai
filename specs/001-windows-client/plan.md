# 实施计划：Windows 客户端

**分支**：`codex/windows-client` | **日期**：2026-08-12 | **规格**：[spec.md](./spec.md)

**输入**：`/specs/001-windows-client/spec.md`

## 摘要

为 Noobi.ai 增加 Windows 11 x64 客户端发行链路。应用继续复用现有 Electron
main/preload/renderer/shared 架构与兼容性应用身份，在 Windows 原生 Runner 中准备平台
Runtime、生成 NSIS 当前用户安装包并执行安装包验证。首版同时修复 Windows 窗口标题栏、
Agent PATH、跨平台工程脚手架和依赖管理：依赖安装仅允许固定 WinGet package ID，所有
Renderer 输入继续经过主进程校验。公开发行由签名门槛保护；没有签名凭据时只生成明确标记的
开发构建。

## 技术上下文

**语言/版本**：TypeScript 5.8、ES Modules、Node.js 20+、Electron 43、React 19
**主要依赖**：Electron、electron-builder 26、Vite 7、Vitest 3、现有 Agent Runtime
**存储**：Electron `userData` 下的本地 JSON/事件记录与 `safeStorage` 密文；用户项目位于用户选择目录
**测试**：Vitest 单元/契约测试、两个桌面 TypeScript 配置、Vite/主进程构建、Runtime smoke、Windows 安装包验证
**目标平台**：Windows 11 x64；macOS 现有发行行为不得回归
**项目类型**：npm workspaces 中的 Electron 桌面应用与 Node.js Agent Runtime
**性能目标**：干净 Windows 设备安装后 15 秒内出现主窗口；依赖检测不阻塞渲染线程
**约束**：不使用 `shell: true`；不从 Renderer 接收命令、包名或任意参数；不把 Mac 原生依赖交叉装入 Windows 包；不删除用户项目
**规模/范围**：一个 Windows x64 NSIS 产物、六项本机依赖状态、现有核心 Agent 工作流与插件中心

## 宪章检查

### Phase 0 调研前

| 门槛                 | 状态 | 依据                                                                        |
| -------------------- | ---- | --------------------------------------------------------------------------- |
| 产品事实与品牌一致性 | 通过 | 仅承诺 Windows 11 x64；Unity/Godot/Blender 仍表述为外部连接。               |
| 桌面端信任边界       | 通过 | 不新增 Renderer 的 Node/进程访问；依赖动作继续通过强类型 Preload 与主进程。 |
| 本地优先与显式副作用 | 通过 | 安装依赖仍需用户确认；WinGet ID 与参数由主进程固定映射。                    |
| Agent 可观察与可恢复 | 通过 | 沿用现有结构化事件、停止和恢复；补 Windows PATH/进程验证。                  |
| 凭据与插件零信任     | 通过 | 继续使用 `safeStorage`，Windows 实机验证 DPAPI 路径；不降低 MCP 信任门槛。  |
| 兼容性迁移           | 通过 | 保留 `com.gameagent.desktop`、IPC 和数据位置；新增联合类型有默认兼容分支。  |
| 证据先于交付         | 通过 | 计划包含原生 Windows CI、Runtime smoke、安装/启动/卸载与签名验证。          |

### Phase 1 设计后复查

设计没有引入 Renderer 特权、任意 Shell、应用身份迁移或用户项目删除。Windows 开发构建与
公开签名构建在脚本、验证器和文档中明确分离。由于当前开发机为 macOS，Windows 安装器的
真实安装/启动验证只能由 `windows-latest` 或 Windows 11 测试机完成；在该证据产生前不得
宣称正式 Windows 发行已经完成。全部宪章门槛继续通过，无例外项。

## 项目结构

### 本功能文档

```text
specs/001-windows-client/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dependency-management.md
│   └── windows-release.md
├── checklists/requirements.md
└── tasks.md
```

### 源码

```text
packages/desktop/
├── package.json
├── scripts/
│   ├── package-current-platform.mjs
│   ├── prepare-runtime-deps.mjs
│   ├── smoke-runtime.mjs
│   └── verify-windows-installer.mjs
├── src/
│   ├── main/
│   │   ├── agentRunner.ts
│   │   ├── dependencyManager.ts
│   │   └── main.ts
│   ├── renderer/
│   │   ├── App.tsx
│   │   └── components/SettingsDialog.tsx
│   └── shared/types.ts
└── test/

packages/core/src/tools/
└── game-type-classifier.ts

agent-test/prompts/custom.md
.github/workflows/desktop-windows.yml
README.md
docs/gameagent/DESKTOP_GUIDE.md
```

**结构决策**：保持现有 workspace 与 Electron 四层边界，不创建新的应用包。平台差异收敛在
main 服务、打包脚本和固定配置中；Renderer 只消费共享的能力状态。

## 复杂度跟踪

无宪章违规需要例外。
