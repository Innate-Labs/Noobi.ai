# 数据模型：Windows 客户端

本功能不新增远程数据库，也不迁移现有应用状态。变更集中在构建元数据与当前平台能力状态。

## WindowsReleaseArtifact

表示一个可分发或待验证的 Windows 产物。

| 字段          | 类型          | 约束                                  |
| ------------- | ------------- | ------------------------------------- |
| `productName` | string        | 固定为 `Noobi.ai`                     |
| `appId`       | string        | 固定兼容值 `com.gameagent.desktop`    |
| `version`     | semver string | 与 desktop package 一致               |
| `platform`    | enum          | 固定 `win32`                          |
| `arch`        | enum          | 首版固定 `x64`                        |
| `kind`        | enum          | `nsis-setup`                          |
| `signed`      | boolean       | 开发构建可以 false；公开发行必须 true |
| `sha256`      | hex string    | 发布前生成并校验                      |

状态：`prepared -> packaged -> verified -> published`。任何 Runtime 架构、资源、签名或安装检查失败，
状态转为 `rejected`，不得发布。

## RuntimeDependencyManifest

沿用 `.runtime-deps/runtime-deps-manifest.json` 的 schema：

- `platform` 必须为 `win32`；
- `arch` 必须为 `x64`；
- `copiedPackages` 记录实际 Runtime 闭包；
- `skippedPackages` 只能包含当前平台可选依赖；
- manifest 与当前构建目标不一致时，打包或验证必须失败。

## DesktopDependency

沿用共享 IPC 类型，`management` 增加 `winget`：

```text
id, name, description, status, path?, version?, installations?,
availableActions[], management, detail?
```

状态：

- `installed`：已找到并可执行，允许 `update`；Unity Hub 还允许 `open`。
- `missing`：未找到；若 WinGet 可用则允许 `install`，否则只显示恢复指引。
- `unsupported`：当前平台没有实现；Windows 11 x64 的六个定义不应返回此状态。

安全不变量：Renderer 只提交 `id` 和 `action`；主进程将二者映射到固定 executable、package ID
和参数。不得持久化或回传任意命令输入。

## PlatformToolEnvironment

临时构造、不会持久化：

- `platform`：当前 Node 平台；
- `systemPath`：从环境中按大小写不敏感规则抽取；
- `preferredPaths`：仅由可信的系统和用户目录构造；
- `PATH`：去重后的唯一规范键。

不得包含 API Key、Token、MCP secrets 或由 Renderer 提供的目录。

## AppPrivateData 与 UserProject

- `AppPrivateData` 继续位于 Electron `userData`，卸载默认保留，以支持手动覆盖升级。
- `UserProject` 位于用户明确选择的目录，不属于安装器目录或卸载范围。
- Windows 的 `safeStorage` 密文绑定当前系统用户；跨 macOS/Windows 复制设置时需要重新输入密钥。
