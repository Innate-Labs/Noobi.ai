# 契约：Windows 依赖管理

## Renderer -> Preload -> Main

现有方法保持不变：

```ts
inspectDependencies(): Promise<DesktopDependency[]>
runDependencyAction(input: { id: string; action: string }):
  Promise<DependencyActionResult | null>
```

## 输入约束

- `id` 只能是 `npx | uvx | godot | blender | unity-hub | unity-editor`。
- `action` 只能是 `install | update | open`。
- Renderer 不得提供 executable、package ID、source、arguments、environment 或 working directory。
- install/update 必须先展示确认框；取消返回 `null`。

## Windows 固定映射

| id             | WinGet package ID           | install/update   | open             |
| -------------- | --------------------------- | ---------------- | ---------------- |
| `npx`          | `OpenJS.NodeJS.LTS`         | 支持             | 不支持           |
| `uvx`          | `astral-sh.uv`              | 支持             | 不支持           |
| `godot`        | `GodotEngine.GodotEngine`   | 支持             | 不支持           |
| `blender`      | `BlenderFoundation.Blender` | 支持             | 不支持           |
| `unity-hub`    | `Unity.UnityHub`            | 支持             | 支持已验证路径   |
| `unity-editor` | 无                          | 不支持，交给 Hub | 打开已验证的 Hub |

固定安装参数：

```text
winget install --exact --id <fixed-id> --source winget
  --scope <fixed-scope> --architecture x64 --silent --no-upgrade
  --accept-package-agreements --accept-source-agreements --disable-interactivity
winget upgrade --exact --id <fixed-id> --source winget
  --scope <fixed-scope> --architecture x64 --silent
  --accept-package-agreements --accept-source-agreements --disable-interactivity
```

执行必须使用 `spawn(executable, args, { shell: false })`。缺少 WinGet 时不得改用任意 PowerShell
下载安装脚本。

## 输出约束

- `command` 是供用户审计的脱敏展示文本，不用于再次执行。
- 输出最多保留既有上限，不记录凭据。
- 超时必须返回 `timedOut=true` 并终止 Windows 子进程树。
- 单项失败不得把该依赖报告为已安装。
