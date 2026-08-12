# 任务：Windows 客户端

**输入**：`specs/001-windows-client/` 中的规格、计划、调研、数据模型、契约和快速验证文档

**组织方式**：任务按用户故事分组，并为 Windows 平台行为、IPC/白名单和发行产物包含测试。

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**：可与同阶段其他任务并行，且不修改同一文件
- **[Story]**：对应 `spec.md` 中的用户故事

## Phase 1：Setup

**目的**：修复打包器前置问题并建立跨平台脚本入口。

- [X] T001 移除破坏 electron-builder CommonJS 依赖的全局 `ansi-regex` override，并更新 `package.json` 与 `package-lock.json`
- [X] T002 [P] 在 `packages/desktop/scripts/package-current-platform.mjs` 增加按宿主平台选择 macOS/Windows 打包目标的安全分发脚本
- [X] T003 在 `packages/desktop/package.json` 与根 `package.json` 增加 Windows 构建、签名和验证命令

---

## Phase 2：Foundational

**目的**：建立所有 Windows 用户故事依赖的平台契约和安全基础。

- [X] T004 在 `packages/desktop/src/shared/types.ts` 为 Windows 依赖管理增加兼容的 `winget` management 类型
- [X] T005 [P] 在 `packages/desktop/test/windows-package-contract.test.ts` 增加产品身份、NSIS x64、产物命名、图标和脚本契约测试
- [X] T006 [P] 在 `packages/desktop/test/agentRunner.test.ts` 增加 Windows PATH 大小写、Unicode 路径与平台候选测试
- [X] T007 在 `packages/desktop/src/main/agentRunner.ts` 实现按平台构造唯一 PATH 键的安全 Runtime 环境
- [X] T008 在 `packages/desktop/src/main/main.ts` 保留兼容 appId，设置 Windows App User Model ID，并让非 macOS 使用可操作的原生标题栏

**检查点**：打包入口和平台基础契约就绪后才能实现各用户故事。

---

## Phase 3：用户故事 1——在 Windows 上安装并启动（P1）🎯 MVP

**目标**：在 Windows 11 x64 生成带 Noobi.ai 名称、IP 图标、系统入口与卸载入口的标准安装包。

**独立测试**：Windows 原生 Runner 完成 `package:win`，验证 setup EXE、unpacked app、x64 PE、
资源清单和 Runtime CLI，并在干净 Windows 11 x64 用户中安装和启动。

- [X] T009 [US1] 在 `packages/desktop/package.json` 配置 Windows x64 NSIS 引导式当前用户安装器、稳定产物名、快捷方式和保留应用数据的卸载策略
- [X] T010 [P] [US1] 在 `packages/desktop/scripts/verify-windows-installer.mjs` 实现宿主、PE x64、资源、Runtime manifest、CLI 与可选 Authenticode 验证
- [X] T011 [P] [US1] 在 `packages/desktop/scripts/prepare-runtime-deps.mjs` 拒绝正式原生 Runtime 的跨平台 staging，并在 manifest 中保持目标证据
- [X] T012 [US1] 在 `packages/desktop/scripts/smoke-runtime.mjs` 增加 Windows bundled rg 和 PTY 轻量冒烟检查
- [X] T013 [US1] 在 `packages/desktop/src/main/main.ts` 与 `packages/desktop/scripts/verify-windows-installer.mjs` 增加 15 秒超时的 packaged app 启动、Renderer ready 与 `safeStorage` 往返冒烟模式
- [X] T014 [US1] 在 `.github/workflows/desktop-windows.yml` 增加 Windows Node 20 桌面 typecheck、test、build、Runtime smoke、NSIS 打包、验证和 unsigned-dev artifact

**检查点**：US1 的开发安装包可由 Windows CI 独立生成和验证。

---

## Phase 4：用户故事 2——完成核心游戏制作流程（P1）

**目标**：Windows 上模型配置、项目创建、Agent 启停/恢复、实际调用、文件与预览核心链路可运行。

**独立测试**：在含中文和空格的 Windows 目录创建项目，让 Agent 完成最小 2D Web 游戏并停止/恢复。

- [X] T015 [P] [US2] 在 `packages/core/src/tools/game-type-classifier.test.ts` 增加跨平台 Node 文件脚手架、重复执行与目录边界测试
- [X] T016 [US2] 在 `packages/core/src/tools/game-type-classifier.ts` 使用可信 Node 文件 API 自动复制固定模板和文档，移除 Bash 脚手架指令
- [X] T017 [US2] 在 `agent-test/prompts/custom.md` 更新 Phase 1 协议，使 Agent 使用分类工具已完成的跨平台脚手架
- [X] T018 [P] [US2] 在 `packages/desktop/test/agentRunner.test.ts` 增加 Windows `.cmd` 开发 Runtime 解析和停止进程树契约测试
- [X] T019 [US2] 在 `packages/desktop/src/main/agentRunner.ts` 使用 Node entry 启动 Windows 开发 Runtime，并强化 Windows 停止路径的错误处理
- [X] T020 [P] [US2] 在 `packages/desktop/test/projectManager.test.ts` 与 Skill 测试中增加 Windows 保留设备名、结尾点/空格和 CRLF frontmatter 契约
- [X] T021 [US2] 在 `packages/desktop/src/main/projectManager.ts`、`packages/desktop/src/main/extensionManager.ts` 与 `packages/core/src/skills/skill-manager.ts` 实现 Windows 安全名称和 CRLF 兼容
- [X] T022 [US2] 在 `packages/desktop/src/renderer/App.tsx` 与 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 更新跨平台快捷键和系统安全存储文案

**检查点**：US2 不再依赖 Bash 或被错误 PATH 阻断，并保持现有 macOS 行为。

---

## Phase 5：用户故事 3——管理插件与本机依赖（P2）

**目标**：Windows 插件中心继续可用，本机工具可以检测，并仅通过固定 WinGet allowlist 安装/更新。

**独立测试**：在 WinGet 可用/缺失两种 fixture 下检测六项依赖，验证固定参数、Unicode 路径、
多个 Unity Editor、未知输入拒绝与 Unity Hub 打开行为。

- [X] T023 [P] [US3] 在 `packages/desktop/src/main/dependencyManager.test.ts` 增加 Windows 检测、WinGet allowlist、缺失恢复、Unity Hub 与注入拒绝测试
- [X] T024 [US3] 在 `packages/desktop/src/main/dependencyManager.ts` 实现 Windows 工具检测、固定 WinGet install/upgrade、Unity Hub 打开和进程树超时清理
- [X] T025 [US3] 在 `packages/desktop/src/main/main.ts` 将依赖确认信息改为当前平台的白名单包管理说明
- [X] T026 [P] [US3] 在 `packages/desktop/src/renderer/components/SettingsDialog.tsx` 展示 WinGet、Unity Hub 和仅检测三种管理来源

**检查点**：Windows 依赖管理可独立测试，Renderer 无法注入 executable、package ID 或参数。

---

## Phase 6：用户故事 4——安全升级、卸载和识别发行状态（P3）

**目标**：维护者和用户能识别版本、架构、签名与 checksum，覆盖安装/卸载不删除项目。

**独立测试**：Windows 11 x64 对 N→N+1 做覆盖安装，检查 userData 和外部项目，再卸载并验证项目仍在。

- [X] T027 [P] [US4] 在 `packages/desktop/scripts/verify-windows-installer.test.ts` 增加 PE、manifest、资源和 signed/unsigned 模式契约测试
- [X] T028 [US4] 在 `.github/workflows/desktop-windows.yml` 增加 SHA-256 生成、签名凭据门槛和 signed release 验证入口
- [X] T029 [P] [US4] 在 `README.md` 增加 Windows 11 x64 下载/构建、开发与签名构建区别、SmartScreen、checksum 和手动覆盖更新说明
- [X] T030 [P] [US4] 在 `docs/gameagent/DESKTOP_GUIDE.md` 增加 Windows 安装、路径、安全存储、依赖、升级和卸载说明并清理旧产品名

**检查点**：只有签名验证通过的产物才满足公开发行契约。

---

## Phase 7：Polish 与跨故事验证

- [X] T031 [P] 在 `packages/desktop/test/brand-contract.test.ts` 增加 Windows 文档与产物中的 Noobi.ai 品牌契约
- [X] T032 运行 `npm run typecheck --workspace=@gameagent/desktop`、desktop/core 聚焦测试和 `npm run build --workspace=@gameagent/desktop`
- [X] T033 运行 macOS Runtime smoke 与 electron-builder 启动检查，确认 Windows 修改没有破坏现有发行基线
- [ ] T034 根据 `specs/001-windows-client/quickstart.md` 记录 Windows Runner 已执行与尚未执行的实机验收，并更新 `specs/001-windows-client/tasks.md`

---

## 依赖与执行顺序

- Phase 1 → Phase 2 → 所有用户故事。
- US1 提供安装产物，是公开交付的最小 MVP。
- US2 与 US3 在 Phase 2 后可并行，但两者都必须在正式 Windows 客户端声明前完成。
- US4 依赖 US1 的安装器和验证器；签名凭据属于外部发布条件。
- 最终验证依赖所选用户故事全部完成。

## 并行机会

- T005 与 T006 可并行建立打包和 Runtime 契约。
- T010、T011 可分别实现验证器与 staging 防护。
- T015 与 T018 可分别覆盖 core 脚手架和 desktop Runtime。
- T023 与 US2 工作修改不同文件，可并行。
- T029、T030 可并行更新用户和开发者文档。

## 实施策略

1. 先完成 Setup/Foundational，保证 electron-builder 可启动且 Windows 窗口可操作。
2. 交付 US1 的 Windows unsigned-dev CI 产物，作为内部安装测试 MVP。
3. 完成 US2 核心游戏流程和 US3 插件/依赖管理，再称为功能完整的 Windows 候选版。
4. 配置真实签名凭据、完成 US4 和干净 Windows 11 x64 验收后，才发布正式版本。

---

## Phase 8：Convergence——原生 Windows 发布证据

> 收敛结论：实现与规格已对齐；以下任务属于正式发行前必须补齐的外部环境与发布证据，
> 不能用 macOS 本机的交叉检查或 unsigned 候选产物替代。

- [ ] T035 [US1] [US2] [US3] 在当前提交的原生 Windows 11 x64 Runner 与干净测试机上执行
  `specs/001-windows-client/quickstart.md` 全链路验收，归档 EXE、SHA-256、安装/启动时间、
  窗口控制、系统安全存储、中文与空格路径、Agent 停止/恢复、实际调用、Skill/MCP、WinGet
  和秘密扫描证据（追踪 FR-001、FR-003、FR-004、FR-006～FR-010、FR-014；
  SC-001～SC-004、SC-007；缺口：missing；严重级别：HIGH）
- [ ] T036 [US4] 在 Windows 原生发布工作流中增加并执行 N→N+1 覆盖升级测试：先用基线安装包
  写入兼容设置、系统安全存储凭据和外部项目哨兵，再安装当前版本并卸载，证明设置、凭据和
  外部项目按契约保留（追踪 FR-011、FR-014；US4 验收场景 2～3；SC-005；
  缺口：partial；严重级别：HIGH）
- [ ] T037 [US4] 配置 Windows 代码签名凭据与 `NOOBI_WINDOWS_SIGNER`，运行 signed workflow，
  验证 Authenticode 为 Valid、证书 Subject 与预期发布者一致，并核对版本、x64 架构和
  SHA-256；只有证据全部通过后才创建公开发行（追踪 FR-012、FR-014；US4 验收场景 1；
  SC-006；缺口：missing；严重级别：HIGH）
