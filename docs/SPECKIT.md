# Noobi.ai 的 Spec Kit 开发流程

Noobi.ai 使用仓库内已签入的 Spec Kit 资产管理功能开发。初始化记录位于
`.specify/init-options.json`，Codex 工作流位于 `.agents/skills/speckit-*/SKILL.md`。

这里的 Spec Kit 用于**开发 Noobi.ai 本身**。它不会自动成为 Noobi.ai 客户端内
Agent 的插件，也不会让客户端自动加载 `.agents/skills`；客户端插件仍由 Skills
与 MCP 管理界面控制。

## 开始一个功能

在仓库根目录打开一个新的 Codex 任务，按顺序调用：

1. `$speckit-specify <用用户结果描述功能>`：创建 feature branch 和 `specs/`
   下的功能规格。
2. `$speckit-clarify`：消除会改变用户体验、范围或验收方式的歧义。
3. `$speckit-plan`：结合当前代码和 Constitution 生成技术计划、数据模型与契约。
4. `$speckit-checklist`：为高风险或复杂功能生成专项质量清单（按需使用）。
5. `$speckit-tasks`：生成按依赖和用户故事排序的可执行任务。
6. `$speckit-analyze`：在写代码前检查 spec、plan 与 tasks 是否一致。
7. `$speckit-implement`：依照任务和验收标准实现并验证。
8. `$speckit-converge`：对照规格检查真实代码，把遗漏工作补回任务列表。

不要用技术方案代替第一步的用户结果。例如：

```text
$speckit-specify 让用户在插件中心安装 Skill 前看到来源、依赖、权限和风险，
安装后能确认 Agent 下一回合是否已成功加载
```

而不是：

```text
$speckit-specify 新增三个 React 组件和两个 IPC handler
```

## 项目约束

所有 feature 的 spec、plan 和 tasks 都必须遵守
[`constitution.md`](../.specify/memory/constitution.md)。其中包括：

- 新增产品文案只使用 Noobi.ai，并区分内置能力与外部 Skill / MCP 能力。
- Renderer 不直接访问 Node、文件、进程或凭据。
- Agent 工作可观察、可停止、可恢复，并按当前单任务调度模型描述。
- IPC、持久化、凭据、插件和打包改动必须提供与风险匹配的验证证据。
- 兼容性契约的修改必须包含迁移方案，不能依靠全局替换。

当前没有 `specs/` 目录是正常状态：只有收到具体功能目标并执行
`$speckit-specify` 后才创建 feature 规格。`.specify/feature.json` 是本机活动功能
指针，已被忽略，不应提交。

## 使用本机 Spec Kit 源码更新

本仓库由本机 Spec Kit 的 Codex Skills 集成初始化。若要从另一个本地 checkout
刷新生成资产，先确保工作区干净并审查 Spec Kit 版本，再运行：

```bash
SPECKIT_SOURCE="/absolute/path/to/spec-kit"
uvx --from "$SPECKIT_SOURCE" specify version
uvx --from "$SPECKIT_SOURCE" specify init --here --force \
  --integration codex \
  --integration-options="--skills" \
  --script sh
```

`--force` 会刷新已生成文件；运行后必须检查 `git diff`，不能把未审查的模板、
扩展或 workflow 直接用于项目。社区扩展和 workflow 可能执行命令，安装前应按
第三方代码审查。

## 最小验证

Speckit 资产或 Constitution 变更至少执行：

```bash
.specify/scripts/bash/resolve-template.sh constitution-template --json
git diff --check
```

应用代码的验证门槛以 Constitution 和对应 feature plan 为准；仅初始化 Spec Kit
不会替代 TypeScript、测试、构建或 macOS 安装包验证。
