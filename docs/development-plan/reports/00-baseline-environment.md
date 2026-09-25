# 阶段 00：环境与回归清单

对应代码提交：`765b52a`；分支：`codex/stage-00-baseline-20260925`。通过 `git worktree list` 定位工作树，不要在旧分支启动验收版本。

## 固定的验收环境

| 项目 | 本次验证版本 |
|---|---|
| 系统与设备 | macOS 26.3.2 / 25D2150，arm64，Mac17,9，24 GiB |
| Node | 22.20.0，已写入根目录 `.nvmrc`，CI 读取同一文件 |
| npm | 10.9.3 |
| Electron | 43.3.0 |
| Codex | 0.153.4，使用项目依赖中的 CLI |
| Godot | 4.7.1.stable.official.a13da4feb |
| 导出模板 | 4.7.1.stable，含 Web、macOS、Windows；本次仅真实验证 Web 导出 |
| TypeScript / Vitest / Vite | 5.9.3 / 3.2.7 / 6.4.3 |
| 模型 | 本阶段没有请求生成模型，不记录虚构模型调用结果 |

依赖以 `package-lock.json` 为准，SHA-256：`24014e6d71fff4c1debc23f405ac5135752f569d870a3ee5ccf35aa97a77e2f8`。Godot 与模板升级后必须重新验证；不得使用其他版本的旧日志证明新版通过。

本机系统默认 Node 为 26.3.0。为保持仓库 Node 22 约定，本次将 Node 22.20.0 与 npm 10.9.3 安装在工作树内忽略目录 `.noobi-private/runtime/`，没有更改全局 Node。

其他开发机器：使用 `.nvmrc` 选择 Node 22.20.0、npm 10.9.3，安装上述 Godot 与匹配模板后执行：

```sh
npm ci
npm run verify
npm run smoke:ui
npm run smoke:godot
```

本机可从当前工作树执行：

```sh
export PATH="$PWD/.noobi-private/runtime/node_modules/.bin:$PATH"
npm ci
npm run verify
npm run smoke:ui
npm run smoke:godot
```

## 回归清单与素材

| 能力 | 回归入口/素材 | 本次结果 |
|---|---|---|
| David #17：避免旧素材回写覆盖新计划 | `src/main/assetPlanStore.test.ts`：并发更新/调和样例 | 已保留并通过；实现与 main 一致 |
| David #19：显式预览来源回退 | `src/main/projectInfrastructure.test.ts`：未构建目录、显式生产目录、入口样例 | 已保留并通过；`previewServer.ts` 与 main 一致 |
| David #20：HTML 资源解析不扫描注释 | `src/main/webProductionBuild.test.ts`：注释/真实标签/资源样例 | 已保留并通过；实现与 main 一致 |
| 冻结构建与检查点 | `src/main/production/*.test.ts` | 已通过 |
| 核心循环、视觉样板、运行证据 | `src/main/quality/*.test.ts`、`src/main/runtime/*.test.ts` | 已通过；不代表未来完整 3D 作品质量已达标 |
| 断线恢复与工具回调 | `gameHarnessConnection.test.ts`、`godotToolBroker.test.ts` | 已通过 |
| 主线项目管理 | `projectStore.test.ts`、`projectInfrastructure.test.ts`、`ProjectRail.test.ts` | 已通过 |
| 合并后的 UI 行为 | `Composer.test.ts`、`Inspector.test.ts` | 保留可编辑输入、断线提示、抽屉、基础检查项数；新增 2 项合并回归 |
| 首页与工作台 | 内置 Signal Garden 隔离示例；`smoke:ui` 与评测抽屉扩展模式 | 启动、截图、关闭通过；人工查看截图通过 |
| Godot 工程与导出 | `scripts/godot-smoke.ts` 创建的临时起始工程 | 导入、验证、Web 导出和 HTML/WASM/PCK 预览通过 |
| 真实已有项目读取 | 本机已有 12 个项目，选取一个读取文件并返回首页 | 12 个均显示；选定项目列出 27 个文件节点，README 可读，无 UI 异常 |

UI 隔离示例的“completed”是截图测试状态，不是生成成功的证据。真实项目测试没有触发制作、评测或素材生成；项目原始内容没有作为测试素材提交。

## 基线已知事项

- `npm audit` 报告 3 项依赖告警：js-yaml 高风险、Vitest 与 @vitest/mocker 中风险。原样登记在本地 audit JSON。本阶段未实施依赖升级，后续安排依赖修复并复测；阶段 00 的本地整合验收不等于公开发布验收。
- 当前已有项目历史状态包括失败、等待和停止；本次未重新生成这些游戏，不把历史失败记录宣称为已修复。
- 首次补充回归测试时有枚举类型写错，已修正；最终 verify 的 454 项测试全部通过，首次失败日志保留。
- macOS 为唯一实际启动平台，Windows、独立游戏包、30–60 分钟完整流程及真实模型生成成功率均未在本阶段验证。
