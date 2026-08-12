# Noobi.ai 仓库开发说明

## 规格驱动开发

- 将 `.specify/memory/constitution.md` 作为产品决策和工程决策的最高约束。
- 开发非简单功能或修改产品行为时，使用仓库级 Spec Kit 工作流：
  `$speckit-specify` -> `$speckit-clarify`（需要时）-> `$speckit-plan` ->
  `$speckit-tasks` -> `$speckit-analyze` -> `$speckit-implement` ->
  `$speckit-converge`。
- 整个仓库只保留一套根级 `.specify/` 和 `specs/` 目录；不得在各个 Package
  内重复初始化 Spec Kit 项目。
- 没有明确的用户结果时，不得创建功能规格。在当前功能的规格、实施计划和任务列表
  达成一致之前，不得开始实现。
- 功能产物统一保存在 `specs/`；不得提交仅供本机使用的
  `.specify/feature.json` 活动功能指针。

## 开发 Skills 与产品插件的边界

- `.agents/skills/speckit-*` 是维护本仓库的开发 Agent 使用的 Skills。
- 这些 Skills 不是 Noobi.ai 的运行时插件，不得自动展示在客户端插件目录中。
- 产品 Agent 的 Skills 和 MCP 集成必须继续使用应用已经校验的用户级或项目级
  插件路径，并遵守相应的信任控制。

## 验证要求

- 执行项目宪章和当前功能实施计划要求的所有检查。
- 应用代码变更至少需要聚焦测试，并通过受影响的 TypeScript 类型检查。打包、
  IPC、持久化、凭据、Agent 运行时和插件变更还需要通过各自与风险相匹配的
  专项门槛。
- 交付时必须说明已经执行和没有执行的检查；不得仅根据配置存在或目录中有条目，
  就推断某项能力已经可用。

命令顺序和本机 Spec Kit 刷新方法参见 `docs/SPECKIT.md`。
